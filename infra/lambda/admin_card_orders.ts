/**
 * 概要: カード発注の管理（管理者用）
 * 詳細: 
 *  - 全てのショップからのカード発注一覧をステータス別（GSI1使用）に取得し、ショップ名やオーナー情報をマージして返却します。
 *  - 発注ステータスの更新（ORDERED -> SHIPPED 等）をアトミックに実行します。
 *
 * エンドポイント: POST /admin/card_orders
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

        // ====================================================================
        // ACTION: list (発注一覧の取得)
        // --------------------------------------------------------------------
        // 目的: 管理者向けに特定ステータスの注文を全件取得し、詳細情報をマージします。
        // ====================================================================
        if (action === 'list') {
            const { status = 'ORDERED', limit = 50 } = body as AdminApiSchema['admin_card_orders_list'];

            // ステータスに応じたGSI1検索 (最新順)
            // GSI1_PK: CARD_ORDER#<STATUS> をパーティションキーとして、最新順(ScanIndexForward: false)に取得
            const result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1_PK = :pk',
                ExpressionAttributeValues: { ':pk': `CARD_ORDER#${status}` },
                ScanIndexForward: false,
                Limit: limit
            }));


            const items = result.Items || [];

            // 互換性処理: design_id がない場合は card_design を使用
            items.forEach((item: any) => {
                if (!item.design_id && item.card_design) {
                    item.design_id = item.card_design;
                }
            });

            if (items.length > 0) {
                const shopIds = [...new Set(items.map((i: any) => i.shop_id).filter(Boolean))];
                if (shopIds.length > 0) {
                    // ショップメタデータの一括取得
                    // SHOP#<shop_id> をPK、METADATAをSKとするレコードを、BatchGetCommandで一括取得してマージします
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

                    // データをマージ
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

                // --- 新規追加: デザイン情報のEnrichment (thumbnails) ---
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
                        // 署名付きURLの生成 (S3パスの場合)
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

        // ====================================================================
        // ACTION: create (カード発注の新規作成)
        // --------------------------------------------------------------------
        // 目的: 管理者が特定のショップへの受託（発注）を手動で作成します。
        // ====================================================================
        if (action === 'create') {
            const {
                shop_id, quantity, design_id, product_id, shop_user_id,
                sender_user_id, expiration_date, activate_now
            } = body as AdminApiSchema['admin_card_orders_create'];

            // if (!shop_id || !quantity || !design_id) {
            //     return errorResponse(400, 'Missing shop_id, quantity, or design_id');
            // }

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

            // CARD_ORDERの新規作成
            // PK: CARD_ORDER#ADMIN<admin_id>, SK: ORDER#<order_id> 
            // 管理対象として検索しやすくするため、GSI1(ステータス別)とGSI2(Order ID検索用)のインデックス情報も付与します。
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
                    user_id_order: userId, // 作成した管理者のID
                    user_id_create: null,
                    // 管理用インデックス情報:
                    // GSI1: ステータス別の全件リスト表示用
                    GSI1_PK: `CARD_ORDER#ORDERED`,
                    GSI1_SK: now,
                    // GSI2: Order ID (UUID) からの直接検索用
                    GSI2_PK: `CARD_ORDER#${order_id}`,
                    GSI2_SK: now
                }
            }));


            return successResponse({ message: 'Card order created', order_id });
        }

        // ====================================================================
        // ACTION: update (ステータス更新)
        // --------------------------------------------------------------------
        // 目的: 管理者が発注のステータス（SHIPPED, COMPLETED 等）を更新します。
        // ====================================================================
        if (action === 'update') {
            const { order_id, status, batch_id } = body as AdminApiSchema['admin_card_orders_update'];
            if (!order_id || !status) return errorResponse(400, 'Missing order_id or status');

            // 1. GSI2 を使用して正確な PK, SK を取得する (SHOP# か ADMIN# かを特定)
            // Order ID (UUID) は SK に含まれているため、直接アトミックに更新するには PK/SK のペアを知る必要があります。
            // そのため、まず GSI2 (GSI2_PK = CARD_ORDER#<order_id>) で対象レコードを特定します。
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

        // ====================================================================
        // ACTION: get (特定の発注情報の取得)
        // --------------------------------------------------------------------
        // 目的: order_id から特定の発注情報を取得し、デザイン情報やショップ情報をマージします。
        // ====================================================================
        if (action === 'get') {
            const { order_id } = body as AdminApiSchema['admin_card_orders_get'];
            if (!order_id) return errorResponse(400, 'Missing order_id');

            // GSI2 を使用して検索
            // Order ID (UUID) から直接レコードを特定するために、インデックス GSI2 を利用します。
            // ログに検索対象のIDを出力して CloudWatch でデバッグ可能にします。
            console.log(`[AdminSearch] Searching for order_id: ${order_id}`);

            let result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :pk',
                ExpressionAttributeValues: { ':pk': `CARD_ORDER#${order_id}` }
            }));

            // フォールバック: CARD_ORDER# なしのプレフィックス（古いデータ、または別の格納形式）を念のため試行
            if (!result.Items || result.Items.length === 0) {
                console.log(`[AdminSearch] No match found with prefix CARD_ORDER#. Trying fallback ORDER#...`);
                result = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI2',
                    KeyConditionExpression: 'GSI2_PK = :pk',
                    ExpressionAttributeValues: { ':pk': `ORDER#${order_id}` }
                }));
            }

            // フォールバック2: プレフィックスなし
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

            console.log(`[AdminSearch] Order found! PK: ${item.PK}, SK: ${item.SK}, Status: ${item.status}`);


            // Enrichment: 互換性処理
            if (!item.design_id && item.card_design) {
                item.design_id = item.card_design;
            }

            // Enrichment: ショップ情報
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

            // Enrichment: デザイン情報
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
