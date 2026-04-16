/**
 * @file receiveAuthorizer.ts
 * @role ギフト受取人（受領者）用 Lambda Authorizer (Request Authorizer)
 * @responsibility
 *  - ギフトカードの受取プロセス（`/receive/...`）におけるセキュリティと認可を管理します。
 *  - 【PIN 認証】ヘッダーの `x-qr-id` と `x-qr-pin` を用いて、対象ギフトへのアクセス権を検証します。
 *  - 【ブルートフォース保護】連続した PIN 入力失敗に対し、`rate-limit` ユーティリティを用いて一時的なアクセスロックを実施します。
 *  - 【オプション認証】Cognito ログイン済みのユーザー（受取人）の場合、履歴記録のために `user_id` を特定・抽出します。
 *  - 【プロモーション対応】ギフトが `PROMOTION` ステータスの場合、情報の閲覧のみを許可し、住所入力等の重要アクションをブロックします。
 * @context
 *  - 未ログインユーザー（ゲスト）のアクセスが想定されるため、Cognito に依存しない独自パッケージの検証フローを持ちます。
 */

import { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { isLocked, getRateLimitUpdate, getResetRateLimitUpdate } from '../utils/rate-limit';
import { getHeader } from '../utils/request';

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.CLIENT_ID || '';
const TABLE_NAME = process.env.TABLE_NAME || '';

/** オプションのログインユーザー識別用ベリファイア */
let verifier: any = null;
if (USER_POOL_ID && CLIENT_ID) {
    verifier = CognitoJwtVerifier.create({
        userPoolId: USER_POOL_ID,
        tokenUse: 'id',
        clientId: CLIENT_ID,
    });
}

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});

/**
 * 受取人認可ハンドラー。
 * 
 * @description
 * 【認可アルゴリズム】
 * 1. ヘッダー情報の抽出: `x-qr-id`, `x-qr-pin`, `authorization`（任意）を抽出。
 * 2. ログインユーザー特定（任意）: トークンがある場合は `sub` を抽出。失敗してもゲストとして続行。
 * 3. ギフト情報の取得: DynamoDB `QR#<id>` レコードを取得。
 * 4. ロック状態の確認: 試行失敗によるロック期間中（`locked_until`）でないかを確認。
 * 5. PIN 検証: 
 *    - プロモーション以外の場合、入力された PIN と DB 保持値を比較。
 *    - 失敗時: `failed_attempts` をインクリメントし、必要に応じてロック。
 *    - 成功時: 過去の失敗カウントをリセット。
 * 6. ステータス制御: 
 *    - `PROMOTION` の場合、許可リソースを `chat/get`, `sender/load`, `verify` に限定し、他をブロック。
 * 
 * @param event - APIGateway 認可イベント。
 * @returns IAM ポリシー（context に QR 情報を含む）。
 */
export const handler = async (event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
    try {
        const qr_id = getHeader(event.headers, 'x-qr-id');
        const pin = getHeader(event.headers, 'x-qr-pin');

        if (!qr_id || !pin) {
            console.log('Missing QR ID or PIN in headers');
            return generatePolicy('unidentified-receiver', 'Deny', event.methodArn);
        }

        // --- オプションの JWT 検証 (履歴記録等のためのユーザー識別用) ---
        let user_id: string | undefined = undefined;
        const authHeader = getHeader(event.headers, 'authorization');
        if (authHeader && verifier) {
            try {
                const token = authHeader.replace('Bearer ', '');
                const payload = await verifier.verify(token);
                user_id = payload.sub;
            } catch (err) {
                console.log('Optional JWT verification failed, proceeding as guest', err);
            }
        }

        // [DB 操作: GetItem] PK: QR#<id>, SK: METADATA
        const getRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `QR#${qr_id}`,
                SK: 'METADATA'
            }
        }));

        if (!getRes.Item) {
            console.log(`QR not found: ${qr_id}`);
            return generatePolicy(`receiver-${qr_id}`, 'Deny', event.methodArn);
        }

        const item = getRes.Item;

        // 【セキュリティチェック】
        // ステータスが PROMOTION (不特定多数向け) でない場合は、厳密な PIN 検証と試行回数制限を適用。
        if (item.status !== 'PROMOTION') {
            // ロック状態の確認
            if (isLocked(item)) {
                console.log(`QR is locked: ${qr_id}`);
                // context に locked=true を含めて通知
                return generatePolicy(`receiver-${qr_id}`, 'Deny', event.methodArn, { locked: 'true' });
            }

            // PIN の照合
            if (String(item.pin) !== String(pin)) {
                console.log(`Invalid PIN for QR: ${qr_id}`);

                // [DB 操作: UpdateItem (Side Effect)]
                // 失敗回数を追記し、規定回数を超えたらロックフラグを立てます。
                const { UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = getRateLimitUpdate(item);
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                    UpdateExpression,
                    ExpressionAttributeValues,
                    ExpressionAttributeNames
                }));

                return generatePolicy(`receiver-${qr_id}`, 'Deny', event.methodArn);
            }

            // 成功時：過去の失敗履歴をクリーンアップ
            if (item.failed_attempts || item.locked_until) {
                const { UpdateExpression, ExpressionAttributeNames } = getResetRateLimitUpdate();
                try {
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                        UpdateExpression,
                        ExpressionAttributeNames
                    }));
                } catch (e) {
                    console.error("Failed to reset rate limit:", e);
                }
            }
        } else {
            // PROMOTION ステータス時のパス制限
            // 住所送信やステータス変更アクションを物理レベルで遮断します。
            const methodArnParts = event.methodArn.split('/');
            const path = methodArnParts.slice(3).join('/');

            const allowedPaths = [
                'receive/chat/get',
                'receive/sender/load'
            ];

            if (!allowedPaths.includes(path)) {
                console.log(`PROMOTION status restricted access to: ${path}`);
                return generatePolicy(`receiver-${qr_id}`, 'Deny', event.methodArn);
            }
        }

        // 認可成功：実行環境の決定
        const stageArn = event.methodArn.split('/').slice(0, 2).join('/');
        let policyResource: string | string[];

        if (item.status === 'PROMOTION') {
            // 許可するエンドポイントを限定
            policyResource = [
                `${stageArn}/POST/receive/chat/get`,
                `${stageArn}/POST/receive/sender/load`,
                `${stageArn}/POST/receive/verify`
            ];
        } else {
            // 受取プロセス全体（/receive/*）を許可
            policyResource = `${stageArn}/*`;
        }

        return generatePolicy(`receiver-${qr_id}`, 'Allow', policyResource, {
            qr_id: String(qr_id),
            pin: String(pin),
            status: String(item.status),
            shop_id: item.shop_id ? String(item.shop_id) : '',
            ...(user_id ? { user_id: String(user_id) } : {})
        });

    } catch (err) {
        console.error('Authorization failed:', err);
        return generatePolicy('authorization-failed', 'Deny', event.methodArn);
    }
};

/**
 * IAM ポリシーレスポンスを構築。
 * 
 * @param principalId - 識別子（受取人の場合は receiver-<id>）。
 * @param effect - Allow / Deny。
 * @param resource - 許可リソース（単一またはリスト）。
 * @param context - 後続のリクエストで使用するキーバリュー。
 */
function generatePolicy(principalId: string, effect: string, resource: string | string[], context?: any): APIGatewayAuthorizerResult {
    const authResponse: any = {
        principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource,
                },
            ],
        },
    };

    if (context) {
        authResponse.context = context;
    }

    return authResponse;
}
