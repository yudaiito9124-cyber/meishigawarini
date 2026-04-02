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
  allowedOrigins: string[];
  grantTablePermissions: (fn: lambda.IFunction, write?: boolean) => void;
}

export class ShopApi extends cdk.NestedStack {
  public readonly shopResource: apigateway.Resource;

  constructor(scope: cdk.Stack, id: string, props: ShopApiProps) {
    super(scope, id);

    const { table, bucket, userPool, userPoolClient, api, commonProps, allowedOrigins, grantTablePermissions } = props;

    // Shop Authorizer (Custom Lambda Authorizer)
    const lampath = (name: string) => path.join(__dirname, `../../lambda/${name}.ts`);
    const authpath = (name: string) => path.join(__dirname, `../../lambda/authorizer/${name}.ts`);
    const shopAuthFn = new nodejs.NodejsFunction(this, 'ShopAuthorizerFn', {
      entry: authpath('shopAuthorizer'),
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

    const shop_list = new nodejs.NodejsFunction(this, 'shop_list', { entry: lampath('shop_list'), ...fnProps });
    const shop_details = new nodejs.NodejsFunction(this, 'shop_details', { entry: lampath('shop_details'), ...fnProps });
    const shop_products = new nodejs.NodejsFunction(this, 'shop_products', { entry: lampath('shop_products'), ...fnProps });
    const shop_products_import = new nodejs.NodejsFunction(this, 'shop_products_import', { entry: lampath('shop_products_import'), ...fnProps });
    const shop_products_uploadurl = new nodejs.NodejsFunction(this, 'shop_products_uploadurl', { entry: lampath('shop_products_uploadurl'), ...fnProps });
    const shop_qr = new nodejs.NodejsFunction(this, 'shop_qr', { entry: lampath('shop_qr'), ...fnProps });
    const shop_admins = new nodejs.NodejsFunction(this, 'shop_admins', { entry: lampath('shop_admins'), ...fnProps });
    const shop_delete_images = new nodejs.NodejsFunction(this, 'shop_delete_images', { entry: lampath('shop_delete_images'), ...fnProps });
    const shop_orders = new nodejs.NodejsFunction(this, 'shop_orders', { entry: lampath('shop_orders'), ...fnProps });
    const shop_card_orders = new nodejs.NodejsFunction(this, 'shop_card_orders', { entry: lampath('shop_card_orders'), ...fnProps });

    // Grant Permissions
    const allShopLambdas = [
      shop_list, shop_details, shop_products, shop_products_import,
      shop_products_uploadurl, shop_qr, shop_admins, shop_delete_images, shop_orders,
      shop_card_orders
    ];
    allShopLambdas.forEach(fn => {
      grantTablePermissions(fn, true);
      bucket.grantPut(fn);
      bucket.grantRead(fn);
      bucket.grantDelete(fn);
    });

    // Helper to add resource
    const addResourceWithCors = (parent: apigateway.IResource, pathPart: string): apigateway.Resource => {
      const res = parent.addResource(pathPart) as apigateway.Resource;
      res.addCorsPreflight({
        allowOrigins: allowedOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [...apigateway.Cors.DEFAULT_HEADERS, 'X-QR-ID', 'X-QR-UUID', 'X-QR-PIN'],
      });
      return res;
    };

    // Shop Routes
    this.shopResource = new apigateway.Resource(this, 'ShopTopResource', {
      parent: api.root,
      pathPart: 'shop'
    });
    this.shopResource.addCorsPreflight({
      allowOrigins: allowedOrigins,
      allowMethods: apigateway.Cors.ALL_METHODS,
      allowHeaders: [...apigateway.Cors.DEFAULT_HEADERS, 'X-QR-ID', 'X-QR-UUID', 'X-QR-PIN'],
    });

    const routeOptions = { authorizer, authorizationType: apigateway.AuthorizationType.CUSTOM };

    // Action-based POST Routes (Standard)
    addResourceWithCors(this.shopResource, 'list').addMethod('POST', new apigateway.LambdaIntegration(shop_list), routeOptions);

    const detailsRes = addResourceWithCors(this.shopResource, 'details');
    addResourceWithCors(detailsRes, 'get').addMethod('POST', new apigateway.LambdaIntegration(shop_details), routeOptions);
    addResourceWithCors(detailsRes, 'update').addMethod('POST', new apigateway.LambdaIntegration(shop_details), routeOptions);

    addResourceWithCors(this.shopResource, 'admins').addMethod('POST', new apigateway.LambdaIntegration(shop_admins), routeOptions);
    const deleteRes = addResourceWithCors(this.shopResource, 'delete');
    addResourceWithCors(deleteRes, 'images').addMethod('POST', new apigateway.LambdaIntegration(shop_delete_images), routeOptions);

    // /shop/products
    const productsResource = addResourceWithCors(this.shopResource, 'products');
    addResourceWithCors(productsResource, 'list').addMethod('POST', new apigateway.LambdaIntegration(shop_products), routeOptions);
    addResourceWithCors(productsResource, 'create').addMethod('POST', new apigateway.LambdaIntegration(shop_products), routeOptions);
    addResourceWithCors(productsResource, 'update').addMethod('POST', new apigateway.LambdaIntegration(shop_products), routeOptions);
    addResourceWithCors(productsResource, 'delete').addMethod('POST', new apigateway.LambdaIntegration(shop_products), routeOptions);

    const importRes = addResourceWithCors(productsResource, 'import');
    addResourceWithCors(importRes, 'list').addMethod('POST', new apigateway.LambdaIntegration(shop_products_import), routeOptions);
    addResourceWithCors(importRes, 'execute').addMethod('POST', new apigateway.LambdaIntegration(shop_products_import), routeOptions);
    addResourceWithCors(productsResource, 'uploadurl').addMethod('POST', new apigateway.LambdaIntegration(shop_products_uploadurl), routeOptions);

    // /shop/qr
    const qrResource = addResourceWithCors(this.shopResource, 'qr');
    addResourceWithCors(qrResource, 'list').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);
    addResourceWithCors(qrResource, 'link').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);
    addResourceWithCors(qrResource, 'unlink').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);
    addResourceWithCors(qrResource, 'activate').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);
    addResourceWithCors(qrResource, 'deactivate').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);

    addResourceWithCors(this.shopResource, 'qrcodecheck').addMethod('POST', new apigateway.LambdaIntegration(shop_qr), routeOptions);

    // /shop/orders
    const ordersResource = addResourceWithCors(this.shopResource, 'orders');
    addResourceWithCors(ordersResource, 'list').addMethod('POST', new apigateway.LambdaIntegration(shop_orders), routeOptions);
    addResourceWithCors(ordersResource, 'update').addMethod('POST', new apigateway.LambdaIntegration(shop_orders), routeOptions);

    // /shop/card/orders
    const cardRes = addResourceWithCors(this.shopResource, 'card');
    const cardOrdersResource = addResourceWithCors(cardRes, 'orders');
    addResourceWithCors(cardOrdersResource, 'create').addMethod('POST', new apigateway.LambdaIntegration(shop_card_orders), routeOptions);
    addResourceWithCors(cardOrdersResource, 'list').addMethod('POST', new apigateway.LambdaIntegration(shop_card_orders), routeOptions);
    addResourceWithCors(cardOrdersResource, 'cancel').addMethod('POST', new apigateway.LambdaIntegration(shop_card_orders), routeOptions);
    addResourceWithCors(cardOrdersResource, 'complete').addMethod('POST', new apigateway.LambdaIntegration(shop_card_orders), routeOptions);

  }
}
