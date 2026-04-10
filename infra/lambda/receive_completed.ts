/**
 * @file receive_completed.ts
 * @role ゲスト用：受取確認（完了）ハンドラー
 * @responsibility
 *  - 被贈答者が商品を手元に受け取ったことを最終確認し、ギフトのライフサイクルを完了（`COMPLETED`）させます。
 *  - 【アトミックな完了処理】
 *    - `ConditionExpression` を用い、現在のステータスが `SHIPPED` である場合のみ更新を許可することで、二重完了処理や不正な状態遷移を防止します。
 *  - 【システム・フィードバック】
 *    - 完了後、チャットへ「ギフトが届きました」というシステムメッセージを自動投稿し、贈り主と受取人の双方に安心感を提供します。
 * @context
 *  - 発送済み（SHIPPED）の状態からのみ遷移可能な、最終的な成功状態への扉です。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { sendSystemNotification } from './utils/notification';
import { getQrId, getPIN } from './utils/request';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { ReceiveApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}') as ReceiveApiSchema['receive_completed'];
        const qr_id = getQrId(event, body);
        const pin = getPIN(event, body);
        
        if (!qr_id || !pin) return errorResponse(400, 'Missing qr_id or pin');

        // 1. ギフトの存在と PIN の妥当性確認
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        if (!qrRes.Item || String(qrRes.Item.pin) !== String(pin)) {
            return errorResponse(403, 'Unauthorized');
        }

        const item = qrRes.Item;

        // ステータスバリデーション: 発送済み（SHIPPED）でないものは完了できない
        if (item.status !== 'SHIPPED') {
            return errorResponse(409, `Cannot mark as completed from current state: ${item.status}`);
        }

        const now = new Date().toISOString();

        // 【Atomic Update】status を COMPLETED へ移行
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
            UpdateExpression: 'SET #status = :completed, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_completed_at = :now, ts_updated_at = :now',
            ConditionExpression: '#status = :shipped', // 途中でステータスが変わっていないことを保証
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':completed': 'COMPLETED', ':shipped': 'SHIPPED', ':gsi_pk': 'QR#COMPLETED', ':now': now }
        }));

        // 【事後通知】チャット内への自動投稿と関係者への通知
        try {
            await sendSystemNotification(qr_id, 'DeliveryCompleted', pin);
        } catch (e) {
            console.error('Notification failed', e);
        }

        return successResponse({ 
            message: 'Gift marked as completed',
            order_id: `ORDER#${qr_id}` 
        });

    } catch (error: any) {
        console.error('Receive completed error:', error);
        if (error.name === 'ConditionalCheckFailedException') {
            return errorResponse(409, 'Conflict detected. Order might be already completed.');
        }
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
