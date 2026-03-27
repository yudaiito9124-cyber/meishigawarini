/**
 * 概要: ギフト配送先情報の登録
 * 詳細: ユーザーが入力した氏名、住所等の配送先情報を保存し、ギフトのステータスを USED (使用済み) に変更します。
 * エンドポイント: POST /receive/submit
 * リクエストボディ:
 *  - qr_id: ギフト（QR）のUUID (必須)
 *  - pin_code: 4桁のPINコード (必須)
 *  - shipping_info: { name, address, zipCode, ... } 配送先情報オブジェクト (必須)
 *  - password: 二要素認証用のパスワード (オプション)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { sendLocalizedEmail } from './templates/email';
import { isLocked, getRateLimitUpdate } from './utils/rate-limit';
import { checkAndExpire } from './utils/expiration';
import { appendToHistory } from './utils/history';

const client = new DynamoDBClient({});
const cognito = new CognitoIdentityProviderClient({});
const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-QR-UUID,X-QR-PIN',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const { qr_id, pin_code, shipping_info, password } = body;
        const userId = event.requestContext?.authorizer?.userId;

        if (!qr_id || !pin_code || !shipping_info) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing required fields' }) };
        }

        const { name, address, zipCode } = shipping_info;
        if (!name || !address || !zipCode) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing required address fields (name, address, zipCode)' }) };
        }

        // 【DB操作: GetItem】
        // - 目的: UUIDに基づくQRコードの状態取得。本当にACTIVE(受取可能)状態であるか、PINが一致するかを最終確認する
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        // - 取得カラム: ALL (status, pin, failed_attempts, ts_expired_at, shop_id, product_id 等)
        const getRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        if (!getRes.Item) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not found' }) };
        }

        const item = getRes.Item;

        // 期限切れチェック (共通ユーティリティ)
        const status = await checkAndExpire(ddb, TABLE_NAME, qr_id, item as any);
        if (status === 'EXPIRED') {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code has expired' }) };
        }

        // 状態チェック
        if (status !== 'ACTIVE') {
            const msg = status === 'EXPIRED' ? 'QR Code has expired' : (status === 'BANNED' ? 'QR Code is banned' : 'QR Code is not active');
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: msg }) };
        }

        // レートリミット/PIN検証 (Authorizerと重複するがロジック維持)
        if (isLocked(item)) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Too many attempts. Please try again later.' }) };
        if (item.pin !== pin_code) {
            const { UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = getRateLimitUpdate(item);
            // 【DB操作: UpdateItem】
            // - 目的: PIN不一致時の失敗回数更新
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames
            }));
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
        }

        // 二要素認証パスワードのハッシュ化
        let password_hash: string | undefined;
        if (password) {
            const bcrypt = await import('bcryptjs');
            password_hash = await bcrypt.hash(password, await bcrypt.genSalt(10));
        }

        const now = new Date();
        const nowIso = now.toISOString();

        // 【DB操作: TransactWriteItems】
        // - 目的: QRコードのステータス更新(USEDへの遷移)と、配送先情報の登録をアトミックに実行
        // - テーブル: TABLE_NAME
        // - 処理1(Update): METADATAに対し status='USED', GSIキー更新, PIN失敗カウントのクリア
        // - 処理2(Put):    SK='ORDER' に対してユーザーが入力した配送情報を新規保存
        await ddb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                        UpdateExpression: 'SET #status = :used, GSI1_PK = :gsi_pk, ts_updated_at = :now, ts_submitted_at = :now' + (password_hash ? ', password_hash = :ph' : '') + ' REMOVE #fa, #lu',
                        ConditionExpression: '#status = :active',
                        ExpressionAttributeNames: { '#status': 'status', '#fa': 'failed_attempts', '#lu': 'locked_until' },
                        ExpressionAttributeValues: { ':used': 'USED', ':active': 'ACTIVE', ':gsi_pk': 'QR#USED', ':now': nowIso, ...(password_hash ? { ':ph': password_hash } : {}) }
                    }
                },
                {
                    Put: {
                        TableName: TABLE_NAME,
                        Item: { PK: `QR#${qr_id}`, SK: 'ORDER', ...shipping_info, ts_submitted_at: nowIso, ts_updated_at: nowIso }
                    }
                }
            ]
        }));

        // 通知処理（通知購読・自動登録）
        if (shipping_info.email) {
            try {
                // 【DB操作: UpdateItem x 2】
                // - 目的: チャットメーリングリスト(CHATレコード)に受取人のメアドを追加登録
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                    UpdateExpression: 'ADD notification_emails :new_email SET email_preferences = if_not_exists(email_preferences, :empty_map)',
                    ExpressionAttributeValues: { ':new_email': new Set([shipping_info.email]), ':empty_map': {} }
                }));
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                    UpdateExpression: 'SET email_preferences.#em = :lang',
                    ExpressionAttributeNames: { '#em': shipping_info.email },
                    ExpressionAttributeValues: { ':lang': 'ja' }
                }));
                // 受取人への確認メール
                await sendLocalizedEmail({ type: 'ADDRESS_REGISTRATION_CONFIRMATION', to: shipping_info.email, params: { uuid: qr_id, pin: pin_code }, lang: 'ja' });
            } catch (e) { console.error('Auto-subscribe failed', e); }
        }

        // ショップ側への通知
        const shopId = item.shop_id;
        const productId = item.product_id;
        if (shopId) {
            try {
                // 【DB操作: GetItem x 2】
                // - 目的: ショップ情報と商品名を取得し、管理者に通知メールを送信
                const [shopRes, productRes] = await Promise.all([
                    ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' } })),
                    productId ? ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` } })) : { Item: undefined }
                ]);

                let shopEmail = shopRes.Item?.email;
                if (!shopEmail && shopRes.Item?.owner_id) {
                    const userRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: process.env.USER_POOL_ID!, Username: shopRes.Item.owner_id }));
                    shopEmail = userRes.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
                }

                if (shopEmail) {
                    await sendLocalizedEmail({
                        type: 'ADDRESS_REGISTRATION_NOTIFICATION', to: shopEmail,
                        params: {
                            shopName: shopRes.Item?.name || '不明なショップ',
                            productName: productRes.Item?.name || '不明な商品',
                            qr_id,
                            shopId
                        },
                        lang: 'ja'
                    });
                }
            } catch (e) { console.error('Shop notification failed', e); }
        }

        // ログインしている場合は受け取り履歴に追加
        if (userId) {
            try {
                await appendToHistory(ddb, TABLE_NAME, userId, 'RECEIVEDLOG', qr_id);
            } catch (e) { console.error('History logging failed', e); }
        }

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Address submitted successfully', order_id: `ORDER#${qr_id}` }) };

    } catch (error: any) {
        console.error(error);
        if (error.name === 'TransactionCanceledException') return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'Transaction failed (possibly already used)' }) };
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};
