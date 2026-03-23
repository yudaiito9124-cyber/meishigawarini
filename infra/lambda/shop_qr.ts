/**
 * 概要: QRコード情報の取得・リンク・アクティベート
 * 詳細: QRコードの一覧取得、商品への紐づけ（LINK）、有効化（ACTIVE）および簡易状態チェックを行います。
 * エンドポイント:
 *  - POST /shop/qr/list (QR一覧取得)
 *  - POST /shop/qr/link (商品への紐付け)
 *  - POST /shop/qr/activate (有効化)
 *  - POST /shop/qrcodecheck (状態チェック)
 * リクエストボディ:
 *  - shop_id: 取得・操作対象のショップID (必須)
 *  [linkの場合]
 *  - qr_id: QR UUID (必須)
 *  - product_id: 紐付ける商品ID (必須)
 *  - memo_for_users: ユーザー向けメモ (オプション)
 *  - memo_for_shop: ショップ内メモ (オプション)
 *  - activate_now: 同時にACTIVE状態にするかフラグ (オプション)
 *  [activate / checkの場合]
 *  - qr_id: 対象QR UUID (必須)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM, checkUserShopPermission } from './share/shop-auth';
import { checkAndExpire } from './utils/expiration';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';
const DEFAULT_VALID_DAYS = parseInt(process.env.DEFAULT_VALID_DAYS || '180');

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
        const res = event.resource;
        if (res.endsWith('/list')) action = 'list';
        else if (res.endsWith('/link')) action = 'link';
        else if (res.endsWith('/activate')) action = 'activate';
        else if (res.includes('/qrcodecheck')) action = 'check';

        if (!shopId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing shopId' }) };
        if (!action || !['list', 'link', 'activate', 'check'].includes(action)) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action. Received: ' + action + ' for ' + res }) };
        }

        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (shopMetadata === false) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        if (action === 'check') {
            const { qr_id } = body;
            // 【DB操作: GetItem】
            // - 目的: 単一のQRコードの存在および状態(メタデータ)を確認
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            // - 取得カラム: ALL(status, shop_id, product_id等を後続で検証), SK = METADATA
            const qrRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            }));
            if (!qrRes.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR not found', detail: `QRcode:${qr_id}` }) };

            const qrItem = qrRes.Item;
            let qrproductName = '';
            let productLinked = false;
            
            // 期限切れチェック (共通ユーティリティ)
            // checkAndExpire は内部で有効なステータス(UNASSIGNED, LINKED, ACTIVE)の場合のみ判定を行います
            const currentStatus = await checkAndExpire(ddb, TABLE_NAME, qr_id, qrItem as any);

            if (currentStatus === 'EXPIRED') {
                return { statusCode: 410, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code has expired', status: 'EXPIRED' }) };
            }

            if (qrItem.shop_id && qrItem.shop_id !== shopId) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'QR does not belong to this shop', detail: `QRcode:${qr_id}, shop:${qrItem.shop_id}` }) };
            }
            if (currentStatus !== 'UNASSIGNED' && currentStatus !== 'LINKED') {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'QR is not in a valid state', detail: `QRcode:${qr_id}, status:${currentStatus}`, status: currentStatus }) };
            }

            if (qrItem.product_id) {
                // 【DB操作: GetItem】
                // - 目的: QRコードに紐付いている商品情報の取得、および販売停止(STOPPED)状態でないかの確認
                // - テーブル: TABLE_NAME
                // - リクエストキー: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${qrItem.product_id}` }
                // - 取得カラム: ALL(name 等)
                const productRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${qrItem.product_id}` }
                }));
                if (!productRes.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Product not found', detail: `QRcode:${qr_id}, product:${qrItem.product_id}` }) };
                if (productRes.Item.status === 'STOPPED') {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Product is stopped', detail: `QRcode:${qr_id}, product:${qrItem.product_id}, product_name:${productRes.Item.name}` }) };
                }
                qrproductName = productRes.Item.name;
                productLinked = true;
            }
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ product_id: qrItem.product_id, product_name: qrproductName, product_linked: productLinked, status: currentStatus }) };
        }

        if (action === 'list') {
            // 【DB操作: Query】
            // - 目的: 当該ショップに紐付く全てのQRコード情報の一覧取得
            // - テーブル: TABLE_NAME
            // - インデックス: GSI2
            // - 検索条件: GSI2_PK = `SHOP#${shopId}`
            // - 取得カラム: ALL
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME, IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :sid', ExpressionAttributeValues: { ':sid': `SHOP#${shopId}` }
            }));

            const now = new Date();
            const updatePromises: Promise<any>[] = [];

            const items = (res.Items || []).map(item => {
                let status = item.status;
                let ts_expired_at = item.ts_expired_at;
                
                // 【DB操作: UpdateItem (非同期ループ)】
                // - 目的: 一覧取得時に期限切れ(EXPIRED)になっているQRレコードを発見した場合、DBの状態を自動更新する（遅延評価）
                // - 共通ユーティリティを使用
                const statusPromise = checkAndExpire(ddb, TABLE_NAME, item.PK.replace('QR#', ''), item as any);
                updatePromises.push(statusPromise);

                return {
                    id: item.PK.replace('QR#', ''), status: item.status, product_id: item.product_id,
                    ts_created_at: item.ts_created_at, ts_activated_at: item.ts_activated_at, ts_expired_at: ts_expired_at
                };
            });

            const updatedStatuses = await Promise.all(updatePromises);
            // 呼び出し元のitemsに更新後のステータスを反映
            items.forEach((item, index) => {
                item.status = updatedStatuses[index];
            });

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items }) };
        }

        if (action === 'link') {
            let { qr_id, product_id, memo_for_users, memo_for_shop, activate_now } = body;
            if (!qr_id || !product_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing qr_id or product_id' }) };

            // 【DB操作: GetItem (2回並行)】
            // - 目的: リンク対象となる QRコードおよび商品の両方が存在し、かつ正しい状態であるかの事前チェック
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `QR#${qr_id}`, SK: 'METADATA' } および { PK: `SHOP#${shopId}`, SK: `PRODUCT#${product_id}` }
            // - 取得カラム: ALL
            const [qrCheck, prodCheck] = await Promise.all([
                ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' } })),
                ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${product_id}` } }))
            ]);
            
            if (!qrCheck.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR not found' }) };
            if (!prodCheck.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Product not found in this shop' }) };
            
            const qrItem = qrCheck.Item;
            const product = prodCheck.Item;

            if (qrItem.status !== "UNASSIGNED" && qrItem.status !== "LINKED") return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'QR state is not unassigned, linked' }) };
            if (qrItem.owner_id && !await checkUserShopPermission(ddb, TABLE_NAME, shopId, qrItem.owner_id)) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'This QR code is reserved for another shop owner / manager' }) };
            if (qrItem.shop_id && qrItem.shop_id !== shopId) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'QR does not belong to this shop' }) };
            if (qrItem.product_id && qrItem.product_id !== product_id) return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'QR is already reserved for another product' }) };
            if (product.status !== 'ACTIVE') return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'Product is not active' }) };

            const validDays = product.valid_days || DEFAULT_VALID_DAYS;
            const status = activate_now ? 'ACTIVE' : 'LINKED';
            const activatedAt = activate_now ? new Date().toISOString() : undefined;
            let expiresAt = qrItem.ts_expired_at;
            if (activate_now && !expiresAt) {
                const expirationDate = new Date();
                expirationDate.setDate(expirationDate.getDate() + validDays);
                expiresAt = expirationDate.toISOString();
            }

            let updateExpr = 'SET #status = :status, shop_id = :sid, product_id = :pid, GSI1_PK = :gsi_pk, GSI2_PK = :gsi2_pk, GSI2_SK = :now, ts_linked_at = :now, ts_updated_at = :now';
            const attrValues: any = {
                ':status': status, ':linked': 'LINKED', ':sid': shopId, ':pid': product_id,
                ':gsi_pk': `QR#${status}`, ':gsi2_pk': `SHOP#${shopId}`, ':now': new Date().toISOString(), ':unassigned': 'UNASSIGNED'
            };

            if (memo_for_users !== undefined) { updateExpr += ', memo_for_users = :mu'; attrValues[':mu'] = memo_for_users; }
            if (memo_for_shop !== undefined) { updateExpr += ', memo_for_shop = :ms'; attrValues[':ms'] = memo_for_shop; }
            if (activate_now) { updateExpr += ', ts_activated_at = :act_at'; attrValues[':act_at'] = activatedAt; if (expiresAt) { updateExpr += ', ts_expired_at = :exp_at'; attrValues[':exp_at'] = expiresAt; } }

            // 【DB操作: UpdateItem】
            // - 目的: QRコードと商品の紐付け(LINK)、および必要に応じた即時有効化(ACTIVE)をアトミックに実行する
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            // - 条件式 (ConditionExpression): まだどこにも割当されていない(UNASSIGNED)、または自ショップのLINKEDなQRであること
            // - 更新カラム: status, shop_id, product_id, GSI1_PK, GSI2_PK, ts_linked_at, memo 等
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: updateExpr,
                ConditionExpression: '(#status = :linked AND shop_id = :sid) OR #status = :unassigned',
                ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: attrValues
            }));

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: activate_now ? 'QR Linked and Activated successfully' : 'QR Linked successfully' }) };
        }

        if (action === 'activate') {
            const { qr_id } = body;
            if (!qr_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing qr_id' }) };

            // 【DB操作: GetItem】
            // - 目的: 有効化(Activate)対象のQRコードが存在し、LINKED状態であるかのチェックを行う
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            // - 取得カラム: ALL(status, shop_id, product_id等を検証)
            const qrRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' } }));
            if (!qrRes.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR not found' }) };
            if (qrRes.Item.status !== 'LINKED') return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'QR is not in LINKED state' }) };
            if (qrRes.Item.owner_id && !await checkUserShopPermission(ddb, TABLE_NAME, shopId, qrRes.Item.owner_id)) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'This QR code is reserved for another shop owner / manager' }) };
            if (qrRes.Item.shop_id !== shopId) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'QR does not belong to this shop' }) };

            const productId = qrRes.Item.product_id;
            
            // 【DB操作: GetItem】
            // - 目的: QRに紐付いている商品の詳細(特に有効期間 valid_days)を取得し、有効化時の期限日時を計算する
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` }
            // - 取得カラム: ALL(valid_daysを利用)
            const prodRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` } }));
            const validDays = (prodRes.Item && prodRes.Item.valid_days) ? prodRes.Item.valid_days : DEFAULT_VALID_DAYS;
            const now = new Date();
            const expiresAt = new Date(now);
            expiresAt.setDate(expiresAt.getDate() + validDays);

            // 【DB操作: UpdateItem】
            // - 目的: QRコードを ACTIVE(有効) 状態に遷移させる
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            // - 条件式 (ConditionExpression): 対象が現在のショップに紐づいており、かつ LINKED 状態であること
            // - 更新カラム: status='ACTIVE', ts_activated_at, ts_expired_at, GSI1_PK='QR#ACTIVE' 等
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :active, ts_activated_at = :now, ts_expired_at = :exp, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                ConditionExpression: '#status = :linked AND shop_id = :sid',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':active': 'ACTIVE', ':linked': 'LINKED', ':sid': shopId,
                    ':now': now.toISOString(), ':exp': qrRes.Item.ts_expired_at || expiresAt.toISOString(), ':gsi_pk': 'QR#ACTIVE'
                }
            }));

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'QR Activated successfully' }) };
        }

        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };
    } catch (error: any) {
        console.error(error);
        if (error.name === 'ConditionalCheckFailedException') {
            return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'Operation failed. QR might not be in correct state or belongs to another shop.' }) };
        }
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
