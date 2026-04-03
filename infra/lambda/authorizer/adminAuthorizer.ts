import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.CLIENT_ID || '';

// JWT検証用の検証器を作成
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',
  clientId: CLIENT_ID,
});

const cognito = new CognitoIdentityProviderClient({});

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  try {
    const authorizationToken = event.authorizationToken;
    if (!authorizationToken) {
      console.log('No authorization token provided');
      return generatePolicy('unauthorized-user', 'Deny', event.methodArn);
    }

    const token = authorizationToken.replace('Bearer ', '');
    if (!token || token === 'undefined' || token === 'null') {
      console.log('Invalid token format or value:', token);
      return generatePolicy('invalid-token', 'Deny', event.methodArn);
    }

    // 1. JWTの検証
    const payload = await verifier.verify(token);

    // 2. グループのチェック
    const groups = (payload['cognito:groups'] as string[]) || [];
    const isAdmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');

    if (!isAdmin) {
      console.log('User is not an administrator. Groups:', groups);
      return generatePolicy(payload.sub, 'Deny', event.methodArn);
    }

    // 3. MFAチェック
    const amr = (payload['amr'] as string[]) || [];
    let usedMfa = amr.some(v => v.includes('mfa') || v === 'totp' || v === 'software_token_mfa' || v === 'webauthn');

    // [Fallback] amrが空の場合、Cognito APIでユーザー設定を確認する
    if (!usedMfa) {
      console.log('AMR is empty. Checking Cognito User MFA settings as fallback...', { sub: payload.sub });
      try {
        const user = await cognito.send(new AdminGetUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: payload.sub
        }));

        // PreferredMfaSetting が設定されているか、MFAOptions が存在すれば MFA ユーザーとみなす
        const hasMfaEnabled = !!(user.PreferredMfaSetting || (user.MFAOptions && user.MFAOptions.length > 0));

        if (hasMfaEnabled) {
          console.log('User has MFA enabled/preferred in Cognito. Success login implies MFA usage.');
          usedMfa = true;
        }
      } catch (cognitoErr) {
        console.error('Failed to fetch user MFA settings from Cognito:', cognitoErr);
      }
    }

    if (!usedMfa) {
      console.log('Admin user access denied: MFA evidence not found and not enabled in profile. AMR:', amr);
      return generatePolicy(payload.sub, 'Deny', event.methodArn, {
        mfa_required: 'true',
        username: payload['cognito:username'] as string,
        amr: JSON.stringify(amr),
        user_id: payload.sub
      });
    }

    // 4. ポリシーの生成 (Allow)
    return generatePolicy(payload.sub, 'Allow', event.methodArn, {
      username: payload['cognito:username'] as string,
      email: payload.email as string,
      groups: JSON.stringify(groups),
      is_global_admin: groups.includes('GlobalAdmins') ? 'true' : 'false',
      is_admin: groups.includes('Administrators') ? 'true' : 'false',
      user_id: payload.sub
    });

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
          // 例: arn:aws:execute-api:region:account:api-id/stage/*/*
          Resource: resource.split('/').slice(0, 2).join('/') + '/*/*',
        },
      ],
    },
  };

  if (context) {
    authResponse.context = context; // 後続の Lambda で event.requestContext.authorizer.[key] として取得可能
  }

  return authResponse;
}
