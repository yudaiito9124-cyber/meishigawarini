import { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from '../share/shop-auth';

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
    const groups = (payload['cognito:groups'] as string[]) || [];

    // 2. ショップIDの取得 (パスパラメータから)
    // Request Authorizerでは event.pathParameters が利用可能
    const shopId = event.pathParameters?.shopId;

    if (!shopId) {
      // shopIdがないリクエスト（一覧取得や作成など）
      console.log('No shopId in path, allowing based on valid token');
      return generatePolicy(userId, 'Allow', event.methodArn, {
        username: payload['cognito:username'] as string,
        email: payload.email as string,
        groups: JSON.stringify(groups)
      });
    }

    // 3. ショップ所有権のチェック (共通ロジックを使用)
    const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, null, groups);

    if (shopMetadata) {
      const isGlobalAdmin = groups.includes('GlobalAdmins');
      return generatePolicy(userId, 'Allow', event.methodArn, {
        username: payload['cognito:username'] as string,
        email: payload.email as string,
        groups: JSON.stringify(groups),
        shopId: shopId,
        isGlobalAdmin: isGlobalAdmin ? 'true' : 'false'
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
