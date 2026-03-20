import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

export interface ShopApiProps {
  table: dynamodb.ITable;
  bucket: s3.IBucket;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  api: apigateway.RestApi;
  commonProps: any;
  grantTablePermissions: (fn: lambda.IFunction, write?: boolean) => void;
}

export class ShopApi extends Construct {
  constructor(scope: Construct, id: string, props: ShopApiProps) {
    super(scope, id);

    const { table, bucket, userPool, userPoolClient, api, commonProps, grantTablePermissions } = props;

    // Shop Authorizer (Custom Lambda Authorizer)
    const lampath = (name: string) => path.join(__dirname, `../../lambda/${name}.ts`);
    const shopAuthFn = new nodejs.NodejsFunction(this, 'ShopAuthorizerFn', {
      entry: lampath('shopAuthorizer'),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
        TABLE_NAME: table.tableName,
      },
    });
    grantTablePermissions(shopAuthFn);

    const authorizer = new apigateway.RequestAuthorizer(this, 'ShopAuthorizer', {
      handler: shopAuthFn,
      identitySources: [apigateway.IdentitySource.header('Authorization')],
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // Lambda: Shop & Product Mgmt
    const shopMgmtFn = new nodejs.NodejsFunction(this, 'ShopMgmtFn', {
      entry: path.join(__dirname, '../../lambda/shop-mgmt.ts'),
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

    // Lambda: Shop Orders
    const shopOrdersFn = new nodejs.NodejsFunction(this, 'ShopOrdersFn', {
      entry: path.join(__dirname, '../../lambda/shop-orders.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(shopOrdersFn, true);
    bucket.grantRead(shopOrdersFn);

    // Shop Routes
    const shopResource = api.root.addResource('shop'); 
    
    // shop POST #CreateShop
    shopResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });
    // shop GET #ListShops
    shopResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const shopIdResource = shopResource.addResource('{shopId}'); 
    // shop/{shopId} GET #GetShop
    shopIdResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });
    // shop/{shopId} PATCH #UpdateShop
    shopIdResource.addMethod('PATCH', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const productsResource = shopIdResource.addResource('products'); 
    // shop/{shopId}/products POST #CreateProducts
    productsResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });
    // shop/{shopId}/products GET #ListProducts
    productsResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const importProductsResource = productsResource.addResource('import'); 
    // shop/{shopId}/products/import GET #ListImportableShops
    importProductsResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });
    // shop/{shopId}/products/import POST #ImportProducts
    importProductsResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const uploadUrlResource = productsResource.addResource('upload-url'); 
    // shop/{shopId}/products/upload-url POST #GetUploadUrl
    uploadUrlResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const productIdResource = productsResource.addResource('{productId}'); 
    // shop/{shopId}/products/{productId} PATCH #UpdateProductStatus
    productIdResource.addMethod('PATCH', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });
    // shop/{shopId}/products/{productId} DELETE #DeleteProduct
    productIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const linkResource = shopIdResource.addResource('link');
    // shop/{shopId}/link POST #LinkQR
    linkResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const shopActivateResource = shopIdResource.addResource('activate');
    // shop/{shopId}/activate POST #ActivateQR
    shopActivateResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const shopQrsResource = shopIdResource.addResource('qrcodes');
    // shop/{shopId}/qrcodes GET #ListQRs
    shopQrsResource.addMethod('GET', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const shopQrResource = shopIdResource.addResource('qrcodecheck');
    // shop/{shopId}/qrcodecheck POST #CheckQR
    shopQrResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const shopAdminsResource = shopIdResource.addResource('admins');
    // shop/{shopId}/admins POST #GetShopAdmins
    shopAdminsResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const shopOrdersResource = shopIdResource.addResource('orders');
    // shop/{shopId}/orders GET #ListShopOrders
    shopOrdersResource.addMethod('GET', new apigateway.LambdaIntegration(shopOrdersFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    const shopOrderResource = shopOrdersResource.addResource('{qrId}');
    // shop/{shopId}/orders/{qrId} PATCH #ShipOrder
    shopOrderResource.addMethod('PATCH', new apigateway.LambdaIntegration(shopOrdersFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });
  }
}
