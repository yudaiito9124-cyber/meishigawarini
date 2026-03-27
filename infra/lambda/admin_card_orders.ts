/**
 * 概要: カード発注管理（管理者側）
 * 詳細: 全ショップのカード発注一覧の取得、およびステータスの更新を行います。
 * 
 * エンドポイント:
 *  - POST /admin/card_orders/list (全発注一覧取得)
 *  - POST /admin/card_orders/update (ステータス更新)
 * 
 * [POST /admin/card_orders/list の場合]
 *  - status: フィルタリングするステータス (オプション, 例: "ORDERED")
 *  - limit: 取得件数制限 (オプション, デフォルト50)
 * 
 * [POST /admin/card_orders/update の場合]
 *  - shopId: ショップID (必須)
 *  - order_id: 発注ID (必須)
 *  - status: 変更後のステータス (必須)
 * 
 * Overview: Card Order Management (Admin side)
 * Description: Handles listing all card orders across all shops and updating their statuses.
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

/**
 * メインハンドラー
 */
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // CORS プリフライト対応
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        const body = JSON.parse(event.body || '{}');
        
        // パスからアクションを特定
        let action = '';
        const res = event.resource;
        if (res.endsWith('/list')) action = 'list';
        else if (res.endsWith('/update')) action = 'update';

        if (!action) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };

        const now = new Date().toISOString();

        // --------------------------------------------------------------------------------
        // 発注一覧取得 (List All Card Orders)
        // --------------------------------------------------------------------------------
        if (action === 'list') {
            const status = body.status || 'ORDERED';
            const limit = Number(body.limit) || 50;

            // 【DB操作: Query】
            // - 目的: 指定ステータス(GSI1_PK)のカード発注一覧を最新順に取得
            // - テーブル: TABLE_NAME
            // - インデックス: GSI1
            // - 検索条件: GSI1_PK = CARD_ORDER#{status}
            // - スキャン方向: 降順 (最新の発注を上に表示)
            const result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1_PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': `CARD_ORDER#${status}`
                },
                ScanIndexForward: false, // 新しい順
                Limit: limit
            }));

            const items = result.Items || [];

            // ショップ情報の Enrich (BatchGet を使用してショップ名を取得)
            if (items.length > 0) {
                const shopIds = [...new Set(items.map((i: any) => i.shop_id).filter(Boolean))];
                if (shopIds.length > 0) {
                    const shopKeys = shopIds.map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' }));
                    // 【DB操作: BatchGetItem (Step 1)】
                    // - 目的: 発注一覧に含まれるショップ名(METADATA)とオーナーID(owner_id)の一括取得
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
                            const sid = shop.PK.replace('SHOP#', '');
                            shopMap[sid] = { name: shop.name, owner_id: shop.owner_id };
                            if (shop.owner_id) ownerIds.add(shop.owner_id);
                        }
                    }

                    // オーナー情報の Enrich (BatchGet を使用してメールアドレスを取得)
                    const emailMap: Record<string, string> = {};
                    if (ownerIds.size > 0) {
                        const ownerKeys = Array.from(ownerIds).map(id => ({ PK: `USER#${id}`, SK: 'SHOP' }));
                        // 【DB操作: BatchGetItem (Step 2)】
                        // - 目的: オーナーのメールアドレスを一括取得
                        const userBatchRes = await ddb.send(new BatchGetCommand({
                            RequestItems: {
                                [TABLE_NAME]: {
                                    Keys: ownerKeys,
                                    ProjectionExpression: 'PK, email'
                                }
                            }
                        }));
                        if (userBatchRes.Responses && userBatchRes.Responses[TABLE_NAME]) {
                            for (const user of userBatchRes.Responses[TABLE_NAME]) {
                                const uid = user.PK.replace('USER#', '');
                                emailMap[uid] = user.email;
                            }
                        }
                    }

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

            return { 
                statusCode: 200, 
                headers: corsHeaders, 
                body: JSON.stringify({ 
                    items: items,
                    count: items.length,
                    hasMore: !!result.LastEvaluatedKey
                }) 
            };
        }

        // --------------------------------------------------------------------------------
        // 発注ステータス更新 (Update Card Order Status)
        // --------------------------------------------------------------------------------
        if (action === 'update') {
            const { shopId, order_id, status } = body;

            if (!shopId || !order_id || !status) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing shopId, order_id, or status' }) };
            }

            // 【DB操作: UpdateItem】
            // - 目的: 管理者によるカード発注のステータス更新
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `CARD_ORDER#SHOP${shopId}`, SK: `ORDER#${order_id}` }
            // - 更新内容: status, GSI1_PK (インデックス同期のため)
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
                    ':status': status,
                    ':gsi_pk': `CARD_ORDER#${status}`,
                    ':now': now
                }
            }));

            return { 
                statusCode: 200, 
                headers: corsHeaders, 
                body: JSON.stringify({ message: 'Order status updated' }) 
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
