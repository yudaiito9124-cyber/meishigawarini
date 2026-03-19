import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as iam from 'aws-cdk-lib/aws-iam';

const DEFAULT_VALID_DAYS = process.env.DEFAULT_VALID_DAYS || '1';

export interface InfraStackProps extends cdk.StackProps {
  stage: string;
}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const stage = props.stage;

    const suffix = stage === 'prod' ? '' : `-${stage}`;

    // DynamoDB Table
    let table: dynamodb.ITable;
    if (stage === 'prod') {
      table = dynamodb.Table.fromTableName(this, 'MeishiGawariniTableV2-Original', 'InfraStack-MeishiGawariniTableV218E81B62-17GD6BQFOY8ZG');
    } else {
      const tableId = `MeishiGawariniTableV2${suffix}`;
      table = new dynamodb.Table(this, tableId, {
        partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        encryption: dynamodb.TableEncryption.AWS_MANAGED,
      });
    }

    const extraOrigins = process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',')
      : [];
    const allowedOrigins = [
      'https://meishigawarini.com',
      'https://stg.dh74sua11za2r.amplifyapp.com', // Staging
      'http://localhost:3000',
      'http://localhost:3001',
      ...extraOrigins
    ];

    // S3 Bucket for Product Images
    const bucketId = `ProductImageBucket${suffix}`;
    const bucket = new s3.Bucket(this, bucketId, {
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: stage === 'prod' ? false : true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedOrigins: allowedOrigins, // Locked down to domains
          allowedHeaders: ['*'],
        },
      ],
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Cognito User Pool
    const userPoolId = `MeishiGawariniUserPool${suffix}`;
    const userPool = new cognito.UserPool(this, userPoolId, {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      // Enable MFA
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
      },
      userVerification: {
        emailSubject: '【名刺がわりに】認証コードのお知らせ (2FA Notification for Meishigawarini)',
        emailBody: 'あなたの認証コードは {####} です。 (Your verification code is {####}.)',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // パスキー (WebAuthn) 対応のために Essentials ティアに設定
    const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;
    cfnUserPool.userPoolTier = 'ESSENTIALS';

    const userPoolClient = new cognito.UserPoolClient(this, 'MeishiGawariniUserPoolClient', {
      userPool,
      authFlows: { userSrp: true },
      idTokenValidity: cdk.Duration.hours(1),       // IDトークン有効期限: 1時間
      accessTokenValidity: cdk.Duration.hours(1),   // アクセストークン有効期限: 1時間
      refreshTokenValidity: cdk.Duration.days(30),  // リフレッシュトークン有効期限: 30日
    });

    // ALLOW_USER_AUTH を有効化 (パスキー / WebAuthn に必要)
    const cfnUserPoolClient = userPoolClient.node.defaultChild as cognito.CfnUserPoolClient;
    cfnUserPoolClient.explicitAuthFlows = [
      'ALLOW_USER_SRP_AUTH',
      'ALLOW_REFRESH_TOKEN_AUTH',
      'ALLOW_USER_AUTH'
    ];

    // Lambda Layer or Bundling
    const commonProps = {
      handler: 'handler',
      environment: {
        TABLE_NAME: table.tableName,
        DEFAULT_VALID_DAYS: DEFAULT_VALID_DAYS,
        SENDER_EMAIL: process.env.SENDER_EMAIL || '',
        RESEND_API_KEY: process.env.RESEND_API_KEY || '', // Added Resend API Key
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '',
      },
      timeout: cdk.Duration.seconds(30),
      bundling: {
        externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', '@aws-sdk/client-ses'],
      }
    };

    // GSIs are already on the original production table. 
    // We only add them to the newly created tables (Staging etc.)
    if (table instanceof dynamodb.Table) {
      // GSI for Status Listing
      table.addGlobalSecondaryIndex({
        indexName: 'GSI1',
        partitionKey: { name: 'GSI1_PK', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'GSI1_SK', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });

      // GSI2 for Reverse Lookups (ShopIndex + OwnerIndex)
      table.addGlobalSecondaryIndex({
        indexName: 'GSI2',
        partitionKey: { name: 'GSI2_PK', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'GSI2_SK', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });
    }

    // Helper to grant permissions including GSIs for imported table
    const grantTablePermissions = (fn: lambda.IFunction, write: boolean = false) => {
      if (write) {
        table.grantReadWriteData(fn);
      } else {
        table.grantReadData(fn);
      }
      // If table is an imported table (it doesn't have addGlobalSecondaryIndex)
      // or even if it's new, we need to ensure index permissions for Query operations.
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: write 
          ? ['dynamodb:Query', 'dynamodb:Scan', 'dynamodb:BatchGetItem', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem']
          : ['dynamodb:Query', 'dynamodb:Scan', 'dynamodb:BatchGetItem', 'dynamodb:GetItem'],
        resources: [`${table.tableArn}/index/*`]
      }));
    };

    // Lambda: Admin Generate
    const adminGenerateFn = new nodejs.NodejsFunction(this, 'AdminGenerateFn', {
      entry: path.join(__dirname, '../lambda/admin-generate.ts'),
      ...commonProps,
    });
    grantTablePermissions(adminGenerateFn, true);

    // Lambda: Admin List
    const adminListFn = new nodejs.NodejsFunction(this, 'AdminListFn', {
      entry: path.join(__dirname, '../lambda/admin-list.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        USER_POOL_ID: userPool.userPoolId,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(adminListFn);
    adminListFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));
    bucket.grantRead(adminListFn);

    // Lambda: Admin Dump (NEW)
    const adminDumpFn = new nodejs.NodejsFunction(this, 'AdminDumpFn', {
      entry: path.join(__dirname, '../lambda/admin-dump.ts'),
      ...commonProps,
    });
    grantTablePermissions(adminDumpFn);

    // Lambda: Shop & Product Mgmt
    const shopMgmtFn = new nodejs.NodejsFunction(this, 'ShopMgmtFn', {
      entry: path.join(__dirname, '../lambda/shop-mgmt.ts'),
      handler: 'handler',
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
      },
      bundling: {
        externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
      }
    });
    grantTablePermissions(shopMgmtFn, true);
    bucket.grantPut(shopMgmtFn);
    bucket.grantRead(shopMgmtFn);
    bucket.grantDelete(shopMgmtFn);

    // Lambda: Recipient Submit
    const recipientSubmitFn = new nodejs.NodejsFunction(this, 'RecipientSubmitFn', {
      entry: path.join(__dirname, '../lambda/recipient-submit.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        SENDER_EMAIL: process.env.SENDER_EMAIL || '',
        USER_POOL_ID: userPool.userPoolId,
      }
    });
    grantTablePermissions(recipientSubmitFn, true);
    recipientSubmitFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));

    // Lambda: Recipient Receive completed
    const recipientCompletedFn = new nodejs.NodejsFunction(this, 'RecipientCompletedFn', {
      entry: path.join(__dirname, '../lambda/recipient-completed.ts'),
      ...commonProps,
    });
    grantTablePermissions(recipientCompletedFn, true);

    // Lambda: Shop Orders (NEW)
    const shopOrdersFn = new nodejs.NodejsFunction(this, 'ShopOrdersFn', {
      entry: path.join(__dirname, '../lambda/shop-orders.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(shopOrdersFn, true);
    bucket.grantRead(shopOrdersFn);

    // Lambda: Recipient Upload URL (NEW)
    const recipientUploadUrlFn = new nodejs.NodejsFunction(this, 'RecipientUploadUrlFn', {
      entry: path.join(__dirname, '../lambda/recipient-upload-url.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      },
      bundling: {
        externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
      }
    });
    grantTablePermissions(recipientUploadUrlFn);
    bucket.grantPut(recipientUploadUrlFn);
    bucket.grantRead(recipientUploadUrlFn);



    // API Gateway
    const apiId = `MeishiGawariniApi${suffix}`;
    const api = new apigateway.RestApi(this, apiId, {
      restApiName: `MeishiGawarini Service${suffix}`,
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });



    // --- 認証エラー(401)を 404 に偽装しつつ CORS を許可 ---
    api.addGatewayResponse('Default401Response', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      statusCode: '404',
      responseParameters: {
        // ヘッダー名にはシングルクォート、値にはシングル＋ダブルクォートが必要
        'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Headers': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
      templates: {
        'application/json': '{"message": "Not Found."}'
      }
    } as any); // オブジェクト全体を any でキャストして型エラー(ts2353)を消す

    // --- 権限エラー(403)を 404 に偽装しつつ CORS を許可 ---
    api.addGatewayResponse('Default403Response', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      statusCode: '404',
      responseParameters: {
        'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Headers': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
      templates: {
        'application/json': '{"message": "Not Found."}'
      }
    } as any);

    // --- タイムアウト(504) ---
    api.addGatewayResponse('IntegrationTimeoutResponse', {
      type: apigateway.ResponseType.INTEGRATION_TIMEOUT,
      statusCode: '504',
      responseParameters: {
        'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Headers': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
      templates: {
        'application/json': '{"message": "Gateway Timeout"}'
      }
    } as any);

    // --- 統合エラー(500) ---
    api.addGatewayResponse('IntegrationFailureResponse', {
      type: apigateway.ResponseType.INTEGRATION_FAILURE,
      statusCode: '500',
      responseParameters: {
        'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Headers': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
      templates: {
        'application/json': '{"message": "Internal Server Error"}'
      }
    } as any);


    new cognito.CfnUserPoolGroup(this, 'AdministratorsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'Administrators',
      description: 'System administrators with access to the admin dashboard',
    });

    new cognito.CfnUserPoolGroup(this, 'GlobalAdminsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'GlobalAdmins',
      description: 'Global administrators with cross-shop access and admin dashboard access',
    });

    // Shop Authorizer (Cognito) - Reused for Admin for now (Authenticated User)
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ShopAuthorizer', {
      cognitoUserPools: [userPool],
    });

    // Admin-check用のLambda関数
    const adminCheckFn = new nodejs.NodejsFunction(this, 'AdminCheckFn', {
      entry: path.join(__dirname, '../lambda/admin-check.ts'),
      ...commonProps,
    });

    // Admin Authorizer (Lambda) - Checks for 'Administrators' group
    const adminAuthorizerFn = new nodejs.NodejsFunction(this, 'AdminAuthorizerFn', {
      entry: path.join(__dirname, '../lambda/admin-authorizer.ts'),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    const adminAuthorizer = new apigateway.TokenAuthorizer(this, 'AdminAuthorizer', {
      handler: adminAuthorizerFn,
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // Admin Authorizer Lambdaに AdminGetUser 権限を付与
    adminAuthorizerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));

    // Admin Routes
    const adminResource = api.root.addResource('admin');
    adminResource.addMethod('GET', new apigateway.LambdaIntegration(adminCheckFn), {
      authorizer: adminAuthorizer,
    });

    const qrResource = adminResource.addResource('qrcodes');
    const generateResource = qrResource.addResource('generate');

    // Protect Admin API with Lambda Authorizer
    generateResource.addMethod('POST', new apigateway.LambdaIntegration(adminGenerateFn), {
      authorizer: adminAuthorizer,
    });

    // Lambda: Admin Update (NEW)
    const adminUpdateFn = new nodejs.NodejsFunction(this, 'AdminUpdateFn', {
      entry: path.join(__dirname, '../lambda/admin-update.ts'),
      ...commonProps,
    });
    grantTablePermissions(adminUpdateFn, true);

    // Lambda: Admin Link Manager (NEW)
    const adminLinkManagerFn = new nodejs.NodejsFunction(this, 'AdminLinkManagerFn', {
      entry: path.join(__dirname, '../lambda/admin-link-manager.ts'),
      ...commonProps,
    });
    grantTablePermissions(adminLinkManagerFn, true);

    // Admin List Route
    qrResource.addMethod('GET', new apigateway.LambdaIntegration(adminListFn), {
      authorizer: adminAuthorizer,
    });

    const dumpResource = adminResource.addResource('dump');
    dumpResource.addMethod('GET', new apigateway.LambdaIntegration(adminDumpFn), {
      authorizer: adminAuthorizer,
    });

    const linksResource = adminResource.addResource('links');
    linksResource.addMethod('POST', new apigateway.LambdaIntegration(adminLinkManagerFn), {
      authorizer: adminAuthorizer,
    });

    // Lambda: Admin Delete Banned
    const adminDeleteBannedFn = new nodejs.NodejsFunction(this, 'AdminDeleteBannedFn', {
      entry: path.join(__dirname, '../lambda/admin-delete-banned.ts'),
      ...commonProps,
    });
    grantTablePermissions(adminDeleteBannedFn, true);

    const bannedResource = qrResource.addResource('banned');
    bannedResource.addMethod('DELETE', new apigateway.LambdaIntegration(adminDeleteBannedFn), {
      authorizer: adminAuthorizer,
    });

    // Lambda: Admin Change Owner (NEW)
    const adminChangeOwnerFn = new nodejs.NodejsFunction(this, 'AdminChangeOwnerFn', {
      entry: path.join(__dirname, '../lambda/admin-change-owner.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        USER_POOL_ID: userPool.userPoolId,
      }
    });
    grantTablePermissions(adminChangeOwnerFn, true);
    adminChangeOwnerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));

    adminResource.addResource('owner-change').addMethod('POST',
      new apigateway.LambdaIntegration(adminChangeOwnerFn), {
      authorizer: adminAuthorizer,
    });

    // Lambda: Admin Card Designs (NEW)
    const adminCardDesignsFn = new nodejs.NodejsFunction(this, 'AdminCardDesignsFn', {
      entry: path.join(__dirname, '../lambda/admin-card-designs.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(adminCardDesignsFn, true);
    bucket.grantReadWrite(adminCardDesignsFn);

    const cardDesignsResource = adminResource.addResource('card-designs');
    cardDesignsResource.addMethod('GET', new apigateway.LambdaIntegration(adminCardDesignsFn), {
      authorizer: adminAuthorizer,
    });
    cardDesignsResource.addMethod('POST', new apigateway.LambdaIntegration(adminCardDesignsFn), {
      authorizer: adminAuthorizer,
    });

    const cardDesignsUploadUrlResource = cardDesignsResource.addResource('upload-url');
    cardDesignsUploadUrlResource.addMethod('POST', new apigateway.LambdaIntegration(adminCardDesignsFn), {
      authorizer: adminAuthorizer,
    });

    const cardDesignIdResource = cardDesignsResource.addResource('{id}');
    cardDesignIdResource.addMethod('PATCH', new apigateway.LambdaIntegration(adminCardDesignsFn), {
      authorizer: adminAuthorizer,
    });
    cardDesignIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(adminCardDesignsFn), {
      authorizer: adminAuthorizer,
    });

    // Admin QR Detail Routes
    const adminQrDetail = qrResource.addResource('{uuid}');
    const banResource = adminQrDetail.addResource('ban');
    banResource.addMethod('POST', new apigateway.LambdaIntegration(adminUpdateFn), {
      authorizer: adminAuthorizer,
    });


    //////////////////////////////////////
    // Shop Routes

    const shopResource = api.root.addResource('shop'); // shop
    // shop POST #CreateShop
    shopResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });
    // shop GET #ListShops
    shopResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const shopIdResource = shopResource.addResource('{shopId}'); // shop/{shopId}
    // shop/{shopId} GET #GetShop
    shopIdResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });
    // shop/{shopId} PATCH #UpdateShop
    shopIdResource.addMethod('PATCH', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const productsResource = shopIdResource.addResource('products'); // shop/{shopId}/products
    // shop/{shopId}/products POST #CreateProducts
    productsResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });
    // shop/{shopId}/products GET #ListProducts
    productsResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const importProductsResource = productsResource.addResource('import'); // shop/{shopId}/products/import
    // shop/{shopId}/products/import GET #ListImportableShops
    importProductsResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });
    // shop/{shopId}/products/import POST #ImportProducts
    importProductsResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const uploadUrlResource = productsResource.addResource('upload-url'); // shop/{shopId}/products/upload-url
    // shop/{shopId}/products/upload-url POST #GetUploadUrl
    uploadUrlResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const productIdResource = productsResource.addResource('{productId}'); // shop/{shopId}/products/{productId}
    // shop/{shopId}/products/{productId} PATCH #UpdateProductStatus
    productIdResource.addMethod('PATCH', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });
    // shop/{shopId}/products/{productId} DELETE #DeleteProduct
    productIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const linkResource = shopIdResource.addResource('link');
    // shop/{shopId}/link POST #LinkQR
    linkResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const shopActivateResource = shopIdResource.addResource('activate');
    // shop/{shopId}/activate POST #ActivateQR
    shopActivateResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const shopQrsResource = shopIdResource.addResource('qrcodes');
    // shop/{shopId}/qrcodes GET #ListQRs
    shopQrsResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const shopQrResource = shopIdResource.addResource('qrcodecheck');
    // shop/{shopId}/qrcodecheck POST #CheckQR
    shopQrResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const shopOrdersResource = shopIdResource.addResource('orders');
    // shop/{shopId}/orders GET #ListShopOrders
    shopOrdersResource.addMethod('GET', new apigateway.LambdaIntegration(shopOrdersFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const shopOrderResource = shopOrdersResource.addResource('{qrId}');
    // shop/{shopId}/orders/{qrId} PATCH #ShipOrder
    shopOrderResource.addMethod('PATCH', new apigateway.LambdaIntegration(shopOrdersFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });






    // Receiver(Recipient) Routes
    const recipientResource = api.root.addResource('recipient');
    const qrResourceRecip = recipientResource.addResource('qrcodes');

    // Lambda: Recipient Verify PIN (NEW)
    const recipientVerifyPinFn = new nodejs.NodejsFunction(this, 'RecipientVerifyPinFn', {
      entry: path.join(__dirname, '../lambda/recipient-verify-pin.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        USER_POOL_ID: userPool.userPoolId,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(recipientVerifyPinFn, true);
    bucket.grantRead(recipientVerifyPinFn);
    // Allow Lambda to fetch user attributes (email) from Cognito
    recipientVerifyPinFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));

    const verifyResource = qrResourceRecip.addResource('verify');
    verifyResource.addMethod('POST', new apigateway.LambdaIntegration(recipientVerifyPinFn));

    const submitResource = recipientResource.addResource('submit');
    submitResource.addMethod('POST', new apigateway.LambdaIntegration(recipientSubmitFn));

    const completedResource = recipientResource.addResource('completed');
    completedResource.addMethod('POST', new apigateway.LambdaIntegration(recipientCompletedFn));

    // Lambda: Recipient Chat (NEW)
    const recipientChatFn = new nodejs.NodejsFunction(this, 'RecipientChatFn', {
      entry: path.join(__dirname, '../lambda/recipient-chat.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(recipientChatFn, true);
    bucket.grantRead(recipientChatFn);
    bucket.grantPut(recipientChatFn);
    bucket.grantDelete(recipientChatFn);

    const qrIdResourceRecip = qrResourceRecip.addResource('{uuid}');

    const chatResource = qrIdResourceRecip.addResource('chat');
    chatResource.addMethod('GET', new apigateway.LambdaIntegration(recipientChatFn));
    chatResource.addMethod('POST', new apigateway.LambdaIntegration(recipientChatFn));

    const uploadUrlResourceChat = qrIdResourceRecip.addResource('upload-url');
    uploadUrlResourceChat.addMethod('GET', new apigateway.LambdaIntegration(recipientUploadUrlFn));




    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
