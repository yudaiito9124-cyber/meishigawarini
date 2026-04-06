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
import { BatchWriteCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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
        const order_id = body.order_id;

        if (!order_id) {
            return errorResponse(400, 'order_id is required. Manual generation without order_id is no longer supported.');
        }

        let cardOrderPK = '';
        let cardOrderSK = '';
        let targetItem: any = null;

        // QR生成済みの事前チェックとデータ取得
        try {
            const lookup = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :pk',
                ExpressionAttributeValues: { ':pk': `CARD_ORDER#${order_id}` }
            }));

            targetItem = lookup.Items?.[0];
            if (!targetItem) {
                return errorResponse(404, 'Card order not found');
            }
            
            // すでに batch_id があるか、ステータスが ORDERED でない場合はエラー
            if (targetItem.batch_id || targetItem.status !== 'ORDERED') {
                return errorResponse(400, 'QR codes already generated for this order', {
                    order_id,
                    status: targetItem.status,
                    batch_id: targetItem.batch_id
                });
            }

            cardOrderPK = targetItem.PK;
            cardOrderSK = targetItem.SK;
        } catch (err: any) {
            console.error('Failed to pre-check card order:', err);
            return errorResponse(500, 'Failed to verify card order status');
        }

        // DB（CardOrder）からパラメータを抽出
        const count = targetItem.quantity || 1;
        const shopId = targetItem.shop_id;
        const productId = targetItem.product_id;
        const expiryDate = targetItem.expiration_date;
        const owner_id = targetItem.shop_user_id;
        const senderId = targetItem.sender_user_id;
        const designId = targetItem.design_id;
        
        // 【重要】動作の不変性維持: 
        // 以前のフロントエンド実装(handleExport)では常に activate_now: false を送っていたため、
        // DB上の値に関わらず一貫性を保つため false を固定値として使用します。
        const activateNow = false; 

        // senderInfo は DB に存在しないため null 固定 (senderId 経由で取得される)
        const senderInfo = null;

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
            if (designId) item.design_id = designId;

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

        // バッチ管理レコードの追加
        writeRequests.push({
            PutRequest: {
                Item: {
                    PK: `QRBATCH#${batch_id}`,
                    SK: 'METADATA',
                    data: ids,
                    order_id: order_id,
                    ts_created_at: new Date().toISOString()
                }
            }
        });

        // 25件ずつのバッチ書き込みを実行 (BatchWriteCommand は DocumentClient 用)
        for (let i = 0; i < writeRequests.length; i += 25) {
            const chunk = writeRequests.slice(i, i + 25);
            await ddb.send(new BatchWriteCommand({
                RequestItems: { [TABLE_NAME]: chunk }
            }));
        }

        // 発注レコードの更新 (order_id が指定されている場合)
        if (order_id && shopId && cardOrderPK && cardOrderSK) {
            const now = new Date().toISOString();
            const adminUserId = getUserId(event);
            try {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: cardOrderPK, SK: cardOrderSK },
                    UpdateExpression: 'SET batch_id = :bid, user_id_create = :uid, #status = :status, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_updated_at = :now',
                    ConditionExpression: 'attribute_not_exists(batch_id)', // 二重生成防止
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':bid': batch_id,
                        ':uid': adminUserId,
                        ':status': 'PRINTING',
                        ':gsi_pk': 'CARD_ORDER#PRINTING',
                        ':now': now
                    }
                }));
            } catch (err: any) {
                console.error('Failed to update card order status:', err);
                if (err.name === 'ConditionalCheckFailedException') {
                    return errorResponse(400, 'QR codes were already generated concurrently');
                }
                // QR生成自体は成功しているので、ここではエラーを返さずログのみ（バッチIDは戻り値に含まれる）
            }
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
