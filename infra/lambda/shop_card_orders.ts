/**
 * 概要: カード発注管理（ショップ側）
 * 詳細: ショップからのカード発注作成、一覧取得、およびキャンセルを行います。
 * 
 * エンドポイント:
 *  - POST /shop/card_orders/create (発注作成)
 *  - POST /shop/card_orders/list (発注一覧取得)
 *  - POST /shop/card_orders/cancel (発注キャンセル)
 *  - POST /shop/card_orders/complete (受取完了)
 * 
 * リクエストボディ:
 *  - shopId: 操作対象のショップID (必須)
 * 
 *  [POST /shop/card_orders/create の場合]
 *  - quantity: 発注枚数 (必須)
 *  - design_id: デザインID (必須)
 *  - product_id: 商品ID (オプション)
 *  - shop_user_id: 制限用ユーザーID (オプション)
 *  - sender_user_id: 送り主ユーザーID (オプション)
 *  - expiration_date: 使用期限 (オプション)
 *  - activate_now: 即時有効化フラグ (オプション)
 * 
 *  [POST /shop/card_orders/cancel または /complete の場合]
 *  - order_id: 発注ID (必須)
 * 
 * Overview: Card Order Management (Shop side)
 * Description: Handles creating, listing, and cancelling card orders from the shop.
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { generateId } from './utils/id';
import { validateQRParams } from './utils/qr-validation';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

/**
 * メインハンドラー
 */
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // CORS プリフライト対応
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        // 認証情報の取得
        const authorizer = event.requestContext?.authorizer;
        const userId = authorizer?.principalId;
        if (!userId) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        const { shopId } = body;

        // パスからアクションを特定
        let action = '';
        const res = event.resource;
        if (res.endsWith('/create')) action = 'create';
        else if (res.endsWith('/list')) action = 'list';
        else if (res.endsWith('/cancel')) action = 'cancel';
        else if (res.endsWith('/complete')) action = 'complete';

        if (!shopId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing shopId' }) };
        if (!action) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };

        // ショップの所有権または管理権限チェック
        // checkShopOwnerOrGM verifies if the user has access to the specified shop.
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (shopMetadata === false) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Forbidden: You do not have access to this shop' }) };
        }

        const now = new Date().toISOString();

        // --------------------------------------------------------------------------------
        // 発注作成 (Create Card Order)
        // --------------------------------------------------------------------------------
        if (action === 'create') {
            const { 
                quantity, design_id, product_id, shop_user_id, 
                sender_user_id, expiration_date, activate_now 
            } = body;

            if (!quantity || !design_id) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing quantity or design_id' }) };
            }

            // 【整合性チェック】 admin_qr_generate.ts と同一の共通ロジックで検証
            // これにより、商品とショップの不一致や、有効化条件の不整合を防ぐ。
            const validationResult = await validateQRParams(ddb, TABLE_NAME, BUCKET_NAME, {
                shopId,
                productId: product_id,
                activateNow: !!activate_now,
                senderId: sender_user_id,
                // ownerUuid はショップマネージャー自身か、指定された shop_user_id
                ownerUuid: shop_user_id || userId
            }).catch((err: any) => {
                if (err.statusCode) return err;
                throw err;
            });

            if (validationResult.statusCode) {
                return { 
                    statusCode: validationResult.statusCode, 
                    headers: corsHeaders, 
                    body: JSON.stringify({ message: validationResult.message, detail: validationResult.detail }) 
                };
            }

            const { validDays } = validationResult;
            
            // 有効期限の決定
            let finalExpirationDate = expiration_date || null;
            if (!finalExpirationDate && activate_now) {
                const expirationDateObj = new Date();
                expirationDateObj.setDate(expirationDateObj.getDate() + validDays);
                finalExpirationDate = expirationDateObj.toISOString();
            }

            const orderId = generateId();

            // 【DB操作: PutItem】
            // - 目的: ショップに紐づく新規カード発注(CARD_ORDER)レコードの作成
            // - テーブル: TABLE_NAME
            // - リクエストキー(プライマリ): { PK: `CARD_ORDER#SHOP${shopId}`, SK: `ORDER#${orderId}` }
            // - 登録属性: order_id, shop_id, quantity, status, design_id, GSI1_PK, GSI2_PK 等
            // - 特記: GSI1は管理者用の一覧、GSI2はorder_idからの逆引用
            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `CARD_ORDER#SHOP${shopId}`,
                    SK: `ORDER#${orderId}`,
                    order_id: orderId,
                    shop_id: shopId,
                    quantity: Number(quantity),
                    status: 'ORDERED', // 初期ステータス
                    design_id,
                    product_id: product_id || null,
                    shop_user_id: shop_user_id || userId, // デフォルトは発注者
                    sender_user_id: sender_user_id || null,
                    expiration_date: finalExpirationDate,
                    activate_now: !!activate_now,
                    ts_created_at: now,
                    ts_updated_at: now,
                    // GSI1: ステータス別の全件取得用（管理者向け）
                    GSI1_PK: `CARD_ORDER#ORDERED`,
                    GSI1_SK: now,
                    // GSI2: order_id からの逆引き用
                    GSI2_PK: `CARD_ORDER#${orderId}`,
                    GSI2_SK: `SHOP#${orderId}`
                }
            }));

            return { 
                statusCode: 201, 
                headers: corsHeaders, 
                body: JSON.stringify({ message: 'Card order created', order_id: orderId }) 
            };
        }

        // --------------------------------------------------------------------------------
        // 発注一覧取得 (List Card Orders)
        // --------------------------------------------------------------------------------
        if (action === 'list') {
            // 【DB操作: Query】
            // - 目的: 特定のショップに紐づくカード発注履歴を最新順に取得
            // - テーブル: TABLE_NAME
            // - キー条件: PK = CARD_ORDER#SHOP{shopId} AND SK starts with ORDER#
            // - スキャン方向: 降順 (最新の発注を上に表示)
            const result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: {
                    ':pk': `CARD_ORDER#SHOP${shopId}`,
                    ':sk': 'ORDER#'
                },
                ScanIndexForward: false // 新しい順に取得
            }));

            return { 
                statusCode: 200, 
                headers: corsHeaders, 
                body: JSON.stringify({ items: result.Items || [] }) 
            };
        }

        // --------------------------------------------------------------------------------
        // 発注キャンセル (Cancel Card Order)
        // --------------------------------------------------------------------------------
        if (action === 'cancel') {
            const { order_id } = body;
            if (!order_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing order_id' }) };

            // 現在の状態を確認するための取得
            const currentOrder = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `CARD_ORDER#SHOP${shopId}`,
                    SK: `ORDER#${order_id}`
                }
            }));

            if (!currentOrder.Item) {
                return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Order not found' }) };
            }

            // ショップからは ORDERED の時点でのみ CANCELLED に移行可能
            if (currentOrder.Item.status !== 'ORDERED') {
                return { 
                    statusCode: 400, 
                    headers: corsHeaders, 
                    body: JSON.stringify({ message: 'Cannot cancel order in current status: ' + currentOrder.Item.status }) 
                };
            }

            // 【DB操作: UpdateItem】
            // - 目的: ステータスを CANCELLED に更新し、GSI1のPKも同期
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `CARD_ORDER#SHOP${shopId}`, SK: `ORDER#${order_id}` }
            // - 更新内容: status = 'CANCELLED', GSI1_PK = 'CARD_ORDER#CANCELLED'
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `CARD_ORDER#SHOP${shopId}`,
                    SK: `ORDER#${order_id}`
                },
                UpdateExpression: 'SET #status = :status, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':status': 'CANCELLED',
                    ':gsi_pk': 'CARD_ORDER#CANCELLED',
                    ':now': now
                }
            }));

            return { 
                statusCode: 200, 
                headers: corsHeaders, 
                body: JSON.stringify({ message: 'Order cancelled' }) 
            };
        }
        
        // --------------------------------------------------------------------------------
        // 受取完了 (Complete Card Order)
        // --------------------------------------------------------------------------------
        if (action === 'complete') {
            const { order_id } = body;
            if (!order_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing order_id' }) };

            const currentOrder = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `CARD_ORDER#SHOP${shopId}`,
                    SK: `ORDER#${order_id}`
                }
            }));

            if (!currentOrder.Item) {
                return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Order not found' }) };
            }

            // 【ステータス制限】受取完了は「発送済み(SHIPPED)」の状態からのみ可能
            if (currentOrder.Item.status !== 'SHIPPED') {
                return { 
                    statusCode: 400, 
                    headers: corsHeaders, 
                    body: JSON.stringify({ message: 'Cannot mark as complete in current status: ' + currentOrder.Item.status }) 
                };
            }

            // 【DB操作: UpdateItem】
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `CARD_ORDER#SHOP${shopId}`,
                    SK: `ORDER#${order_id}`
                },
                UpdateExpression: 'SET #status = :status, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':status': 'COMPLETED',
                    ':gsi_pk': 'CARD_ORDER#COMPLETED',
                    ':now': now
                }
            }));

            return { 
                statusCode: 200, 
                headers: corsHeaders, 
                body: JSON.stringify({ message: 'Order marked as completed' }) 
            };
        }

        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };

    } catch (error: any) {
        console.error(error);
        return { 
            statusCode: 500, 
            headers: corsHeaders, 
            body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) 
        };
    }
};
