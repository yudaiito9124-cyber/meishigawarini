import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as crypto from 'crypto';
import { generateId } from './utils/id';
import { checkUserShopPermission } from './share/shop-auth';
import { stripSignaturesInHtml, stripSignature } from './utils/s3';

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {

    try {
        // Only allow POST
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
        }

        const body = JSON.parse(event.body || '{}');
        const count = body.count || 1;
        let shopId = body.shopId;
        let productId = body.productId;
        const expiryDate = body.expiry_date;
        const ownerUuid = body.owner_uuid;
        const senderInfo = body.sender_info;


        // Limit max count for safety
        if (count > 100) { // DynamoDB BatchWrite limit is 25 items
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Max 100 items per batch' }) };
        }

        // Validate owner_uuid if provided
        if (ownerUuid) {
            const userRes = await ddbDocClient.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${ownerUuid}`, SK: 'SHOP' }
            }));
            if (!userRes.Item) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: '指定されたオーナーIDが存在しません' }) };
            }

            // If shopID is also provided, verify ownership
            if (shopId) {
                const hasPermission = await checkUserShopPermission(ddbDocClient, TABLE_NAME, shopId, ownerUuid);
                if (!hasPermission) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: '指定されたショップは指定されたオーナーのものではありません' }) };
                }
            }
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
        // Validation for shopId and productId
        else if (shopId && !productId) {
            // Verify if the shop exists
            const shopRes = await ddbDocClient.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `SHOP#${shopId}`,
                    SK: 'METADATA'
                }
            }));
            if (!shopRes.Item) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: '指定されたショップIDは存在しません' })
                };
            }
            productId = ""
            isLinked = false; // "ショップと商品IDを同時に指定した時に限って，生成時からすでにLINK状態にしてほしい"
        } else if (!shopId && productId) {
            // Verify if the product exists using GSI2
            const prodRes = await ddbDocClient.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': `PRODUCT#${productId}`
                }
            }));
            if (!prodRes.Items || prodRes.Items.length === 0) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: '指定されたプロダクトIDは存在しません' })
                };
            }
            shopId = ""
            isLinked = false;
        }

        const items = [];
        const ids = [];
        const batch_id = generateId();

        let processedSenderInfo = null;
        if (senderInfo) {
            processedSenderInfo = {
                ...senderInfo,
                card_image_url: stripSignature(senderInfo.card_image_url),
                html_image_urls: (senderInfo.html_image_urls || []).map((url: string) => stripSignature(url)),
                detail_html: stripSignaturesInHtml(senderInfo.detail_html, BUCKET_NAME)
            };
        }

        for (let i = 0; i < count; i++) {
            const uuid = generateId();
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
                batch_id: { S: batch_id }, // Store the batch ID
                ts_created_at: { S: now },
                ts_updated_at: { S: now }
            };

            if (expiryDate) {
                item.ts_expired_at = { S: expiryDate };
            }
            if (ownerUuid) {
                item.owner_id = { S: ownerUuid };
            }

            if (shopId) {
                item.GSI2_PK = { S: `SHOP#${shopId}` };
                item.GSI2_SK = { S: now };
                item.shop_id = { S: shopId };
            }
            if (productId) {
                item.product_id = { S: productId };
            }
            if (isLinked) {
                item.GSI1_PK = { S: 'QR#LINKED' };
                item.status = { S: 'LINKED' };
                item.ts_linked_at = { S: now };
            } else {
                item.GSI1_PK = { S: 'QR#UNASSIGNED' };
                item.status = { S: 'UNASSIGNED' };
            }
            item.GSI1_SK = { S: now };

            items.push({
                PutRequest: {
                    Item: item
                }
            });

            if (processedSenderInfo) {
                items.push({
                    PutRequest: {
                        Item: {
                            PK: { S: `QR#${uuid}` },
                            SK: { S: 'CHAT' },
                            sender_info: {
                                M: Object.entries(processedSenderInfo).reduce((acc: any, [k, v]) => {
                                    if (typeof v === 'string') acc[k] = { S: v };
                                    else if (Array.isArray(v)) acc[k] = { L: v.map(item => ({ S: item })) };
                                    else acc[k] = { S: JSON.stringify(v) }; // Fallback
                                    return acc;
                                }, {})
                            },
                            ts_created_at: { S: now },
                            ts_updated_at: { S: now }
                        }
                    }
                });
            }

            ids.push({ uuid, pin });
        }

        // DynamoDB BatchWriteItem has a limit of 25 items per request
        for (let i = 0; i < items.length; i += 25) {
            const chunk = items.slice(i, i + 25);
            await client.send(new BatchWriteItemCommand({
                RequestItems: {
                    [TABLE_NAME]: chunk
                }
            }));
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'QR Codes generated',
                count: ids.length,
                batch_id: batch_id,
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
