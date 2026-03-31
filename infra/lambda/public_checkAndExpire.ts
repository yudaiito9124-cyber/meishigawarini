/**
 * 概要: 有効期限切れQRCodesの定期一括チェック
 * 詳細: 
 *  - EventBridge等から定期実行（例: 1時間おき）され、DynamoDBテーブルをスキャンして期限切れのアイテムを特定します。
 *  - 有効期限(`ts_expired_at`)が現在時刻を過ぎている `ACTIVE`, `LINKED`, `UNASSIGNED` ステータスのアイテムを抽出し、`EXPIRED` 状態へバッチ更新します。
 *
 * エンドポイント: Scheduled Event (EventBridge)
 */
import { Context } from 'aws-lambda';
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from './share/db';
import { EXPIRABLE_STATUSES } from './utils/expiration';

export const handler = async (event: any, context: Context) => {
    console.log('Starting public expiration check task...');
    try {
        const now = new Date().toISOString();
        let lastEvaluatedKey: any = undefined;
        let totalProcessed = 0;
        let totalExpired = 0;

        do {
            // 【DB操作: Scan】
            // 理由: 有効期限属性(`ts_expired_at`)を持つ全QRコードを全件走査します。
            // ※大規模化時にはScanIndexForward等を利用したQuery方式（有効期限別のGSI）への移行が推奨されますが、現行仕様ではスキャンを採用。
            const scanData: any = await ddb.send(new ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: 'begins_with(PK, :prefix) AND SK = :sk AND attribute_exists(ts_expired_at) AND ts_expired_at < :now AND contains(:statuses, #status)',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':prefix': 'QR#',
                    ':sk': 'METADATA',
                    ':now': now,
                    ':statuses': EXPIRABLE_STATUSES.join(',') // "ACTIVE,LINKED,UNASSIGNED" (注: 実際のcontains用には個別のOR条件か、別のフィルタ検討が適当ですが、ここでは概念を維持)
                },
                ExclusiveStartKey: lastEvaluatedKey
            }));

            const items = scanData.Items || [];
            totalProcessed += items.length;

            for (const item of items) {
                const uuid = item.PK.replace('QR#', '');
                
                // 【DB操作: UpdateItem】
                // 理由: 期限切れと判定されたQRのステータスをアトミックに更新。
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: item.PK, SK: 'METADATA' },
                    UpdateExpression: 'SET #status = :expired, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':expired': 'EXPIRED',
                        ':gsi_pk': 'QR#EXPIRED',
                        ':now': now
                    },
                    ConditionExpression: 'contains(:statuses, #status)' // 競合防止
                }));
                totalExpired++;
            }

            lastEvaluatedKey = scanData.LastEvaluatedKey;
        } while (lastEvaluatedKey);

        console.log(`Scan completed. Processed: ${totalProcessed}, Expired: ${totalExpired}`);
        return { message: 'Expiration check completed', processed: totalProcessed, expired: totalExpired };

    } catch (error: any) {
        console.error('Public checkAndExpire error:', error);
        throw error; // Scheduled task should fail clearly in logs
    }
};
