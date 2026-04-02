/**
 * 概要: 新規QRコードとPINをバッチで一括生成する。
 * 詳細: 
 *  - 指定された件数のQRコードを生成し、オプションに応じた属性（ショップID、商品ID、有効期限、デザイン等）を設定してDynamoDBに登録する。
 *  - 各項目ごとに一意のUUIDと8桁のPINを発行。
 *  - バッチ書き込み制約（25件/回）を考慮したループ処理を行う。
 *
 * エンドポイント: POST /admin/qr/generate
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import * as crypto from 'crypto';
import { generateId } from './utils/id';
import { validateQRParams } from './utils/qr-validation';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getShopId, getUserId, getProductId } from './utils/request';
import { AdminApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}') as AdminApiSchema['admin_qr_generate'];
        const count = body.count || 1;
        const shopId = getShopId(event, body);
        const productId = getProductId(event, body);
        const expiryDate = body.expiry_date;
        const owner_id = body.owner_id || body.owner_user_id || (body as any).owner_uuid;
        const senderInfo = body.sender_info;
        let senderId = body.sender_id;
        const activateNow = body.activate_now === true;
        const cardDesign = body.card_design;

        // 生成件数の上限チェック (一旦100件まで)
        if (count > 100) {
            return errorResponse(400, 'Max 100 items per batch', { count });
        }

        // 共通バリデーションロジックの呼び出し
        const validationResult: any = await validateQRParams(ddb, TABLE_NAME, BUCKET_NAME, {
            shopId,
            productId,
            owner_id,
            activateNow,
            senderId,
            senderInfo
        }).catch((err: any) => {
            if (err.statusCode) return err;
            throw err;
        });

        if (validationResult.statusCode) {
            return errorResponse(validationResult.statusCode, validationResult.message, validationResult.detail);
        }

        const { processedSenderInfo, isLinkeable, validDays } = validationResult;

        const ids = [];
        const batch_id = generateId();
        const writeRequests = [];

        for (let i = 0; i < count; i++) {
            const qr_id = generateId();
            let pin = '';
            do {
                // 8桁のPIN生成 (ゾロ目を避ける)
                pin = crypto.randomInt(10000000, 100000000).toString();
            } while (/^(\d)\1+$/.test(pin));

            const now = new Date().toISOString();

            // METADATA 項目の構築
            const item: any = {
                PK: `QR#${qr_id}`,
                SK: 'METADATA',
                pin: pin,
                batch_id: batch_id,
                ts_created_at: now,
                ts_updated_at: now
            };

            if (expiryDate) item.ts_expired_at = expiryDate;
            if (owner_id) item.owner_id = owner_id;
            if (shopId) {
                item.shop_id = shopId;
                item.GSI2_PK = `SHOP#${shopId}`;
                item.GSI2_SK = now;
            }
            if (productId) item.product_id = productId;
            if (cardDesign) item.card_design = cardDesign;

            // ステータスとGSI1の設定
            if (activateNow) {
                const activationDate = new Date();
                const expirationDate = new Date(activationDate);
                expirationDate.setDate(expirationDate.getDate() + validDays);

                item.GSI1_PK = 'QR#ACTIVE';
                item.GSI1_SK = now;
                item.status = 'ACTIVE';
                item.ts_activated_at = now;
                if (!expiryDate) {
                    item.ts_expired_at = expirationDate.toISOString();
                }
            } else if (isLinkeable) {
                item.GSI1_PK = 'QR#LINKED';
                item.GSI1_SK = now;
                item.status = 'LINKED';
                item.ts_linked_at = now;
            } else {
                item.GSI1_PK = 'QR#UNASSIGNED';
                item.GSI1_SK = now;
                item.status = 'UNASSIGNED';
            }

            writeRequests.push({ PutRequest: { Item: item } });

            // CHAT レコード（送信者が決まっている場合のみ）
            if (processedSenderInfo) {
                writeRequests.push({
                    PutRequest: {
                        Item: {
                            PK: `QR#${qr_id}`,
                            SK: 'CHAT',
                            sender_id: processedSenderInfo.sender_id,
                            ts_created_at: now,
                            ts_updated_at: now
                        }
                    }
                });
            }

            ids.push({ qr_id, pin });
        }

        // 25件ずつのバッチ書き込みを実行 (BatchWriteCommand は DocumentClient 用)
        for (let i = 0; i < writeRequests.length; i += 25) {
            const chunk = writeRequests.slice(i, i + 25);
            await ddb.send(new BatchWriteCommand({
                RequestItems: { [TABLE_NAME]: chunk }
            }));
        }

        return successResponse({
            message: 'QR Codes generated',
            count: ids.length,
            batch_id: batch_id,
            data: ids
        });

    } catch (error: any) {
        console.error('QR generate error:', error);
        return errorResponse(500, 'Internal Server Error', error.message || String(error));
    }
};
