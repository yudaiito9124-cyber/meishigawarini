/**
 * @file admin_qr_generate.ts
 * @role 管理者用：QR コード / ギフト券一括生成ハンドラー
 * @responsibility
 *  - `admin_card_orders`（発注）を起点に、物理的なカードに印字するための QR コード ID と PIN コードをバッチ生成します。
 *  - 【状態遷移】発注レコード（CARD_ORDER）を `ORDERED` から `PRINTING`（印刷中）へ更新し、`batch_id` を紐付けます。これにより、一つの注文に対して二重に QR が生成されることを防ぎます。
 *  - 【セキュリティ】一意の UUID（QR_ID）に加え、推測困難な 8 桁の PIN コードを発行します（ゾロ目や単純連番を排除するフィルタ付き）。
 *  - 【柔軟な初期状態】
 *    1. `ACTIVE`: 到着後すぐに利用可能。受取人の住所入力フローをスキップする場合に使用。
 *    2. `LINKED`: 送信者が決まっているが、受取人のアクションが必要な状態。
 *    3. `UNASSIGNED`: 在庫として生成される未割当状態。
 *  - 【バッチ書き込み】DynamoDB の 25 件制限を考慮し、生成された全エンティティ（QR メタデータ、チャット、バッチ情報）を分割して永続化します。
 * @context
 *  - カード制作会社への入稿データ作成の根幹となるプロセスです。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { BatchWriteCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as crypto from 'crypto';
import { generateId } from './utils/id';
import { validateQRParams } from './utils/qr-validation';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getUserId } from './utils/request';
import { AdminApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}') as AdminApiSchema['admin_qr_generate'];
        const order_id = body.order_id;

        // --------------------------------------------------------------------
        // 1. 生成対象の発注レコード（CARD_ORDER）の特定と検証
        // --------------------------------------------------------------------
        if (!order_id) {
            return errorResponse(400, 'order_id is required. Manual generation without order_id is no longer supported.');
        }

        let cardOrderPK = '';
        let cardOrderSK = '';
        let targetItem: any = null;

        try {
            // GSI2 を用いて order_id から発注レコードを逆引き
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

            // フールプルーフ: 重複生成の防止（既に作成済みまたはキャンセル済みの場合は拒否）
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

        // --------------------------------------------------------------------
        // 2. 発注情報に基づく生成パラメータの抽出
        // --------------------------------------------------------------------
        const count = targetItem.quantity;
        const shopId = targetItem.shop_id;
        const productId = targetItem.product_id;
        const expiryDate = targetItem.expiration_date;
        const owner_id = targetItem.shop_user_id;
        const senderId = targetItem.sender_user_id;
        const designId = targetItem.design_id;
        const activateNow = !!targetItem.activate_now;
        const senderInfo = null; // senderId 経由の解決に任せる

        if (count > 100) {
            return errorResponse(400, 'Max 100 items per batch', { count });
        }

        // ショップ、商品、送信者の有効性を一括チェック
        const validationResult: any = await validateQRParams(ddb, TABLE_NAME, BUCKET_NAME, {
            shopId, productId, owner_id, activateNow, senderId, senderInfo
        }).catch((err: any) => {
            if (err.statusCode) return err;
            throw err;
        });

        if (validationResult.statusCode) {
            return errorResponse(validationResult.statusCode, validationResult.message, validationResult.detail);
        }

        const { processedSenderInfo, isLinkeable, validDays } = validationResult;

        // --------------------------------------------------------------------
        // 3. QR コードおよび PIN のバルク生成ロジック
        // --------------------------------------------------------------------
        const ids = [];
        const batch_id = generateId();
        const writeRequests = [];

        for (let i = 0; i < count; i++) {
            const qr_id = generateId();
            let pin = '';
            do {
                // セキュアな 8 桁 PIN の生成
                // フィルタ: 全て同じ数字（11111111）や単純連番（12345678）は、印刷後の耐タンパー性に影響するため除外。
                pin = crypto.randomInt(10000000, 100000000).toString();
            } while (/^(\d)\1+$/.test(pin) || pin === "12345678");

            const now = new Date().toISOString();

            // QR エンティティの構築
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

            // ステータスとインデックス(GSI1)の割り当て
            if (activateNow) {
                // 即時有効化モード: ギフト内容が確定している場合
                const activationDate = new Date();
                const expirationDate = new Date(activationDate);
                expirationDate.setDate(expirationDate.getDate() + validDays);

                item.GSI1_PK = 'QR#ACTIVE';
                item.GSI1_SK = now;
                item.status = 'ACTIVE';
                item.ts_activated_at = now;
                if (!expiryDate) item.ts_expired_at = expirationDate.toISOString();
            } else if (isLinkeable) {
                // リンク済みモード: 送信者は決まっているが受取人の入力が必要な場合
                item.GSI1_PK = 'QR#LINKED';
                item.GSI1_SK = now;
                item.status = 'LINKED';
                item.ts_linked_at = now;
            } else {
                // 未割当モード: 在庫分として生成
                item.GSI1_PK = 'QR#UNASSIGNED';
                item.GSI1_SK = now;
                item.status = 'UNASSIGNED';
            }

            writeRequests.push({ PutRequest: { Item: item } });

            // 送信者が特定されている場合、CHAT レコード（コンテキスト管理）を自動生成
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

        // --------------------------------------------------------------------
        // 4. バッチ情報の永続化（履歴管理）
        // --------------------------------------------------------------------
        const batchTimestamp = new Date().toISOString();
        writeRequests.push({
            PutRequest: {
                Item: {
                    PK: `QR_BATCH#${batch_id}`,
                    SK: `METADATA#${batchTimestamp}`,
                    data: ids,
                    order_id: order_id,
                    ts_created_at: batchTimestamp
                }
            }
        });

        // BatchWrite による一括書き込み（25 件ずつ分割）
        for (let i = 0; i < writeRequests.length; i += 25) {
            const chunk = writeRequests.slice(i, i + 25);
            await ddb.send(new BatchWriteCommand({
                RequestItems: { [TABLE_NAME]: chunk }
            }));
        }

        // --------------------------------------------------------------------
        // 5. 発注レコード（CARD_ORDER）のステータス更新
        // --------------------------------------------------------------------
        if (order_id && cardOrderPK && cardOrderSK) {
            const now = new Date().toISOString();
            const adminUserId = getUserId(event);
            try {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: cardOrderPK, SK: cardOrderSK },
                    UpdateExpression: 'SET batch_id = :bid, user_id_create = :uid, #status = :status, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_qr_generated_at = :now, ts_updated_at = :now',
                    ConditionExpression: 'attribute_not_exists(batch_id)', // 二重生成防止の要
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
