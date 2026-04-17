/**
 * @file receive_chat.ts
 * @role ゲスト用：チャットメッセージ管理ハンドラー
 * @responsibility
 *  - ギフトの贈り主（Sender）と受取人（Receiver）の間でメッセージや画像をやり取りするための非公開チャット機能を提供します。
 *  - 【ストレージ管理とクォータ】
 *    - 各ギフトごとに累計 100MB までのファイル添付を許可します。
 *    - `total_size_bytes` を `UpdateCommand` の `ADD` 演算でアトミックに加算し、正確な容量計算を行います。
 *  - 【強力な通知エコシステム】
 *    - メッセージ送信時、そのチャットを「購読（notification_emails）」している全員、およびギフトの「作成者（sender_id）」へ自動通知メールを送信します。
 *    - ユーザーごとの言語設定（`email_preferences`）に基づき、日本語または英語で通知を出し分けます。
 *  - 【自己完結型のデータ構造】
 *    - チャットレコード(`SK=CHAT`)には、作成時の送り主プロフィールのスナップショット（`sender_info`）が含まれており、送り主本人のプロフ変更に影響されずに当時の情報を表示可能です。
 * @context
 *  - 公開・非公開の境界線となるため、PIN 認証（Authorizer 経由）による厳格なアクセス制御が行われています。
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

/** 各ギフトチャットのストレージ上限（MB） */
const CHAT_CAPACITY_LIMIT_MB = 100;

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const qr_id = getQrId(event, body);
        const pin = getPIN(event, body);
        const action = getAction(event, body);

        if (!qr_id || !pin) return errorResponse(400, 'Missing qr_id or pin');

        // Note: PIN の照合および試行回数制限（Rate Limiting）は receiveAuthorizer.ts で一括処理されています。

        // --------------------------------------------------------------------
        // ACTION: get (チャット履歴とコンテキストの取得)
        // --------------------------------------------------------------------
        if (action === 'get') {
            const chatRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'CHAT' }
            }));
            const chatLog = chatRes.Item || { messages: [], total_size_bytes: 0, sender_info: null };

            // 各メッセージの互換性処理と添付ファイルへの署名
            const messages = (chatLog.messages || []).map((msg: any) => {
                if (!msg.message && msg.content) msg.message = msg.content;
                if (!msg.username && msg.role) msg.username = msg.role;
                return msg;
            });

            for (const msg of messages) {
                if (msg.file_url) msg.file_url = await signUrlIfS3(msg.file_url, BUCKET_NAME);
            }

            // 【Enrichment】スナップショットされた送り主情報の S3 アセットに署名を付与
            let sender_info = chatLog.sender_info;

            // 強力なパース処理（二重文字列化などの異常系にも対応）
            while (typeof sender_info === 'string' && sender_info.trim().startsWith('{')) {
                try {
                    sender_info = JSON.parse(sender_info);
                } catch (e) {
                    console.error("Failed to parse sender_info string:", e);
                    break;
                }
            }

            if (sender_info && typeof sender_info === 'object') {
                // Null値の除去（フロントエンドでの文字列操作を安全にするため）
                Object.keys(sender_info).forEach(key => {
                    if (sender_info[key] === null) sender_info[key] = "";
                });

                if (sender_info.card_image_url) {
                    sender_info.card_image_url = await signUrlIfS3(sender_info.card_image_url, BUCKET_NAME);
                }
                if (sender_info.detail_html) {
                    sender_info.detail_html = await signUrlsInHtml(sender_info.detail_html, BUCKET_NAME);
                }
                if (sender_info.html_image_urls && Array.isArray(sender_info.html_image_urls)) {
                    sender_info.html_image_urls = await Promise.all(
                        sender_info.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                    );
                }
            } else if (sender_info && typeof sender_info !== 'object') {
                // オブジェクトでない（パース失敗した文字列など）場合は、フロントエンドの誤動作を防ぐため空オブジェクトにする
                sender_info = {};
            }

            return successResponse({
                messages,
                total_size_bytes: chatLog.total_size_bytes || 0,
                capacity_limit_mb: CHAT_CAPACITY_LIMIT_MB,
                sender_info,
                sender_id: chatLog.sender_id
            });
        }

        // --------------------------------------------------------------------
        // ACTION: send (メッセージ投稿と通知)
        // --------------------------------------------------------------------
        if (action === 'send') {
            const { username, message, type, file_url, file_size, file_name, file_type } = body as ReceiveApiSchema['receive_chat_send'];
            if (!message && !file_url) return errorResponse(400, 'Empty message');

            const now = new Date().toISOString();
            const newMessage = {
                id: generateId(),
                role: 'RECEIVER', // このエンドポイント経由の投稿は常に Receiver 扱い
                username: username || 'Receiver',
                message: message,
                type: type || 'text',
                file_url: file_url ? stripSignature(file_url) : undefined,
                file_size: file_size || 0,
                file_name: file_name,
                file_type: file_type,
                ts_created_at: now
            };

            // ストレージ上限チェック
            const chatRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'CHAT' } }));
            const currentTotalSize = chatRes.Item?.total_size_bytes || 0;
            if (currentTotalSize + (file_size || 0) > CHAT_CAPACITY_LIMIT_MB * 1024 * 1024) {
                return errorResponse(403, 'Chat storage capacity exceeded');
            }

            // 【Atomic Update】メッセージ追加とサイズ加算を同時に実行
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty_list), :msg), total_size_bytes = if_not_exists(total_size_bytes, :zero) + :fsize, ts_updated_at = :now',
                ExpressionAttributeValues: {
                    ':msg': [newMessage], ':empty_list': [], ':now': now,
                    ':zero': 0, ':fsize': file_size || 0
                }
            }));

            // 【通知処理】購読者および送信者（作成者）への一斉メール通知
            const recipientsSet = new Set<string>();
            if (chatRes.Item?.notification_emails) {
                (chatRes.Item.notification_emails as string[]).forEach(e => recipientsSet.add(e));
            }

            // 送り主 ID がある場合は最新のプロフから Email を取得（ snapshot ではなく master の Email を使用）
            const senderId = chatRes.Item?.sender_id;
            if (senderId) {
                try {
                    const profileRes = await ddb.send(new GetCommand({
                        TableName: TABLE_NAME, Key: { PK: `USER#${senderId}`, SK: 'SENDER' }
                    }));
                    if (profileRes.Item?.email) recipientsSet.add(profileRes.Item.email);
                } catch (e) {
                    console.warn(`Failed to fetch sender profile for notification:`, e);
                }
            }

            if (recipientsSet.size > 0) {
                const recipients = Array.from(recipientsSet);
                const preferences = chatRes.Item?.email_preferences || {};

                const sendPromises = recipients.map(emailTo => {
                    const lang = preferences[emailTo] === 'en' ? 'en' : 'ja';
                    return sendLocalizedEmail({
                        type: 'MESSAGE_NOTIFICATION',
                        to: emailTo,
                        params: { username: username || 'Receiver', message: message || '', qr_id, pin },
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
