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
import { validateQRParams } from './utils/qr-validation';

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

        // Execute shared parameter and consistency validation
        // この一連のチェックは admin_qr_generate.ts と shop_card_orders.ts で共通のロジックを使用する。
        const validationResult = await validateQRParams(ddbDocClient, TABLE_NAME, BUCKET_NAME, {
            shopId,
            productId,
            ownerUuid,
            activateNow,
            senderId,
            senderInfo
        }).catch((err: any) => {
            if (err.statusCode) return err;
            throw err;
        });

        if (validationResult.statusCode) {
            return {
                statusCode: validationResult.statusCode,
                headers: corsHeaders,
                body: JSON.stringify({ message: validationResult.message, detail: validationResult.detail })
            };
        }

        const { processedSenderInfo, isLinkeable, validDays } = validationResult;


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
