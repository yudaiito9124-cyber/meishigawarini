/**
 * @file userAuthorizer.ts
 * @role 一般ユーザー用 Lambda Authorizer (Request Authorizer)
 * @responsibility
 *  - エンドユーザー（送り主・受取人としてログインしているユーザー）の API アクセスを認可します。
 *  - Cognito ID トークンの妥当性を検証し、ユーザーを一意に識別する ID（sub）を確定させます。
 * @context
 *  - マイページや履歴取得（`/user/...`）などのエンドポイントに適用されます。
 *  - ここで特定された `user_id` は `appendToHistory` 等の処理において、正しいユーザーレコードを特定するために極めて重要です。
 */

import { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getHeader } from '../utils/request';

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.CLIENT_ID || '';

/** JWT 検証器の初期化 */
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',
  clientId: CLIENT_ID,
});

/**
 * ユーザー認可ハンドラー。
 * 
 * @description
 * 1. authorization ヘッダーからトークンを抽出。
 * 2. `aws-jwt-verify` により、Cognito User Pool ID と Client ID に基づいた署名検証を実施。
 * 3. 認可成功時、トークンの `sub` クレームを `user_id` として、且つ `principalId` として返却。
 * 
 * @param event - APIGateway からのリクエスト認可イベント。
 * @returns IAM ポリシー。
 */
export const handler = async (event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  try {
    // 1. authorization ヘッダーからトークンを抽出
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
    // - 有効期限、署名、発行元 (iss)、クライアント ID (aud) を検証します。
    const payload = await verifier.verify(token);
    const userId = payload.sub; // Cognito のユーザー一意識別子 (sub)
    const groups = (payload['cognito:groups'] as string[]) || [];

    // 3. 認可ポリシーの生成
    // - 検証に成功した場合、userId を principalId として 'Allow' ポリシーを返却します。
    // - context に含めた情報は、後続の Lambda ハンドラーで 
    //   event.requestContext.authorizer.user_id 等として参照可能です。
    return generatePolicy(userId, 'Allow', event.methodArn, {
      username: payload['cognito:username'] as string,
      email: payload.email as string,
      groups: JSON.stringify(groups),
      user_id: userId
    });

  } catch (err) {
    console.error('Token verification failed:', err);
    // トークンが無効な場合 (期限切れ、改ざん等) は 403 Forbidden (Deny) を返却（APIGateway はこれを 401 に変換可能）
    return generatePolicy('verification-failed', 'Deny', event.methodArn);
  }
};

/**
 * API Gateway に返却する認可ポリシーを生成。
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
          // キャッシュ対策：ステージ全体の Wildcard に対して許可
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
