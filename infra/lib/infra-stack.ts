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

    // S3 Bucket for Product Images
    const bucket = new s3.Bucket(this, 'ProductImageBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'], // For prototype simplicity. In prod, lock down to domain.
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
      },
      bundling: {
        externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
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
    table.grantWriteData(adminGenerateFn);

    // Lambda: Admin List
    const adminListFn = new nodejs.NodejsFunction(this, 'AdminListFn', {
      entry: path.join(__dirname, '../lambda/admin-list.ts'),
      ...commonProps,
    });
    table.grantReadData(adminListFn);


    // // Lambda: Shop Activate
    // const shopActivateFn = new nodejs.NodejsFunction(this, 'ShopActivateFn', {
    //   entry: path.join(__dirname, '../lambda/shop-activate.ts'),
    //   ...commonProps,
    // });
    // table.grantReadWriteData(shopActivateFn);

    // Lambda: Shop & Product Mgmt (NEW)
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
    });
    table.grantReadWriteData(recipientSubmitFn);

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
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });

    // // 認証エラー(401)が発生したときも、404を返すように上書きする設定
    // api.addGatewayResponse('Default401Response', {
    //   type: apigateway.ResponseType.UNAUTHORIZED,
    //   statusCode: '404',
    //   templates: {
    //     'application/json': '{"message": "Not Found"}'
    //   }
    // });

    // // 権限エラー(403)が発生したときも、404を返すように上書き
    // api.addGatewayResponse('Default403Response', {
    //   type: apigateway.ResponseType.ACCESS_DENIED,
    //   statusCode: '404',
    //   templates: {
    //     'application/json': '{"message": "Not Found"}'
    //   }
    // });

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
    // const activateResource = shopResource.addResource('activate');

    // activateResource.addMethod('POST', new apigateway.LambdaIntegration(shopActivateFn), {
    //   authorizer,
    //   authorizationType: apigateway.AuthorizationType.COGNITO,
    // });

    // const ordersResource = shopResource.addResource('orders');
    // ordersResource.addMethod('GET', new apigateway.LambdaIntegration(shopOrdersFn), {
    //   authorizer,
    //   authorizationType: apigateway.AuthorizationType.COGNITO
    // });

    // const orderDetailResource = ordersResource.addResource('{uuid}');
    // orderDetailResource.addMethod('PATCH', new apigateway.LambdaIntegration(shopOrdersFn), {
    //   authorizer,
    //   authorizationType: apigateway.AuthorizationType.COGNITO
    // });

    // New Shops Resource /shops
    // const shopsResource = api.root.addResource('shops');
    shopResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      // Keeping CREATE SHOP open to allow signup -> create flow? 
      // Or require Auth? Let's require Auth so they must Register (Cognito) -> Login -> Create Shop.
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
    // const qrDetailResource = qrResourceRecip.addResource('{uuid}');

    // Lambda: Recipient Get
    // const recipientGetFn = new nodejs.NodejsFunction(this, 'RecipientGetFn', {
    //   entry: path.join(__dirname, '../lambda/recipient-get.ts'),
    //   ...commonProps,
    // });
    // table.grantReadData(recipientGetFn);

    // qrDetailResource.addMethod('GET', new apigateway.LambdaIntegration(recipientGetFn));

    // // Lambda: Recipient Verify PIN (NEW)
    // Lambda: Recipient Verify PIN (NEW)
    const recipientVerifyPinFn = new nodejs.NodejsFunction(this, 'RecipientVerifyPinFn', {
      entry: path.join(__dirname, '../lambda/recipient-verify-pin.ts'),
      ...commonProps,
    });
    table.grantReadData(recipientVerifyPinFn);

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
        SOURCE_EMAIL: process.env.SES_SENDER_EMAIL || 'noreply@meishigawarini.com', // Replace with your verified email
      }
    });
    table.grantReadWriteData(recipientChatFn);

    // Grant SES permissions
    recipientChatFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'], // In production, restrict to specific identities
    }));

    const chatResource = qrResourceRecip.addResource('{uuid}').addResource('chat');
    chatResource.addMethod('GET', new apigateway.LambdaIntegration(recipientChatFn));
    chatResource.addMethod('POST', new apigateway.LambdaIntegration(recipientChatFn));


    // ######################### ここからIP制限
    // --- WAF Setup for Admin IP Restriction ---
    // 1. IP Set (Allowed IPs)
    const allowedIpSet = new wafv2.CfnIPSet(this, 'AdminAllowedIPs', {
      name: 'AdminAllowedIPs',
      scope: 'REGIONAL',
      ipAddressVersion: 'IPV4',
      addresses: [
        '115.65.249.220/32' // User's IP
      ],
      description: 'Allowed IPs for Admin access',
    });

    // 2. Web ACL
    // const webAcl = new wafv2.CfnWebACL(this, 'MeishiGawariniWebACL', {
    //   name: 'MeishiGawariniWebACL',
    //   scope: 'REGIONAL',
    //   defaultAction: { allow: {} },
    //   visibilityConfig: {
    //     cloudWatchMetricsEnabled: true,
    //     metricName: 'MeishiGawariniWebACL',
    //     sampledRequestsEnabled: true,
    //   },
    //   rules: [
    //     {
    //       name: 'BlockAdminOutsideIp',
    //       priority: 100,
    //       statement: {
    //         andStatement: {
    //           statements: [
    //             {
    //               byteMatchStatement: {
    //                 fieldToMatch: { uriPath: {} },
    //                 positionalConstraint: 'STARTS_WITH',
    //                 searchString: '/admin',
    //                 textTransformations: [{ priority: 0, type: 'NONE' }]
    //               }
    //             },
    //             {
    //               notStatement: {
    //                 statement: {
    //                   ipSetReferenceStatement: {
    //                     arn: allowedIpSet.attrArn
    //                   }
    //                 }
    //               }
    //             }
    //           ]
    //         }
    //       },
    //       action: { block: {} },
    //       visibilityConfig: {
    //         cloudWatchMetricsEnabled: true,
    //         metricName: 'BlockAdminOutsideIp',
    //         sampledRequestsEnabled: true,
    //       }
    //     }
    //   ]
    // });

    // 3. Associate with API Gateway
    // API Gateway deployment stage ARN: arn:aws:apigateway:region::/restapi_id/stages/stage_name
    // const apiGatewayArn = `arn:aws:apigateway:${this.region}::/restapis/${api.restApiId}/stages/${api.deploymentStage.stageName}`;

    // new wafv2.CfnWebACLAssociation(this, 'ApiGatewayAssociation', {
    //   resourceArn: apiGatewayArn,
    //   webAclArn: webAcl.attrArn,
    // });
    // ######################### ここまでIP制限





    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
