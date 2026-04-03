/**
 * 概要: QRコード情報の取得・リンク・アクティベート (ショップ用)
 * 詳細: 
 *  - 特定のショップに紐づくQRコードの一覧取得(list)、商品への紐付け（link）、および有効化（activate）を管理します。
 *  - 状態チェック(check)機能により、スキャンされたQRコードが現在そのショップで利用可能か判定します。
 *  - 有効期限の遅延評価（checkAndExpire）により、データの整合性を保ちます。
 *
 * エンドポイント: POST /shop/qr
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM, checkUserShopPermission } from './share/shop-auth';
import { checkAndExpire } from './utils/expiration';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getQrId, getProductId, getShopId, getAction, getUserId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';

const DEFAULT_VALID_DAYS = parseInt(process.env.DEFAULT_VALID_DAYS || '180');

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
        else if (resPath.endsWith('/link')) action = 'link';
        else if (resPath.endsWith('/activate')) action = 'activate';
        else if (resPath.includes('/qrcodecheck')) action = 'check';

        if (!shopId) return errorResponse(400, 'Missing shopId');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // 権限チェック
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // ====================================================================
        // ACTION: check (QRコードの状態チェック)
        // --------------------------------------------------------------------
        // 目的: 指定されたQRコードが自ショップで利用可能（未割当またはリンク済）かを確認します。
        // ====================================================================
        if (action === 'check') {
            const { qr_id: body_qr_id } = body as ShopApiSchema['shop_qrcodecheck'];
            const qr_id = getQrId(event, body);
            if (!qr_id) return errorResponse(400, 'Missing qr_id');

            const qrRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            }));
            if (!qrRes.Item) return errorResponse(404, 'QR not found');

            const qrItem = qrRes.Item;
            
            // 期限切れの自動判定とステータス更新
            const currentStatus = await checkAndExpire(ddb, TABLE_NAME, qr_id, qrItem as any);
            if (currentStatus === 'EXPIRED') return errorResponse(410, 'QR Code has expired');

            // 帰属ショップの確認
            if (qrItem.shop_id && qrItem.shop_id !== shopId) {
                return errorResponse(403, 'QR does not belong to this shop');
            }

            // 状態のバリデーション (UNASSIGNED または LINKED のみ許可)
            if (currentStatus !== 'UNASSIGNED' && currentStatus !== 'LINKED') {
                return errorResponse(409, `QR is in invalid state: ${currentStatus}`);
            }

            let productName = '';
            let productLinked = false;

            if (qrItem.product_id) {
                const productRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${qrItem.product_id}` }
                }));
                if (productRes.Item) {
                    if (productRes.Item.status === 'STOPPED') return errorResponse(400, 'Product is stopped');
                    productName = productRes.Item.name;
                    productLinked = true;
                }
            }
            return successResponse({ product_id: qrItem.product_id, product_name: productName, product_linked: productLinked, status: currentStatus });
        }

        // ====================================================================
        // ACTION: list (ショップQR一覧の取得)
        // --------------------------------------------------------------------
        // 目的: ショップに関連付けられた（GSI2_PK = SHOP#{id}）QRコードを一覧表示します。
        // ====================================================================
        if (action === 'list') {
            const { shop_id } = body as ShopApiSchema['shop_qr_list'];
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME, IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :sid', ExpressionAttributeValues: { ':sid': `SHOP#${shopId}` }
            }));

            const rawItems = res.Items || [];
            
            // 期限切れの遅延評価を行いながらデータを整形
            const items = await Promise.all(rawItems.map(async (item) => {
                const qrid = item.PK.replace('QR#', '');
                const status = await checkAndExpire(ddb, TABLE_NAME, qrid, item as any);
                return {
                    qr_id: qrid,
                    status: status,
                    product_id: item.product_id,
                    design_id: item.design_id || item.card_design || item.card_design_id,
                    ts_created_at: item.ts_created_at,
                    ts_activated_at: item.ts_activated_at,
                    ts_expired_at: item.ts_expired_at
                };
            }));

            return successResponse({ items });
        }

        // ====================================================================
        // ACTION: link (商品への紐付け)
        // --------------------------------------------------------------------
        // 目的: 未割当のQRコードを特定の商品に紐付けます。activate_now=trueで即時有効化。
        // ====================================================================
        if (action === 'link') {
            const { qr_id: body_qr_id, product_id: body_product_id, memo_for_users, memo_for_shop, activate_now } = body as ShopApiSchema['shop_qr_link'];
            const qr_id = getQrId(event, body);
            const product_id = getProductId(event, body);
            
            if (!qr_id || !product_id) return errorResponse(400, 'Missing qr_id or product_id');

            const [qrCheck, prodCheck] = await Promise.all([
                ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' } })),
                ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${product_id}` } }))
            ]);
            
            if (!qrCheck.Item) return errorResponse(404, 'QR not found');
            if (!prodCheck.Item) return errorResponse(404, 'Product not found');
            
            const qrItem = qrCheck.Item;
            const product = prodCheck.Item;

            // バリデーション
            if (qrItem.status !== "UNASSIGNED" && qrItem.status !== "LINKED") return errorResponse(409, 'QR state is not unassigned or linked');
            if (qrItem.owner_id && !await checkUserShopPermission(ddb, TABLE_NAME, shopId, qrItem.owner_id)) return errorResponse(403, 'Permission denied for this reserved QR');
            if (qrItem.shop_id && qrItem.shop_id !== shopId) return errorResponse(403, 'QR belongs to another shop');
            if (qrItem.product_id && qrItem.product_id !== product_id) return errorResponse(409, 'QR is reserved for another product');
            if (product.status !== 'ACTIVE') return errorResponse(400, 'Product is not active');

            const now = new Date().toISOString();
            const status = activate_now ? 'ACTIVE' : 'LINKED';
            
            let expiresAt = qrItem.ts_expired_at;
            if (activate_now && !expiresAt) {
                const expDate = new Date();
                expDate.setDate(expDate.getDate() + (product.valid_days || DEFAULT_VALID_DAYS));
                expiresAt = expDate.toISOString();
            }

            let updateExpr = 'SET #status = :status, shop_id = :sid, product_id = :pid, GSI1_PK = :gsi_pk, GSI1_SK = :now, GSI2_PK = :gsi2_pk, GSI2_SK = :now, ts_linked_at = :now, ts_updated_at = :now';
            const attrValues: any = {
                ':status': status, ':sid': shopId, ':pid': product_id,
                ':gsi_pk': `QR#${status}`, ':gsi2_pk': `SHOP#${shopId}`, ':now': now,
                ':linked': 'LINKED', ':unassigned': 'UNASSIGNED'
            };

            if (memo_for_users !== undefined) { updateExpr += ', memo_for_users = :mu'; attrValues[':mu'] = memo_for_users; }
            if (memo_for_shop !== undefined) { updateExpr += ', memo_for_shop = :ms'; attrValues[':ms'] = memo_for_shop; }
            if (activate_now) {
                updateExpr += ', ts_activated_at = :now';
                if (expiresAt) { updateExpr += ', ts_expired_at = :exp'; attrValues[':exp'] = expiresAt; }
            }

            // 【DB操作: UpdateItem】
            // アトミックにリンク処理を実行。条件式により二重登録や他店舗の介入を防ぐ。
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: updateExpr,
                ConditionExpression: '(#status = :linked AND shop_id = :sid) OR #status = :unassigned',
                ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: attrValues
            }));

            return successResponse({ message: 'QR Linked successfully', status });
        }

        // ====================================================================
        // ACTION: activate (リンク済みQRの有効化)
        // --------------------------------------------------------------------
        // 目的: 既に特定の商品に紐付いている(LINKED)QRコードを利用可能(ACTIVE)にします。
        // ====================================================================
        if (action === 'activate') {
            const { qr_id: body_qr_id } = body as ShopApiSchema['shop_qr_activate'];
            const qr_id = getQrId(event, body);
            if (!qr_id) return errorResponse(400, 'Missing qr_id');

            const qrRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' } }));
            if (!qrRes.Item) return errorResponse(404, 'QR not found');
            if (qrRes.Item.status !== 'LINKED') return errorResponse(409, 'QR is not in LINKED state');
            if (qrRes.Item.shop_id !== shopId) return errorResponse(403, 'QR does not belong to this shop');

            // 有効期限の計算
            const prodRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${qrRes.Item.product_id}` } }));
            const validDays = prodRes.Item?.valid_days || DEFAULT_VALID_DAYS;
            const now = new Date();
            const expiresAt = new Date(now);
            expiresAt.setDate(expiresAt.getDate() + validDays);

            // 【DB操作: UpdateItem】
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :active, ts_activated_at = :now, ts_expired_at = :exp, GSI1_PK = :gsi_pk, GSI1_SK = :now, ts_updated_at = :now',
                ConditionExpression: '#status = :linked AND shop_id = :sid',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':active': 'ACTIVE', ':linked': 'LINKED', ':sid': shopId,
                    ':now': now.toISOString(), ':exp': qrRes.Item.ts_expired_at || expiresAt.toISOString(), ':gsi_pk': 'QR#ACTIVE'
                }
            }));

            return successResponse({ message: 'QR Activated successfully' });
        }

        return errorResponse(400, 'Unknown action');
    } catch (error: any) {
        console.error('Shop QR error:', error);
        if (error.name === 'ConditionalCheckFailedException') {
            return errorResponse(409, 'Operation failed. QR state or ownership has changed.');
        }
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
