/**
 * @file receive_submit.ts
 * @role ゲスト用：ギフト受取・配送先登録（チェックアウト）ハンドラー
 * @responsibility
 *  - 被贈答者が配送先住所を入力し、ギフト券を「使用済み」にして商品の配送を確定させます。
 *  - 【トランザクションによる整合性】
 *    - `TransactWrite`:
 *      1. `QR#METADATA`: ステータスを `ACTIVE` から `USED` へ遷移させ、パスワード保護（任意）を設定。
 *      2. `QR#ORDER`: 配送先情報（住所・氏名・希望日時）を持つオーダーレコードを新規作成。
 *    - これにより、住所登録されたのにステータスが更新されない、といった不整合を防ぎます。
 *  - 【遅延評価による最終防衛】
 *    - 登録の直前で `checkAndExpire` を実行し、入力中に期限が切れたギフトを確実にブロックします。
 *  - 【受取履歴への自動追加】
 *    - 被贈答者がログイン済みの場合、ギフト ID を `RECEIVEDLOG` へ追加し、自分の履歴からいつでもチャットを見返せるようにします。
 *  - 【購読と通知のマルチキャスト】
 *    - 受取人の Email をチャットの通知リストへ自動登録（Subscribe）し、登録完了メールを送信。
 *    - 同時にショップオーナーに対しても、新しい注文が入ったことを通知します。
 * @context
 *  - ギフトを受け取るという体験のクライマックスであり、最もデータ整合性が求められるポイントです。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { TransactWriteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as bcrypt from 'bcryptjs';
import { sendLocalizedEmail } from './templates/email';
import { checkAndExpire } from './utils/expiration';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getQrId, getPIN, getUserId } from './utils/request';
import { appendToHistory } from './utils/history';
import { normalizeZipCode } from './utils/normalization';
import { ReceiveApiSchema } from '@shared/api-types';


const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}') as ReceiveApiSchema['receive_submit'];
        const qr_id = getQrId(event, body);
        const pin = getPIN(event, body);

        // フロントエンドの入れ子構造(shipping_info)を使用
        const shipping = body.shipping_info || {};
        const { name, address, zip_code, phone, email, preferred_date, preferred_time, client_timestamp } = shipping;
        const password = body.password;

        if (!qr_id || !pin || !name || !address) {
            return errorResponse(400, 'MISSING_REQUIRED_FIELDS');
        }

        // 【確認フェーズ 1: QRコードの状態確認】
        // Note: PINとレートリミットは receiveAuthorizer.ts で検証済みです。
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));
        if (!qrRes.Item) return errorResponse(404, 'QR_NOT_FOUND');

        const item = qrRes.Item;


        // 状態チェック
        if (item.status !== 'ACTIVE') {
            const msg = item.status === 'EXPIRED' ? 'QR_EXPIRED' : 'QR_NOT_ACTIVE';
            return errorResponse(400, msg);
        }

        const now = new Date();
        const nowIso = now.toISOString();

        // 期限切れチェック (遅延評価)
        const currentStatus = await checkAndExpire(ddb, TABLE_NAME, qr_id, item as any);
        if (currentStatus === 'EXPIRED') {
            return errorResponse(400, 'QR_EXPIRED');
        }

        // 【確認フェーズ 3: パスワードハッシュ化 (設定されている場合)】
        let password_hash: string | undefined;
        if (password) {
            password_hash = await bcrypt.hash(password, await bcrypt.genSalt(10));
        }

        // 【確認フェーズ 4: 配送希望日のバリデーション】
        // 目的: 指定された配送希望日がショップの最短配送日設定（shortest_delivery_days）を満たしているか検証します。
        // 背景: iOS/Androidの一部ブラウザで HTML5 input[type=date] の min 属性が効かない場合があるための最終防衛ラインです。
        if (preferred_date) {
            const shopId = item.shop_id;
            if (shopId) {
                // 【DB操作: GetItem】
                // PK: SHOP#{shopId}
                // SK: METADATA
                // 目的: ショップの最短配送日設定を取得するためにメタデータを参照します。
                const shopRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
                }));
                const shop = shopRes.Item;
                // ショップ設定がない場合のデフォルト値は3日
                const shortestDays = shop?.shortest_delivery_days ?? 3;

                // サーバー時刻（UTC）を基準に最短配送可能日を算出
                const minDate = new Date();
                minDate.setDate(minDate.getDate() + shortestDays);
                const minDateStr = minDate.toISOString().split('T')[0];

                // 選択された日付が最短日よりも前であれば 400 エラーを返却
                if (preferred_date < minDateStr) {
                    return errorResponse(400, 'INVALID_PREFERRED_DATE', minDateStr);
                }
            }
        }

        // 【受取体験の継続】ログイン中のユーザーであれば ID を記録し RECEIVEDLOG に自動追加
        const userId = getUserId(event);

        // ====================================================================
        // 実施フェーズ: アトミックなステータス更新とオーダー作成
        // ====================================================================
        await ddb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                        UpdateExpression: 'SET #status = :used, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_submitted_at = :now, ts_updated_at = :now' +
                            (password_hash ? ', password_hash = :ph' : '') + 
                            (userId ? ', receiver_user_id = :rid' : '') +
                            ' REMOVE #fa, #lu',
                        ConditionExpression: '#status = :active',
                        ExpressionAttributeNames: { '#status': 'status', '#fa': 'failed_attempts', '#lu': 'locked_until' },
                        ExpressionAttributeValues: {
                            ':used': 'USED', ':active': 'ACTIVE', ':gsi_pk': 'QR#USED', ':now': nowIso,
                            ...(password_hash ? { ':ph': password_hash } : {}),
                            ...(userId ? { ':rid': userId } : {})
                        }
                    }
                },
                {
                    Put: {
                        TableName: TABLE_NAME,
                        Item: {
                            PK: `QR#${qr_id}`, SK: 'ORDER',
                            name, address, zip_code: normalizeZipCode(zip_code), phone, preferred_date, preferred_time, email,

                            ts_submitted_at: nowIso, ts_updated_at: nowIso,
                            ...(userId ? { receiver_user_id: userId } : {})
                        }
                    }
                }
            ]
        }));

        if (userId) {
            try {
                await appendToHistory(ddb, TABLE_NAME, userId, 'RECEIVEDLOG', qr_id);
            } catch (e) {
                console.error('Failed to append to RECEIVEDLOG:', e);
            }
        }


        // ====================================================================
        // 副作用処理 (通知と購読)
        // ====================================================================

        // 1. 被贈答者の自動購読と確認メール
        if (email) {
            try {
                // 通知リストへ追加
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                    UpdateExpression: 'ADD notification_emails :new_email SET email_preferences = if_not_exists(email_preferences, :empty_map)',
                    ExpressionAttributeValues: { ':new_email': new Set([email]), ':empty_map': {} }
                }));
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                    UpdateExpression: 'SET email_preferences.#em = :lang',
                    ExpressionAttributeNames: { '#em': email },
                    ExpressionAttributeValues: { ':lang': 'ja' }
                }));
                // 確認メール送信
                await sendLocalizedEmail({
                    type: 'ADDRESS_REGISTRATION_CONFIRMATION',
                    to: email,
                    params: { qr_id, pin },
                    lang: 'ja'
                });
            } catch (e) { console.error('Recipient notification/subscription failed', e); }
        }

        // 2. ショップ側への通知
        const shopId = item.shop_id;
        const productId = item.product_id;
        if (shopId) {
            try {
                const [shopRes, productRes] = await Promise.all([
                    ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' } })),
                    productId ? ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` } })) : { Item: undefined }
                ]);

                const shop = shopRes.Item;
                const product = productRes.Item;

                // ショップ個別の Email がなければオーナー（Cognito）の Email を使用
                let ownerEmail: string | undefined;
                if (shop?.owner_id && USER_POOL_ID) {
                    const userRes = await cognito.send(new AdminGetUserCommand({
                        UserPoolId: USER_POOL_ID, Username: shop.owner_id
                    }));
                    ownerEmail = userRes.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
                }

                if (shop) {
                    // ショップオーナー/管理者への通知 (ADDRESS_REGISTRATION_NOTIFICATION)
                    // メーリングリスト（order_mailing_list）が設定されている場合はそれを使用します。
                    let shopRecipients = Array.isArray(shop.order_mailing_list) ? shop.order_mailing_list : [];
                    // Note: 配送先登録の通知については、明示的に登録されているユーザーのみに送ります（誰も登録されていない場合は誰にも送らない）。

                    if (shopRecipients.length > 0) {
                        await sendLocalizedEmail({
                            type: 'ADDRESS_REGISTRATION_NOTIFICATION',
                            to: shopRecipients,
                            params: { 
                                shopName: shop.name || 'Shop', 
                                productName: product?.name || 'Gift',
                                qr_id, 
                                shopId: shopId, 
                                timestamp: client_timestamp || now.toLocaleString('ja-JP')
                            },
                            lang: 'ja'
                        });
                    }
                }
            } catch (e) { console.error('Shop notification failed', e); }
        }

        return successResponse({ message: 'Address submitted successfully', order_id: `ORDER#${qr_id}` });

    } catch (error: any) {
        console.error('Receive submit error:', error);
        if (error.name === 'TransactionCanceledException') {
            // トランザクション失敗時（既に登録済み、または状態変更時）のコンフリクトエラー
            return errorResponse(409, 'CONFLICT_DETECTED_ORDER_MIGHT_BE_ALREADY_SUBMITTED_OR_QR_STATE_CHANGED');
        }
        // 予期せぬシステムエラー
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', error.message);
    }
};
