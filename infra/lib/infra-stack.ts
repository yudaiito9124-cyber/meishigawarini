import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

import { AdminApi } from './constructs/admin-api';
import { ShopApi } from './constructs/shop-api';
import { ReceiveApi } from './constructs/receive-api';

const DEFAULT_VALID_DAYS = process.env.DEFAULT_VALID_DAYS || '1';

export interface InfraStackProps extends cdk.StackProps {
  stage: string;
}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const stage = props.stage;
    const suffix = stage === 'prod' ? '' : `-${stage}`;


    ////////////////////////////////////////////////////////////////////////////////
    // CORS設定
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


    ////////////////////////////////////////////////////////////////////////////////
    // データベース（テキストデータ）
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

    // DynamoDBの逆引き用インデックス
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

    // DynamoDBへのアクセス権限をLambdaに付与するヘルパー関数
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


    ////////////////////////////////////////////////////////////////////////////////
    // データベース（メディアデータ）
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


    ////////////////////////////////////////////////////////////////////////////////
    // ユーザ一覧・認証
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

    // Add User Pool Domain for Hosted UI
    // Note: Prefix must be globally unique across AWS in the region.
    userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: `meishigawarini${suffix}`,
      },
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
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
        cognito.UserPoolClientIdentityProvider.AMAZON,
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
          ...allowedOrigins.map(origin => `${origin}/ja/login/`),
          ...allowedOrigins.map(origin => `${origin}/en/login/`),
        ],
        logoutUrls: [
          ...allowedOrigins.map(origin => `${origin}/`),
          ...allowedOrigins.map(origin => `${origin}/ja/`),
          ...allowedOrigins.map(origin => `${origin}/en/`),
          ...allowedOrigins.map(origin => `${origin}/login/`),
          ...allowedOrigins.map(origin => `${origin}/ja/login/`),
          ...allowedOrigins.map(origin => `${origin}/en/login/`),
        ],
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
      },
    });

    // ALLOW_USER_AUTH を有効化 (パスキー / WebAuthn に必要)
    const cfnUserPoolClient = userPoolClient.node.defaultChild as cognito.CfnUserPoolClient;
    cfnUserPoolClient.explicitAuthFlows = [
      'ALLOW_USER_SRP_AUTH',
      'ALLOW_REFRESH_TOKEN_AUTH',
      'ALLOW_USER_AUTH'
    ];




    ////////////////////////////////////////////////////////////////////////////////
    // ルーティング・API制御
    // API Gateway
    const apiId = `MeishiGawariniApi${suffix}`;
    const api = new apigateway.RestApi(this, apiId, {
      restApiName: `MeishiGawarini Service${suffix}`,
      description: `Backend API for MeishiGawarini (Deployment ID: ${Date.now()})`, // Forces stage redeployment
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [...apigateway.Cors.DEFAULT_HEADERS, 'X-QR-UUID', 'X-QR-PIN'],
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

    // --- その他 全ての4XX系エラーへのCORS許可 ---
    api.addGatewayResponse('Default4XXResponse', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseParameters: {
        'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Headers': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
    } as any);

    // --- その他 全ての5XX系エラーへのCORS許可 ---
    api.addGatewayResponse('Default5XXResponse', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseParameters: {
        'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Headers': "'*'",
        'gatewayresponse.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
      },
    } as any);


    ////////////////////////////////////////////////////////////////////////////////
    // Lambda共通設定
    // Lambda Layer or Bundling
    const commonProps = {
      handler: 'handler',
      environment: { // 環境変数の受け渡し
        TABLE_NAME: table.tableName,
        DEFAULT_VALID_DAYS: DEFAULT_VALID_DAYS,
        SENDER_EMAIL: process.env.SENDER_EMAIL || '',
        RESEND_API_KEY: process.env.RESEND_API_KEY || '', // Added Resend API Key
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '',
      },
      timeout: cdk.Duration.seconds(30), // タイムアウト設定
      bundling: { // バンドリング設定
        externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', '@aws-sdk/client-ses'],
      }
    };



    ////////////////////////////////////////////////////////////////////////////////
    // 各APIの設定(LambdaとURL、権限の紐づけ)
    // Admin API
    new AdminApi(this, 'AdminApiConstruct', {
      table,
      bucket,
      userPool,
      userPoolClient,
      api,
      commonProps,
      grantTablePermissions,
    });

    // Shop API
    new ShopApi(this, 'ShopApiConstruct', {
      table,
      bucket,
      userPool,
      userPoolClient,
      api,
      commonProps,
      grantTablePermissions,
    });

    // Receive API
    new ReceiveApi(this, 'ReceiveApiConstruct', {
      table,
      bucket,
      userPool,
      api,
      commonProps,
      grantTablePermissions,
    });


    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoDomain', { value: `meishigawarini${suffix}.auth.${this.region}.amazoncognito.com` });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
