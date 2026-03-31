/**
 * 概要: BANNED（利用停止）状態のQRコードを物理削除する (管理者用)
 * 詳細: 
 *  - 特定のUUIDかつBAN状態のQRコードを個別に削除、またはGSIを利用してBANNEDステータスの全項目を一括抽出・物理削除します。
 *  - バッチ削除(BatchWriteCommand)を使用し、25件ずつのチャンクで効率的に処理を行います。
 *
 * エンドポイント: POST /admin/qr/deleteban
 */
import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getUUID, getAction } from './utils/request';

const INDEX_NAME = 'GSI1';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        const body = JSON.parse(event.body || '{}');
        const uuid = getUUID(event, body);
        const action = getAction(event, body);

        console.log('Delete BAN event started:', { uuid, action });

        let deletedCount = 0;
        let lastEvaluatedKey: Record<string, any> | undefined;

        /**
         * 削除対象の抽出とバッチ処理
         * ループにより、LastEvaluatedKey が無くなるまで全件をスキャン・削除します。
         */
        do {
            let result;
            if (uuid) {
                // 【DB操作: Query】
                // - 目的: 特定のUUIDのQRコードを検索 (BANNED状態であることも確認)
                // - 抽出: status = "BANNED" のもののみを対象とする
                result = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :pk',
                    FilterExpression: '#status = :status',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: { ':pk': `QR#${uuid}`, ':status': 'BANNED' },
                    ProjectionExpression: 'PK, SK'
                }));
            } else {
                // 【DB操作: Query】
                // - 目的: BANNED状態のQRコードをインデックス(GSI1)から全件取得
                // - 抽出: GSI1_PK = "QR#BANNED"
                result = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME, IndexName: INDEX_NAME,
                    KeyConditionExpression: 'GSI1_PK = :pk',
                    ExpressionAttributeValues: { ':pk': 'QR#BANNED' },
                    ProjectionExpression: 'PK, SK',
                    ExclusiveStartKey: lastEvaluatedKey
                }));
            }

            if (result.Items && result.Items.length > 0) {
                const pageItems = result.Items;

                // 【DB操作: BatchWriteCommand】
                // DynamoDBの制限に基づき、25件ずつのバッチで物理削除を実行
                for (let i = 0; i < pageItems.length; i += 25) {
                    const chunk = pageItems.slice(i, i + 25);
                    const deleteRequests = chunk.map((item: any) => ({
                        DeleteRequest: { Key: { PK: item.PK, SK: item.SK } }
                    }));

                    await ddb.send(new BatchWriteCommand({
                        RequestItems: { [TABLE_NAME]: deleteRequests }
                    }));
                    deletedCount += chunk.length;
                }
            }

            lastEvaluatedKey = result.LastEvaluatedKey;
            // 単体指定(uuid)の場合はループを抜ける
            if (uuid) break;
        } while (lastEvaluatedKey);

        return successResponse({ message: 'Successfully deleted BANNED items', count: deletedCount });

    } catch (error: any) {
        console.error('Admin delete BAN error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
