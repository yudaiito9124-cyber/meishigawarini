/**
 * @file shop_orders.ts
 * @role ショップ用：注文・配送管理（Order/Shipping）ハンドラー
 * @responsibility
 *  - 被贈答者（受取人）から送信された配送先情報を管理し、ショップによる発送ステータスの更新を制御します。
 *  - 【データ集約（Enrichment）】
 *    「ショップに紐付く QR メタデータ」「受取人が入力した配送先詳細」「カードのデザインアセット」という
 *    DynamoDB 上で分散している情報を効率的に結合し、管理画面に必要なリッチな情報を提供します。
 *  - 【発送ワークフロー】
 *    - `USED`（受取入力済）から `SHIPPED`（発送済）への遷移を管理。
 *    - 追跡番号の登録と同時に、配送業者情報の保存および受取人への「発送完了メール」の自動送信（SES/Templates 連携）を行います。
 * @context
 *  - ギフトが実際に「モノ」として受取人に届くまでの物流フェーズを支えるバックエンド処理です。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand, BatchGetCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { sendLocalizedEmail } from './templates/email';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { signUrlIfS3 } from './utils/s3';
import { checkAndExpire } from './utils/expiration';
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

        // 互換性: 旧パスベースのルーティングに対応
        const resPath = event.resource;
        if (resPath.endsWith('/list')) action = 'list';
        else if (resPath.endsWith('/update')) action = 'update';

        if (!shopId) return errorResponse(400, 'Missing shopId');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // 権限検証: ショップ管理者（オーナー/GM）であることを確認
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // --------------------------------------------------------------------
        // ACTION: list (注文一覧の取得と情報の結合)
        // 目的: ショップに紐付く全ての「動き（注文）」をリッチな形式で一覧化。
        // --------------------------------------------------------------------
        if (action === 'list') {
            const { qr_id: body_qr_id } = body as ShopApiSchema['shop_orders_list'];
            let metaItems: any[] = [];

            // ケースA: 特定の QR コード 1 件を詳細取得する場合
            if (body_qr_id) {
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
                
                // デザインアセットの署名付き URL を即時生成
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

            // ケースB: ショップ全件の一覧を取得する場合（バルク結合処理）
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME, IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :sid', ExpressionAttributeValues: { ':sid': `SHOP#${shopId}` }
            }));
            const rawItems = res.Items || [];
            if (rawItems.length === 0) return successResponse({ orders: [] });

            // 【Enrichment 1: 配送先情報 (SK=ORDER) の一括取得】
            const orderDetailsMap = new Map();
            for (let i = 0; i < rawItems.length; i += 100) {
                const keys = rawItems.slice(i, i + 100).map(item => ({ PK: item.PK, SK: 'ORDER' }));
                const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: keys } } }));
                batchRes.Responses?.[TABLE_NAME]?.forEach(o => orderDetailsMap.set(o.PK, o));
            }

            // 互換性処理: カードデザイン ID の正規化
            rawItems.forEach((item: any) => {
                if (!item.design_id && item.card_design) {
                    item.design_id = item.card_design;
                }
            });

            // 【Enrichment 2: デザインメタデータの一括取得と URL 署名】
            const designMap = new Map<string, any>();
            const designIds = [...new Set(rawItems.map(i => i.design_id).filter(Boolean))];
            if (designIds.length > 0) {
                for (let i = 0; i < designIds.length; i += 100) {
                    const keys = designIds.slice(i, i + 100).map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
                    const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: keys, ProjectionExpression: 'SK, thumbf, thumbb, width, height' } } }));
                    for (const d of (batchRes.Responses?.[TABLE_NAME] || [])) {
                        // ブラウザ表示用に S3 上のプライベートパスを署名付き URL へ置換
                        if (d.thumbf) d.thumbf = await signUrlIfS3(d.thumbf, BUCKET_NAME);
                        if (d.thumbb) d.thumbb = await signUrlIfS3(d.thumbb, BUCKET_NAME);
                        designMap.set(d.SK, d);
                    }
                }
            }

            const orders = await Promise.all(rawItems.map(async (meta) => {
                const qrid = meta.PK.replace('QR#', '');
                // リスト表示の際も期限切れをリアルタイム判定（Lazy Evaluation）
                const updatedStatus = await checkAndExpire(ddb, TABLE_NAME, qrid, meta as any);
                const orderDetail = orderDetailsMap.get(meta.PK) || {};
                const design = meta.design_id ? (designMap.get(meta.design_id) || getSystemDesign(meta.design_id)) : null;
                
                const order = formatOrderDetails(meta, orderDetail);
                order.status = updatedStatus; 
                if (design) {
                    order.thumbf = design.thumbf;
                    order.thumbb = design.thumbb;
                    order.width = design.width;
                    order.height = design.height;
                }
                return order;
            }));

            return successResponse({ orders });
        }

        // --------------------------------------------------------------------
        // ACTION: update (発送処理・ステータス更新)
        // 目的: 配送業者情報の登録、および受取人へのシステム通知の発火。
        // --------------------------------------------------------------------
        if (action === 'update') {
            const { delivery_company, tracking_number, memo_for_users, memo_for_shop } = body as ShopApiSchema['shop_orders_update'];
            const qr_id = getQrId(event, body);
            
            if (!qr_id || !qr_id) return errorResponse(400, 'Missing qr_id');

            const metaRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' } }));
            if (!metaRes.Item || metaRes.Item.shop_id !== shopId) return errorResponse(403, 'Forbidden');
            
            const currentStatus = metaRes.Item.status;
            const now = new Date().toISOString();
            
            // 重要: 「受取情報入力済 (USED)」から「発送済 (SHIPPED)」への移行判定
            const isShippingTransition = (delivery_company || tracking_number) && currentStatus === 'USED';

            // 1. METADATA レコードの更新（ステータス、管理者用メモなど）
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

            const metaUpdateParams: any = {
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET ' + metaUpdateExpr.join(', '),
                ExpressionAttributeValues: metaAttrValues
            };
            if (isShippingTransition) {
                metaUpdateParams.ExpressionAttributeNames = { '#status': 'status' };
            }
            await ddb.send(new UpdateCommand(metaUpdateParams));

            // 2. ORDER レコードの更新（実配送データの紐付け）
            if ((delivery_company || tracking_number) && currentStatus === 'USED') {
                const orderRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'ORDER' } }));

                if (orderRes.Item) {
                    const orderUpdateExpr: string[] = ['ts_updated_at = :now'];
                    const orderAttrValues: any = { ':now': now };
                    if (delivery_company !== undefined) { orderUpdateExpr.push('delivery_company = :d'); orderAttrValues[':d'] = delivery_company; }
                    if (tracking_number !== undefined) { orderUpdateExpr.push('tracking_number = :t'); orderAttrValues[':t'] = tracking_number; }
                    if (isShippingTransition) orderUpdateExpr.push('ts_shipped_at = :now');

                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'ORDER' },
                        UpdateExpression: 'SET ' + orderUpdateExpr.join(', '), ExpressionAttributeValues: orderAttrValues
                    }));

                    // 重要: 発送完了メール通知（受取人にギフトが発送されたことを知らせる）
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
 * DynamoDB の生データ（METADATA + ORDER）を、フロントエンド向けに正規化するユーティリティ。
 * 各種タイムスタンプや配送先項目名をマッピングします。
 */
function formatOrderDetails(meta: any, order: any): any {
    return {
        qr_id: meta.PK.replace('QR#', ''), product_id: meta.product_id, status: meta.status,
        recipient_name: order.name || order.recipient_name || '-', address: order.address || '-',
        postal_code: order.zipCode || order.zip_code || order.postal_code || '',
        preferred_date: order.preferredDate || order.preferred_date || '-', 
        preferred_time: order.preferredTime || order.preferred_time || '-',
        shipping_info: order, memo_for_users: meta.memo_for_users, memo_for_shop: meta.memo_for_shop,
        tracking_number: order.tracking_number, delivery_company: order.delivery_company,
        ts_created_at: meta.ts_created_at, ts_updated_at: meta.ts_updated_at, ts_linked_at: meta.ts_linked_at,
        ts_shipped_at: meta.ts_shipped_at, ts_activated_at: meta.ts_activated_at,
        ts_submitted_at: meta.ts_submitted_at, ts_completed_at: meta.ts_completed_at,
        ts_expired_at: meta.ts_expired_at, ts_banned_at: meta.ts_banned_at,
        design_id: meta.design_id || meta.card_design
    };
}
