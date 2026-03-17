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
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const count = body.count || 1;
        const shopId = body.shopId;
        const productId = body.productId;
        const expiryDate = body.expiry_date;
        const ownerUuid = body.owner_uuid;
        const senderInfo = body.sender_info;
        let senderId = body.senderId;
        const activateNow = body.activate_now === true;
        const cardDesign = body.card_design;


        // Limit max count for safety
        if (count > 100) { // DynamoDB BatchWrite limit is 25 items
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Max 100 items per batch', detail: { count } }) };
        }

        // Validate owner_uuid if provided
        let user_shop_ids: string[] = [];
        if (ownerUuid) {
            const userRes = await ddbDocClient.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${ownerUuid}`, SK: 'SHOP' }
            }));
            if (!userRes.Item) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'User ID not found', detail: { ownerUuid } }) };
            }
            user_shop_ids = [
                ...(userRes.Item.owner_shop_ids || []),
                ...(userRes.Item.gm_shop_ids || [])
            ];
        }

        // If productID is also provided, verify ownership
        let product_shopids = [];
        if (productId) {
            const prodRes = await ddbDocClient.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': `PRODUCT#${productId}`
                }
            }));
            if (!prodRes.Items || prodRes.Items.length === 0) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Product ID not found', detail: { productId } }) };
            }

            product_shopids = prodRes.Items.map((item: any) => item.PK.replace(/^SHOP#/, ""));
        }

        if (shopId) {
            // Verify if the shop exists
            const shopRes = await ddbDocClient.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `SHOP#${shopId}`,
                    SK: 'METADATA'
                }
            }));
            if (!shopRes.Item) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Shop ID not found', detail: { shopId } }) };
            }
        }


        let isLinkeable = false;
        if (shopId && productId && ownerUuid) {
            if (!product_shopids.includes(shopId)) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid shop and product ID combination', detail: { shopids_fromproductid: product_shopids, shopId } }) };
            }
            if (!user_shop_ids.includes(shopId)) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized for target shop', detail: { user_shop_ids, shopId } }) };
            }
            isLinkeable = true;
        } else if (shopId && productId) {
            if (!product_shopids.includes(shopId)) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid shop and product ID combination', detail: { shopids_fromproductid: product_shopids, shopId } }) };
            }
            isLinkeable = true;
        } else if (shopId && ownerUuid) {
            if (!user_shop_ids.includes(shopId)) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized for target shop', detail: { user_shop_ids, shopId } }) };
            }
        } else if (productId && ownerUuid) {
            let set_shopids_fromproductid = new Set(product_shopids);
            if (!user_shop_ids.some((item: any) => set_shopids_fromproductid.has(item))) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Product is not associated with any authorized shop', detail: { user_shop_ids, shopids_fromproductid: product_shopids } }) };
            }
        }

        if (activateNow && !isLinkeable) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Activation requires both shop ID and product ID', detail: { activateNow, isLinkeable } }) };
        }

        let validDays = 180; // Default
        if (activateNow) {
            // Fetch product to get valid_days
            const prodRes = await ddbDocClient.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` }
            }));
            if (prodRes.Item) {
                validDays = prodRes.Item.valid_days || 180;
            }
        }


        let processedSenderInfo = null;
        if (senderId) {
            senderId = senderId.replace(/^USER#/, "");
            // Load sender info from ID (Format: USER#[uuid])
            const senderRes = await ddbDocClient.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${senderId}`, SK: 'SENDER' }
            }));
            if (!senderRes?.Item) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Sender ID not found', detail: { senderId } }) };
            }
            const info = { ...senderRes.Item };
            delete info.PK;
            delete info.SK;
            processedSenderInfo = info;
            processedSenderInfo.sender_id = senderId;
        } else if (senderInfo) {
            processedSenderInfo = { ...senderInfo };
        }

        if (processedSenderInfo) {
            processedSenderInfo = {
                ...processedSenderInfo,
                card_image_url: stripSignature(processedSenderInfo.card_image_url),
                html_image_urls: (processedSenderInfo.html_image_urls || []).map((url: string) => stripSignature(url)),
                detail_html: stripSignaturesInHtml(processedSenderInfo.detail_html, BUCKET_NAME)
            };
        }


        const ids = [];
        const batch_id = generateId();

        const items = [];

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
                item.shop_id = { S: shopId };
                item.GSI2_PK = { S: `SHOP#${shopId}` };
                item.GSI2_SK = { S: now };
            }
            if (productId) {
                item.product_id = { S: productId };
            }
            if (cardDesign) {
                item.card_design = { S: cardDesign };
            }
            if (activateNow) {
                const activationDate = new Date();
                const expirationDate = new Date(activationDate);
                expirationDate.setDate(expirationDate.getDate() + validDays);

                item.GSI1_PK = { S: 'QR#ACTIVE' };
                item.GSI1_SK = { S: now };
                item.status = { S: 'ACTIVE' };
                item.ts_activated_at = { S: now };
                if (!expiryDate) {
                    item.ts_expired_at = { S: expirationDate.toISOString() };
                }
            } else if (isLinkeable) {
                item.GSI1_PK = { S: 'QR#LINKED' };
                item.GSI1_SK = { S: now };
                item.status = { S: 'LINKED' };
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

            if (processedSenderInfo) {
                items.push({
                    PutRequest: {
                        Item: {
                            PK: { S: `QR#${uuid}` },
                            SK: { S: 'CHAT' },
                            sender_id: { S: processedSenderInfo.sender_id },
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
