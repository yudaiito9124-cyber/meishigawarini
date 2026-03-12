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
  const token = event.authorizationToken.replace('Bearer ', '');

  try {
    // 1. JWTの検証
    const payload = await verifier.verify(token);

    // 2. グループのチェック
    const groups = (payload['cognito:groups'] as string[]) || [];
    const isAdmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');

    if (!isAdmin) {
      console.log('User is not an administrator. Groups:', groups);
      return generatePolicy('user', 'Deny', event.methodArn);
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
        mfaRequired: 'true',
        username: payload['cognito:username'] as string,
        amr: JSON.stringify(amr)
      });
    }

    // 4. ポリシーの生成 (Allow)
    return generatePolicy(payload.sub, 'Allow', event.methodArn, {
      username: payload['cognito:username'] as string,
      email: payload.email as string,
      groups: JSON.stringify(groups),
    });

  } catch (err) {
    console.error('Token verification failed:', err);
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

function generatePolicy(principalId: string, effect: string, resource: string, context?: any): APIGatewayAuthorizerResult {
  const authResponse: any = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          // admin配下をワイルドカードで許可
          Resource: resource.split('/').slice(0, 2).join('/') + '/*/*', 
        },
      ],
    },
  };

  if (context) {
    authResponse.context = context;
  }

  return authResponse;
}
