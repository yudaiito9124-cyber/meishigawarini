/**
 * @file user-api.ts
 * @role 一般ユーザー API 構築コンストラクト
 * @responsibility
 *  - 贈り主（Sender）および被贈答者（Receiver）がログイン後に利用する REST API エンドポイントを定義します。
 *  - 【認証の統合】`shopAuthorizer` ロジックを再利用し、Cognito ID トークンに基づいた安全な本人確認と、自身のプロフィール・履歴へのアクセスのみを許可します。
 *  - 【パーソナライズ機能】プロフィール管理、ギフト送信履歴、受け取りアカウント設定など、エンドユーザー向けのコア機能を提供します。
 * @context
 *  - `InfraStack` からインスタンス化され、`/user/*` 配下のルーティングを管理します。
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
import { USER_ALLOW_HEADERS } from '../../../shared/constants';

export interface UserApiProps {
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
 * ユーザー向け API サブシステム。
 * 
 * @description
 * ユーザー自身のプロフィール、ギフト履歴、および受取人としての配送先情報の管理をサポートします。
 */
export class UserApi extends cdk.NestedStack {
  public readonly userResource: apigateway.Resource;

  constructor(scope: cdk.Stack, id: string, props: UserApiProps) {
    super(scope, id);

    const { table, bucket, userPool, userPoolClient, api, commonProps, allowedOrigins, grantTablePermissions } = props;
    const lampath = (name: string) => path.join(__dirname, `../../lambda/${name}.ts`);
    const authpath = (name: string) => path.join(__dirname, `../../lambda/authorizer/${name}.ts`);

    /**
     * ユーザー認証 (UserAuthorizer)
     * - `shopAuthorizer` のロジックを共有します。
     * - ショップ ID が指定されない場合、このハンドラーは単なる ID トークンの検証器として機能し、
     *   デコードされた `userId` を後続の Lambda へ渡します。
     */
    const userAuthFn = new nodejs.NodejsFunction(this, 'UserAuthorizerFn', {
      entry: authpath('shopAuthorizer'),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
        TABLE_NAME: table.tableName,
      },
    });
    grantTablePermissions(userAuthFn);

    const authorizer = new apigateway.RequestAuthorizer(this, 'UserAuthorizer', {
      handler: userAuthFn,
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

    const user_profile = new nodejs.NodejsFunction(this, 'user_profile', { entry: lampath('user_profile'), ...fnProps });
    const user_history = new nodejs.NodejsFunction(this, 'user_history', { entry: lampath('user_history'), ...fnProps });
    const user_receiver = new nodejs.NodejsFunction(this, 'user_receiver', { entry: lampath('user_receiver'), ...fnProps });
    const unified_chat = new nodejs.NodejsFunction(this, 'unified_chat', { entry: lampath('unified_chat'), ...fnProps });

    // --- Permissions ---
    [user_profile, user_history, user_receiver, unified_chat].forEach(fn => {
      grantTablePermissions(fn, true);
      bucket.grantRead(fn);
    });

    // Profile needs write/delete for images
    bucket.grantPut(user_profile);
    bucket.grantDelete(user_profile);

    /**
     * ルーティングの構築
     * `/user/*` 配下のリソースを定義します。
     */
    const addResourceWithCors = (parent: apigateway.IResource, pathPart: string): apigateway.Resource => {
      const res = parent.addResource(pathPart) as apigateway.Resource;
      res.addCorsPreflight({
        allowOrigins: allowedOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: USER_ALLOW_HEADERS,
      });
      return res;
    };

    // /user
    this.userResource = new apigateway.Resource(this, 'UserTopResource', {
      parent: api.root,
      pathPart: 'user'
    });
    this.userResource.addCorsPreflight({
      allowOrigins: allowedOrigins,
      allowMethods: apigateway.Cors.ALL_METHODS,
      allowHeaders: USER_ALLOW_HEADERS,
    });

    const routeOptions = { authorizer, authorizationType: apigateway.AuthorizationType.CUSTOM };

    const profileResource = addResourceWithCors(this.userResource, 'profile');
    addResourceWithCors(profileResource, 'get').addMethod('POST', new apigateway.LambdaIntegration(user_profile), routeOptions);
    addResourceWithCors(profileResource, 'update').addMethod('POST', new apigateway.LambdaIntegration(user_profile), routeOptions);
    addResourceWithCors(profileResource, 'uploadurl').addMethod('POST', new apigateway.LambdaIntegration(user_profile), routeOptions);

    const receiverResource = addResourceWithCors(this.userResource, 'receiver');
    addResourceWithCors(receiverResource, 'get').addMethod('POST', new apigateway.LambdaIntegration(user_receiver), routeOptions);
    addResourceWithCors(receiverResource, 'update').addMethod('POST', new apigateway.LambdaIntegration(user_receiver), routeOptions);

    const historyResource = addResourceWithCors(this.userResource, 'history');
    addResourceWithCors(historyResource, 'get').addMethod('POST', new apigateway.LambdaIntegration(user_history), routeOptions);
    addResourceWithCors(historyResource, 'sendgift').addMethod('POST', new apigateway.LambdaIntegration(user_history), routeOptions);

    // /unified/chat
    // 例外構成: 本プロジェクトの通常ルール（1 Lambda = 1 API）に対して、
    // unified_chat は1つの Lambda で複数エンドポイントを処理します。
    // Lambda 内では event.resource の完全一致で分岐する実装に統一しています。
    const unifiedResource = new apigateway.Resource(this, 'UnifiedTopResource', {
      parent: api.root,
      pathPart: 'unified'
    });
    unifiedResource.addCorsPreflight({
      allowOrigins: allowedOrigins,
      allowMethods: apigateway.Cors.ALL_METHODS,
      allowHeaders: USER_ALLOW_HEADERS,
    });

    const chatResource = addResourceWithCors(unifiedResource, 'chat');
    // create/list/get はチャット単位の操作
    addResourceWithCors(chatResource, 'create').addMethod('POST', new apigateway.LambdaIntegration(unified_chat), routeOptions);
    addResourceWithCors(chatResource, 'list').addMethod('POST', new apigateway.LambdaIntegration(unified_chat), routeOptions);
    addResourceWithCors(chatResource, 'get').addMethod('POST', new apigateway.LambdaIntegration(unified_chat), routeOptions);

    const messagesResource = addResourceWithCors(chatResource, 'messages');
    // messages/get と messages/send は履歴参照・送信の操作
    addResourceWithCors(messagesResource, 'get').addMethod('POST', new apigateway.LambdaIntegration(unified_chat), routeOptions);
    addResourceWithCors(messagesResource, 'send').addMethod('POST', new apigateway.LambdaIntegration(unified_chat), routeOptions);

    const readResource = addResourceWithCors(chatResource, 'read');
    addResourceWithCors(readResource, 'mark').addMethod('POST', new apigateway.LambdaIntegration(unified_chat), routeOptions);

    const statusResource = addResourceWithCors(chatResource, 'status');
    addResourceWithCors(statusResource, 'update').addMethod('POST', new apigateway.LambdaIntegration(unified_chat), routeOptions);
  }
}
