import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import * as crypto from 'crypto';
import { verifyAdmin } from './share/admin-auth-inlambda';

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    // 最初にadmin権限をチェック
    const { isAdmin, errorResponse } = verifyAdmin(event);
    // 管理者でなければ、ここで処理を終了して404を返す
    if (!isAdmin) {
        return errorResponse!;
    }

    try {
        // Only allow POST
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
        }

        const body = JSON.parse(event.body || '{}');
        const count = body.count || 1;

        // Limit max count for safety
        if (count > 25) { // DynamoDB BatchWrite limit is 25 items
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Max 25 items per batch' }) };
        }

        const items = [];
        const ids = [];

        for (let i = 0; i < count; i++) {
            const uuid = crypto.randomUUID();
            let pin = '';
            do {
                // Cryptographically secure random number
                pin = crypto.randomInt(10000000, 100000000).toString();
            } while (/^(\d)\1+$/.test(pin)); // 8 digit PIN, avoid repdigits

            const now = new Date().toISOString();
            items.push({
                PutRequest: {
                    Item: {
                        PK: { S: `QR#${uuid}` },
                        SK: { S: 'METADATA' },
                        GSI1_PK: { S: 'QR#UNASSIGNED' },
                        GSI1_SK: { S: now },
                        status: { S: 'UNASSIGNED' },
                        pin: { S: pin },
                        created_at: { S: now },
                        updated_at: { S: now }
                    }
                }
            });
            ids.push({ uuid, pin });
        }

        await ddb.send(new BatchWriteItemCommand({
            RequestItems: {
                [TABLE_NAME]: items
            }
        }));

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'QR Codes generated',
                count: items.length,
                data: ids
            })
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
