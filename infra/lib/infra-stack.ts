/**
 * @file infra-stack.ts
 * @role メインインフラストラクチャ・スタック定義
 * @responsibility
 *  - 「名刺代わりに」システムの全マネージドリソース（DB, ストレージ, 認証, API 基盤）の定義と紐付け。
 *  - 【環境戦略】
 *    - `prod` ステージ: 既存のデータベース（TableV2）をインポートして利用し、データの永続性を最優先します。
 *    - `stg` 等の非本番: 毎回新規にテーブルを作成し、スタック削除時にデータの自動破棄（RemovalPolicy.DESTROY）を許可してコストとクリーンさを保ちます。
 *  - 【セキュリティ設計】
 *    - API Gateway での 404/403 偽装（セキュリティ・バイ・オブスキュアリティ）によるエンドポイント探索の防止。
 *    - S3 バケットのパブリックアクセス完全遮断と、ドメイン制限付き CORS 設定。
 *    - Cognito MFA のオプション強制と WebAuthn (Passkeys) の有効化。
 * @context
 *  - `InfraStack` からインスタンス化され、システム全体の土台として機能します。
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ALL_ALLOW_HEADERS, joinHeaders } from '../../shared/constants';

import { AdminApi } from './constructs/admin-api';
import { ShopApi } from './constructs/shop-api';
import { ReceiveApi } from './constructs/receive-api';
import { UserApi } from './constructs/user-api';

const DEFAULT_VALID_DAYS = process.env.DEFAULT_VALID_DAYS || '1';

export interface InfraStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * システムのコア・インフラスタック。
 * 
 * @description
 * 単一のスタック内で VPC を使用しないサーバーレス構成（DynamoDB + S3 + Cognito + Lambda + API Gateway）を定義します。
 * 各 API モジュールは Construct として分割され、関心の分離を実現しています。
 */
