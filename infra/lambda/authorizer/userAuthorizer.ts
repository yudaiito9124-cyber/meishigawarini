import { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getHeader } from '../utils/request';

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.CLIENT_ID || '';

// JWT検証用の検証器を作成
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',
  clientId: CLIENT_ID,
});

export const handler = async (event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  try {
    // 1. authorizationヘッダーからトークンを抽出
    const authorizationToken = getHeader(event.headers, 'authorization');
    if (!authorizationToken) {
      console.log('No authorization token provided');
      return generatePolicy('unauthorized-user', 'Deny', event.methodArn);
    }

    const token = authorizationToken.replace('Bearer ', '');
    // トークンが空、または無効な文字列 ('undefined', 'null') の場合は拒否
    if (!token || token === 'undefined' || token === 'null') {
      console.log('Invalid token format or value');
      return generatePolicy('invalid-token', 'Deny', event.methodArn);
    }

    // 2. JWT (Cognito ID Token) の検証
    // - 有効期限、署名、発行元 (iss)、クライアントID (aud) を検証します。
    const payload = await verifier.verify(token);
    const userId = payload.sub; // Cognitoのユーザー一意識別子 (sub)
    const groups = (payload['cognito:groups'] as string[]) || [];

    // 3. 認可ポリシーの生成
    // - 検証に成功した場合、userId を principalId として 'Allow' ポリシーを返却します。
    // - context に含めた情報は、後続の Lambda ハンドラーで 
    //   event.requestContext.authorizer.userId 等として参照可能です。
    return generatePolicy(userId, 'Allow', event.methodArn, {
      username: payload['cognito:username'] as string,
      email: payload.email as string,
      groups: JSON.stringify(groups),
      user_id: userId
    });

  } catch (err) {
    console.error('Token verification failed:', err);
    // トークンが無効な場合 (期限切れ、改ざん等) は 401 Unauthorized (Deny) を返却
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
