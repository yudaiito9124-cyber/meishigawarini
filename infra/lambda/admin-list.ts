
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { verifyAdmin } from './share/admin-auth-inlambda';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';
const INDEX_NAME = 'GSI1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,GET'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    // 最初にadmin権限をチェック
    const { isAdmin, errorResponse } = verifyAdmin(event);
    // 管理者でなければ、ここで処理を終了して404を返す
    if (!isAdmin) {
        return errorResponse!;
    }

    try {
        if (event.httpMethod !== 'GET') {
            return {
                statusCode: 405,
                headers: corsHeaders,
                body: 'Method Not Allowed'
            };
        }

        const status = event.queryStringParameters?.status || 'UNASSIGNED';
        const keyword = event.queryStringParameters?.keyword || '';

        let result;

        if (status === 'SEARCH') {
            const trimmedKeyword = keyword.trim();
            console.log(`Searching for keyword: "${trimmedKeyword}"`);

            // UUIDs are lowercase, so let's search lowercased keyword against PK
            // PIN is numeric string, acceptable to search as is (lowercase doesn't change digits)

            result = await ddb.send(new ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: '(contains(PK, :kw) OR contains(pin, :kw)) AND begins_with(PK, :prefix) AND SK = :sk',
                ExpressionAttributeValues: {
                    ':kw': trimmedKeyword.toLowerCase(),
                    ':prefix': 'QR#',
                    ':sk': 'METADATA'
                }
            }));
        } else {
            result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: INDEX_NAME,
                KeyConditionExpression: 'GSI1_PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': `QR#${status}`
                },
                ScanIndexForward: false, // Descending by ts_created_at
                // Limit: 50 // soft listing limit for now
            }));
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                status,
                count: result.Count,
                items: result.Items
            })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: String(error) })
        };
    }
};
