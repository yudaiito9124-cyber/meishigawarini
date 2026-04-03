/**
 * 概要: ショップの注文（Order）管理 (ショップ用)
 * 詳細: 
 *  - 被贈答者から送信された配送先情報（オーダー）の取得や、発送状況（発送業者・追跡番号）の更新を管理。
 *  - 一覧取得時には、各注文に関連する商品、デザイン、および注文詳細情報を複数のBatchGetにより高効率に紐付け(Enrichment)します。
 *  - 発送時には、被贈答者への発送完了メール通知を自動で行います。
 *
 * エンドポイント: POST /shop/orders
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand, BatchGetCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { sendLocalizedEmail } from './templates/email';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { signUrlIfS3 } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getQrId, getShopId, getAction, getUserId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const shopId = getShopId(event, body);
        let action = getAction(event, body);

        // パスベースのルーティング互換性
        const resPath = event.resource;
        if (resPath.endsWith('/list')) action = 'list';
        else if (resPath.endsWith('/update')) action = 'update';

        if (!shopId) return errorResponse(400, 'Missing shopId');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // 【DB操作: 内部モジュールによる GetItem・BatchGetItem】
        // 理由: 権限検証とともに、ショップメタデータを取得。
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // ====================================================================
        // ACTION: list (ショップ注文一覧の取得)
        // ====================================================================
        if (action === 'list') {
            const { qr_id: body_qr_id } = body as ShopApiSchema['shop_orders_list'];
            let metaItems: any[] = [];

            if (body_qr_id) {
                // 【DB操作: Query】
                // 理由: 指定された単一QRの情報を取得。
                const res = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `QR#${body_qr_id}` }
                }));
                const items = res.Items || [];
                const metadata = items.find(i => i.SK === 'METADATA');
                if (!metadata || metadata.shop_id !== shopId) return successResponse({ orders: [] });

                metaItems = [metadata];
                const orderDetail = items.find(i => i.SK === 'ORDER') || {};
                const designId = metadata.design_id || metadata.card_design;
                const order = formatOrderDetails(metadata, orderDetail);
                // 単体取得時はデザイン情報を即時アタッチ
                if (designId) {
                    const designRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: 'CARD_DESIGN#METADATA', SK: designId } }));
                    const design = designRes.Item || getSystemDesign(designId);
                    if (design) {
                        order.thumbf = design.thumbf?.startsWith('/') ? design.thumbf : await signUrlIfS3(design.thumbf, BUCKET_NAME);
                        order.thumbb = design.thumbb?.startsWith('/') ? design.thumbb : await signUrlIfS3(design.thumbb, BUCKET_NAME);
                        order.width = design.width;
                        order.height = design.height;
                    }
                }
                return successResponse({ orders: [order] });
            }

            // 【DB操作: Query】
            // 理由: インデックス(GSI2_PK=SHOP#{id})を利用して、ショップに紐づく全QRメタデータを取得。
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME, IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :sid', ExpressionAttributeValues: { ':sid': `SHOP#${shopId}` }
            }));
            const rawItems = res.Items || [];
            if (rawItems.length === 0) return successResponse({ orders: [] });

            // Enrichment 1: 注文詳細(SK=ORDER)の一括取得
            const orderDetailsMap = new Map();
            for (let i = 0; i < rawItems.length; i += 100) {
                const keys = rawItems.slice(i, i + 100).map(item => ({ PK: item.PK, SK: 'ORDER' }));
                const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: keys } } }));
                batchRes.Responses?.[TABLE_NAME]?.forEach(o => orderDetailsMap.set(o.PK, o));
            }

            // design_id を正規化
            rawItems.forEach((item: any) => {
                if (!item.design_id && item.card_design) {
                    item.design_id = item.card_design;
                }
            });

            // Enrichment 2: カードデザイン情報(PK=CARD_DESIGN#METADATA, SK=id)の一括取得
            const designMap = new Map<string, any>();
            const designIds = [...new Set(rawItems.map(i => i.design_id).filter(Boolean))];
            if (designIds.length > 0) {
                for (let i = 0; i < designIds.length; i += 100) {
                    const keys = designIds.slice(i, i + 100).map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
                    const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: keys, ProjectionExpression: 'SK, thumbf, thumbb, width, height' } } }));
                    for (const d of (batchRes.Responses?.[TABLE_NAME] || [])) {
                        if (d.thumbf) d.thumbf = await signUrlIfS3(d.thumbf, BUCKET_NAME);
                        if (d.thumbb) d.thumbb = await signUrlIfS3(d.thumbb, BUCKET_NAME);
                        designMap.set(d.SK, d);
                    }
                }
            }

            const orders = rawItems.map(meta => {
                const orderDetail = orderDetailsMap.get(meta.PK) || {};
                const design = meta.design_id ? (designMap.get(meta.design_id) || getSystemDesign(meta.design_id)) : null;
                const order = formatOrderDetails(meta, orderDetail);
                if (design) {
                    order.thumbf = design.thumbf;
                    order.thumbb = design.thumbb;
                    order.width = design.width;
                    order.height = design.height;
                }
                return order;
            });

            return successResponse({ orders });
        }

        // ====================================================================
        // ACTION: update (発送情報・各種メモの更新)
        // ====================================================================
        if (action === 'update') {
            const { qr_id: body_qr_id, delivery_company, tracking_number, memo_for_users, memo_for_shop } = body as ShopApiSchema['shop_orders_update'];
            const qr_id = getQrId(event, body);
            
            if (!qr_id) return errorResponse(400, 'Missing qr_id');

            // 更新対象の状態確認
            const metaRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' } }));
            if (!metaRes.Item || metaRes.Item.shop_id !== shopId) return errorResponse(403, 'Forbidden');
            
            const currentStatus = metaRes.Item.status;
            const now = new Date().toISOString();
            const isShippingTransition = (delivery_company || tracking_number) && currentStatus === 'USED';

            // 1. メタデータの更新(ステータス、メモ)
            const metaUpdateExpr: string[] = ['ts_updated_at = :now'];
            const metaAttrValues: any = { ':now': now };
            if (isShippingTransition) {
                metaUpdateExpr.push('#status = :s, ts_shipped_at = :now, GSI1_PK = :gsi_pk, GSI1_SK = :now');
                metaAttrValues[':s'] = 'SHIPPED'; metaAttrValues[':gsi_pk'] = 'QR#SHIPPED';
            }
            if (memo_for_users !== undefined && !['COMPLETED', 'EXPIRED', 'BANNED'].includes(currentStatus)) {
                metaUpdateExpr.push('memo_for_users = :mu'); metaAttrValues[':mu'] = memo_for_users;
            }
            if (memo_for_shop !== undefined) {
                metaUpdateExpr.push('memo_for_shop = :ms'); metaAttrValues[':ms'] = memo_for_shop;
            }

            // 【DB操作: UpdateItem (METADATA)】
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET ' + metaUpdateExpr.join(', '),
                ExpressionAttributeValues: metaAttrValues, ExpressionAttributeNames: { '#status': 'status' }
            }));

            // 2. オーダー詳細の更新(発送業者、追跡番号) - ORDERレコードが存在する場合のみ (元の動作と一致)
            if ((delivery_company || tracking_number) && currentStatus === 'USED') {
                const orderRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'ORDER' } }));

                if (orderRes.Item) {
                    const orderUpdateExpr: string[] = ['ts_updated_at = :now'];
                    const orderAttrValues: any = { ':now': now };
                    if (delivery_company !== undefined) { orderUpdateExpr.push('delivery_company = :d'); orderAttrValues[':d'] = delivery_company; }
                    if (tracking_number !== undefined) { orderUpdateExpr.push('tracking_number = :t'); orderAttrValues[':t'] = tracking_number; }
                    if (isShippingTransition) orderUpdateExpr.push('ts_shipped_at = :now');

                    // 【DB操作: UpdateItem (ORDER)】
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'ORDER' },
                        UpdateExpression: 'SET ' + orderUpdateExpr.join(', '), ExpressionAttributeValues: orderAttrValues
                    }));

                    // 発送完了メール通知 (USED -> SHIPPED 遷移時のみ)
                    if (isShippingTransition) {
                        const email = orderRes.Item?.email;
                        if (email && metaRes.Item.pin) {
                            try {
                                await sendLocalizedEmail({ type: 'SHIPPING_NOTIFICATION', to: email, params: { qr_id: qr_id, pin: metaRes.Item.pin }, lang: 'ja' });
                            } catch (e) {
                                console.error('Failed to send shipping notification email', e);
                            }
                        }
                    }
                }
            }


            return successResponse({ message: 'Order updated' });
        }

        return errorResponse(400, 'Unknown action');
    } catch (error: any) {
        console.error('Shop orders error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};

/**
 * 内部フォーマットへの変換ユーティリティ
 */
function formatOrderDetails(meta: any, order: any): any {
    return {
        qr_id: meta.PK.replace('QR#', ''), product_id: meta.product_id, status: meta.status,
        recipient_name: order.name || '-', address: order.address || '-',
        postal_code: order.zipCode || order.postal_code || '',
        preferred_date: order.preferredDate || '-', preferred_time: order.preferredTime || '-',
        shipping_info: order, memo_for_users: meta.memo_for_users, memo_for_shop: meta.memo_for_shop,
        tracking_number: order.tracking_number, delivery_company: order.delivery_company,
        ts_created_at: meta.ts_created_at, ts_updated_at: meta.ts_updated_at, ts_linked_at: meta.ts_linked_at,
        ts_shipped_at: meta.ts_shipped_at, ts_activated_at: meta.ts_activated_at,
        ts_submitted_at: meta.ts_submitted_at, ts_completed_at: meta.ts_completed_at,
        ts_expired_at: meta.ts_expired_at, ts_banned_at: meta.ts_banned_at,
        design_id: meta.design_id || meta.card_design
    };
}
