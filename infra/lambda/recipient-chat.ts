
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers: corsHeaders, body: '' };
        }

        const { uuid } = event.pathParameters || {};
        if (!uuid) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID' }) };
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { pin, username, message } = body;

            if (!pin || !username || !message) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing required fields' }) };
            }

            // 1. Verify PIN
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
            }));

            if (!getRes.Item) {
                return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not found' }) };
            }

            if (getRes.Item.pin !== pin) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
            }

            // 2. Append Message to SK=CHAT
            // Structure: messages: [ { username, message, ts_created_at, id } ]
            const newMessage = {
                id: crypto.randomUUID(),
                username,
                message,
                ts_created_at: new Date().toISOString()
            };

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty_list), :new_msg)',
                ExpressionAttributeValues: {
                    ':empty_list': [],
                    ':new_msg': [newMessage]
                }
            }));

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Message posted', data: newMessage })
            };
        }

        if (event.httpMethod === 'GET') {
            const pin = event.queryStringParameters?.pin;
            if (!pin) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing PIN' }) };
            }

            // 1. Verify PIN (Check METADATA first)
            const getMeta = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
            }));

            if (!getMeta.Item) {
                return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not found' }) };
            }

            if (getMeta.Item.pin !== pin) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
            }

            // 2. Get Messages
            const getChat = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'CHAT' }
            }));

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ messages: getChat.Item?.messages || [] })
            };
        }

        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };

    } catch (error: any) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error' })
        };
    }
};
