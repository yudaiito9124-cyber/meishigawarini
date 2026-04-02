/**
 * 概要: カード発注の管理（管理者用）
 * 詳細: 
 *  - 全てのショップからのカード発注一覧をステータス別（GSI1使用）に取得し、ショップ名やオーナー情報をマージして返却します。
 *  - 発注ステータスの更新（ORDERED -> SHIPPED 等）をアトミックに実行します。
 *
 * エンドポイント: POST /admin/card_orders
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getAction } from './utils/request';
import { AdminApiSchema } from '@shared/api-types';

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
            const result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1_PK = :pk',
                ExpressionAttributeValues: { ':pk': `CARD_ORDER#${status}` },
                ScanIndexForward: false,
                Limit: limit
            }));

            const items = result.Items || [];

            if (items.length > 0) {
                const shopIds = [...new Set(items.map((i: any) => i.shop_id).filter(Boolean))];
                if (shopIds.length > 0) {
                    // ショップメタデータの一括取得
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
            }

            return successResponse({ items, count: items.length, hasMore: !!result.LastEvaluatedKey });
        }

        // ====================================================================
        // ACTION: update (ステータス更新)
        // --------------------------------------------------------------------
        // 目的: 管理者が発注のステータス（SHIPPED, COMPLETED 等）を更新します。
        // ====================================================================
        if (action === 'update') {
            const { shop_id, order_id, status } = body as AdminApiSchema['admin_card_orders_update'];
            if (!shop_id || !order_id || !status) return errorResponse(400, 'Missing shop_id, order_id, or status');

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `CARD_ORDER#SHOP${shop_id}`, SK: `ORDER#${order_id}` },
                UpdateExpression: 'SET #status = :status, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':status': status,
                    ':gsi_pk': `CARD_ORDER#${status}`,
                    ':now': now
                }
            }));

            return successResponse({ message: 'Order status updated' });
        }

        return errorResponse(404, 'Unknown action');

    } catch (error: any) {
        console.error('Admin card orders error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
