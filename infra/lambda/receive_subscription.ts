/**
 * 概要: チャット通知の購読登録
 * 詳細: 指定されたメールアドレスをチャット通知の配信リストに追加し、言語設定を保存します。
 * エンドポイント: POST /receive/subscription
 * リクエストボディ:
 *  - email: 購読するメールアドレス (必須)
 *  - locale: 言語設定 ("ja" | "en") (オプション)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getResetRateLimitUpdate } from './utils/rate-limit';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        const authorizer = event.requestContext.authorizer;
        const uuid = authorizer?.uuid || (event.headers['X-QR-UUID'] || event.headers['x-qr-uuid']);
        if (!uuid) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID' }) };

        const body = JSON.parse(event.body || '{}');
        const { email, locale } = body;

        if (!email) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing email' }) };
        }

        const lang = locale === 'ja' ? 'ja' : 'en';

        // 【DB操作: UpdateItem】
        // - 目的: チャット着信通知を希望するメールアドレスをメーリングリストに追加し、同時に初期設定マップを作成
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `QR#${uuid}`, SK: 'CHAT' }
        // - 更新要素: 
        //   - notification_emails (SS型): 指定のアドレスを追加(ADD)
        //   - email_preferences (M型): もし存在しなければ空マップで初期化
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
            UpdateExpression: 'ADD notification_emails :new_email SET email_preferences = if_not_exists(email_preferences, :empty_map)',
            ExpressionAttributeValues: {
                ':new_email': new Set([email]),
                ':empty_map': {}
            }
        }));

        // 【DB操作: UpdateItem】
        // - 目的: 追加したメールアドレスに対応する言語設定（優先度）を個別に保存
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `QR#${uuid}`, SK: 'CHAT' }
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
            UpdateExpression: 'SET email_preferences.#em = :lang',
            ExpressionAttributeNames: {
                '#em': email
            },
            ExpressionAttributeValues: {
                ':lang': lang
            }
        }));

        // レートリミット情報のクリーンアップ（もしあれば）
        // 以前のロジックを忠実に再現
        try {
            // 【DB操作: GetItem】
            // - 目的: レートリミット(failed_attempts等)が設定されているか確認
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
            }));
            const item = getRes.Item;
            if (item && (item.failed_attempts || item.locked_until)) {
                const { UpdateExpression, ExpressionAttributeNames } = getResetRateLimitUpdate();
                // 【DB操作: UpdateItem】
                // - 目的: 認証成功(Subscribe到達)に伴い、レートリミットカウンタをリセット
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                    UpdateExpression,
                    ExpressionAttributeNames
                }));
            }
        } catch (e) {
            console.error("Failed to reset rate limit on subscribe", e);
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Subscribed successfully' })
        };

    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};
