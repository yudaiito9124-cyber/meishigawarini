
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

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
    try {
        if (event.httpMethod !== 'GET') {
            return {
                statusCode: 405,
                headers: corsHeaders,
                body: 'Method Not Allowed'
            };
        }

        const status = event.queryStringParameters?.status || 'UNASSIGNED';

        const result = await ddb.send(new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: INDEX_NAME,
            KeyConditionExpression: 'GSI1_PK = :pk',
            ExpressionAttributeValues: {
                ':pk': `QR#${status}`
            },
            ScanIndexForward: false, // Descending by created_at
            // Limit: 50 // soft listing limit for now
        }));

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
