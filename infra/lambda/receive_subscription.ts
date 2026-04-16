/**
 * @file receive_subscription.ts
 * @role ゲスト用：チャット通知（メール購読）管理ハンドラー
 * @responsibility
 *  - 被贈答者が自身のメールアドレスを登録し、チャットに動きがあった際のリアルタイム通知を有効化します。
 *  - 【多言語対応の購読管理】
 *    - `notification_emails` (Set): 重複を排除して配送先 Email を管理します。
 *    - `email_preferences` (Map): 各 Email ごとに `ja` / `en` の優先言語を記録し、ローカライズされた通知送信を可能にします。
 *  - 【レートリミットの自己浄化（Self-Healing）】
 *    - 正当な PIN でこのステップに到達した際、それまでに蓄積された `failed_attempts` や `locked_until`（連続試行失敗によるロック）を自動的に解除し、以降の操作のストレスを解消します。
 * @context
 *  - ギフトの体験を「一過性の閲覧」から「贈り主との双方向コミュニケーション」へと繋げる重要な接点です。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getQrId, getPIN } from './utils/request';
import { ReceiveApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}') as ReceiveApiSchema['receive_subscription'];
        const qr_id = getQrId(event, body);
        const pin = getPIN(event, body);
        const { email, locale } = body;
        
        if (!qr_id || !pin || !email) return errorResponse(400, 'Missing required fields');

        // 1. PIN 認証とメタデータの取得
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        if (!qrRes.Item || String(qrRes.Item.pin) !== String(pin)) {
            return errorResponse(401, 'Unauthorized');
        }

        const lang = locale === 'ja' ? 'ja' : 'en';

        // 2. 購読リストの更新と Map の初期化
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
            UpdateExpression: 'ADD notification_emails :new_email SET email_preferences = if_not_exists(email_preferences, :empty_map), ts_updated_at = :now',
            ExpressionAttributeValues: { ':new_email': new Set([email]), ':empty_map': {}, ':now': new Date().toISOString() }
        }));

        // 3. 個別の言語設定を Map 内へ書き込み
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
            UpdateExpression: 'SET email_preferences.#em = :lang',
            ExpressionAttributeNames: { '#em': email },
            ExpressionAttributeValues: { ':lang': lang }
        }));

        // 【自己浄化】正当なユーザーによるアクセスが確認されたため、失敗制限をリセット
        try {
            if (qrRes.Item.failed_attempts || qrRes.Item.locked_until) {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
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
