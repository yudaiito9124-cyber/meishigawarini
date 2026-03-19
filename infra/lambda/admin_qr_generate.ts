/**
 * 概要: 新規QRコードとPINをバッチで一括生成する。
 * 詳細: 指定された件数のQRコードを生成し、オプションに応じた属性（ショップID、商品ID、有効期限、デザイン等）を設定してDynamoDBに登録する。
 * エンドポイント: POST /admin/qr/generate
 * リクエストボディ:
 *  - count: 生成件数 (最大100)
 *  - card_design: カードデザインID (必須)
 *  - shopId, productId, expiry_date, owner_uuid, sender_info, senderId: 各種属性（オプション）
 *  - activate_now: trueの場合、即座に有効状態で生成
 */
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
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'OK' }) };
        }
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const count = body.count || 1; //required
        const shopId = body.shopId;  //optional
        const productId = body.productId;  //optional
        const expiryDate = body.expiry_date;  //optional
        const ownerUuid = body.owner_uuid;  //optional
        const senderInfo = body.sender_info;  //optional
        let senderId = body.senderId;  //optional
        const activateNow = body.activate_now === true;  //optional
        const cardDesign = body.card_design;  //required


        // Limit max count for safety
        if (count > 100) { // DynamoDB BatchWrite limit is 25 items
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Max 100 items per batch', detail: { count } }) };
        }

        // Validate owner_uuid if provided
        let user_shop_ids: string[] = [];
        if (ownerUuid) {
            // オーナー指定がある場合、ユーザー情報の存在と権限を確認
            // - 検索条件: PK = USER#{ownerUuid}, SK = "SHOP"
            // - 取得カラム: owner_shop_ids, gm_shop_ids
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
            // 商品指定がある場合、その商品の情報を取得（所属ショップ確認用）
            // - 検索条件: GSI2_PK = PRODUCT#{productId}
            // - 取得カラム: PK (所属ショップのID)
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
            // ショップ指定がある場合、ショップ情報の存在を確認
            // - 検索条件: PK = SHOP#{shopId}, SK = "METADATA"
            // - 取得カラム: 項目の全属性
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
            // 即時有効化する場合、商品の詳細設定（有効期間等）を取得
            // - 検索条件: PK = SHOP#{shopId}, SK = PRODUCT#{productId}
            // - 取得カラム: valid_days (有効日数)
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
            // 送り主IDの情報を取得
            // - 検索条件: PK = USER#{senderId}, SK = "SENDER"
            // - 取得カラム: 項目の全ての属性 (名称、ロゴ等)
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
            // 生成したQRコードデータを一括登録 (25件ずつのバッチ実行)
            // - 登録内容: 各種ステータス、生成されたUUID/PIN、有効期限、関連ID等
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
