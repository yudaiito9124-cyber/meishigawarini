
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
        const { qr_id, product_id, pin_code } = body;

        if (!qr_id || !product_id) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing qr_id or product_id' }) };
        }

        // Update status to ACTIVE and set product_id
        // Condition: Status must be UNASSIGNED or LINKED (assuming we allow direct activation from fresh)
        // Actually, per security, maybe strictly UNASSIGNED?
        // Let's assume UNASSIGNED -> ACTIVE (with product link)

        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `QR#${qr_id}`,
                SK: 'METADATA'
            },
            UpdateExpression: 'SET #status = :active, product_id = :pid, activated_at = :now',
            ConditionExpression: '#status = :unassigned OR #status = :linked',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':active': 'ACTIVE',
                ':unassigned': 'UNASSIGNED',
                ':linked': 'LINKED',
                ':pid': product_id,
                ':now': new Date().toISOString()
            }
        }));

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Activation completed',
                status: 'success'
            })
        };

    } catch (error: any) {
        console.error(error);
        if (error.name === 'ConditionalCheckFailedException') {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not in valid state for activation' }) };
        }
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error' })
        };
    }
};
