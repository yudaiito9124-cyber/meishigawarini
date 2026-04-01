/**
 * 概要: ギフト受取完了の確定
 * 詳細: 
 *  - 被贈答者が商品を受け取ったことを確認し、ステータスを`SHIPPED`から`COMPLETED`へ変更します。
 *  - PINによる認証を行い、正当な受取人による操作であることを保証します。
 *
 * エンドポイント: POST /receive/completed
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { sendSystemNotification } from './utils/notification';
import { getUUID, getPIN } from './utils/request';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const uuid = getUUID(event, body);
        const pin = getPIN(event, body);
        
        if (!uuid || !pin) return errorResponse(400, 'Missing uuid or pin');

        // 【DB操作: GetItem】
        // 理由: QRコードのメタデータを取得し、PINの一致とステータスを検証。
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
        }));

        if (!qrRes.Item || String(qrRes.Item.pin) !== String(pin)) {
            return errorResponse(403, 'Unauthorized');
        }

        const item = qrRes.Item;
        const currentStatus = item.status;

        // ステータス遷移のバリデーション (発送済み(SHIPPED)から完了へ)
        if (currentStatus !== 'SHIPPED') {
            return errorResponse(409, `Cannot mark as completed from current state: ${currentStatus}`);
        }

        const now = new Date().toISOString();

        // 【DB操作: UpdateItem】
        // 理由: statusをCOMPLETEDに変更し、完了日時を記録。
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
            UpdateExpression: 'SET #status = :completed, GSI1_PK = :gsi_pk, ts_completed_at = :now, ts_updated_at = :now',
            ConditionExpression: '#status = :shipped', // 二重操作防止
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':completed': 'COMPLETED', ':shipped': 'SHIPPED', ':gsi_pk': 'QR#COMPLETED', ':now': now }
        }));

        // 【事後処理: システム通知】
        // 理由: 送り主・受け取り人の双方に受取完了を通知し、チャット履歴にシステムメッセージを残します。
        try {
            await sendSystemNotification(uuid, 'DeliveryCompleted', pin);
        } catch (e) {
            console.error('Notification failed', e);
        }

        return successResponse({ 
            message: 'Gift marked as completed',
            order_id: `ORDER#${uuid}` 
        });

    } catch (error: any) {
        console.error('Receive completed error:', error);
        if (error.name === 'ConditionalCheckFailedException') {
            return errorResponse(409, 'Conflict detected. Order might be already completed.');
        }
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
