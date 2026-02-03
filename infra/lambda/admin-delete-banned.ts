import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { verifyAdmin } from './share/admin-auth-inlambda';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';
const INDEX_NAME = 'GSI1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export const handler: APIGatewayProxyHandler = async (event) => {
    // 最初にadmin権限をチェック
    const { isAdmin, errorResponse } = verifyAdmin(event);
    // 管理者でなければ、ここで処理を終了して404を返す
    if (!isAdmin) {
        return errorResponse!;
    }

    console.log('Event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    if (event.httpMethod !== 'DELETE') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Method Not Allowed' })
        };
    }

    try {
        // 1. Query & Delete in batches
        let deletedCount = 0;
        let lastEvaluatedKey: Record<string, any> | undefined;

        do {
            const result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: INDEX_NAME,
                KeyConditionExpression: 'GSI1_PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': 'QR#BANNED'
                },
                ProjectionExpression: 'PK, SK', // Only need keys for deletion
                ExclusiveStartKey: lastEvaluatedKey
            }));

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

                    await ddb.send(new BatchWriteCommand({
                        RequestItems: {
                            [TABLE_NAME]: deleteRequests
                        }
                    }));

                    deletedCount += chunk.length;
                }
            }

            lastEvaluatedKey = result.LastEvaluatedKey;
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
