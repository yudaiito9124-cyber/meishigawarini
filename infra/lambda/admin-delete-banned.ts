import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

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
        // 1. Query all BANNED items
        let itemsToDelete: any[] = [];
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

            if (result.Items) {
                itemsToDelete.push(...result.Items);
            }
            lastEvaluatedKey = result.LastEvaluatedKey;
        } while (lastEvaluatedKey);

        console.log(`Found ${itemsToDelete.length} items to delete`);

        if (itemsToDelete.length === 0) {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'No BANNED items found', count: 0 })
            };
        }

        // 2. Batch Delete (max 25 items per batch)
        const chunks = [];
        for (let i = 0; i < itemsToDelete.length; i += 25) {
            chunks.push(itemsToDelete.slice(i, i + 25));
        }

        let deletedCount = 0;

        for (const chunk of chunks) {
            const deleteRequests = chunk.map((item: any) => ({
                DeleteRequest: {
                    Key: {
                        PK: item.PK,
                        SK: item.SK
                    }
                }
            }));

            await ddb.send(new BatchWriteCommand({
                RequestItems: {
                    [TABLE_NAME]: deleteRequests
                }
            }));

            deletedCount += chunk.length;
        }

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
