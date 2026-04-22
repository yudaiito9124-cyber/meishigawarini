/**
 * @file receive_inquiry.ts
 * @role ゲスト用：ショップオーナーへのお問い合わせハンドラー
 * @responsibility
 *  - ゲスト（受取人）からショップオーナーへの直接的な問い合わせ機能を処理します。
 *  - 【マルチチャネル通知】
 *    1. ショップオーナーのメールアドレス（Cognito または SHOP メタデータ）へ通知メールを送信 (Resend)。
 *    2. ギフト固有のチャット (SK=CHAT) に問い合わせ内容を記録。
 *    3. ショップオーナーの管理画面（Unified Chat）に通知用の履歴を生成。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getQrId, getPIN } from './utils/request';
import { sendLocalizedEmail } from './templates/email';
import { createClosedChatNotification } from './utils/chat-notification';
import { generateId } from './utils/id';
import { ReceiveApiSchema } from '@shared/api-types';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}') as ReceiveApiSchema['receive_inquiry'];
        const qr_id = getQrId(event, body);
        const pin = getPIN(event, body);

        const { reply_email, phone, content } = body;

        if (!qr_id || !pin || !reply_email || !content || !phone) {
            return errorResponse(400, 'Missing required fields (qr_id, pin, reply_email, content, or phone)');
        }

        // 1. ギフト情報の取得と検証
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));
        if (!qrRes.Item) return errorResponse(404, 'QR Code not found');

        const item = qrRes.Item;
        const shopId = item.shop_id;
        if (!shopId) return errorResponse(400, 'Shop not associated with this QR Code');

        // 2. ショップオーナーのメールアドレス取得
        const shopRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
        }));
        if (!shopRes.Item) return errorResponse(404, 'Shop not found');

        let shopEmail = shopRes.Item.email;
        if (!shopEmail && shopRes.Item.owner_id && USER_POOL_ID) {
            try {
                const userRes = await cognito.send(new AdminGetUserCommand({
                    UserPoolId: USER_POOL_ID, Username: shopRes.Item.owner_id
                }));
                shopEmail = userRes.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
            } catch (e) {
                console.warn('Failed to fetch shop owner email from Cognito:', e);
            }
        }

        if (!shopEmail) {
            console.error(`No email address found for shop ${shopId}`);
            // メールが送れなくても処理は続行させる（チャット通知は可能）
        }

        // 3. 通知処理
        const promises: Promise<any>[] = [];
        const now = new Date().toISOString();

        // 3.1. メール送信 (Resend)
        if (shopEmail) {
            promises.push(sendLocalizedEmail({
                type: 'INQUIRY_NOTIFICATION',
                to: shopEmail,
                reply_to: reply_email,
                params: {
                    content,
                    reply_email,
                    phone: phone || 'なし',
                    shopName: shopRes.Item.name || 'Shop',
                    qr_id,
                    shopId
                },
                lang: 'ja' // 固定または何らかの方法で判定
            }));
        }

        // 3.2. ギフト固有チャット (SK=CHAT) への記録
        const inquiryMessageText = `【お問い合わせ】\n返信先: ${reply_email}${phone ? `\n電話番号: ${phone}` : ''}\n\n${content}`;
        const inquiryMessage = {
            id: generateId(),
            role: 'RECEIVER',
            username: 'Guest (Inquiry)',
            message: inquiryMessageText,
            type: 'text',
            ts_created_at: now
        };

        promises.push(ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
            UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty_list), :msg), ts_updated_at = :now',
            ExpressionAttributeValues: {
                ':msg': [inquiryMessage], ':empty_list': [], ':now': now
            }
        })));

        // 3.3. ショップオーナー向け Unified Chat 通知 (即クローズ)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://meishigawarini.com';
        const shopName = shopRes.Item.name || 'Shop';
        const shopAdminUrl = `${baseUrl}/shop/${shopId}`;
        const notificationMessage = `【お問い合わせ】ショップ: ${shopName}\n\n受取人様よりお問い合わせがありました。このチャット機能ではなく、直接ユーザーのメールアドレスまたは電話番号に対して返信し、対応を行なってください。\n\n[注文ID(カードのID)]\n${qr_id}\n[ショップ管理画面]\n${shopAdminUrl}\n[返信先]\n${reply_email}\n[電話番号]\n${phone}\n\n[お問い合わせ内容]\n${content}`;
        promises.push(createClosedChatNotification({
            chatType: 'GIFT_RECEIVER_SUPPORT',
            participants: [`SHOP#${shopId}`, 'ADMIN'], // とりあえず ADMIN も入れておく（unified_chat の制約に合わせる）
            initiatorId: `GUEST#QR#${qr_id}`,
            message: notificationMessage,
            payloadType: 'INQUIRY_SUBMITTED', // 将来的に構造化データとして扱えるように
            payload: { qr_id, reply_email, phone, content, shopId, shopName }
        }));

        await Promise.all(promises).catch(e => console.error('Notification failed:', e));

        return successResponse({ message: 'Inquiry sent successfully' });

    } catch (error: any) {
        console.error('Receive inquiry error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
