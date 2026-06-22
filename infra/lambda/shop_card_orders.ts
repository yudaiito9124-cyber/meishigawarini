/**
 * @file shop_card_orders.ts
 * @role ショップ用：物理カード発注（CARD_ORDER）管理ハンドラー
 * @responsibility
 *  - ショップオーナーまたは GM が、ギフト印字用の物理カードをシステム管理者に発注する機能を管理します。
 *  - 【ライフサイクル管理】以下の状態遷移を管理します。
 *    - `create`: `ORDERED`（注文済）状態のレコードを生成。注文内容はインデックス（GSI1）経由で管理者に通知されます。
 *    - `list`: ショップの発注履歴を一覧表示。デザイン情報のサムネイルを動的に結合（Enrichment）します。
 *    - `cancel`: 制作開始（管理者による `PRINTING` 化）前であればキャンセル可能。
 *    - `complete`: 管理者が発送（`SHIPPED`）した注文に対し、受取完了を宣言。
 *  - 【権限モデル】`checkShopOwnerOrGM` により、対象ショップのオーナーまたは GM ロールを持つユーザーのみに操作を限定します。
 * @context
 *  - ショップが在庫を補充したり、特定のデザイン・商品が紐付いたカードを新規作成する際の入り口となるプロセスです。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { generateId } from './utils/id';
import { successResponse, errorResponse, apiResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getShopId, getAction, getUserId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';
import { validateQRParams } from './utils/qr-validation';
import { signUrlIfS3 } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { sendLocalizedEmail } from './templates/email';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const shopId = getShopId(event, body);
        const action = getAction(event, body);

        if (!userId) return errorResponse(401, 'Unauthorized');
        if (!shopId) return errorResponse(400, 'Missing shopId');

        const now = new Date().toISOString();

        // --------------------------------------------------------------------
        // 権限検証: 操作者がショップの正当な管理者（オーナー/GM）かチェック
        // --------------------------------------------------------------------
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // --------------------------------------------------------------------
        // ACTION: create (新規カード発注の作成)
        // 目的: 管理者（システム側）への印刷依頼レコードを生成します。
        // --------------------------------------------------------------------
        if (action === 'create') {
            const { quantity, design_id, product_id, shop_user_id, sender_user_id, expiration_date, activate_now } = body as ShopApiSchema['shop_card_orders_create'];

            if (!quantity || !design_id) {
                return errorResponse(400, 'Missing quantity or design_id');
            }

            // 指定された商品やデザインが有効か、生成ツール（qr-validation）で事前評価
            const validationResult: any = await validateQRParams(ddb, TABLE_NAME, BUCKET_NAME, {
                shopId,
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

            const orderId = generateId();
            let finalExpirationDate = expiration_date || null;

            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `CARD_ORDER#SHOP${shopId}`,
                    SK: `ORDER#${orderId}`,
                    order_id: orderId,
                    shop_id: shopId,
                    quantity: Number(quantity),
                    status: 'ORDERED',
                    design_id,
                    product_id: product_id || null,
                    shop_user_id: shop_user_id || userId,
                    sender_user_id: sender_user_id || null,
                    expiration_date: finalExpirationDate,
                    activate_now: !!activate_now,
                    ts_created_at: now,
                    ts_updated_at: now,
                    user_id_order: userId, // 自端末の操作者 ID
                    user_id_create: null,
                    // 【GSI1】管理者の「未処理一覧」に表示させるためのフラグ
                    GSI1_PK: `CARD_ORDER#ORDERED`,
                    GSI1_SK: now,
                    // 【GSI2】バッチ生成時などに ID から直接引けるように逆引き用インデックス
                    GSI2_PK: `CARD_ORDER#${orderId}`,
                    GSI2_SK: now
                }
            }));

            // --------------------------------------------------------------------
            // データベース参照: システム設定 (SYSTEM#SETTINGS, METADATA) の取得
            // 目的: 新規発注発生時に通知するべき管理者メーリングリストを取得します。
            // --------------------------------------------------------------------
            try {
                const sysRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: 'SYSTEM#SETTINGS', SK: 'METADATA' }
                }));
                const adminEmails = sysRes.Item?.admin_order_mailing_list;
                if (adminEmails && Array.isArray(adminEmails) && adminEmails.length > 0) {
                    // 管理者向け通知メールは一旦日本語（ja）で送信します
                    await sendLocalizedEmail({
                        type: 'ADMIN_CARD_ORDER_NOTIFICATION',
                        to: adminEmails,
                        params: {
                            orderId,
                            shopId,
                            quantity: String(quantity),
                            designId: design_id,
                            shopName: shopMetadata.name || 'Unknown Shop'
                        },
                        lang: 'ja'
                    });
                }
            } catch (emailErr) {
                console.error('Failed to send admin order notification:', emailErr);
            }

            return apiResponse(201, { message: 'Card order created', order_id: orderId });
        }

        // --------------------------------------------------------------------
        // ACTION: list (発注履歴の一覧取得)
        // 目的: 過去の全発注履歴を取得し、デザイン情報を結合して返却します。
        // --------------------------------------------------------------------
        if (action === 'list') {
            const result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: {
                    ':pk': `CARD_ORDER#SHOP${shopId}`,
                    ':sk': 'ORDER#'
                },
                ScanIndexForward: false // 最新順
            }));

            const items = result.Items || [];
            
            // 互換性処理
            items.forEach((item: any) => {
                if (!item.design_id && item.card_design) {
                    item.design_id = item.card_design;
                }
            });

            // 【Enrichment】デザイン情報のサムネイルを結合
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
                    // S3 のパスであれば一時的な署名付き URL に変換
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

            return successResponse({ items });
        }

        // --------------------------------------------------------------------
        // ACTION: cancel (発注キャンセル)
        // 目的: 印刷作業に入る前の「ORDERED」状態に限り、発注の取り消しを許可します。
        // --------------------------------------------------------------------
        if (action === 'cancel') {
            const { order_id } = body as ShopApiSchema['shop_card_orders_cancel'];
            if (!order_id) return errorResponse(400, 'Missing order_id');

            const currentOrder = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `CARD_ORDER#SHOP${shopId}`, SK: `ORDER#${order_id}` }
            }));

            if (!currentOrder.Item) return errorResponse(404, 'Order not found');
            if (currentOrder.Item.status !== 'ORDERED') {
                return errorResponse(400, 'Cannot cancel order in current status: ' + currentOrder.Item.status);
            }

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `CARD_ORDER#SHOP${shopId}`, SK: `ORDER#${order_id}` },
                UpdateExpression: 'SET #status = :status, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_updated_at = :now',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':status': 'CANCELLED',
                    ':gsi_pk': 'CARD_ORDER#CANCELLED',
                    ':now': now
                }
            }));

            return successResponse({ message: 'Order cancelled' });
        }

        // --------------------------------------------------------------------
        // ACTION: complete (受取完了宣言)
        // 目的: 物理カードの納品（発送済 SHIPPED）を確認し、ステータスを最終状態（COMPLETED）にします。
        // --------------------------------------------------------------------
        if (action === 'complete') {
            const { order_id } = body as ShopApiSchema['shop_card_orders_complete'];
            if (!order_id) return errorResponse(400, 'Missing order_id');

            const currentOrder = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `CARD_ORDER#SHOP${shopId}`, SK: `ORDER#${order_id}` }
            }));

            if (!currentOrder.Item) return errorResponse(404, 'Order not found');
            if (currentOrder.Item.status !== 'SHIPPED') {
                return errorResponse(400, 'Order must be SHIPPED to complete');
            }

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `CARD_ORDER#SHOP${shopId}`, SK: `ORDER#${order_id}` },
                UpdateExpression: 'SET #status = :status, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_updated_at = :now',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':status': 'COMPLETED',
                    ':gsi_pk': 'CARD_ORDER#COMPLETED',
                    ':now': now
                }
            }));

            return successResponse({ message: 'Order marked as completed' });
        }

        return errorResponse(404, 'Unknown action');

    } catch (error: any) {
        console.error('Shop card orders error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
