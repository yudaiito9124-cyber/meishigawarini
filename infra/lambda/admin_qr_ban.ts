/**
 * 概要: 特定のQRコードをBAN（利用停止）または解除する。
 * 詳細: QRコードのステータスを`BANNED`に変更する。解除時には、QRコードの属性情報から元の状態（`ACTIVE`, `LINKED`等）を判定して自動的に復元する。
 * エンドポイント: POST /admin/qr/ban
 * リクエストボディ:
 *  - uuid: 対象QRコードのUUID
 *  - reason: BANの理由（オプション）
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
};


const getRevertStatus = (item: any): string => {

    if (item.ts_completed_at) return "COMPLETED";
    if (item.ts_shipped_at) return "SHIPPED";
    if (item.ts_submitted_at) return "USED";

    const now = new Date();
    const expiresAt = new Date(item.ts_expired_at);
    if (now > expiresAt) {
        return "EXPIRED";
    }

    if (item.ts_activated_at) return "ACTIVE";
    if (item.ts_linked_at) return "LINKED";
    return "UNASSIGNED";
}


export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'OK' }) };
        }
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        // /admin/qrcodes/ban
        const body = JSON.parse(event.body || '{}');
        const uuid = body.uuid;
        if (!uuid) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID' }) };
        }

        console.log(`Banning QR: ${uuid}`);

        let reason = 'No reason provided';
        try {
            const body = JSON.parse(event.body || '{}');
            if (body.reason) reason = body.reason;
        } catch (e) { }

        // 1. Fetch current status
        // QRコードの現在の状態を取得
        // - 検索条件: PK = QR#{uuid}, SK = "METADATA"
        // - 取得カラム: status (現在のステータス), 各種日付属性 (復元用)
        const currentData = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
        }));

        const item = currentData.Item;
        if (!item) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not found' }) };
        }

        const currentStatus = item.status;
        const now = new Date().toISOString();

        if (currentStatus === 'BANNED') {
            // UNBAN (Revert)
            const revertStatus = getRevertStatus(item);
            console.log(`Unbanning QR ${uuid}: Reverting to ${revertStatus}`);

            // BAN（利用停止）を解除し、元のステータスに復元
            // - 検索条件: PK = QR#{uuid}, SK = "METADATA"
            // - 更新カラム:
            //   - status: 計算された復元後のステータス
            //   - GSI1_PK: ステータスに応じたインデックスキー (QR#STATUS)
            //   - ts_updated_at: 現在時刻
            // - 削除(REMOVE)カラム: ban_reason, ts_banned_at (BAN情報のクリア)
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :s, GSI1_PK = :gsi_pk, ts_updated_at = :ts_updated_at REMOVE ban_reason, ts_banned_at',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':s': revertStatus,
                    ':gsi_pk': `QR#${revertStatus}`,
                    ':ts_updated_at': now
                }
            }));

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'QR Code Unbanned', uuid, status: revertStatus })
            };
        } else {
            // BAN
            console.log(`Banning QR ${uuid} (current: ${currentStatus})`);
            // QRコードをBAN（利用停止）状態に設定
            // - 検索条件: PK = QR#{uuid}, SK = "METADATA"
            // - 更新カラム:
            //   - status: "BANNED"
            //   - GSI1_PK: "QR#BANNED" (検索高速化用)
            //   - ts_updated_at, ts_banned_at: 現在時刻
            //   - ban_reason: BANの理由
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :banned, GSI1_PK = :gsi_pk, ts_updated_at = :ts_updated_at, ts_banned_at = :ts_banned_at, ban_reason = :reason',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':banned': 'BANNED',
                    ':gsi_pk': 'QR#BANNED',
                    ':ts_updated_at': now,
                    ':ts_banned_at': now,
                    ':reason': reason,
                }
            }));

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'QR Code Banned', uuid, status: 'BANNED' })
            };
        }
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error' })
        };
    }
};
