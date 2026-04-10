/**
 * @file history.ts
 * @role ユーザー履歴管理ユーティリティ
 * @responsibility
 *  - ユーザーのギフト送受信履歴を DynamoDB に効率的に保存・管理します。
 *  - 単一レコードのサイズ制限（400KB）を回避するため、履歴を 1000 件ごとの「バケット」に分割して保存するロジックを提供します。
 * @context
 *  - ギフトの購入・発送（shop_orders）または受取完了（receive_submit）など、履歴を残すべきイベントが発生した際に呼び出されます。
 */

import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

/** 1 つの履歴レコード（バケット）に保存する最大アイテム数 */
const MAX_ITEMS_PER_RECORD = 1000;

/**
 * 送信または受信の履歴をユーザーレコードへ追加します。
 * 
 * @description
 * 【分割保存（バケッティング）ロジック】
 * 履歴は `SENDLOG#001`, `SENDLOG#002` のようにインデックス付きの SK で保存されます。
 * 1. `{logType}_META` レコードを参照し、現在のバケット番号（current_index）と件数（current_count）を取得します。
 * 2. 1000 件を超えた場合、新しいバケット番号を発行します。
 * 3. 該当のバケットに対し、`list_append` を使用してアトミックにログを追記します。
 * 
 * @param ddb - DynamoDBDocumentClient。
 * @param tableName - 操作対象のテーブル名。
 * @param userId - 対象のユーザー ID。
 * @param logType - 履歴の種類 ('SENDLOG' または 'RECEIVEDLOG')。
 * @param qr_id - 履歴に追加する QR コード ID。
 * @returns Promise<void>
 */
export async function appendToHistory(
    ddb: DynamoDBDocumentClient,
    tableName: string,
    userId: string,
    logType: 'SENDLOG' | 'RECEIVEDLOG',
    qr_id: string
): Promise<void> {
    const pk = `USER#${userId}`;
    const baseSk = `${logType}#`;
    const metaSk = `${logType}_META`;
    const nowIso = new Date().toISOString();

    // --------------------------------------------------------------------
    // 1. メタデータの取得
    // --------------------------------------------------------------------
    // 目的: 現在どのバケットに保存すべきか、現在のバケットに空きがあるかを確認します。
    // PK: USER#<userId>, SK: <logType>_META
    const getRes = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { PK: pk, SK: metaSk }
    }));

    let currentIndex = 1;
    let currentCount = 0;

    if (getRes.Item) {
        currentIndex = getRes.Item.current_index || 1;
        currentCount = getRes.Item.current_count || 0;
    }

    // --------------------------------------------------------------------
    // 2. バケット分割の判定と更新
    // --------------------------------------------------------------------
    // 目的: 1000 件の制限に達した場合、次のバケットを作成する準備をします。
    if (currentCount >= MAX_ITEMS_PER_RECORD) {
        currentIndex += 1;
        // カウントのリセット
        await ddb.send(new UpdateCommand({
            TableName: tableName,
            Key: { PK: pk, SK: metaSk },
            UpdateExpression: 'SET current_count = :zero',
            ExpressionAttributeValues: { ':zero': 0 }
        }));
    }

    const paddedIndex = currentIndex.toString().padStart(3, '0');
    const targetSk = `${baseSk}${paddedIndex}`;

    // --------------------------------------------------------------------
    // 3. 履歴本体への追記
    // --------------------------------------------------------------------
    // 目的: 実際の履歴データをバケット内のリストの末尾に追加します。
    // PK: USER#<userId>, SK: <logType>#<001~>
    // 状態遷移: `logs` リストに `{ qr_id, timestamp }` オブジェクトをアトミックに結合します。
    await ddb.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: pk, SK: targetSk },
        UpdateExpression: 'SET logs = list_append(if_not_exists(logs, :empty_list), :new_log), ts_updated_at = :now',
        ExpressionAttributeValues: {
            ':empty_list': [],
            ':new_log': [{ qr_id, timestamp: nowIso }],
            ':now': nowIso
        }
    }));

    // --------------------------------------------------------------------
    // 4. メタデータの最終更新
    // --------------------------------------------------------------------
    // 目的: 使用したバケットインデックスを保存し、件数を 1 インクリメントします。
    await ddb.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: pk, SK: metaSk },
        UpdateExpression: 'SET current_index = :idx, ts_updated_at = :now ADD current_count :inc',
        ExpressionAttributeValues: {
            ':idx': currentIndex,
            ':inc': 1,
            ':now': nowIso
        }
    }));
}
