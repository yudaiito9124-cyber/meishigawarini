/**
 * 概要: ギフト受取人によるチャット通知配信の購読登録
 * 詳細: 
 *  - 被贈答者が自身のメールアドレスを登録し、チャットにメッセージが届いた際に通知を受け取れるようにします。
 *  - 被贈答者側の言語設定(locale)を保存し、通知テンプレートの言語を出し分け可能にします。
 *  - 登録成功時には不正ログイン試行のレートリミットをリセットします。
 *
 * エンドポイント: POST /receive/subscription
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const { uuid, pin, email, locale } = body;
        
        if (!uuid || !pin || !email) return errorResponse(400, 'Missing required fields');

        // 【DB操作: GetItem】
        // 理由: 署名、PIN、およびステータスの妥当性を確認。
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
        }));

        if (!qrRes.Item || String(qrRes.Item.pin) !== String(pin)) {
            return errorResponse(401, 'Unauthorized');
        }

        const lang = locale === 'ja' ? 'ja' : 'en';

        // 【DB操作: UpdateItem (CHAT) - Step 1: 購読登録と言語設定】
        // 理由: notification_emails(String Set)にメールを追加し、email_preferences Mapを初期化(if_not_exists)。
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
            UpdateExpression: 'ADD notification_emails :new_email SET email_preferences = if_not_exists(email_preferences, :empty_map), ts_updated_at = :now',
            ExpressionAttributeValues: { ':new_email': new Set([email]), ':empty_map': {}, ':now': new Date().toISOString() }
        }));

        // 【DB操作: UpdateItem (CHAT) - Step 2: 言語設定の書き込み】
        // 理由: Step1でemail_preferencesが確実に初期化された後に言語キーをセット（元の2ステップ方式と同一）。
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
            UpdateExpression: 'SET email_preferences.#em = :lang',
            ExpressionAttributeNames: { '#em': email },
            ExpressionAttributeValues: { ':lang': lang }
        }));

        // ログイン試行制限(failed_attempts)のクリーンアップ
        // 理由: 認証に成功して購読まで到達したため、蓄積された失敗回数をリセット。
        try {
            if (qrRes.Item.failed_attempts || qrRes.Item.locked_until) {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                    UpdateExpression: 'REMOVE failed_attempts, locked_until'
                }));
            }
        } catch (e) {
            console.error('Rate limit reset error:', e);
        }

        return successResponse({ message: 'Subscription successfully registered' });

    } catch (error: any) {
        console.error('Receive subscription error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
