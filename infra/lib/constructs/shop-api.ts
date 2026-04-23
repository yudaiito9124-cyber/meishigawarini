/**
 * @file shop-api.ts
 * @role ショップオーナー API 構築コンストラクト
 * @responsibility
 *  - ショップ運営・オーナー向けの REST API エンドポイントを一括定義します。
 *  - 【マルチテナント認可】`shopAuthorizer` を使用し、リクエストされたショップ ID に対して実行ユーザーが権限を持っているか（オーナーまたは GM か）を動的に検証します。
 *  - 【メディア操作権限】商品画像や QR コード等の商用アセットを扱うため、各 Lambda に S3 の Read/Write 権限を厳格に付与します。
 * @context
 *  - `InfraStack` からインスタンス化され、`/shop/*` 配下のルーティングを管理します。
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
import { SHOP_ALLOW_HEADERS } from '../../../shared/constants';

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

/**
 * ショップ管理用 API サブシステム。
 * 
 * @description
 * 商品管理、QR 紐付け、注文ステータス更新、スタッフ管理など、
 * ショップ日次運営に必要な全機能をフロントエンドへ提供します。
 */
export class ShopApi extends cdk.NestedStack {
  public readonly shopResource: apigateway.Resource;

  constructor(scope: cdk.Stack, id: string, props: ShopApiProps) {
    super(scope, id);

    const { table, bucket, userPool, userPoolClient, api, commonProps, allowedOrigins, grantTablePermissions } = props;

    const lampath = (name: string) => path.join(__dirname, `../../lambda/${name}.ts`);
    const authpath = (name: string) => path.join(__dirname, `../../lambda/authorizer/${name}.ts`);

    /**
     * ショップ用カスタム認証 (ShopAuthorizer)
     * - API Gateway の RequestAuthorizer として動作します。
     * - リクエストヘッダーの `authorization` (ID Token) と `x-shop-id` を取得し、
     *   対象ショップに対するユーザーの管理権限を検証します。
     */
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
      identitySources: [apigateway.IdentitySource.header('authorization')],
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // --- Lambda Definitions ---
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
    const shop_owner_transfer = new nodejs.NodejsFunction(this, 'shop_owner_transfer', { entry: lampath('shop_owner_transfer'), ...fnProps });

    // --- Permissions ---
    const allShopLambdas = [
      shop_list, shop_details, shop_products, shop_products_import,
      shop_products_uploadurl, shop_qr, shop_admins, shop_delete_images, shop_orders,
      shop_card_orders, shop_owner_transfer
    ];
    allShopLambdas.forEach(fn => {
      grantTablePermissions(fn, true);
      bucket.grantPut(fn);
      bucket.grantRead(fn);
      bucket.grantDelete(fn);
    });

    /**
     * ルーティングの構築
     * `/shop/*` 以下の全エンドポイントを構成し、`shopAuthorizer` による保護を適用します。
     */
    const addResourceWithCors = (parent: apigateway.IResource, pathPart: string): apigateway.Resource => {
      const res = parent.addResource(pathPart) as apigateway.Resource;
      res.addCorsPreflight({
        allowOrigins: allowedOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: SHOP_ALLOW_HEADERS,
      });
      return res;
    };

    // /shop
    this.shopResource = new apigateway.Resource(this, 'ShopTopResource', {
      parent: api.root,
      pathPart: 'shop'
    });
    this.shopResource.addCorsPreflight({
      allowOrigins: allowedOrigins,
      allowMethods: apigateway.Cors.ALL_METHODS,
      allowHeaders: SHOP_ALLOW_HEADERS,
    });

    const routeOptions = { authorizer, authorizationType: apigateway.AuthorizationType.CUSTOM };

    // --- Routes ---
    addResourceWithCors(this.shopResource, 'list').addMethod('POST', new apigateway.LambdaIntegration(shop_list), routeOptions);

    const detailsRes = addResourceWithCors(this.shopResource, 'details');
    addResourceWithCors(detailsRes, 'get').addMethod('POST', new apigateway.LambdaIntegration(shop_details), routeOptions);
    addResourceWithCors(detailsRes, 'update').addMethod('POST', new apigateway.LambdaIntegration(shop_details), routeOptions);

    const adminsRes = addResourceWithCors(this.shopResource, 'admins');
    adminsRes.addMethod('POST', new apigateway.LambdaIntegration(shop_admins), routeOptions);
    addResourceWithCors(adminsRes, 'validate').addMethod('POST', new apigateway.LambdaIntegration(shop_admins), routeOptions);
    addResourceWithCors(adminsRes, 'link').addMethod('POST', new apigateway.LambdaIntegration(shop_admins), routeOptions);
    addResourceWithCors(adminsRes, 'unlink').addMethod('POST', new apigateway.LambdaIntegration(shop_admins), routeOptions);
    
    const ownerRes = addResourceWithCors(this.shopResource, 'owner');
    const transferRes = addResourceWithCors(ownerRes, 'transfer');
    addResourceWithCors(transferRes, 'validate').addMethod('POST', new apigateway.LambdaIntegration(shop_owner_transfer), routeOptions);
    addResourceWithCors(transferRes, 'execute').addMethod('POST', new apigateway.LambdaIntegration(shop_owner_transfer), routeOptions);
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
