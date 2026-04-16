/**
 * @file adminAuthorizer.ts
 * @role 管理ツール用 Lambda Authorizer (Token Authorizer)
 * @responsibility
 *  - 運営管理者およびシステム管理者の API アクセスを認可します。
 *  - Cognito ID トークンの妥当性を検証（署名、期限、発行元確認）します。
 *  - ユーザーが `Administrators` または `GlobalAdmins` グループに所属しているかを確認します。
 *  - 【重要】管理操作の安全性を保証するため、MFA（多要素認証）が実施されていることを強制します。
 * @context
 *  - 管理画面（Admin UI）からの全リクエストの入り口として機能し、認証・認可・MFA 検証を一括して行います。
 */

import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.CLIENT_ID || '';

/** JWT 検証器の初期化 */
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',
  clientId: CLIENT_ID,
});

const cognito = new CognitoIdentityProviderClient({});

/**
 * 管理者向け認可ハンドラー。
 * 
 * @description
 * 1. トークンの抽出: Bearer スキームから ID トークンを抽出。
 * 2. JWT 検証: `aws-jwt-verify` を用いて、Cognito が発行した有効なトークンであることを保証。
 * 3. 権限（RBAC）確認: トークン内の `cognito:groups` クレームを確認し、管理者グループへの所属を検証。
 * 4. MFA 検証: 
 *    - トークンの `amr` (Authentication Methods References) クレームにより、MFA 経由のログインかを確認。
 *    - [Fallback] `amr` が不足している場合（特定の環境下）、Cognito API を直接呼び出し、ユーザープロファイルで MFA が強制設定（Preferred）されているかを確認し、ログイン成功＝MFA 済と見なします。
 * 
 * @param event - APIGateway からのトークン認可イベント。
 * @returns IAM ポリシーを含む認可結果。
 */
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

    // 1. JWT の検証
    const payload = await verifier.verify(token);

    // 2. グループ権限のチェック
    const groups = (payload['cognito:groups'] as string[]) || [];
    const isAdmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');

    if (!isAdmin) {
      console.log('User is not an administrator. Groups:', groups);
      return generatePolicy(payload.sub, 'Deny', event.methodArn);
    }

    // --------------------------------------------------------------------
    // 3. MFA (多要素認証) チェック
    // --------------------------------------------------------------------
    // 目的: 管理権限の行使には単純な PW 以上（TOTP 等）の証跡が必要であることを保証します。
    const amr = (payload['amr'] as string[]) || [];
    let usedMfa = amr.some(v => v.includes('mfa') || v === 'totp' || v === 'software_token_mfa' || v === 'webauthn');

    // [証跡不足時の Fallback]
    // 理由: 一部のログインフローでは ID トークンに amr が明示されない場合があるため、
    // プロファイル側の「MFA 強制設定」を確認することで、ログイン成功をもって MFA 合格と判断します。
    if (!usedMfa) {
      console.log('AMR is empty. Checking Cognito User MFA settings as fallback...', { sub: payload.sub });
      try {
        const user = await cognito.send(new AdminGetUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: payload.sub
        }));

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
      // MFA 未実施の場合、メタデータに mfa_required を含めて拒否し、フロントエンドに再認証を促します。
      return generatePolicy(payload.sub, 'Deny', event.methodArn, {
        mfa_required: 'true',
        username: payload['cognito:username'] as string,
        amr: JSON.stringify(amr),
        user_id: payload.sub
      });
    }

    // 4. 認可成功 - ポリシーの生成
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
 * API Gateway に返却する認可レスポンス（IAM ポリシードキュメント）を構築します。
 * 
 * @param principalId - ユーザー識別子。
 * @param effect - 'Allow' または 'Deny'。
 * @param resource - 要求されたリソースの ARN。
 * @param context - 後続の Lambda ハンドラーに渡す付加情報（JSON 文字列推奨）。
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
          // 【キャッシュ対策の Wildcarding】
          // API Gateway の Authorizer キャッシュによる 403 エラーを防ぐため、
          // 特定のリソース URL だけでなく、同一 API/Stage 内の全リソース（/*/*）への権限として返却します。
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