export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const stage = props.stage;
    const isProd = stage.startsWith('prod');
    const suffix = stage === 'prod' ? '' : `-${stage}`;

    ////////////////////////////////////////////////////////////////////////////////
    /**
     * CORS 設定
     * フロントエンドのドメインおよびローカル開発環境からのアクセスを許可します。
     */
    const extraOrigins = process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',')
      : [];
    const allowedOrigins = [
      'https://meishigawarini.com',
      'https://stg.dh74sua11za2r.amplifyapp.com', // Staging
      'https://master.d19yct597o7t9y.amplifyapp.com', // Production
      'http://localhost:3000',
      'http://localhost:3001',
      ...extraOrigins
    ];

    ////////////////////////////////////////////////////////////////////////////////
    /**
     * データベース (DynamoDB TableV2)
     * 【ステージによる分岐】
     * - prod: 既存テーブルをインポート。データの物理削除を防止。
     * - 非本番: PK/SK 構成の新テーブルを作成。
     */
    let table: dynamodb.ITable;
    const sharedTableName = process.env.SHARED_TABLE_NAME;

    if (isProd) {
      // 既存のテーブルをインポート。変数が指定されていない場合はデフォルトの本番テーブル名を使用。
      const tableName = sharedTableName || 'InfraStack-MeishiGawariniTableV218E81B62-17GD6BQFOY8ZG';
      table = dynamodb.Table.fromTableName(this, 'MeishiGawariniTableV2-Original', tableName);
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

    /**
     * DynamoDB 二次インデックス (GSI)
     */
    if (table instanceof dynamodb.Table) {
      table.addGlobalSecondaryIndex({
        indexName: 'GSI1',
        partitionKey: { name: 'GSI1_PK', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'GSI1_SK', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });

      table.addGlobalSecondaryIndex({
        indexName: 'GSI2',
        partitionKey: { name: 'GSI2_PK', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'GSI2_SK', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });
    }

    /**
     * 権限セット・ヘルパー
     * インデックスを含めた適切な権限を Lambda に付与します。
     */
    const grantTablePermissions = (fn: lambda.IFunction, write: boolean = false) => {
      if (write) {
        table.grantReadWriteData(fn);
      } else {
        table.grantReadData(fn);
      }
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: write
          ? ['dynamodb:Query', 'dynamodb:Scan', 'dynamodb:BatchGetItem', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem']
          : ['dynamodb:Query', 'dynamodb:Scan', 'dynamodb:BatchGetItem', 'dynamodb:GetItem'],
        resources: [`${table.tableArn}/index/*`]
      }));
    };

    ////////////////////////////////////////////////////////////////////////////////
    /**
     * ストレージ (S3 Bucket)
     */
    const sharedBucketName = process.env.SHARED_S3_BUCKET_NAME;
    let bucket: s3.IBucket;

    if (isProd && sharedBucketName) {
      // 既存バケットをインポートして接続
      bucket = s3.Bucket.fromBucketName(this, 'ImportedProductImageBucket', sharedBucketName);
    } else {
      // 新規バケット作成
      const bucketId = `ProductImageBucket${suffix}`;
      bucket = new s3.Bucket(this, bucketId, {
        removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: isProd ? false : true,
        cors: [
          {
            allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
            allowedOrigins: allowedOrigins,
            allowedHeaders: ['*'],
          },
        ],
        publicReadAccess: false,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      });
    }

    ////////////////////////////////////////////////////////////////////////////////
    /**
     * 認証 (Cognito User Pool)
     */
    const sharedUserPoolId = process.env.SHARED_USER_POOL_ID;
    let userPool: cognito.IUserPool;

    if (isProd && sharedUserPoolId) {
      // 既存UserPoolをインポート
      userPool = cognito.UserPool.fromUserPoolId(this, 'ImportedUserPool', sharedUserPoolId);
    } else {
      // 新規UserPool作成
      const userPoolId = `MeishiGawariniUserPool${suffix}`;
      userPool = new cognito.UserPool(this, userPoolId, {
        selfSignUpEnabled: true,
        signInAliases: { email: true },
        autoVerify: { email: true },
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
        removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });

      userPool.addDomain('CognitoDomain', {
        cognitoDomain: {
          domainPrefix: `meishigawarini${suffix}`,
        },
      });

      const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;
      cfnUserPool.userPoolTier = 'ESSENTIALS';
    }

    const sharedUserPoolClientId = process.env.SHARED_USER_POOL_CLIENT_ID;
    let userPoolClient: cognito.IUserPoolClient;

    if (isProd && sharedUserPoolId && sharedUserPoolClientId) {
      // 既存のアプリケーションクライアントをインポート
      userPoolClient = cognito.UserPoolClient.fromUserPoolClientId(this, 'ImportedUserPoolClient', sharedUserPoolClientId);
    } else {
      // 新規アプリケーションクライアント作成
      userPoolClient = new cognito.UserPoolClient(this, 'MeishiGawariniUserPoolClient', {
        userPool,
        authFlows: { userSrp: true },
        idTokenValidity: cdk.Duration.hours(1),
        accessTokenValidity: cdk.Duration.hours(1),
        refreshTokenValidity: cdk.Duration.days(30),
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO
        ],
        oAuth: {
          flows: {
            authorizationCodeGrant: true,
          },
          callbackUrls: [
            ...allowedOrigins.map(origin => `${origin}/`),
            ...allowedOrigins.map(origin => `${origin}/ja/`),
            ...allowedOrigins.map(origin => `${origin}/en/`),
            ...allowedOrigins.map(origin => `${origin}/login/`),
          ],
          logoutUrls: [
            ...allowedOrigins.map(origin => `${origin}/`),
            ...allowedOrigins.map(origin => `${origin}/ja/`),
            ...allowedOrigins.map(origin => `${origin}/en/`),
            ...allowedOrigins.map(origin => `${origin}/login/`),
          ],
          scopes: [
            cognito.OAuthScope.EMAIL,
            cognito.OAuthScope.OPENID,
            cognito.OAuthScope.PROFILE,
            cognito.OAuthScope.COGNITO_ADMIN,
          ],
        },
      });

      const cfnUserPoolClient = userPoolClient.node.defaultChild as cognito.CfnUserPoolClient;
      cfnUserPoolClient.explicitAuthFlows = [
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
        'ALLOW_USER_AUTH' // WebAuthn (Passkeys) 用
      ];
    }

    ////////////////////////////////////////////////////////////////////////////////
    /**
     * API 基盤 (API Gateway REST API)
     */
    const apiId = `MeishiGawariniApi${suffix}`;
    const api = new apigateway.RestApi(this, apiId, {
      restApiName: `MeishiGawarini Service${suffix}`,
      description: `Backend API for MeishiGawarini`,
      deploy: false,
    });

    // --- 認証エラー(401)を 404 に偽装しつつ CORS を許可 ---
    api.addGatewayResponse('Default401Response', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      statusCode: '404',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': `'${joinHeaders(ALL_ALLOW_HEADERS)}'`,
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
      templates: {
        'application/json': '{"message": "Not Found."}'
      }
    });

    // --- 権限エラー(403)を 404 に偽装しつつ CORS を許可 ---
    api.addGatewayResponse('Default403Response', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      statusCode: '404',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
      templates: {
        'application/json': '{"message": "Not Found."}'
      }
    });

    // --- エンドポイント未定義エラー(403)を 404 に偽装しつつ CORS を許可 ---
    api.addGatewayResponse('DefaultMissingAuthTokenResponse', {
      type: apigateway.ResponseType.MISSING_AUTHENTICATION_TOKEN,
      statusCode: '404',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
      templates: {
        'application/json': '{"message": "Not Found (Missing Auth Token). Check Deployment."}'
      }
    });

    // --- タイムアウト(504) ---
    api.addGatewayResponse('IntegrationTimeoutResponse', {
      type: apigateway.ResponseType.INTEGRATION_TIMEOUT,
      statusCode: '504',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
      templates: {
        'application/json': '{"message": "Gateway Timeout"}'
      }
    });

    // --- 統合エラー(500) ---
    api.addGatewayResponse('IntegrationFailureResponse', {
      type: apigateway.ResponseType.INTEGRATION_FAILURE,
      statusCode: '500',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
      templates: {
        'application/json': '{"message": "Internal Server Error"}'
      }
    });

    // --- その他 全ての4XX系エラーへのCORS許可 ---
    api.addGatewayResponse('Default4XXResponse', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
    });

    // --- その他 全ての5XX系エラーへのCORS許可 ---
    api.addGatewayResponse('Default5XXResponse', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
    });

    ////////////////////////////////////////////////////////////////////////////////
    /**
     * Lambda 関数の共通設定
     */
    const commonProps = {
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_LATEST,
      environment: { // 環境変数の受け渡し
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

    // 各APIの設定(LambdaとURL、権限の紐づけ)
    // Admin API
    const adminApi = new AdminApi(this, 'AdminApiConstruct', {
      bucket,
      userPool,
      userPoolClient,
      api,
      commonProps,
      allowedOrigins,
      grantTablePermissions,
    });

    // Shop API
    const shopApi = new ShopApi(this, 'ShopApiConstruct', {
      table,
      bucket,
      userPool,
      userPoolClient,
      api,
      commonProps,
      allowedOrigins,
      grantTablePermissions,
    });

    // User API
    const userApi = new UserApi(this, 'UserApiConstruct', {
      table,
      bucket,
      userPool,
      userPoolClient,
      api,
      commonProps,
      allowedOrigins,
      grantTablePermissions,
    });

    // Receive API
    const receiveApi = new ReceiveApi(this, 'ReceiveApiConstruct', {
      table,
      bucket,
      userPool,
      userPoolClient,
      api,
      commonProps,
      allowedOrigins,
      grantTablePermissions,
    });

    /**
     * デプロイメント定義
     */
    const deployment = new apigateway.Deployment(this, `ApiDeployment-${new Date().getTime()}`, {
      api: api,
      description: `Comprehensive deployment - Refs: ${adminApi.adminResource.resourceId}, ${shopApi.shopResource.resourceId}, ${userApi.userResource.resourceId}, ${receiveApi.receiveResource.resourceId}`,
    });
    deployment.node.addDependency(adminApi);
    deployment.node.addDependency(shopApi);
    deployment.node.addDependency(userApi);
    deployment.node.addDependency(receiveApi);

    // 各環境（stg/prod）のコンテキストに応じたステージ名を使用します。
    // これにより同一アカウント内でのステージ名の衝突を回避します。
    const apiStage = new apigateway.Stage(this, 'ApiStage', {
      deployment,
      stageName: stage,
    });

    /**
         * 外部出力 (Outputs)
         * フロントエンドの設定ファイルや運用時に必要な情報を出力します。
     */
    new cdk.CfnOutput(this, 'ApiUrl', { value: apiStage.urlForPath() });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoDomain', { value: `meishigawarini${suffix}.auth.${this.region}.amazoncognito.com` });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
