
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {

    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        // /admin/qrcodes/{uuid}/ban
        const uuid = event.pathParameters?.uuid;
        if (!uuid) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID' }) };
        }

        console.log(`Banning QR: ${uuid}`);

        const now = new Date().toISOString()
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
            UpdateExpression: 'SET #status = :banned, GSI1_PK = :gsi_pk, ts_updated_at = :ts_updated_at, ts_banned_at = :ts_banned_at',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':banned': 'BANNED',
                ':gsi_pk': 'QR#BANNED',
                ':ts_updated_at': now,
                ':ts_banned_at': now
            }
        }));

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'QR Code Banned', uuid, status: 'BANNED' })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error' })
        };
    }
};
