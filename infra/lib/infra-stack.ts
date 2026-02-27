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
      publicReadAccess: true, // For prototype simplicity. Alternatively use CloudFront or Presigned Get Urls.
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      } as any // Forced public access for prototype
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
        USER_POOL_ID: userPool.userPoolId
      }
    });
    table.grantReadData(adminListFn);
    adminListFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));

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

    // Shop Routes (Legacy & Activation)
    const shopResource = api.root.addResource('shop');


    // New Shops Resource /shops
    // const shopsResource = api.root.addResource('shops');
    shopResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });
    shopResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // List My Shops

    const shopIdResource = shopResource.addResource('{shopId}');
    shopIdResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // Get Shop

    const productsResource = shopIdResource.addResource('products');
    productsResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // Create Product
    productsResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // List Products

    const uploadUrlResource = productsResource.addResource('upload-url');
    uploadUrlResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // Get Upload URL

    const productIdResource = productsResource.addResource('{productId}');
    productIdResource.addMethod('PATCH', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // Update Status
    productIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // Delete Product

    const linkResource = shopIdResource.addResource('link');
    linkResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // Link QR

    const shopActivateResource = shopIdResource.addResource('activate');
    shopActivateResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // Activate QR

    const shopQrsResource = shopIdResource.addResource('qrcodes');
    shopQrsResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // List QRs

    const shopOrdersResource = shopIdResource.addResource('orders');
    shopOrdersResource.addMethod('GET', new apigateway.LambdaIntegration(shopOrdersFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // List Shop Orders

    const shopOrderResource = shopOrdersResource.addResource('{qrId}');
    shopOrderResource.addMethod('PATCH', new apigateway.LambdaIntegration(shopOrdersFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    }); // Ship Order


    // Recipient Routes
    // Recipient Routes
    const recipientResource = api.root.addResource('recipient');
    const qrResourceRecip = recipientResource.addResource('qrcodes');

    // Lambda: Recipient Verify PIN (NEW)
    const recipientVerifyPinFn = new nodejs.NodejsFunction(this, 'RecipientVerifyPinFn', {
      entry: path.join(__dirname, '../lambda/recipient-verify-pin.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        USER_POOL_ID: userPool.userPoolId
      }
    });
    table.grantReadWriteData(recipientVerifyPinFn);
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
        ...commonProps.environment
      }
    });
    table.grantReadWriteData(recipientChatFn);

    const chatResource = qrResourceRecip.addResource('{uuid}').addResource('chat');
    chatResource.addMethod('GET', new apigateway.LambdaIntegration(recipientChatFn));
    chatResource.addMethod('POST', new apigateway.LambdaIntegration(recipientChatFn));




    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
