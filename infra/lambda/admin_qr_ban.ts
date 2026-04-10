/**
 * @file admin_qr_ban.ts
 * @role 管理者用：QR コード BAN/解除ハンドラー
 * @responsibility
 *  - 特定のギフト（QR コード）を緊急停止（BAN）、または停止を解除します。
 *  - 【アクセス遮断】BAN 状態の QR コードは `receiveAuthorizer` によりアクセスが拒否され、ギフトの受け取りが不能になります。
 *  - 【インテリジェント復元】BAN 解除時、単に固定のステータスに戻すのではなく、レコードに刻まれたタイムスタンプ群（ts_shipped_at 等）を元に、本来あるべき論理状態（COMPLETED, SHIPPED, ACTIVE 等）を自動判定して復元します。
 * @context
 *  - 不正利用の疑いがある場合や、誤操作によるギフトの無効化処理、およびそのリカバリに使用されます。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { isExpired } from './utils/expiration';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getQrId, getAction } from './utils/request';
import { AdminApiSchema } from '@shared/api-types';

/**
 * アイテムの属性から、BAN 解除後に戻すべき論理ステータスを判定します。
 * 
 * @description
 * 以下の優先順位でチェックを行い、その QR コードが辿った最後の「正常な状態」を特定します。
 * 1. ts_completed_at があれば「完了（COMPLETED）」
 * 2. ts_shipped_at があれば「配送中（SHIPPED）」
 * 3. ts_submitted_at があれば「住所登録済（USED）」
 * 4. 有期限であり、期限を過ぎていれば「期限切れ（EXPIRED）」
 * 5. ts_activated_at があれば「有効（ACTIVE）」
 * 6. ts_linked_at があれば「注文紐付け済（LINKED）」
 * 7. いずれもなければ「未割当（UNASSIGNED）」
 */
const getRevertStatus = (item: any): string => {
    if (item.ts_completed_at) return "COMPLETED";
    if (item.ts_shipped_at) return "SHIPPED";
    if (item.ts_submitted_at) return "USED";

    if (isExpired(item)) return "EXPIRED";

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

        // 現状の取得 (復帰判定用)
        const currentRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        const item = currentRes.Item;
        if (!item) return errorResponse(404, 'QR Code not found');

        const currentStatus = item.status;
        const now = new Date().toISOString();

        if (currentStatus === 'BANNED') {
            // --------------------------------------------------------------------
            // ACTION: UNBAN (復元)
            // 目的: BAN 状態を解除し、自動判定された元のステータスに戻します。
            // --------------------------------------------------------------------
            const revertStatus = getRevertStatus(item);
            console.log(`Unbanning QR ${qr_id}: Reverting to ${revertStatus}`);

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :s, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_updated_at = :now REMOVE ban_reason, ts_banned_at',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':s': revertStatus, ':gsi_pk': `QR#${revertStatus}`, ':now': now
                }
            }));

            return successResponse({ message: 'QR Code Unbanned', qr_id, status: revertStatus });
        } else {
            // --------------------------------------------------------------------
            // ACTION: BAN (停止)
            // 目的: アクセスを強制遮断し、理由を記録します。
            // --------------------------------------------------------------------
            console.log(`Banning QR ${qr_id} (current: ${currentStatus})`);

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :banned, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_updated_at = :now, ts_banned_at = :now, ban_reason = :reason',
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
