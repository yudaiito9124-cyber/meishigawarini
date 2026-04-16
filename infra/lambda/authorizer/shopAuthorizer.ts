/**
 * @file shopAuthorizer.ts
 * @role ショップ管理用 Lambda Authorizer (Request Authorizer)
 * @responsibility
 *  - ショップオーナーおよび店長（GM）による特定ショップへのアクセスを認可します。
 *  - パスパラメータから `shopId` を抽出し、実行ユーザーがそのショップに対して操作権限（オーナーまたは所属）を持っているかを検証します。
 *  - `GlobalAdmins` グループのユーザーについては、全ショップへのアクセスを無条件で許可します。
 * @context
 *  - ショップ管理画面（Shop UI）の API バックエンド全体（`/shop/{shopId}/...`）に適用されます。
 *  - 認可結果（shopId, userId 等）を context を通じて後続のビジネスロジック Lambda へ安全にバイパスします。
 */

import { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from '../share/shop-auth';
import { getHeader } from '../utils/request';

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.CLIENT_ID || '';
const TABLE_NAME = process.env.TABLE_NAME || '';

/** JWT 検証器の初期化 */
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',
  clientId: CLIENT_ID,
});

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

/**
 * ショップ権限認可ハンドラー。
 * 
 * @description
 * 1. トークンの抽出: ID トークンを検証。
 * 2. `shopId` の特定: 
 *    - Request Authorizer として、APIGateway から渡される `event.pathParameters` を参照します。
 *    - `shopId` がパラメータに含まれないエンドポイント（新規作成等）の場合は、トークンが有効であれば Allow とします。
 * 3. 権限（Ownership/GM）検証:
 *    - 共通ユーティリティ `checkShopOwnerOrGM` を呼び出し、DynamoDB 上の権限レコードを確認。
 *    - グローバル管理者の場合はこのチェックをパス。
 * 
 * @param event - APIGateway からのリクエスト認可イベント。
 * @returns IAM ポリシードキュメント。
 */
export const handler = async (event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  try {
    const authorizationToken = getHeader(event.headers, 'authorization');
    if (!authorizationToken) {
      console.log('No authorization token provided');
      return generatePolicy('unauthorized-user', 'Deny', event.methodArn);
    }

    const token = authorizationToken.replace('Bearer ', '');
    if (!token || token === 'undefined' || token === 'null') {
      console.log('Invalid token format or value');
      return generatePolicy('invalid-token', 'Deny', event.methodArn);
    }

    // 1. JWT の検証
    const payload = await verifier.verify(token);
    const userId = payload.sub;
    const groups = (payload['cognito:groups'] as string[]) || [];

    // 2. ショップ ID の取得 (パスパラメータから)
    const shopId = event.pathParameters?.shopId;

    if (!shopId) {
      // shopId がパスに含まれない（例: ショップ一覧、ショップ作成等）
      // このレベルではトークンの正当性のみを保証し、詳細な条件はビジネスロジック側で処理します。
      console.log('No shopId in path, allowing based on valid token');
      return generatePolicy(userId, 'Allow', event.methodArn, {
        username: payload['cognito:username'] as string,
        email: payload.email as string,
        groups: JSON.stringify(groups)
      });
    }

    // 3. ショップ所有権のチェック (共通ロジックを使用)
    // - ユーザー情報の SK=SHOP から所属先リストを取得し、shopId が含まれるか確認。
    // - または、ショップメタデータから owner_id が userId と一致するかを確認。
    const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, null, groups);

    if (shopMetadata) {
      const is_global_admin = groups.includes('GlobalAdmins');
      return generatePolicy(userId, 'Allow', event.methodArn, {
        username: payload['cognito:username'] as string,
        email: payload.email as string,
        groups: JSON.stringify(groups),
        shop_id: shopId,
        is_global_admin: is_global_admin ? 'true' : 'false',
        user_id: userId
      });
    }

    console.log(`User ${userId} does not have permission for shop ${shopId}`);
    return generatePolicy(userId, 'Deny', event.methodArn);

  } catch (err) {
    console.error('Token verification failed:', err);
    return generatePolicy('verification-failed', 'Deny', event.methodArn);
  }
};

/**
 * 認可レスポンスを生成。
 */
function generatePolicy(principalId: string, effect: string, resource: string, context?: any): APIGatewayAuthorizerResult {
  const authResponse: any = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          // 特定のメソッドだけでなく、API ステージの Wildcard に対して許可（キャッシュ問題への対策）
          Resource: resource.split('/').slice(0, 2).join('/') + '/*',
        },
      ],
    },
  };

  if (context) {
    authResponse.context = context;
  }

  return authResponse;
}
