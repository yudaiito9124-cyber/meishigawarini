/**
 * 概要: チャットメッセージの取得・送信
 * 詳細: 特定のギフト（QR）に紐付くチャット履歴の取得、および新規メッセージの送信を行います。宛先へのメール通知も行います。
 * エンドポイント:
 *  - POST /receive/chat/get (チャット履歴・送り主情報の取得)
 *  - POST /receive/chat/send (新規メッセージの送信)
 * リクエストボディ:
 *  [send の場合]
 *  - username: 表示名 (必須)
 *  - message: 本文 (必須/ファイルがある場合は任意)
 *  - file_url: 添付ファイルURL (オプション)
 *  - file_name: ファイル名 (オプション)
 *  - file_type: MIMEタイプ (オプション)
 *  - file_size: ファイルサイズ (オプション)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { sendLocalizedEmail } from './templates/email';
import { signUrlIfS3, signUrlsInHtml, stripSignature } from './utils/s3';
import { generateId } from './utils/id';
import { getResetRateLimitUpdate } from './utils/rate-limit';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-QR-UUID,X-QR-PIN',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        // 認可コンテキストからUUIDを取得 (Authorizer経由)
        const authorizer = event.requestContext.authorizer;
        const uuid = authorizer?.uuid || event.pathParameters?.uuid || (event.headers['X-QR-UUID'] || event.headers['x-qr-uuid']);
        
        if (!uuid) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID' }) };
        }

        const body = JSON.parse(event.body || '{}');
        
        // Determine action from path or body
        let action = body.action;
        const resPath = event.resource;
        if (resPath.endsWith('/get') || event.httpMethod === 'GET') action = 'get_messages';
        else if (resPath.endsWith('/send')) action = 'post_message';

        // ====================================================================
        // Action: get_messages (GET メソッド または POST /get)
        // ====================================================================
        if (action === 'get_messages') {
            // 【DB操作: GetItem】
            // - 目的: チャット履歴(messages)およびチャット画面の設定情報(sender_info等)を取得
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `QR#${uuid}`, SK: 'CHAT' }
            // - 取得カラム: ALL
            const getChat = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'CHAT' }
            }));

            // 【DB操作: UpdateItem】
            // - 目的: 認証成功に伴い、METADATA側のレートリミット（失敗回数）をリセット
            try {
                const getMeta = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' } }));
                if (getMeta.Item && (getMeta.Item.failed_attempts || getMeta.Item.locked_until)) {
                    const { UpdateExpression, ExpressionAttributeNames } = getResetRateLimitUpdate();
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                        UpdateExpression,
                        ExpressionAttributeNames
                    }));
                }
            } catch (e) {
                console.error("Failed to reset rate limit on GET", e);
            }

            const messages = getChat.Item?.messages || [];
            const sender_info = getChat.Item?.sender_info || null;

            // S3画像の署名付きURL生成（メッセージ添付ファイル）
            for (const msg of messages) {
                if (msg.file_url) {
                    msg.file_url = await signUrlIfS3(msg.file_url, BUCKET_NAME);
                }
            }

            // S3画像の署名付きURL生成（送り主プロフィール情報）
            if (sender_info) {
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
            }

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    messages,
                    total_size_bytes: getChat.Item?.total_size_bytes || 0,
                    sender_info,
                    sender_id: getChat.Item?.sender_id
                })
            };
        }

        // ====================================================================
        // Action: post_message (POST /send)
        // ====================================================================
        // (body parsing already handled above)
        const { username, message, file_url, file_name, file_type, file_size } = body;

        if (!username || (!message && !file_url)) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing required fields' }) };
        }

        if (username === 'System') {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid username' }) };
        }

        const newMessage: any = {
            id: generateId(),
            username,
            message,
            ts_created_at: new Date().toISOString()
        };

        if (file_url) {
            newMessage.file_url = stripSignature(file_url);
            newMessage.file_name = file_name;
            newMessage.file_type = file_type;
            newMessage.file_size = file_size;
        }

        // 【DB操作: UpdateItem】
        // - 目的: チャット履歴への新規メッセージ追加と、累積ストレージ使用量の更新
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `QR#${uuid}`, SK: 'CHAT' }
        // - 更新内容: messagesリストの末尾に要素追加、total_size_bytesの加算
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
            UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty_list), :new_msg) ADD total_size_bytes :size',
            ExpressionAttributeValues: {
                ':empty_list': [],
                ':new_msg': [newMessage],
                ':size': file_size || 0
            }
        }));

        // 【DB操作: UpdateItem】
        // - 目的: メッセージ投稿成功に伴い、METADATA側のレートリミットをリセット
        try {
            const getMeta = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' } }));
            if (getMeta.Item && (getMeta.Item.failed_attempts || getMeta.Item.locked_until)) {
                const { UpdateExpression, ExpressionAttributeNames } = getResetRateLimitUpdate();
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                    UpdateExpression,
                    ExpressionAttributeNames
                }));
            }
        } catch (e) {
            console.error("Failed to reset rate limit on message", e);
        }

        // 通知送信処理
        try {
            // 【DB操作: GetItem】
            // - 目的: メッセージ着信を通知すべき先のメールアドレスリストと、各ユーザーの言語設定を取得
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `QR#${uuid}`, SK: 'CHAT' }
            // - 取得カラム: notification_emails, email_preferences
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                ProjectionExpression: 'notification_emails, email_preferences'
            }));

            if (getRes.Item && getRes.Item.notification_emails) {
                const recipients = Array.from(new Set(getRes.Item.notification_emails as string[]));
                const preferences = getRes.Item.email_preferences || {};

                const sendPromises = recipients.map(emailTo => {
                    const lang = (preferences[emailTo] === 'en') ? 'en' : 'ja';
                    return sendLocalizedEmail({
                        type: 'MESSAGE_NOTIFICATION',
                        to: [emailTo],
                        params: {
                            username,
                            message: message || '',
                            uuid,
                            pin: authorizer?.pin || '' // Authorizerから取得可能なら使用
                        },
                        lang: lang as 'ja' | 'en'
                    });
                });
                await Promise.all(sendPromises);
            }
        } catch (e) {
            console.error('Failed to send notification emails:', e);
        }

        // フロントエンドでの即時表示用に署名を付与
        const responseData = { ...newMessage };
        if (responseData.file_url) {
            responseData.file_url = await signUrlIfS3(responseData.file_url, BUCKET_NAME);
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Message posted', data: responseData })
        };

    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};
