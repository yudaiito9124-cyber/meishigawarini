import { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.CLIENT_ID || '';
const TABLE_NAME = process.env.TABLE_NAME || '';

// JWT検証用の検証器を作成
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',
  clientId: CLIENT_ID,
});

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

export const handler = async (event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  try {
    const authorizationToken = event.headers?.['Authorization'] || event.headers?.['authorization'];
    if (!authorizationToken) {
      console.log('No authorization token provided');
      return generatePolicy('unauthorized-user', 'Deny', event.methodArn);
    }

    const token = authorizationToken.replace('Bearer ', '');
    if (!token || token === 'undefined' || token === 'null') {
      console.log('Invalid token format or value');
      return generatePolicy('invalid-token', 'Deny', event.methodArn);
    }

    // 1. JWTの検証
    const payload = await verifier.verify(token);
    const userId = payload.sub;

    // 2. ショップIDの取得 (パスパラメータから)
    // Request Authorizerでは event.pathParameters が利用可能
    const shopId = event.pathParameters?.shopId;

    if (!shopId) {
      // shopIdがないリクエスト（一覧取得や作成など）
      // 一覧取得(/shop)や作成(POST /shop)の場合は、ログインしていればまずは許可
      // ※より厳密にするなら、ここではパスを見て判断を分ける
      console.log('No shopId in path, allowing based on valid token');
      return generatePolicy(userId, 'Allow', event.methodArn, {
        username: payload['cognito:username'] as string,
        email: payload.email as string,
      });
    }

    // 3. ショップ所有権のチェック
    // Original logic: GlobalAdmin bypass -> User Role Record Check -> Metadata Fallback
    const groups = (payload['cognito:groups'] as string[]) || [];
    const isGlobalAdmin = groups.includes('GlobalAdmins') || groups.includes('Administrators');

    if (isGlobalAdmin) {
      return generatePolicy(userId, 'Allow', event.methodArn, {
        username: payload['cognito:username'] as string,
        email: payload.email as string,
        shopId: shopId,
        isGlobalAdmin: 'true'
      });
    }

    // Check User Role Record
    const userRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'SHOP' }
    }));

    if (userRes.Item) {
      const ownerIds = userRes.Item.owner_shop_ids || [];
      const gmIds = userRes.Item.gm_shop_ids || [];
      if (ownerIds.includes(shopId) || gmIds.includes(shopId)) {
        return generatePolicy(userId, 'Allow', event.methodArn, {
          username: payload['cognito:username'] as string,
          email: payload.email as string,
          shopId: shopId,
          isGlobalAdmin: 'false'
        });
      }
    }

    // Fallback: Check Shop Metadata direct ownership
    const shopRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `SHOP#${shopId}`,
        SK: 'METADATA'
      }
    }));

    if (!shopRes.Item) {
      console.log(`Shop not found or no permission: ${shopId}`);
      return generatePolicy(userId, 'Deny', event.methodArn);
    }

    const isOwner = shopRes.Item.owner_id === userId;
    const isGM = (shopRes.Item.gm_ids || []).includes(userId);

    if (isOwner || isGM) {
      return generatePolicy(userId, 'Allow', event.methodArn, {
        username: payload['cognito:username'] as string,
        email: payload.email as string,
        shopId: shopId,
        isGlobalAdmin: 'false'
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
 * API Gateway に返すための認可ポリシーを生成する
 * @param principalId ユーザーを一意に識別するID (ログやメトリクスで使用)
 * @param effect 'Allow' (許可) または 'Deny' (拒否)
 * @param resource リクエストされたリソースのARN
 * @param context 後続のLambdaハンドラーに引き継ぐ追加情報
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
          // 特定のURLだけでなく、このAPIステージ全体へのアクセスを許可する (キャッシュ対策)
          // 例: arn:aws:execute-api:region:account:api-id/stage/*
          Resource: resource.split('/').slice(0, 2).join('/') + '/*', 
        },
      ],
    },
  };

  if (context) {
    authResponse.context = context; // 後続の Lambda で event.requestContext.authorizer.[key] として取得可能
  }

  return authResponse;
}
