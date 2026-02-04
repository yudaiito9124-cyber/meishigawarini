
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
        }

        const body = JSON.parse(event.body || '{}');
        const { qr_id, pin_code, shipping_info } = body;

        if (!qr_id || !pin_code || !shipping_info) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing required fields' }) };
        }

        const { name, address, zipCode } = shipping_info;
        if (!name || !address || !zipCode) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing required address fields (name, address, zipCode)' }) };
        }

        // 1. Verify QR and PIN
        const getRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        if (!getRes.Item) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not found' }) };
        }

        if (getRes.Item.status !== 'ACTIVE') {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code is not active' }) };
        }

        if (getRes.Item.pin !== pin_code) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
        }

        const now = new Date().toISOString();
        // 2. Transact Write: Update Status + Create Order
        await ddb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                        UpdateExpression: 'SET #status = :used, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                        ConditionExpression: '#status = :active', // Double check race condition
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: { ':used': 'USED', ':active': 'ACTIVE', ':gsi_pk': 'QR#USED', ':now': now }
                    }
                },
                {
                    Put: {
                        TableName: TABLE_NAME,
                        Item: {
                            PK: `QR#${qr_id}`,
                            SK: 'ORDER',
                            ...shipping_info,
                            ts_submitted_at: now,
                            ts_updated_at: now
                        }
                    }
                }
            ]
        }));

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Address submitted successfully',
                order_id: `ORDER#${qr_id}` // logically same ID space or new UUID? Using QR ID is simpler for lookup
            })
        };

    } catch (error: any) {
        console.error(error);
        if (error.name === 'TransactionCanceledException') {
            return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'Transaction failed (possibly already used)' }) };
        }
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error' })
        };
    }
};
