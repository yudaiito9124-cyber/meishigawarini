/**
 * @file expiration.ts
 * @role ギフト有効期限管理ユーティリティ
 * @responsibility
 *  - QR コードや各種ギフトの有効期限を判定します。
 *  - 期限が切れている場合にステータスを `EXPIRED` に更新する「遅延評価（Lazy Expiration）」ロジックを提供します。
 * @context
 *  - QR コードの読み取り時（receive_verify）やショップの注文一覧取得時など、データが参照されるタイミングで呼び出されます。
 *  - 物理的なバッチ処理（Cron）に頼らず、アクセス時の整合性を保証する設計です。
 */

import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

/**
 * 期限切れ判定の対象となるステータス一覧
 * `UNASSIGNED`, `LINKED`, `ACTIVE` のいずれかである場合のみ、時刻による判定を行います。
 */
export const EXPIRABLE_STATUSES = ['UNASSIGNED', 'LINKED', 'ACTIVE'];

/**
 * 現在時刻と有効期限を比較し、期限切れかどうかをメモリ上で判定します。
 * 
 * @param item - QR コードのメタデータ項目（status, ts_expired_at を含む）。
 * @returns 期限切れであれば true、そうでなければ false。
 */
export function isExpired(item: { status: string; ts_expired_at?: string }): boolean {
    const { status, ts_expired_at } = item;
    const now = new Date();
    // すでにステータスが EXPIRED であるか、判定対象のステータスでかつ期限を過ぎている場合に true を返します。
    return status === "EXPIRED" || (EXPIRABLE_STATUSES.includes(status) && !!ts_expired_at && now > new Date(ts_expired_at));
}

/**
 * 有効期限をチェックし、期限切れであればステータスを `EXPIRED` に DB 上で更新します。
 * 
 * @description
 * 【遅延評価（Lazy Expiration）の仕組み】
 * ユーザーが期限切れのデータにアクセスした際、読み取り処理の途中でステータスを書き換えます。
 * これにより、管理コストのかかる定期バッチ処理を行うことなく、常に正確なステータスを提示できます。
 * 
 * @param ddb - DynamoDBDocumentClient。
 * @param tableName - 操作対象のテーブル名。
 * @param qr_id - 更新対象の QR コード ID。
 * @param item - 現在の QR コード情報。
 * @returns 判定・更新後の最新ステータス（'EXPIRED' または元のステータス）。
 */
export async function checkAndExpire(
    ddb: DynamoDBDocumentClient,
    tableName: string,
    qr_id: string,
    item: { status: string; ts_expired_at?: string }
): Promise<string> {
    const { status, ts_expired_at } = item;
    
    // すでに期限切れなら即復帰
    if (status === 'EXPIRED') return status;

    if (isExpired(item)) {
        const updatedStatus = 'EXPIRED';
        const now = new Date().toISOString();

        // --------------------------------------------------------------------
        // 【DB 操作: UpdateItem (遅延評価による状態遷移)】
        // --------------------------------------------------------------------
        // 目的: メモリ上の判定結果を永続化し、以降のアクセスで計算を省けるようにします。
        // PK: QR#<qrId>, SK: METADATA
        // 変更箇所:
        // - status: 'EXPIRED'（ギフト無効化）
        // - GSI1_PK: ステータス別 GSI のパーティションキーを更新し、検索結果から除外（または期限切れカテゴリへ移動）します。
        // - ts_updated_at: 最終更新時刻を記録します。
        try {
            await ddb.send(new UpdateCommand({
                TableName: tableName,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :expired, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_updated_at = :now',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':expired': updatedStatus,
                    ':gsi_pk': `QR#${updatedStatus}`,
                    ':now': now
                }
            }));
            return updatedStatus;
        } catch (e: any) {
            console.error(`[checkAndExpire] Failed lazy expire update for QR ${qr_id}:`, e.message || e);
            // DB 更新に一時的に失敗しても、メモリ上のステータスは EXPIRED として返します。
            // これにより、フロントエンド側では正しく「期限切れ」として振る舞い、整合性を保ちます。
            return updatedStatus;
        }
    }

    return status;
}
