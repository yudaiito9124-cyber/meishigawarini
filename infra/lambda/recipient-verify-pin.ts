import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as bcrypt from 'bcryptjs';
import { isLocked, getRateLimitUpdate, getResetRateLimitUpdate } from './utils/rate-limit';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});
const TABLE_NAME = process.env.TABLE_NAME || '';
const USER_POOL_ID = process.env.USER_POOL_ID || '';

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

        // Check Lock
        if (isLocked(item)) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Too many attempts. Please try again later.' }) };
        }

        // Verify PIN
        if (String(item.pin) !== String(pin)) {
            const { UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = getRateLimitUpdate(item);
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                UpdateExpression,
                ExpressionAttributeValues,
                ExpressionAttributeNames
            }));
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
        }

        // Success: Reset failures if they exist
        if (item.failed_attempts || item.locked_until) {
            const { UpdateExpression, ExpressionAttributeNames } = getResetRateLimitUpdate();
            try {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                    UpdateExpression,
                    ExpressionAttributeNames
                }));
            } catch (e) {
                console.error("Failed to reset rate limit:", e);
            }
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

        const { product_id, shop_id } = item;
        let status = item.status;

        // Check Expiration
        if (status === 'ACTIVE' && item.ts_expired_at) {
            const now = new Date();
            const expiresAt = new Date(item.ts_expired_at);
            if (now > expiresAt) {
                status = 'EXPIRED';

                // Lazy update: Update DB to EXPIRED so next time it is faster and consistent
                try {
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                        UpdateExpression: 'SET #status = :expired, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: {
                            ':expired': 'EXPIRED',
                            ':gsi_pk': 'QR#EXPIRED',
                            ':now': now.toISOString()
                        }
                    }));
                    console.log(`QR Code ${uuid} expired and updated.`);
                } catch (e: any) {
                    console.error('Failed to update expired status:', e.message, e.stack);
                    // Continue, as we can still return expired status to user
                }
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

        // Fetch Shop Metadata for Email
        let shop_email = undefined;
        let shop_name = undefined;
        let owner_id = undefined;
        if (shop_id && isAuthorizedByPassword) {
            const shopRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shop_id}`, SK: 'METADATA' }
            }));
            if (shopRes.Item) {
                shop_email = shopRes.Item.email;
                shop_name = shopRes.Item.name;
                owner_id = shopRes.Item.owner_id;
            }

            // Fallback: If no email in DynamoDB, fetch from Cognito using owner_id
            if (!shop_email && owner_id && USER_POOL_ID) {
                try {
                    const user = await cognito.send(new AdminGetUserCommand({
                        UserPoolId: USER_POOL_ID,
                        Username: owner_id
                    }));
                    const emailAttr = user.UserAttributes?.find(attr => attr.Name === 'email');
                    if (emailAttr) {
                        shop_email = emailAttr.Value;

                        // OPTIONAL: Heal the data? 
                        // We could update the shop metadata with this email to avoid future lookups.
                        // But let's keep it simple for now or do it asynchronously if we cared about perf.
                    }
                } catch (e) {
                    console.error(`Failed to fetch email for owner ${owner_id}:`, e);
                }
            }
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
                shop_email: shop_email,
                shop_name: shop_name,
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
