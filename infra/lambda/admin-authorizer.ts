import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.CLIENT_ID || '';

// JWT検証用の検証器を作成
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id', // Administratorsグループの情報が含まれるのは通常IDトークン
  clientId: CLIENT_ID,
});

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  const token = event.authorizationToken.replace('Bearer ', '');

  try {
    // 1. JWTの検証 (署名、期限、発行元、クライアントIDのチェック)
    const payload = await verifier.verify(token);

    // 2. グループのチェック
    const groups = (payload['cognito:groups'] as string[]) || [];
    const isAdmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');

    if (!isAdmin) {
      console.log('User is not an administrator. Groups:', groups);
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // 3. 管理者の場合、MFA（マルチファクタ認証）が使用されたかチェック
    // Identity Token の amr クレーム（Authentication Methods References）を確認
    const amr = (payload['amr'] as string[]) || [];
    const usedMfa = amr.includes('mfa') || amr.includes('software_token_mfa') || amr.includes('sms_mfa');

    if (!usedMfa) {
      console.log('Admin user access denied: MFA not used. AMR:', amr);
      // MFAなしの管理者はアクセス拒否。context に情報を乗せてフロントで判断しやすくする
      return generatePolicy(payload.sub, 'Deny', event.methodArn, {
        mfaRequired: 'true',
        username: payload['cognito:username'] as string
      });
    }

    // 3. ポリシーの生成 (Allow)
    // context を通じて、後続のLambdaにユーザー情報を渡すことも可能
    return generatePolicy(payload.sub, 'Allow', event.methodArn, {
      username: payload['cognito:username'] as string,
      email: payload.email as string,
      groups: JSON.stringify(groups),
    });

  } catch (err) {
    console.error('Token verification failed:', err);
    // 認証失敗時は例外を投げるのではなく Deny ポリシーを返すか、
    // 'Unauthorized' を投げて 401 にさせる (APIGatewayの挙動)
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

/**
 * IAMポリシーを生成するユーティリティ
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
          // キャッシュを有効にするため、admin 配下のすべてのリソースに対して権限を付与する
          // 元の ARN: arn:aws:execute-api:region:account:api/stage/METHOD/PATH
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
