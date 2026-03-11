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

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table
    const table = new dynamodb.Table(this, 'MeishiGawariniTableV2', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',')
      : ['https://meishigawarini.com', 'http://localhost:3000'];

    // S3 Bucket for Product Images
    const bucket = new s3.Bucket(this, 'ProductImageBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
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
    const userPool = new cognito.UserPool(this, 'MeishiGawariniUserPool', {
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

    const userPoolClient = new cognito.UserPoolClient(this, 'MeishiGawariniUserPoolClient', {
      userPool,
      authFlows: { userSrp: true },
    });

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

    // Lambda: Admin Generate
    const adminGenerateFn = new nodejs.NodejsFunction(this, 'AdminGenerateFn', {
      entry: path.join(__dirname, '../lambda/admin-generate.ts'),
      ...commonProps,
    });
    table.grantReadWriteData(adminGenerateFn);

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
    table.grantReadData(adminListFn);
    adminListFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));
    bucket.grantRead(adminListFn);

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
    table.grantReadWriteData(shopMgmtFn);
    bucket.grantPut(shopMgmtFn);
    bucket.grantRead(shopMgmtFn);

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
    table.grantReadWriteData(recipientSubmitFn);
    recipientSubmitFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));

    // Lambda: Recipient Receive completed
    const recipientCompletedFn = new nodejs.NodejsFunction(this, 'RecipientCompletedFn', {
      entry: path.join(__dirname, '../lambda/recipient-completed.ts'),
      ...commonProps,
    });
    table.grantReadWriteData(recipientCompletedFn);

    // Lambda: Shop Orders (NEW)
    const shopOrdersFn = new nodejs.NodejsFunction(this, 'ShopOrdersFn', {
      entry: path.join(__dirname, '../lambda/shop-orders.ts'),
      ...commonProps,
    });
    table.grantReadWriteData(shopOrdersFn);

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
    table.grantReadData(recipientUploadUrlFn);
    bucket.grantPut(recipientUploadUrlFn);
    bucket.grantRead(recipientUploadUrlFn);



    // API Gateway
    const api = new apigateway.RestApi(this, 'MeishiGawariniApi', {
      restApiName: 'MeishiGawarini Service',
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


    // Create Administrators Group
    new cognito.CfnUserPoolGroup(this, 'AdministratorsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'Administrators',
      description: 'Admin users with access to dashboard',
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

    // Admin Routes
    const adminResource = api.root.addResource('admin');
    adminResource.addMethod('GET', new apigateway.LambdaIntegration(adminCheckFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const qrResource = adminResource.addResource('qrcodes');
    const generateResource = qrResource.addResource('generate');

    // Protect Admin API with Cognito Auth
    generateResource.addMethod('POST', new apigateway.LambdaIntegration(adminGenerateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    // Lambda: Admin Update (NEW)
    const adminUpdateFn = new nodejs.NodejsFunction(this, 'AdminUpdateFn', {
      entry: path.join(__dirname, '../lambda/admin-update.ts'),
      ...commonProps,
    });
    table.grantReadWriteData(adminUpdateFn);

    // Admin List Route
    qrResource.addMethod('GET', new apigateway.LambdaIntegration(adminListFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    // Lambda: Admin Delete Banned
    const adminDeleteBannedFn = new nodejs.NodejsFunction(this, 'AdminDeleteBannedFn', {
      entry: path.join(__dirname, '../lambda/admin-delete-banned.ts'),
      ...commonProps,
    });
    table.grantReadWriteData(adminDeleteBannedFn);

    const bannedResource = qrResource.addResource('banned');
    bannedResource.addMethod('DELETE', new apigateway.LambdaIntegration(adminDeleteBannedFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    // Admin QR Detail Routes
    const adminQrDetail = qrResource.addResource('{uuid}');
    const banResource = adminQrDetail.addResource('ban');
    banResource.addMethod('POST', new apigateway.LambdaIntegration(adminUpdateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
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
    table.grantReadWriteData(recipientVerifyPinFn);
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
    table.grantReadWriteData(recipientChatFn);
    bucket.grantRead(recipientChatFn);

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
