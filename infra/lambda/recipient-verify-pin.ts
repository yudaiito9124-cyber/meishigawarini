
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

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
        const { uuid, pin } = body;

        if (!uuid || !pin) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID or PIN' }) };
        }

        const getRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `QR#${uuid}`,
                SK: 'METADATA'
            }
        }));

        if (!getRes.Item) {
            // Not found
            // To prevent enumeration? Maybe just 404 is fine.
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Gift not found or Invalid PIN' }) };
        }

        const item = getRes.Item;

        // Verify PIN
        // Ensure both are strings for comparison
        if (String(item.pin) !== String(pin)) {
            // Invalid PIN
            // Return 404 or specific error. Usually "Invalid credentials" style.
            // User asked: "match -> return data, not match -> return nothing (or error)"
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
        }

        const { product_id, shop_id } = item;
        let status = item.status;

        // Check Expiration
        if (status === 'ACTIVE' && item.ts_expired_at) {
            const now = new Date();
            const expiresAt = new Date(item.ts_expired_at);
            if (now > expiresAt) {
                status = 'EXPIRED';
            }
        }

        // Fetch Product Data if available
        let product = null;
        if (shop_id && product_id) {
            const prodRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `SHOP#${shop_id}`,
                    SK: `PRODUCT#${product_id}`
                }
            }));
            product = prodRes.Item;
        }

        // Fetch Tracking Number if SHIPPED
        let delivery_company = undefined;
        let tracking_number = undefined;
        if (status === 'SHIPPED') {
            const orderRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `QR#${uuid}`,
                    SK: 'ORDER'
                }
            }));
            if (orderRes.Item) {
                delivery_company = orderRes.Item.delivery_company;
                tracking_number = orderRes.Item.tracking_number;
            }
        }

        // Fallback for legacy or unlinked codes (Prototype safety)
        if (!product) {
            product = {
                name: 'Pending Gift',
                description: 'This gift has not been linked to a product yet.',
                image_url: 'https://placehold.co/600x400?text=Pending'
            };
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                uuid,
                status,
                product_id,
                shop_id,
                // Do NOT return the PIN in the response, obviously, though they sent it.
                delivery_company,
                tracking_number,
                product,
                memo_for_users: item.memo_for_users,
                ts_expired_at: item.ts_expired_at
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
