/**
 * @file shop_qr.ts
 * @role ショップ用：QR コード / ギフト券運用管理ハンドラー
 * @responsibility
 *  - 店舗スタッフが QR コードをスキャンし、商品（ギフト）を紐付け、有効化する一連のオペレーションを管理します。
 *  - 【主要アクション】
 *    - `check`: スキャンされた QR コードが自ショップで利用可能（状態・帰属）かを確認します。
 *    - `list`: 自ショップに紐付いている（GSI2 使用）QR コードの一覧を取得。
 *    - `link`: 未割当（UNASSIGNED）の状態から、特定の商品やメモを紐付けます。`activate_now` オプションによる一括有効化もサポート。
 *    - `activate`: リンク済み（LINKED）の QR コードを、最終的に利用可能（ACTIVE）な状態へ移行させます。
 *  - 【整合性・セキュリティ】
 *    - `checkAndExpire`: 動作の都度、有効期限を遅延評価し、実態に合わせたステータス更新を自動で行います。
 *    - `ConditionExpression`: 紐付け処理において、アトミックな更新を保証し、他ショップによる同一コードの不正操作や二重登録を物理的に防ぎます。
 * @context
 *  - 店舗のレジ横や発送作業現場で、物理カードを「ただの紙」から「価値のあるギフトカード」に変える、運用の中核を担うプロセスです。
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

        // 互換性: 旧パスベースのルーティングに対応
        const resPath = event.resource;
        if (resPath.endsWith('/list')) action = 'list';
        else if (resPath.endsWith('/link')) action = 'link';
        else if (resPath.endsWith('/activate')) action = 'activate';
        else if (resPath.includes('/qrcodecheck')) action = 'check';

        if (!shopId) return errorResponse(400, 'Missing shopId');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // 権限検証
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // --------------------------------------------------------------------
        // ACTION: check (QR コードの状態チェック / 事前確認)
        // 目的: スキャンされた QR コードが「自店舗のものか」「紐付け可能か」を確認。
        // --------------------------------------------------------------------
        if (action === 'check') {
            const qr_id = getQrId(event, body);
            if (!qr_id) return errorResponse(400, 'Missing qr_id');

            const qrRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            }));
            if (!qrRes.Item) return errorResponse(404, 'QR not found');

            const qrItem = qrRes.Item;
            
            // 重要: 有効期限の遅延評価（取得と同時に判定・更新を行う「Lazy Evaluation」手法）
            const currentStatus = await checkAndExpire(ddb, TABLE_NAME, qr_id, qrItem as any);
            if (currentStatus === 'EXPIRED') return errorResponse(410, 'QR Code has expired');

            // セキュリティ: 他ショップの QR コードは操作不能
            if (qrItem.shop_id && qrItem.shop_id !== shopId) {
                return errorResponse(403, 'QR does not belong to this shop');
            }

            // オペレーションバリデーション: 既に受け取られたり、エラー状態のものは除外
            if (currentStatus !== 'UNASSIGNED' && currentStatus !== 'LINKED') {
                return errorResponse(409, `QR is in invalid state: ${currentStatus}`);
            }

            // 既に商品が紐付いている場合は、その情報を付加して返却（再リンク用）
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

        // --------------------------------------------------------------------
        // ACTION: list (ショップ帰属 QR 一覧)
        // 目的: GSI2 インデックス（SHOP#ID）を用いて、自ショップに関連付けられた全 QR を取得。
        // --------------------------------------------------------------------
        if (action === 'list') {
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME, IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :sid', ExpressionAttributeValues: { ':sid': `SHOP#${shopId}` }
            }));

            const rawItems = res.Items || [];
            
            // 全アイテムに対して個別に期限切れ判定を実行しながら整形
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

        // --------------------------------------------------------------------
        // ACTION: link (商品との紐付け実行)
        // 目的: 「紙のカード」に「特定のギフト価値（商品）」をアトミックに定義します。
        // --------------------------------------------------------------------
        if (action === 'link') {
            const bodyTyped = body as ShopApiSchema['shop_qr_link'];
            const { memo_for_users, memo_for_shop, activate_now } = bodyTyped;
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

            // 各種ビジネスロジック・バリデーション
            if (qrItem.status !== "UNASSIGNED" && qrItem.status !== "LINKED") return errorResponse(409, 'QR state is not unassigned or linked');
            // 特定ユーザー専用 QR（reserved）の場合、そのショップに所属しているかチェック
            if (qrItem.owner_id && !await checkUserShopPermission(ddb, TABLE_NAME, shopId, qrItem.owner_id)) return errorResponse(403, 'Permission denied for this reserved QR');
            if (qrItem.shop_id && qrItem.shop_id !== shopId) return errorResponse(403, 'QR belongs to another shop');
            if (qrItem.product_id && qrItem.product_id !== product_id) return errorResponse(409, 'QR is reserved for another product');
            if (product.status !== 'ACTIVE') return errorResponse(400, 'Product is not active');

            const now = new Date().toISOString();
            const status = activate_now ? 'ACTIVE' : 'LINKED';
            
            // 有効期限の算出（有効化されるタイミングで商品の valid_days に基づいて設定）
            let expiresAt = qrItem.ts_expired_at;
            if (activate_now && !expiresAt) {
                const expDate = new Date();
                expDate.setDate(expDate.getDate() + (product.valid_days || DEFAULT_VALID_DAYS));
                expiresAt = expDate.toISOString();
            }

            // 更新クエリの構築
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
            // 排他制御: 他のプロセスの介入を防ぐ ConditionExpression を指定
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: updateExpr,
                ConditionExpression: '(#status = :linked AND shop_id = :sid) OR #status = :unassigned',
                ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: attrValues
            }));

            return successResponse({ message: 'QR Linked successfully', status });
        }

        // --------------------------------------------------------------------
        // ACTION: activate (リンク済み QR の強制有効化 / 確定)
        // 目的: 既にリンク済みの QR コードに対し、最終的な利用許可を与えます。
        // --------------------------------------------------------------------
        if (action === 'activate') {
            const qr_id = getQrId(event, body);
            if (!qr_id) return errorResponse(400, 'Missing qr_id');

            const qrRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' } }));
            if (!qrRes.Item) return errorResponse(404, 'QR not found');
            if (qrRes.Item.status !== 'LINKED') return errorResponse(409, 'QR is not in LINKED state');
            if (qrRes.Item.shop_id !== shopId) return errorResponse(403, 'QR does not belong to this shop');

            // 商品設定から有効期間を取得し、現在時刻から期限を算出
            const prodRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${qrRes.Item.product_id}` } }));
            const validDays = prodRes.Item?.valid_days || DEFAULT_VALID_DAYS;
            const now = new Date();
            const expiresAt = new Date(now);
            expiresAt.setDate(expiresAt.getDate() + validDays);

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
