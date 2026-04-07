import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

/**
 * 期限切れ判定の対象となるステータス
 */
export const EXPIRABLE_STATUSES = ['UNASSIGNED', 'LINKED', 'ACTIVE'];

/**
 * 有効期限をチェックし、期限切れかどうかを判定する (メモリ上での判定のみ)
 * 
 * @param item QRコードのメタデータ項目（status, ts_expired_at を含む）
 * @returns 期限切れであれば true
 */
export function isExpired(item: { status: string; ts_expired_at?: string }): boolean {
    const { status, ts_expired_at } = item;
    const now = new Date();
    return status === "EXPIRED" || (EXPIRABLE_STATUSES.includes(status) && !!ts_expired_at && now > new Date(ts_expired_at));
}

/**
 * 有効期限をチェックし、期限切れであればステータスを EXPIRED に更新する（遅延評価）
 * 
 * 呼び出し元で `item.status` が更新される可能性があるため、常に最新のステータスを返します。
 * 
 * @param ddb DynamoDBDocumentClient
 * @param tableName テーブル名
 * @param qr_id QRコードのQR_ID
 * @param item QRコードのメタデータ項目（status, ts_expired_at を含む）
 * @returns 判定・更新後のステータス
 */
export async function checkAndExpire(
    ddb: DynamoDBDocumentClient,
    tableName: string,
    qr_id: string,
    item: { status: string; ts_expired_at?: string }
): Promise<string> {
    const { status, ts_expired_at } = item;
    if (status === 'EXPIRED') return status;

    if (isExpired(item)) {
        const updatedStatus = 'EXPIRED';
        const now = new Date();

        // 【DB操作: UpdateItem】
        // - 目的: 期限切れ状態をDBに反映(遅延評価)
        try {
            await ddb.send(new UpdateCommand({
                TableName: tableName,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :expired, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_updated_at = :now',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':expired': updatedStatus,
                    ':gsi_pk': `QR#${updatedStatus}`,
                    ':now': now.toISOString()
                }
            }));
            return updatedStatus;
        } catch (e: any) {
            console.error(`[checkAndExpire] Failed lazy expire update for QR ${qr_id}:`, e.message || e);
            // DB更新に失敗しても、メモリ上のステータスはEXPIREDとして返してGUI上での整合性を優先する
            // (次回のアクセス時に再度更新が試行される)
            return updatedStatus;
        }
    }

    return status;
}
