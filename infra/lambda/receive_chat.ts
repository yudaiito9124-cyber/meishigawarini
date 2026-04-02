/**
 * 概要: 送り主・受け取り人間でのチャットメッセージ交換
 * 詳細: 
 *  - 特定のQRコードに関連付けられたチャット履歴の取得(list)および新規メッセージの送信(send)を管理。
 *  - 被贈答者(Receiver)によるメッセージ投稿時には、QRコードとPINの認証が必要です。
 *  - 各ギフトにおける画像添付などの累計ファイルサイズ(total_size_bytes)を追跡し、100MBの容量制限を課しています。
 *
 * エンドポイント: POST /receive/chat
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { signUrlIfS3, signUrlsInHtml, stripSignature } from './utils/s3';
import { sendLocalizedEmail } from './templates/email';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getQrId, getPIN, getAction } from './utils/request';
import { ReceiveApiSchema } from '@shared/api-types';
import { generateId } from './utils/id';

const CHAT_CAPACITY_LIMIT_MB = 100;

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const qr_id = getQrId(event, body);
        const pin = getPIN(event, body);
        let action = getAction(event, body);

        if (!qr_id || !pin) return errorResponse(400, 'Missing qr_id or pin');

        // Note: PIN verification and Rate Limiting are handled by receiveAuthorizer.ts
        // so we can proceed directly to business logic.


        // ====================================================================
        // ACTION: list (チャット履歴の取得)
        // ====================================================================
        if (action === 'get') {
            const { } = body as ReceiveApiSchema['receive_chat_get'];
            // 【DB操作: GetItem】
            // 理由: SK=CHATレコードを取得し、蓄積された全メッセージ(messages)を返します。
            const chatRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'CHAT' }
            }));
            const chatLog = chatRes.Item || { messages: [], total_size_bytes: 0, sender_info: null };

            // 各メッセージの添付ファイルURLに署名を付与
            const messages = (chatLog.messages || []).map((msg: any) => {
                // 互換性担保: content があれば message に振替
                if (!msg.message && msg.content) msg.message = msg.content;
                if (!msg.username && msg.role) msg.username = msg.role;
                return msg;
            });

            for (const msg of messages) {
                if (msg.file_url) msg.file_url = await signUrlIfS3(msg.file_url, BUCKET_NAME);
            }

            // 送り主情報の署名付きURL生成 (Enrichment)
            const sender_info = chatLog.sender_info;
            if (sender_info) {
                if (sender_info.card_image_url) sender_info.card_image_url = await signUrlIfS3(sender_info.card_image_url, BUCKET_NAME);
                if (sender_info.detail_html) sender_info.detail_html = await signUrlsInHtml(sender_info.detail_html, BUCKET_NAME);
                if (sender_info.html_image_urls && Array.isArray(sender_info.html_image_urls)) {
                    sender_info.html_image_urls = await Promise.all(
                        sender_info.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                    );
                }
            }

            return successResponse({
                messages,
                total_size_bytes: chatLog.total_size_bytes || 0,
                capacity_limit_mb: CHAT_CAPACITY_LIMIT_MB,
                sender_info,
                sender_id: chatLog.sender_id
            });
        }

        // ====================================================================
        // ACTION: send (メッセージの送信)
        // ====================================================================
        if (action === 'send') {
            const { username, message, type, file_url, file_size, file_name, file_type } = body as ReceiveApiSchema['receive_chat_send'];
            if (!message && !file_url) return errorResponse(400, 'Empty message');

            const now = new Date().toISOString();
            const newMessage = {
                id: generateId(),
                role: 'RECEIVER',
                username: username || 'Receiver',
                message: message,
                type: type || 'text',
                file_url: file_url ? stripSignature(file_url) : undefined,
                file_size: file_size || 0,
                file_name: file_name,
                file_type: file_type,
                ts_created_at: now
            };

            // 容量制限のチェック
            const chatRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'CHAT' } }));
            const currentTotalSize = chatRes.Item?.total_size_bytes || 0;
            if (currentTotalSize + (file_size || 0) > CHAT_CAPACITY_LIMIT_MB * 1024 * 1024) {
                return errorResponse(403, 'Chat storage capacity exceeded');
            }

            // 【DB操作: UpdateItem】
            // 理由: messagesリストに新メッセージを追記(list_append)し、累計ファイルサイズを加算(ADD)。
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty_list), :msg), total_size_bytes = if_not_exists(total_size_bytes, :zero) + :fsize, ts_updated_at = :now',
                ExpressionAttributeValues: {
                    ':msg': [newMessage], ':empty_list': [], ':now': now,
                    ':zero': 0, ':fsize': file_size || 0
                }
            }));

            // 【事後処理: 通知送信】
            // 理由: チャット参加者（notification_emails）に新着メッセージを通知。
            if (chatRes.Item?.notification_emails) {
                const recipients = Array.from(new Set(chatRes.Item.notification_emails as string[]));
                const preferences = chatRes.Item.email_preferences || {};

                const sendPromises = recipients.map(emailTo => {
                    const lang = preferences[emailTo] === 'en' ? 'en' : 'ja';
                    return sendLocalizedEmail({
                        type: 'MESSAGE_NOTIFICATION',
                        to: emailTo,
                        params: { username: 'Recipient', message: message || '', qr_id, pin },
                        lang
                    });
                });
                await Promise.all(sendPromises).catch(e => console.error('Notification failed', e));
            }

            return successResponse({ message: 'Message sent successfully', data: newMessage });
        }

        return errorResponse(400, 'Unknown action');

    } catch (error: any) {
        console.error('Receive chat error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
