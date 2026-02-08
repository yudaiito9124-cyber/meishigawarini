
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { verifyAdmin } from './share/admin-auth-inlambda';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});
const TABLE_NAME = process.env.TABLE_NAME || '';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const INDEX_NAME = 'GSI1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,GET'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    // 最初にadmin権限をチェック
    const { isAdmin, errorResponse } = verifyAdmin(event);
    // 管理者でなければ、ここで処理を終了して404を返す
    if (!isAdmin) {
        return errorResponse!;
    }

    try {
        if (event.httpMethod !== 'GET') {
            return {
                statusCode: 405,
                headers: corsHeaders,
                body: 'Method Not Allowed'
            };
        }

        const status = event.queryStringParameters?.status || 'UNASSIGNED';
        const keyword = event.queryStringParameters?.keyword || '';

        let result;

        if (status === 'SEARCH') {
            const trimmedKeyword = keyword.trim();
            console.log(`Searching for keyword: "${trimmedKeyword}"`);

            // UUIDs are lowercase, so let's search lowercased keyword against PK
            // PIN is numeric string, acceptable to search as is (lowercase doesn't change digits)

            result = await ddb.send(new ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: '(contains(PK, :kw) OR contains(pin, :kw)) AND begins_with(PK, :prefix) AND SK = :sk',
                ExpressionAttributeValues: {
                    ':kw': trimmedKeyword.toLowerCase(),
                    ':prefix': 'QR#',
                    ':sk': 'METADATA'
                }
            }));
        } else {
            result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: INDEX_NAME,
                KeyConditionExpression: 'GSI1_PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': `QR#${status}`
                },
                ScanIndexForward: false, // Descending by ts_created_at
                // Limit: 50 // soft listing limit for now
            }));
        }

        const items = result.Items || [];

        // Enrich with Shop Info
        const shopIds = [...new Set(items.map((item: any) => item.shop_id).filter(Boolean))];
        const shopMap = new Map<string, any>();

        if (shopIds.length > 0) {
            // BatchGet has a limit of 100 items (and 16MB) - chunk it if necessary
            // For simplicity, assuming < 100 unique shops per page for now or implementing simple chunking
            const chunkedShopIds = [];
            for (let i = 0; i < shopIds.length; i += 100) {
                chunkedShopIds.push(shopIds.slice(i, i + 100));
            }

            for (const chunk of chunkedShopIds) {
                const keys = chunk.map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' }));

                const batchRes = await ddb.send(new BatchGetCommand({
                    RequestItems: {
                        [TABLE_NAME]: {
                            Keys: keys,
                            ProjectionExpression: 'PK, #name, email, owner_id', // Fetch owner_id for Cognito lookup
                            ExpressionAttributeNames: { '#name': 'name' }
                        }
                    }
                }));

                if (batchRes.Responses && batchRes.Responses[TABLE_NAME]) {
                    for (const shop of batchRes.Responses[TABLE_NAME]) {
                        const sid = shop.PK.replace('SHOP#', '');
                        shopMap.set(sid, shop);
                    }
                }
            }

            // Fallback: If shop email is missing, try to fetch from Cognito using owner_id
            for (const shop of Array.from(shopMap.values())) {
                if (!shop.email && shop.owner_id) {
                    try {
                        const userRes = await cognito.send(new AdminGetUserCommand({
                            UserPoolId: USER_POOL_ID,
                            Username: shop.owner_id
                        }));
                        const emailAttr = userRes.UserAttributes?.find(attr => attr.Name === 'email');
                        if (emailAttr) {
                            shop.email = emailAttr.Value;
                        }
                    } catch (e) {
                        console.warn(`Failed to fetch email for owner ${shop.owner_id}`, e);
                    }
                }
            }
        }

        // Fetch Order Details (SK=ORDER) for Recipient Info
        // Similar strategy: chunk keys and BatchGet
        const orderKeys = items.filter((i: any) => i.status !== 'UNASSIGNED').map((i: any) => ({
            PK: i.PK,
            SK: 'ORDER'
        }));

        const orderMap = new Map<string, any>();

        if (orderKeys.length > 0) {
            const chunkedOrderKeys = [];
            for (let i = 0; i < orderKeys.length; i += 100) {
                chunkedOrderKeys.push(orderKeys.slice(i, i + 100));
            }

            for (const chunk of chunkedOrderKeys) {
                const batchRes = await ddb.send(new BatchGetCommand({
                    RequestItems: {
                        [TABLE_NAME]: {
                            Keys: chunk
                        }
                    }
                }));

                if (batchRes.Responses && batchRes.Responses[TABLE_NAME]) {
                    for (const order of batchRes.Responses[TABLE_NAME]) {
                        orderMap.set(order.PK, order);
                    }
                }
            }
        }

        const enrichedItems = items.map((item: any) => {
            const shop = item.shop_id ? shopMap.get(item.shop_id) : null;
            const order = orderMap.get(item.PK);

            return {
                ...item,
                shop_name: shop ? shop.name : undefined,
                shop_email: shop ? shop.email : undefined,
                // Accessors for admin/page.tsx
                recipient_name: order?.name || undefined,
                postal_code: order?.zipCode || order?.postal_code || undefined,
                address: order?.address || undefined,
                shipping_info: order || undefined // Pass full order object as shipping_info to match shop page structure if needed, or just specific fields
            };
        });

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                status,
                count: result.Count,
                items: enrichedItems
            })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: String(error) })
        };
    }
};
