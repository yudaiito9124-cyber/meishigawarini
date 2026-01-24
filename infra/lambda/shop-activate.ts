
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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
        const { qr_id, product_id, shop_id, action, activate_now } = body; // action: 'LINK' | 'ACTIVATE'

        if (!qr_id) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing qr_id' }) };
        }

        if (action === 'LINK') {
            if (!product_id || !shop_id) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing product_id or shop_id for LINK action' }) };
            }

            const targetStatus = activate_now ? 'ACTIVE' : 'LINKED';
            let updateExp = 'SET #status = :target, product_id = :pid, shop_id = :sid';
            const expValues: any = {
                ':target': targetStatus,
                ':pid': product_id,
                ':sid': shop_id,
                ':unassigned': 'UNASSIGNED'
            };

            if (activate_now) {
                updateExp += ', activated_at = :now';
                expValues[':now'] = new Date().toISOString();
            }

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: updateExp,
                ConditionExpression: '#status = :unassigned',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: expValues
            }));

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: `QR Code ${activate_now ? 'Activated' : 'Linked'}`, status: 'success' })
            };

        } else if (action === 'ACTIVATE') {
            // Activate an already LINKED code
            // For safety, we should really check if the shop owns it, but this generic endpoint might be used by admin
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :active, activated_at = :now',
                ConditionExpression: '#status = :linked',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':active': 'ACTIVE',
                    ':linked': 'LINKED',
                    ':now': new Date().toISOString()
                }
            }));

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Activation completed', status: 'success' })
            };

        } else {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };
        }

    } catch (error: any) {
        console.error(error);
        if (error.name === 'ConditionalCheckFailedException') {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not in valid state for requested action' }) };
        }
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error' })
        };
    }
};
