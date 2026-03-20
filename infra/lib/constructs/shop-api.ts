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

    // Lambda Definitions
    const fnProps = {
      ...commonProps,
      environment: {
        ...commonProps.environment,
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
      },
      bundling: {
        externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
      }
    };

    const shop_create = new nodejs.NodejsFunction(this, 'shop_create', { entry: lampath('shop_create'), ...fnProps });
    const shop_list = new nodejs.NodejsFunction(this, 'shop_list', { entry: lampath('shop_list'), ...fnProps });
    const shop_details = new nodejs.NodejsFunction(this, 'shop_details', { entry: lampath('shop_details'), ...fnProps });
    const shop_products = new nodejs.NodejsFunction(this, 'shop_products', { entry: lampath('shop_products'), ...fnProps });
    const shop_products_import = new nodejs.NodejsFunction(this, 'shop_products_import', { entry: lampath('shop_products_import'), ...fnProps });
    const shop_products_uploadurl = new nodejs.NodejsFunction(this, 'shop_products_uploadurl', { entry: lampath('shop_products_uploadurl'), ...fnProps });
    const shop_qr = new nodejs.NodejsFunction(this, 'shop_qr', { entry: lampath('shop_qr'), ...fnProps });
    const shop_admins = new nodejs.NodejsFunction(this, 'shop_admins', { entry: lampath('shop_admins'), ...fnProps });
    const shop_delete_images = new nodejs.NodejsFunction(this, 'shop_delete_images', { entry: lampath('shop_delete_images'), ...fnProps });
    const shop_orders = new nodejs.NodejsFunction(this, 'shop_orders', { entry: lampath('shop_orders'), ...fnProps });

    // Grant Permissions
    const allShopLambdas = [
        shop_create, shop_list, shop_details, shop_products, shop_products_import, 
        shop_products_uploadurl, shop_qr, shop_admins, shop_delete_images, shop_orders
    ];
    allShopLambdas.forEach(fn => {
        grantTablePermissions(fn, true);
        bucket.grantPut(fn);
        bucket.grantRead(fn);
        bucket.grantDelete(fn);
    });

    // Shop Routes
    const shopResource = api.root.addResource('shop'); 
    const routeOptions = { authorizer, authorizationType: apigateway.AuthorizationType.CUSTOM };

    // Action-based POST Routes (Standard)
    shopResource.addResource('create').addMethod('POST', new apigateway.LambdaIntegration(shop_create), routeOptions);
    shopResource.addResource('list').addMethod('POST', new apigateway.LambdaIntegration(shop_list), routeOptions);
    
    const detailsRes = shopResource.addResource('details');
    detailsRes.addResource('get').addMethod('POST', new apigateway.LambdaIntegration(shop_details), routeOptions);
    detailsRes.addResource('update').addMethod('POST', new apigateway.LambdaIntegration(shop_details), routeOptions);

    shopResource.addResource('admins').addMethod('POST', new apigateway.LambdaIntegration(shop_admins), routeOptions);
    shopResource.addResource('delete').addResource('images').addMethod('POST', new apigateway.LambdaIntegration(shop_delete_images), routeOptions);


    // /shop/products
    const productsResource = shopResource.addResource('products'); 
    productsResource.addResource('list').addMethod('POST', new apigateway.LambdaIntegration(shop_products), routeOptions);
    productsResource.addResource('create').addMethod('POST', new apigateway.LambdaIntegration(shop_products), routeOptions);
    productsResource.addResource('update').addMethod('POST', new apigateway.LambdaIntegration(shop_products), routeOptions);
    productsResource.addResource('delete').addMethod('POST', new apigateway.LambdaIntegration(shop_products), routeOptions);
    
    const importRes = productsResource.addResource('import');
    importRes.addResource('list').addMethod('POST', new apigateway.LambdaIntegration(shop_products_import), routeOptions);
    importRes.addResource('execute').addMethod('POST', new apigateway.LambdaIntegration(shop_products_import), routeOptions);
    productsResource.addResource('upload-url').addMethod('POST', new apigateway.LambdaIntegration(shop_products_uploadurl), routeOptions);

    // /shop/qr
    const qrResource = shopResource.addResource('qr');
    qrResource.addResource('list').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);
    qrResource.addResource('link').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);
    qrResource.addResource('unlink').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);
    qrResource.addResource('activate').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);
    qrResource.addResource('deactivate').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);
    
    shopResource.addResource('qrcode-check').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);

    // /shop/orders
    const ordersResource = shopResource.addResource('orders');
    ordersResource.addResource('list').addMethod('POST', new apigateway.LambdaIntegration(shop_orders), routeOptions);
    ordersResource.addResource('update').addMethod('POST', new apigateway.LambdaIntegration(shop_orders), routeOptions);

  }
}
