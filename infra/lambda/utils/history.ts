import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const MAX_ITEMS_PER_RECORD = 1000;

/**
 * 履歴を追加する (SENDLOG または RECEIVEDLOG)
 * ユーザーの履歴レコードを最大1000件ごとに分割して保存する。
 * SKの形式: {logType}#001, {logType}#002 ...
 */
export async function appendToHistory(
    ddb: DynamoDBDocumentClient,
    tableName: string,
    userId: string,
    logType: 'SENDLOG' | 'RECEIVEDLOG',
    uuid: string
): Promise<void> {
    const pk = `USER#${userId}`;
    const baseSk = `${logType}#`;

    // 1. メタデータ (現在のインデックスと件数) を取得する
    // SK: `{logType}_META` を使用して管理する
    const metaSk = `${logType}_META`;
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

    // 2. 1000件に達している場合はインデックスを増やす、カウントリセット
    if (currentCount >= MAX_ITEMS_PER_RECORD) {
        currentIndex += 1;
        // リセットする (前の値を見ているため厳密ではないが、レコード分割の目的は達せる)
        await ddb.send(new UpdateCommand({
            TableName: tableName,
            Key: { PK: pk, SK: metaSk },
            UpdateExpression: 'SET current_count = :zero',
            ExpressionAttributeValues: { ':zero': 0 }
        }));
    }

    const paddedIndex = currentIndex.toString().padStart(3, '0');
    const targetSk = `${baseSk}${paddedIndex}`;
    const nowIso = new Date().toISOString();

    // UUIDのリストに追記
    // 重複を避ける＆順序を維持するためにはList型を使用するか、Set(SS)を使用するか
    // ここでは単純な時刻とのペアを持ったリスト情報を保存する
    
    // 【DB操作: UpdateItem】
    // ターゲットの履歴レコードに新しいUUIDを追加
    await ddb.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: pk, SK: targetSk },
        UpdateExpression: 'SET logs = list_append(if_not_exists(logs, :empty_list), :new_log), ts_updated_at = :now',
        ExpressionAttributeValues: {
            ':empty_list': [],
            ':new_log': [{ uuid, timestamp: nowIso }],
            ':now': nowIso
        }
    }));

    // 【DB操作: UpdateItem】
    // メタデータのインデックスと件数を更新
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
