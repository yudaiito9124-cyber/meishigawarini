/**
 * @file admin_card_orders.ts
 * @role 管理者用：カード発注管理ハンドラー
 * @responsibility
 *  - ショップから依頼された、または管理者が手動作成した「カード発注（名刺の印刷依頼等）」を表示・作成・更新します。
 *  - 【データ検索】GSI1 を用いたステータス別の高速な受注一覧取得。
 *  - 【情報マージ】受注レコードに欠けている「ショップの実名」や「オーナーのメールアドレス」を DynamoDB から追加取得し、UI 向けに情報集約（Enrichment）します。
 *  - 【ステータス管理】注文のライフサイクル（ORDERED -> SHIPPED -> COMPLETED 等）をアトミックに更新します。
 * @context
 *  - 運営・印刷担当者が「どのショップから何枚の注文が来ているか」を確認し、発送処理を行うための主要なエンドポイントです。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand, UpdateCommand, BatchGetCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getAction, getUserId } from './utils/request';
import { generateId } from './utils/id';
import { AdminApiSchema } from '@shared/api-types';
import { validateQRParams } from './utils/qr-validation';
import { signUrlIfS3 } from './utils/s3';
import { getSystemDesign } from './utils/designs';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const action = getAction(event, body);
        const now = new Date().toISOString();

        // --------------------------------------------------------------------
        // ACTION: list (発注一覧の取得)
        // --------------------------------------------------------------------
        // 目的: 指定ステータスの注文を全件取得し、管理画面で判読しやすいよう詳細情報を結合します。
        // インデックス設計: GSI1 (PK: CARD_ORDER#<STATUS>, SK: ts_created_at) を使用して最新順に取得。
        // --------------------------------------------------------------------
        if (action === 'list') {
            const { status = 'ORDERED', limit = 50 } = body as AdminApiSchema['admin_card_orders_list'];

            // 1. ステータスに応じた GSI1 検索
            const result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1_PK = :pk',
                ExpressionAttributeValues: { ':pk': `CARD_ORDER#${status}` },
                ScanIndexForward: false, // 降順 (最新が上)
                Limit: limit
            }));

            const items = result.Items || [];

            // 互換性処理: 内部フィールド名の統一
            items.forEach((item: any) => {
                if (!item.design_id && item.card_design) {
                    item.design_id = item.card_design;
                }
            });

            if (items.length > 0) {
                // 2. 情報マージ (Enrichment)
                // 各注文レコードが持つ shop_id を元に、ショップ名とオーナー情報を一括取得します。
                const shopIds = [...new Set(items.map((i: any) => i.shop_id).filter(Boolean))];
                if (shopIds.length > 0) {
                    const shopKeys = shopIds.map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' }));
                    const batchRes = await ddb.send(new BatchGetCommand({
                        RequestItems: {
                            [TABLE_NAME]: {
                                Keys: shopKeys,
                                ProjectionExpression: 'PK, #name, owner_id',
                                ExpressionAttributeNames: { '#name': 'name' }
                            }
                        }
                    }));

                    const shopMap: Record<string, { name: string, owner_id?: string }> = {};
                    const ownerIds = new Set<string>();

                    if (batchRes.Responses && batchRes.Responses[TABLE_NAME]) {
                        for (const shop of batchRes.Responses[TABLE_NAME]) {
                            const sid = (shop.PK as string).replace('SHOP#', '');
                            shopMap[sid] = { name: shop.name, owner_id: shop.owner_id };
                            if (shop.owner_id) ownerIds.add(shop.owner_id);
                        }
                    }

                    // オーナー（ユーザー）のメールアドレスを一括取得
                    const emailMap: Record<string, string> = {};
                    if (ownerIds.size > 0) {
                        const ownerKeys = Array.from(ownerIds).map(id => ({ PK: `USER#${id}`, SK: 'SHOP' }));
                        const userBatchRes = await ddb.send(new BatchGetCommand({
                            RequestItems: { [TABLE_NAME]: { Keys: ownerKeys, ProjectionExpression: 'PK, email' } }
                        }));
                        if (userBatchRes.Responses && userBatchRes.Responses[TABLE_NAME]) {
                            for (const user of userBatchRes.Responses[TABLE_NAME]) {
                                const uid = (user.PK as string).replace('USER#', '');
                                emailMap[uid] = user.email;
                            }
                        }
                    }

                    // 取得データを注文リストにマージ
                    for (const item of items) {
                        if (item.shop_id && shopMap[item.shop_id]) {
                            item.shop_name = shopMap[item.shop_id].name;
                            const ownerId = shopMap[item.shop_id].owner_id;
                            if (ownerId && emailMap[ownerId]) {
                                item.shop_owner_email = emailMap[ownerId];
                            }
                        }
                    }
                }

                // 3. デザイン情報のマージ (Thumbnails)
                // 管理者が目視でカードデザインを確認できるよう、署名付き URL を付与します。
                const designIds = [...new Set(items.map((i: any) => i.design_id).filter(Boolean))];
                if (designIds.length > 0) {
                    const keys = designIds.map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
                    const batchRes = await ddb.send(new BatchGetCommand({
                        RequestItems: {
                            [TABLE_NAME]: {
                                Keys: keys,
                                ProjectionExpression: 'SK, thumbf, thumbb, bgimgf, bgimgb'
                            }
                        }
                    }));

                    const metaMap = new Map<string, any>();
                    for (const d of (batchRes.Responses?.[TABLE_NAME] || [])) {
                        if (d.thumbf) d.thumbf = await signUrlIfS3(d.thumbf, BUCKET_NAME);
                        if (d.thumbb) d.thumbb = await signUrlIfS3(d.thumbb, BUCKET_NAME);
                        metaMap.set(d.SK, d);
                    }

                    for (const item of items) {
                        const designId = item.design_id;
                        if (designId) {
                            const meta = metaMap.get(designId) || getSystemDesign(designId);
                            if (meta) {
                                item.thumbf = meta.thumbf || meta.bgimgf;
                                item.thumbb = meta.thumbb || meta.bgimgb;
                            }
                        }
                    }
                }
            }

            return successResponse({ items, count: items.length, hasMore: !!result.LastEvaluatedKey });
        }

        // --------------------------------------------------------------------
        // ACTION: create (カード発注の手動作成)
        // --------------------------------------------------------------------
        // 目的: 管理者が特定のショップへの受託（発注）を直接投入します。
        // セキュリティ: 投入前に validateQRParams を呼び出し、ショップ・商品・オーナーの不整合がないか厳密にチェックします。
        // --------------------------------------------------------------------
        if (action === 'create') {
            const {
                shop_id, quantity, design_id, product_id, shop_user_id,
                sender_user_id, expiration_date, activate_now
            } = body as AdminApiSchema['admin_card_orders_create'];

            // 整合性チェックの実行
            const validationResult: any = await validateQRParams(ddb, TABLE_NAME, BUCKET_NAME, {
                shopId: shop_id,
                productId: product_id,
                owner_id: shop_user_id,
                activateNow: !!activate_now,
                senderId: sender_user_id
            }).catch((err: any) => {
                if (err.statusCode) return err;
                throw err;
            });

            if (validationResult.statusCode) {
                return errorResponse(validationResult.statusCode, validationResult.message, validationResult.detail);
            }

            const order_id = generateId();
            const userId = getUserId(event);

            // 注文データの保存
            // PK: CARD_ORDER#ADMIN<id> (管理者が作成した証跡としての PK)
            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `CARD_ORDER#ADMIN${userId}`,
                    SK: `ORDER#${order_id}`,
                    order_id: order_id,
                    shop_id: shop_id,
                    quantity: Number(quantity),
                    status: 'ORDERED',
                    design_id: design_id,
                    product_id: product_id || null,
                    shop_user_id: shop_user_id || null,
                    sender_user_id: sender_user_id || null,
                    expiration_date: expiration_date || null,
                    activate_now: !!activate_now,
                    ts_created_at: now,
                    ts_updated_at: now,
                    user_id_order: userId,
                    user_id_create: null,
                    // インデックス用フィールド:
                    GSI1_PK: `CARD_ORDER#ORDERED`,
                    GSI1_SK: now,
                    GSI2_PK: `CARD_ORDER#${order_id}`,
                    GSI2_SK: now
                }
            }));

            return successResponse({ message: 'Card order created', order_id });
        }

        // --------------------------------------------------------------------
        // ACTION: update (ステータス更新)
        // --------------------------------------------------------------------
        // 目的: 「発送済(SHIPPED)」や「完了(COMPLETED)」へのステータス遷移。
        // 実装: GSI2 で order_id から PK/SK を逆引きしてから、アトミックな UpdateCommand を実行します。
        // --------------------------------------------------------------------
        if (action === 'update') {
            const { order_id, status, batch_id } = body as AdminApiSchema['admin_card_orders_update'];
            if (!order_id || !status) return errorResponse(400, 'Missing order_id or status');

            // 1. GSI2 を使用して正確な PK, SK を取得
            const lookup = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :pk',
                ExpressionAttributeValues: { ':pk': `CARD_ORDER#${order_id}` }
            }));

            const targetItem = lookup.Items?.[0];
            if (!targetItem) return errorResponse(404, 'Order not found');

            const pk = targetItem.PK;
            const sk = targetItem.SK;

            const updateExpr = ['SET #status = :status, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_updated_at = :now'];
            const exprAttrValues: any = {
                ':status': status,
                ':gsi_pk': `CARD_ORDER#${status}`,
                ':now': now
            };
            const exprAttrNames: any = { '#status': 'status' };

            if (batch_id) {
                updateExpr[0] += ', batch_id = :batch_id';
                exprAttrValues[':batch_id'] = batch_id;
            }

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: sk },
                UpdateExpression: updateExpr[0],
                ExpressionAttributeNames: exprAttrNames,
                ExpressionAttributeValues: exprAttrValues
            }));

            return successResponse({ message: 'Order status updated' });
        }

        // --------------------------------------------------------------------
        // ACTION: get (個別発注詳細の取得)
        // --------------------------------------------------------------------
        // 目的: 特定の注文の詳細、および関連するショップ・オーナー・デザイン情報を一括取得します。
        // 備考: ID 形式の揺れ（古い形式の ID 等）に対応するため複数のプレフィックスでフォールバック検索を行います。
        // --------------------------------------------------------------------
        if (action === 'get') {
            const { order_id } = body as AdminApiSchema['admin_card_orders_get'];
            if (!order_id) return errorResponse(400, 'Missing order_id');

            console.log(`[AdminSearch] Searching for order_id: ${order_id}`);

            // A. 標準プレフィックスでの検索
            let result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :pk',
                ExpressionAttributeValues: { ':pk': `CARD_ORDER#${order_id}` }
            }));

            // B. 互換用: ORDER# プレフィックスでの検索
            if (!result.Items || result.Items.length === 0) {
                console.log(`[AdminSearch] No match found with prefix CARD_ORDER#. Trying fallback ORDER#...`);
                result = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI2',
                    KeyConditionExpression: 'GSI2_PK = :pk',
                    ExpressionAttributeValues: { ':pk': `ORDER#${order_id}` }
                }));
            }

            // C. 互換用: プレフィックスなしでの直接検索
            if (!result.Items || result.Items.length === 0) {
                console.log(`[AdminSearch] No match found with prefix ORDER#. Trying direct UUID lookup...`);
                result = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI2',
                    KeyConditionExpression: 'GSI2_PK = :pk',
                    ExpressionAttributeValues: { ':pk': order_id }
                }));
            }

            const item = result.Items?.[0] as any;
            if (!item) {
                console.warn(`[AdminSearch] Order not found in GSI2 index for ID: ${order_id}`);
                return errorResponse(404, 'Order not found');
            }

            // Enrichment
            if (!item.design_id && item.card_design) {
                item.design_id = item.card_design;
            }

            // ショップ情報の追加取得
            if (item.shop_id) {
                const shopRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `SHOP#${item.shop_id}`, SK: 'METADATA' }
                }));
                if (shopRes.Item) {
                    item.shop_name = shopRes.Item.name;
                    if (shopRes.Item.owner_id) {
                        const ownerRes = await ddb.send(new GetCommand({
                            TableName: TABLE_NAME,
                            Key: { PK: `USER#${shopRes.Item.owner_id}`, SK: 'SHOP' }
                        }));
                        if (ownerRes.Item) {
                            item.shop_owner_email = ownerRes.Item.email;
                        }
                    }
                }
            }

            // デザイン情報の追加取得 + S3 署名
            if (item.design_id) {
                const designRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: 'CARD_DESIGN#METADATA', SK: item.design_id }
                }));
                const meta = designRes.Item || getSystemDesign(item.design_id);
                if (meta) {
                    item.thumbf = meta.thumbf ? await signUrlIfS3(meta.thumbf, BUCKET_NAME) : (meta.bgimgf ? await signUrlIfS3(meta.bgimgf, BUCKET_NAME) : null);
                    item.thumbb = meta.thumbb ? await signUrlIfS3(meta.thumbb, BUCKET_NAME) : (meta.bgimgb ? await signUrlIfS3(meta.bgimgb, BUCKET_NAME) : null);
                }
            }

            return successResponse(item);
        }

        return errorResponse(404, 'Unknown action');

    } catch (error: any) {
        console.error('Admin card orders error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
