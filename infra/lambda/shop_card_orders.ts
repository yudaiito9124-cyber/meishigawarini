/**
 * 概要: ショップ用カード発注管理
 * 詳細: 
 *  - ショップオーナーまたはGM向けに、物理カードの発注(create)、一覧表示(list)、キャンセル(cancel)、受取完了処理(complete)を提供します。
 *  - 注文情報は CARD_ORDER#SHOP{shopId} をパーティションキーとして管理されます。
 *
 * エンドポイント: POST /shop/card_orders
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { generateId } from './utils/id';
import { successResponse, errorResponse, apiResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getShopId, getAction, getUserId } from './utils/request';

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

        // 権限チェック
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // ====================================================================
        // ACTION: create (新規カード発注の作成)
        // --------------------------------------------------------------------
        // 目的: ショップに紐づく新規カード発注(CARD_ORDER)レコードの作成
        // ====================================================================
        if (action === 'create') {
            const { quantity, design_id, product_id, shop_user_id, sender_user_id, expiration_date, activate_now } = body;

            if (!quantity || !design_id) {
                return errorResponse(400, 'Missing quantity or design_id');
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
                    // 管理者一覧用インデックス (GSI1)
                    GSI1_PK: `CARD_ORDER#ORDERED`,
                    GSI1_SK: now,
                    // ID逆引き用インデックス (GSI2)
                    GSI2_PK: `CARD_ORDER#${orderId}`,
                    GSI2_SK: `SHOP#${orderId}`
                }
            }));

            return apiResponse(201, { message: 'Card order created', order_id: orderId });
        }

        // ====================================================================
        // ACTION: list (発注履歴の一覧取得)
        // --------------------------------------------------------------------
        // 目的: 特定のショップに紐づくカード発注履歴を最新順(降順)に取得
        // ====================================================================
        if (action === 'list') {
            const result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: {
                    ':pk': `CARD_ORDER#SHOP${shopId}`,
                    ':sk': 'ORDER#'
                },
                ScanIndexForward: false
            }));

            return successResponse({ items: result.Items || [] });
        }

        // ====================================================================
        // ACTION: cancel (発注キャンセル)
        // --------------------------------------------------------------------
        // 目的: 「ORDERED」状態の発注をキャンセル済みに変更します。
        // ====================================================================
        if (action === 'cancel') {
            const { order_id } = body;
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
                UpdateExpression: 'SET #status = :status, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':status': 'CANCELLED',
                    ':gsi_pk': 'CARD_ORDER#CANCELLED',
                    ':now': now
                }
            }));

            return successResponse({ message: 'Order cancelled' });
        }

        // ====================================================================
        // ACTION: complete (受取完了)
        // --------------------------------------------------------------------
        // 目的: 発送済み(SHIPPED)の発注を完了(COMPLETED)に変更します。
        // ====================================================================
        if (action === 'complete') {
            const { order_id } = body;
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
                UpdateExpression: 'SET #status = :status, GSI1_PK = :gsi_pk, ts_updated_at = :now',
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
