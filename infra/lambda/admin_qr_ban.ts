/**
 * 概要: 特定のQRコードをBAN（利用停止）または解除する。
 * 詳細: 
 *  - QRコードのステータスを一時的に`BANNED`に変更し、利用不能にします。
 *  - 解除時には、アイテムの属性（ts_completed_at等）から元の論理状態（COMPLETED, SHIPPED, USED, ACTIVE等）を自動判定して復元します。
 *
 * エンドポイント: POST /admin/qr/ban
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getQrId, getAction } from './utils/request';
import { AdminApiSchema } from '@shared/api-types';

/**
 * アイテムの属性から、BAN解除後に戻すべきステータスを判定します。
 */
const getRevertStatus = (item: any): string => {
    if (item.ts_completed_at) return "COMPLETED";
    if (item.ts_shipped_at) return "SHIPPED";
    if (item.ts_submitted_at) return "USED";

    const now = new Date();
    const expiresAt = item.ts_expired_at ? new Date(item.ts_expired_at) : null;
    if (expiresAt && now > expiresAt) return "EXPIRED";

    if (item.ts_activated_at) return "ACTIVE";
    if (item.ts_linked_at) return "LINKED";
    return "UNASSIGNED";
}

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        const body = JSON.parse(event.body || '{}') as AdminApiSchema['admin_qr_ban'];
        const qr_id = getQrId(event, body);
        const reason = body.reason || 'No reason provided';
        
        if (!qr_id) return errorResponse(400, 'Missing QR ID');

        // 【DB操作: GetItem】
        // 現在のステータスと、解除時の復帰判定に必要なタイムスタンプ類を取得
        const currentRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        const item = currentRes.Item;
        if (!item) return errorResponse(404, 'QR Code not found');

        const currentStatus = item.status;
        const now = new Date().toISOString();

        if (currentStatus === 'BANNED') {
            // ====================================================================
            // ACTION: UNBAN (復元)
            // ====================================================================
            const revertStatus = getRevertStatus(item);
            console.log(`Unbanning QR ${qr_id}: Reverting to ${revertStatus}`);

            // 【DB操作: UpdateItem】
            // statusを復元し、GSI1_PKも同期。BAN関連フィールドを削除。
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :s, GSI1_PK = :gsi_pk, ts_updated_at = :now REMOVE ban_reason, ts_banned_at',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':s': revertStatus, ':gsi_pk': `QR#${revertStatus}`, ':now': now
                }
            }));

            return successResponse({ message: 'QR Code Unbanned', qr_id, status: revertStatus });
        } else {
            // ====================================================================
            // ACTION: BAN (停止)
            // ====================================================================
            console.log(`Banning QR ${qr_id} (current: ${currentStatus})`);

            // 【DB操作: UpdateItem】
            // statusをBANNEDに変更し、理由と実行日時を記録。
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :banned, GSI1_PK = :gsi_pk, ts_updated_at = :now, ts_banned_at = :now, ban_reason = :reason',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':banned': 'BANNED', ':gsi_pk': 'QR#BANNED', ':now': now, ':reason': reason
                }
            }));

            return successResponse({ message: 'QR Code Banned', qr_id, status: 'BANNED' });
        }
    } catch (error: any) {
        console.error('Admin QR Ban error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
