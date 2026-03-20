/**
 * 概要: ショップの注文（Order）管理
 * 詳細: ショップオーナー・GM向けに、ユーザーから送信された配送先情報（オーダー）の取得や、発送状況の更新を行います。
 * エンドポイント:
 *  - POST /shop/orders/list (注文一覧取得)
 *  - POST /shop/orders/update (注文・発送ステータス更新)
 * リクエストボディ:
 *  - shop_id: 操作対象のショップID (必須)
 *  [list の場合]
 *  - uuid: 特定のQRコードUUIDに絞り込む場合 (オプション)
 *  [update の場合]
 *  - qr_id: 対象のQR UUID (必須)
 *  - delivery_company: 配送業者名 (オプション)
 *  - tracking_number: 追跡番号 (オプション)
 *  - memo_for_users: ユーザー向けメモ (オプション)
 *  - memo_for_shop: ショップ内メモ (オプション)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { sendLocalizedEmail } from './templates/email';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { signUrlIfS3 } from './utils/s3';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        const authorizer = event.requestContext?.authorizer;
        const userId = authorizer?.principalId;
        const claims = authorizer;
        if (!userId) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        const { shopId } = body;
        
        // Determine action from path or body
        let action = body.action;
        const resPath = event.resource;
        if (resPath.endsWith('/list')) action = 'list';
        else if (resPath.endsWith('/update')) action = 'update';

        if (!shopId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing shopId' }) };
        if (!action || !['list', 'update'].includes(action)) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action. Received: ' + action + ' for ' + resPath }) };
        }

        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };

        if (action === 'list') {
            const { uuid } = body;
            let relevantItems: any[] = [];

            if (uuid) {
                // 【DB操作: Query】
                // - 目的: 指定された単一のQRコードに対する詳細情報(メタデータ+オーダー情報)を取得
                // - テーブル: TABLE_NAME
                // - 検索条件: PK = `QR#${uuid}`
                // - 取得カラム: ALL (SK が 'METADATA' と 'ORDER' の両方のレコードを同時に取得するため)
                const queryRes = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :pk',
                    ExpressionAttributeValues: { ':pk': `QR#${uuid}` }
                }));

                const items = queryRes.Items || [];
                const metadata = items.find(i => i.SK === 'METADATA');
                
                if (!metadata || metadata.shop_id !== shopId) {
                    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ orders: [] }) };
                }

                relevantItems = [metadata];
                const orderDetail = items.find(i => i.SK === 'ORDER') || {};
                
                const orderRes = formatOrderDetails(metadata, orderDetail);
                if (orderRes.card_design) await addDesignThumbnails(orderRes, orderRes.card_design);

                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ orders: [orderRes] }) };
            }

            // 【DB操作: Query】
            // - 目的: ログイン中ショップに紐づくすべてのQRコードメタデータを全件検索
            // - テーブル: TABLE_NAME
            // - インデックス: GSI2
            // - 検索条件: GSI2_PK = `SHOP#${shopId}`
            // - 取得カラム: ALL (ページネーションなしで全結果を取得する)
            const queryRes = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :sid',
                ExpressionAttributeValues: { ':sid': `SHOP#${shopId}` }
            }));

            if (!queryRes.Items || queryRes.Items.length === 0) {
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ orders: [] }) };
            }
            relevantItems = queryRes.Items;

            // 【DB操作: BatchGetItem (チャンク実行)】
            // - 目的: 大量のQRコードメタデータに対応する個別のオーダー詳細項目(SK='ORDER')を一括で高速取得
            // - テーブル: TABLE_NAME
            // - リクエストキー配列: 取得した各QRの { PK: item.PK, SK: 'ORDER' } を 100件ずつチャンク分割して指定
            // - 取得カラム: ALL
            const allOrderDetails: any[] = [];
            for (let i = 0; i < relevantItems.length; i += 100) {
                const chunk = relevantItems.slice(i, i + 100);
                const keys = chunk.map(item => ({ PK: item.PK, SK: 'ORDER' }));
                const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: keys } } }));
                if (batchRes.Responses?.[TABLE_NAME]) allOrderDetails.push(...batchRes.Responses[TABLE_NAME]);
            }

            const orderDetailsMap = new Map();
            allOrderDetails.forEach((item: any) => orderDetailsMap.set(item.PK, item));

            // 【DB操作: BatchGetItem (チャンク実行)】
            // - 目的: 各注文で利用されている独自のカードデザイン設定情報の取得
            // - テーブル: TABLE_NAME
            // - リクエストキー配列: 重複排除したカードデザインIDリストに対し { PK: 'CARD_DESIGN#METADATA', SK: id }
            // - 取得カラム: SK, thumbf, thumbb (プレビュー用サムネイルURLなど一部カラムのみ指定取得)
            const designIds = [...new Set(relevantItems.map((i: any) => i.card_design).filter(Boolean))];
            const designMap = new Map<string, any>();
            if (designIds.length > 0) {
                for (let i = 0; i < designIds.length; i += 100) {
                    const chunk = designIds.slice(i, i + 100);
                    const keys = chunk.map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id as string }));
                    const batchRes = await ddb.send(new BatchGetCommand({
                        RequestItems: { [TABLE_NAME]: { Keys: keys, ProjectionExpression: 'SK, thumbf, thumbb' } }
                    }));
                    if (batchRes.Responses?.[TABLE_NAME]) {
                        for (const design of batchRes.Responses[TABLE_NAME]) {
                            if (design.thumbf) design.thumbf = await signUrlIfS3(design.thumbf, BUCKET_NAME);
                            if (design.thumbb) design.thumbb = await signUrlIfS3(design.thumbb, BUCKET_NAME);
                            designMap.set(design.SK, design);
                        }
                    }
                }
            }

            const orders = relevantItems.map(meta => {
                const orderDetail = orderDetailsMap.get(meta.PK) || {};
                const design = meta.card_design ? designMap.get(meta.card_design) : null;
                const order = formatOrderDetails(meta, orderDetail);
                if (design) {
                    (order as any).thumbf = design.thumbf;
                    (order as any).thumbb = design.thumbb;
                }
                return order;
            });

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ orders }) };
        }

        if (action === 'update') {
            const { qr_id, delivery_company, tracking_number, memo_for_users, memo_for_shop } = body;
            if (!qr_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing qr_id' }) };

            // 【DB操作: GetItem】
            // - 目的: 更新対象のQRメタデータ取得 (自ショップのQRかの権限確認と、現在のステータス判定に使用)
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            // - 取得カラム: ALL (shop_id, status, pin, ts_shipped_at等すべて)
            const metaRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' } }));
            if (!metaRes.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Order not found' }) };
            if (metaRes.Item.shop_id !== shopId) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'QR does not belong to this shop' }) };

            const currentStatus = metaRes.Item.status;
            // 未発送から発送済みへの遷移チェック条件
            const isShippingTransition = (delivery_company || tracking_number) && currentStatus === 'USED';

            const updateExpPartsMeta = [];
            const expAttrValuesMeta: any = {};
            const expAttrNamesMeta: any = {};

            // 発送状態への遷移なら、QRの状態とGSI1キーを書き換え
            if (isShippingTransition) {
                updateExpPartsMeta.push('#status = :s', 'ts_shipped_at = :now', 'GSI1_PK = :gsi_pk');
                expAttrValuesMeta[':s'] = 'SHIPPED';
                expAttrValuesMeta[':now'] = new Date().toISOString();
                expAttrValuesMeta[':gsi_pk'] = 'QR#SHIPPED';
                expAttrNamesMeta['#status'] = 'status';
            }

            if (memo_for_users !== undefined && !['COMPLETED', 'EXPIRED', 'BANNED'].includes(currentStatus)) {
                updateExpPartsMeta.push('memo_for_users = :mu');
                expAttrValuesMeta[':mu'] = memo_for_users;
            }

            if (memo_for_shop !== undefined) {
                updateExpPartsMeta.push('memo_for_shop = :ms');
                expAttrValuesMeta[':ms'] = memo_for_shop;
            }

            if (updateExpPartsMeta.length > 0) {
                updateExpPartsMeta.push('ts_updated_at = :now');
                expAttrValuesMeta[':now'] = expAttrValuesMeta[':now'] || new Date().toISOString();

                // 【DB操作: UpdateItem】
                // - 目的: QRメタデータの部分更新 (ユーザー/ショップ向けメモの追記や、発送完了に伴うステータス・GSIキーの変更等)
                // - テーブル: TABLE_NAME
                // - リクエストキー: { PK: `QR#${qr_id}`, SK: 'METADATA' }
                // - 更新カラム: status, ts_shipped_at, GSI1_PK, memo_for_users, memo_for_shop 等（条件合致したカラムのみ動的に更新）
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                    UpdateExpression: 'SET ' + updateExpPartsMeta.join(', '),
                    ExpressionAttributeValues: expAttrValuesMeta,
                    ExpressionAttributeNames: Object.keys(expAttrNamesMeta).length > 0 ? expAttrNamesMeta : undefined,
                }));
            }

            // ORDERレコードも更新が必要な場合
            if ((tracking_number || delivery_company) && currentStatus === 'USED') {
                const orderRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'ORDER' } }));
                if (orderRes.Item) {
                    const updateExpPartsOrder = [];
                    const expAttrValuesOrder: any = {};

                    if (delivery_company !== undefined) { updateExpPartsOrder.push('delivery_company = :d'); expAttrValuesOrder[':d'] = delivery_company; }
                    if (tracking_number !== undefined) { updateExpPartsOrder.push('tracking_number = :t'); expAttrValuesOrder[':t'] = tracking_number; }

                    updateExpPartsOrder.push('ts_updated_at = :now');
                    expAttrValuesOrder[':now'] = new Date().toISOString();
                    if (isShippingTransition) updateExpPartsOrder.push('ts_shipped_at = :now');

                    // 【DB操作: UpdateItem (条件合致時のみ)】
                    // - 目的: 実際の「オーダー詳細データ」側への配送設定情報（配送業者、追跡番号、発送日時等）の書き込み
                    // - テーブル: TABLE_NAME
                    // - リクエストキー: { PK: `QR#${qr_id}`, SK: 'ORDER' }
                    // - 更新カラム: delivery_company, tracking_number, ts_shipped_at, ts_updated_at 等
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'ORDER' },
                        UpdateExpression: 'SET ' + updateExpPartsOrder.join(', '), ExpressionAttributeValues: expAttrValuesOrder
                    }));
                }
            }

            // 初回配送時のみ、ユーザーへメール通知
            if (isShippingTransition) {
                const orderRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'ORDER' } }));
                const email = orderRes.Item?.email;
                const pin = metaRes.Item?.pin;
                if (email && pin) {
                    try {
                        await sendLocalizedEmail({ type: 'SHIPPING_NOTIFICATION', to: email, params: { uuid: qr_id, pin }, lang: 'ja' });
                    } catch (e) {
                        console.error('Failed to send shipping notification email', e);
                    }
                }
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: isShippingTransition ? 'Order marked as shipped' : 'Order meta updated' }) };
        }

        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };
    } catch (error) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};

function formatOrderDetails(meta: any, orderDetail: any) {
    return {
        id: meta.PK.replace('QR#', ''), qr_id: meta.PK, product_id: meta.product_id, status: meta.status,
        recipient_name: orderDetail.name || '-', address: orderDetail.address || '-',
        postal_code: orderDetail.zipCode || orderDetail.postal_code || '',
        preferred_date: orderDetail.preferredDate || '-', preferred_time: orderDetail.preferredTime || '-',
        shipping_info: orderDetail, memo_for_users: meta.memo_for_users, memo_for_shop: meta.memo_for_shop,
        tracking_number: orderDetail.tracking_number, delivery_company: orderDetail.delivery_company,
        ts_created_at: meta.ts_created_at, ts_updated_at: meta.ts_updated_at, ts_linked_at: meta.ts_linked_at,
        ts_activated_at: meta.ts_activated_at, ts_submitted_at: meta.ts_submitted_at, ts_shipped_at: meta.ts_shipped_at,
        ts_completed_at: meta.ts_completed_at, ts_expired_at: meta.ts_expired_at, ts_banned_at: meta.ts_banned_at,
        card_design: meta.card_design
    };
}

async function addDesignThumbnails(order: any, designId: string) {
    const designRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: 'CARD_DESIGN#METADATA', SK: designId } }));
    if (designRes.Item) {
        order.thumbf = await signUrlIfS3(designRes.Item.thumbf, BUCKET_NAME);
        order.thumbb = await signUrlIfS3(designRes.Item.thumbb, BUCKET_NAME);
    }
}
