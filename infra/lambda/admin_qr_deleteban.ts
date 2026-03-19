/**
 * 概要: BANNED（利用停止）状態のQRコードを物理削除する。
 * 詳細: 特定のUUIDかつBAN状態のQRコードを削除、またはGSIを利用してBANNEDステータスのアイテムを抽出し、DBから一括削除する。
 * エンドポイント: POST /admin/qr/deleteban
 * リクエストボディ:
 *  - target: 削除対象のQRコードUUID（オプション。指定がない場合は全BANNEDアイテムを一括削除）
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';
const INDEX_NAME = 'GSI1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'OK' }) };
        }
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        const body = JSON.parse(event.body || '{}');

        console.log('Event:', JSON.stringify(event));

        // 1. Query & Delete in batches
        let deletedCount = 0;
        let lastEvaluatedKey: Record<string, any> | undefined;

        do {
            let result;
            if (body.target) {
                // 特定のUUIDのQRコードを検索 (BANNED状態であることも確認)
                // - 検索条件: PK = QR#{uuid}
                // - フィルタ条件: status = "BANNED"
                // - 取得カラム: PK, SK (削除に必要な最小限の属性)
                result = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :pk',
                    FilterExpression: '#status = :status',
                    ExpressionAttributeNames: {
                        '#status': 'status'
                    },
                    ExpressionAttributeValues: {
                        ':pk': 'QR#' + body.target,
                        ':status': 'BANNED'
                    },
                    ProjectionExpression: 'PK, SK'
                }));

                if (!result.Items) {
                    return {
                        statusCode: 404,
                        headers: corsHeaders,
                        body: JSON.stringify({ message: 'QR code not found or not BANNED' })
                    };
                }
            } else {
                // BANNED状態のQRコードをインデックスから全件取得
                // - 検索条件: GSI1_PK = "QR#BANNED"
                // - 取得カラム: PK, SK (削除に必要な最小限の属性)
                // - ページング: LastEvaluatedKey を使用して全件取得をサポート
                result = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: INDEX_NAME,
                    KeyConditionExpression: 'GSI1_PK = :pk',
                    ExpressionAttributeValues: {
                        ':pk': 'QR#BANNED'
                    },
                    ProjectionExpression: 'PK, SK', // Only need keys for deletion
                    ExclusiveStartKey: lastEvaluatedKey
                }));
            }

            if (result.Items && result.Items.length > 0) {
                // Process this page of items immediately
                const pageItems = result.Items;

                // Chunk into batches of 25 for BatchWrite
                for (let i = 0; i < pageItems.length; i += 25) {
                    const chunk = pageItems.slice(i, i + 25);
                    const deleteRequests = chunk.map((item: any) => ({
                        DeleteRequest: {
                            Key: { PK: item.PK, SK: item.SK }
                        }
                    }));

                    // 抽出したQRコードを物理削除 (25件ずつのバッチ実行)
                    // - 削除条件: PK = item.PK, SK = item.SK
                    await ddb.send(new BatchWriteCommand({
                        RequestItems: {
                            [TABLE_NAME]: deleteRequests
                        }
                    }));

                    deletedCount += chunk.length;
                }
            }

            lastEvaluatedKey = result.LastEvaluatedKey;
            if (body.target) break;
        } while (lastEvaluatedKey);

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Successfully deleted BANNED items',
                count: deletedCount
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: String(error) })
        };
    }
};
