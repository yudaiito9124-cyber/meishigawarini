import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';

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
        const { uuid, pin, password } = body;

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
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Gift not found or Invalid PIN' }) };
        }

        const item = getRes.Item;

        // Verify PIN
        if (String(item.pin) !== String(pin)) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
        }

        // Logic for Password Protection
        let isAuthorizedByPassword = false;
        let isPasswordProtected = false;

        if (item.password_hash) {
            isPasswordProtected = true;
            if (password) {
                const isValid = await bcrypt.compare(password, item.password_hash);
                if (!isValid) {
                    isAuthorizedByPassword = false;
                } else {
                    isAuthorizedByPassword = true;
                }
            } else {
                isAuthorizedByPassword = false;
            }
        } else {
            isAuthorizedByPassword = true;
        }

        // If NOT authorized (Protected + Wrong/No Password), we redact info
        // BUT we still allow them to see the "Restricted" screen (for Chat).
        // So we don't return 403, we return 200 with limited data.

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

        // Fetch Product Data if available AND Authorized
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

        // Fetch Tracking Number if SHIPPED AND Authorized
        let delivery_company = undefined;
        let tracking_number = undefined;
        if (isAuthorizedByPassword && status === 'SHIPPED') {
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

        // Fallback for legacy or unlinked codes (Prototype safety) - Only if authorized
        if (isAuthorizedByPassword && !product && !shop_id) { // Only show dummy if it really has no product
            // If it has shop_id/product_id but failed to fetch, it might be an error, but let's stick to simple logic
            // logic: if authorized and no product found (and no shop_id implies it wasn't linked), show dummy?
            // Actually, cleaner: if authorized, populate product.
            // If NOT authorized, product remains null.
        }

        // If authorized and product is still null (maybe database issue or truly empty), we can provide a default?
        // Or specific "Protected" placeholder if not authorized.

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                uuid,
                status,
                product_id: product_id,
                shop_id: shop_id,
                delivery_company: isAuthorizedByPassword ? delivery_company : undefined,
                tracking_number: isAuthorizedByPassword ? tracking_number : undefined,
                product: product,
                memo_for_users: isAuthorizedByPassword ? item.memo_for_users : undefined,
                ts_expired_at: item.ts_expired_at,
                is_password_protected: isPasswordProtected,
                is_authorized: isAuthorizedByPassword
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
