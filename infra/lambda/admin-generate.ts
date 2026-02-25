import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as crypto from 'crypto';
import { verifyAdmin } from './share/admin-auth-inlambda';

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
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
        const shopId = body.shopId;
        const productId = body.productId;

        // Validation for shopId and productId
        if ((shopId && !productId) || (!shopId && productId)) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Both shopId and productId must be provided, or both must be empty (ショップIDとプロダクトIDは両方指定するか、両方空にする必要があります)' })
            };
        }

        // Limit max count for safety
        if (count > 10) { // DynamoDB BatchWrite limit is 25 items
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Max 25 items per batch' }) };
        }

        let isLinked = false;

        if (shopId && productId) {
            // Verify if the shop and product exist
            const getRes = await ddbDocClient.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `SHOP#${shopId}`,
                    SK: `PRODUCT#${productId}`
                }
            }));

            if (!getRes.Item) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: '指定されたショップIDとプロダクトIDの組み合わせが存在しません' })
                };
            }
            isLinked = true;
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

            const item: any = {
                PK: { S: `QR#${uuid}` },
                SK: { S: 'METADATA' },
                pin: { S: pin },
                ts_created_at: { S: now },
                ts_updated_at: { S: now }
            };

            if (isLinked) {
                item.GSI1_PK = { S: 'QR#LINKED' };
                item.GSI1_SK = { S: now };
                item.GSI2_PK = { S: `SHOP#${shopId}` };
                item.GSI2_SK = { S: now };
                item.status = { S: 'LINKED' };
                item.shop_id = { S: shopId };
                item.product_id = { S: productId };
                item.ts_linked_at = { S: now };
            } else {
                item.GSI1_PK = { S: 'QR#UNASSIGNED' };
                item.GSI1_SK = { S: now };
                item.status = { S: 'UNASSIGNED' };
            }

            items.push({
                PutRequest: {
                    Item: item
                }
            });
            ids.push({ uuid, pin });
        }

        await client.send(new BatchWriteItemCommand({
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

    } catch (error: any) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: error.message || String(error) })
        };
    }
};
