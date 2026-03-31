/**
 * 概要: ギフト配送先情報の登録
 * 詳細: 
 *  - 被贈答者が入力した配送先情報(名前、住所、電話番号等)をSK=ORDERとして保存します。
 *  - DynamoDBのトランザクション(TransactWrite)を使用し、METADATAのステータスをACTIVEからUSEDへアトミックに変更します。
 *  - 二重送信防止、有効期限の遅延評価、およびレートリミット検証を実施します。
 *  - 登録成功時、受取人への確認メール送信、ショップ提供者への通知メール送信、およびチャット通知リストへの自動登録を行います。
 *
 * エンドポイント: POST /receive/submit
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { TransactWriteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as bcrypt from 'bcryptjs';
import { isLocked, getRateLimitUpdate, getResetRateLimitUpdate } from './utils/rate-limit';
import { sendLocalizedEmail } from './templates/email';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const { uuid, pin, name, address, zipCode, phone, preferredDate, preferredTime, email, password, client_timestamp } = body;
        
        if (!uuid || !pin || !name || !address) return errorResponse(400, 'Missing required fields');

        // 【確認フェーズ 1: QRコードの存在と状態確認】
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
        }));
        if (!qrRes.Item) return errorResponse(404, 'QR Code not found');

        const item = qrRes.Item;

        // 【確認フェーズ 2: レートリミット / PIN検証】
        if (isLocked(item)) return errorResponse(403, 'Too many attempts. Please try again later.');
        if (String(item.pin) !== String(pin)) {
            const { UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = getRateLimitUpdate(item);
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames
            }));
            return errorResponse(403, 'Invalid PIN');
        }

        // 状態チェック
        if (item.status !== 'ACTIVE') {
            const msg = item.status === 'EXPIRED' ? 'QR Code has expired' : 'QR Code is not active or already used';
            return errorResponse(400, msg);
        }

        const now = new Date();
        const nowIso = now.toISOString();

        // 期限切れチェック (遅延評価)
        if (item.ts_expired_at && now > new Date(item.ts_expired_at)) {
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :expired, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':expired': 'EXPIRED', ':gsi_pk': 'QR#EXPIRED', ':now': nowIso }
            })).catch(e => console.error('Failed lazy expire update', e));
            return errorResponse(400, 'QR Code has expired');
        }

        // 【確認フェーズ 3: パスワードハッシュ化 (設定されている場合)】
        let password_hash: string | undefined;
        if (password) {
            password_hash = await bcrypt.hash(password, await bcrypt.genSalt(10));
        }

        // ====================================================================
        // 実施フェーズ: アトミックなステータス更新とオーダー作成
        // ====================================================================
        await ddb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                        UpdateExpression: 'SET #status = :used, GSI1_PK = :gsi_pk, ts_submitted_at = :now, ts_updated_at = :now' + 
                                          (password_hash ? ', password_hash = :ph' : '') + ' REMOVE #fa, #lu',
                        ConditionExpression: '#status = :active',
                        ExpressionAttributeNames: { '#status': 'status', '#fa': 'failed_attempts', '#lu': 'locked_until' },
                        ExpressionAttributeValues: { 
                            ':used': 'USED', ':active': 'ACTIVE', ':gsi_pk': 'QR#USED', ':now': nowIso,
                            ...(password_hash ? { ':ph': password_hash } : {})
                        }
                    }
                },
                {
                    Put: {
                        TableName: TABLE_NAME,
                        Item: { 
                            PK: `QR#${uuid}`, SK: 'ORDER',
                            name, address, zipCode, phone, preferredDate, preferredTime, email,
                            ts_submitted_at: nowIso, ts_updated_at: nowIso
                        }
                    }
                }
            ]
        }));

        // ====================================================================
        // 副作用処理 (通知と購読)
        // ====================================================================
        
        // 1. 被贈答者の自動購読と確認メール
        if (email) {
            try {
                // 通知リストへ追加
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                    UpdateExpression: 'ADD notification_emails :new_email SET email_preferences = if_not_exists(email_preferences, :empty_map)',
                    ExpressionAttributeValues: { ':new_email': new Set([email]), ':empty_map': {} }
                }));
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                    UpdateExpression: 'SET email_preferences.#em = :lang',
                    ExpressionAttributeNames: { '#em': email },
                    ExpressionAttributeValues: { ':lang': 'ja' }
                }));
                // 確認メール送信
                await sendLocalizedEmail({ 
                    type: 'ADDRESS_REGISTRATION_CONFIRMATION', 
                    to: email, 
                    params: { uuid, pin }, 
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

                let shopEmail = shopRes.Item?.email;
                if (!shopEmail && shopRes.Item?.owner_id && USER_POOL_ID) {
                    const userRes = await cognito.send(new AdminGetUserCommand({ 
                        UserPoolId: USER_POOL_ID, Username: shopRes.Item.owner_id 
                    }));
                    shopEmail = userRes.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
                }

                if (shopEmail) {
                    await sendLocalizedEmail({
                        type: 'ADDRESS_REGISTRATION_NOTIFICATION', 
                        to: shopEmail,
                        params: { 
                            shopName: shopRes.Item?.name || '不明なショップ', 
                            productName: productRes.Item?.name || '不明な商品', 
                            qr_id: uuid, 
                            shopId: shopId, 
                            timestamp: client_timestamp || now.toLocaleString('ja-JP') 
                        },
                        lang: 'ja'
                    });
                }
            } catch (e) { console.error('Shop provider notification failed', e); }
        }

        return successResponse({ message: 'Address submitted successfully', order_id: `ORDER#${uuid}` });

    } catch (error: any) {
        console.error('Receive submit error:', error);
        if (error.name === 'TransactionCanceledException') {
            return errorResponse(409, 'Conflict detected. Order might be already submitted or QR state changed.');
        }
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
