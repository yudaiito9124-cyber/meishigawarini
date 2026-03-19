/**
 * 概要: ユーザーをショップの「ゼネラルマネージャー（GM）」として紐付ける。
 * 詳細: ユーザーとショップの存在を確認し、双方向の参照関係（ユーザー側には`gm_shop_ids`、ショップ側には`gm_ids`）を更新して権限を付与する。
 * エンドポイント: POST /admin/links
 * リクエストボディ:
 *  - shopIds: 紐付け対象のショップID配列
 *  - userIds: 紐付け対象のユーザーID配列
 *  - action: "validate" (ID存在確認のみ) | "execute" (紐付け実行)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'OK' }) };
        }
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const { shopIds, userIds, action } = body;

        if (!Array.isArray(shopIds) || !Array.isArray(userIds) || !action) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Missing required fields: shopIds, userIds, action' })
            };
        }

        if (action === 'validate') {
            const userMetadataList = [];
            const shopMetadataList = [];
            const missingIds = [];

            // Validate Users
            for (const userId of userIds) {
                // ユーザー情報の存在確認
                // - 検索条件: PK = USER#{userId}, SK = "SHOP"
                // - 取得カラム: email
                const res = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${userId}`, SK: 'SHOP' }
                }));
                if (res.Item) {
                    userMetadataList.push({ id: userId, email: res.Item.email });
                } else {
                    missingIds.push(`USER#${userId}`);
                }
            }

            // Validate Shops
            for (const shopId of shopIds) {
                // ショップ情報の存在確認
                // - 検索条件: PK = SHOP#{shopId}, SK = "METADATA"
                // - 取得カラム: name, owner_id, email (オーナーのアドレス)
                const res = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
                }));
                if (res.Item) {
                    shopMetadataList.push({
                        id: shopId,
                        name: res.Item.name,
                        owner_id: res.Item.owner_id,
                        email: res.Item.email // Owner contact email
                    });
                } else {
                    missingIds.push(`SHOP#${shopId}`);
                }
            }

            if (missingIds.length > 0) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        message: 'Some IDs not found',
                        missingIds,
                        missingIdsFormatted: missingIds.join(', ')
                    })
                };
            }

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    users: userMetadataList,
                    shops: shopMetadataList
                })
            };
        }

        if (action === 'execute') {
            const now = new Date().toISOString();

            // 1. Update Users
            for (const userId of userIds) {
                // Fetch current user to check owner_shop_ids
                // 権限更新のため現在のユーザー状態を取得
                // - 検索条件: PK = USER#{userId}, SK = "SHOP"
                // - 取得カラム: owner_shop_ids, gm_shop_ids
                const userRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${userId}`, SK: 'SHOP' }
                }));

                if (!userRes.Item) continue; // Should not happen if validated

                const ownerShopIds = userRes.Item.owner_shop_ids || [];
                const currentGmShopIds = userRes.Item.gm_shop_ids || [];

                // Filter out shopIds that the user is already owner of
                const shopIdsToLink = shopIds.filter(id => !ownerShopIds.includes(id));

                if (shopIdsToLink.length > 0) {
                    // Filter out already linked gm shop ids for list_append (to avoid duplicates if already partially linked)
                    // Note: contains check in ConditionExpression is safer for single updates, 
                    // but for bulk linking here we might need a more complex loop or just accept potential duplicates if we don't check.
                    // Actually, the request says "already included, ignore". 
                    // So we should filter out those already in gm_shop_ids too.
                    const finalShopIdsToLink = shopIdsToLink.filter(id => !currentGmShopIds.includes(id));

                    if (finalShopIdsToLink.length > 0) {
                        // ユーザーのGMショップリストにショップIDを追加
                        // - 検索条件: PK = USER#{userId}, SK = "SHOP"
                        // - 更新カラム:
                        //   - gm_shop_ids: リクエストで指定されたショップIDリストを末尾に追加 (list_append)
                        //   - ts_updated_at: 現在時刻
                        await ddb.send(new UpdateCommand({
                            TableName: TABLE_NAME,
                            Key: { PK: `USER#${userId}`, SK: 'SHOP' },
                            UpdateExpression: 'SET gm_shop_ids = list_append(if_not_exists(gm_shop_ids, :empty_list), :new_shop_list), ts_updated_at = :now',
                            ExpressionAttributeValues: {
                                ':new_shop_list': finalShopIdsToLink,
                                ':empty_list': [],
                                ':now': now
                            }
                        }));
                    }
                }

                // Ensure GENERAL_MANAGER role
                try {
                    // ユーザーに GENERAL_MANAGER ロールを付与
                    // - 検索条件: PK = USER#{userId}, SK = "SHOP"
                    // - 更新カラム: roles (リストに "GENERAL_MANAGER" を追加)
                    // - 実行条件: 既にロールを持っていない場合のみ実行 (重複防止)
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `USER#${userId}`, SK: 'SHOP' },
                        UpdateExpression: 'SET #roles = list_append(if_not_exists(#roles, :empty_list), :gm_role_list)',
                        ConditionExpression: 'attribute_not_exists(#roles) OR NOT contains(#roles, :gm_role_str)',
                        ExpressionAttributeNames: { '#roles': 'roles' },
                        ExpressionAttributeValues: {
                            ':gm_role_list': ['GENERAL_MANAGER'],
                            ':gm_role_str': 'GENERAL_MANAGER',
                            ':empty_list': []
                        }
                    }));
                } catch (e: any) {
                    if (e.name !== 'ConditionalCheckFailedException') {
                        throw e;
                    }
                }
            }

            // 2. Update Shops
            for (const shopId of shopIds) {
                // 権限更新のため現在のショップ情報を取得
                // - 検索条件: PK = SHOP#{shopId}, SK = "METADATA"
                // - 取得カラム: owner_id, gm_ids
                const shopRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
                }));

                if (!shopRes.Item) continue;

                const ownerId = shopRes.Item.owner_id;
                const currentGmIds = shopRes.Item.gm_ids || [];

                // Filter out userIds that are the owner
                const userIdsToLink = userIds.filter(id => id !== ownerId);
                // Filter out userIds already in gm_ids
                const finalUserIdsToLink = userIdsToLink.filter(id => !currentGmIds.includes(id));

                if (finalUserIdsToLink.length > 0) {
                    // ショップのGMリストにユーザーIDを追加
                    // - 検索条件: PK = SHOP#{shopId}, SK = "METADATA"
                    // - 更新カラム: gm_ids (ユーザーIDリストを末尾に追加)
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' },
                        UpdateExpression: 'SET gm_ids = list_append(if_not_exists(gm_ids, :empty_list), :new_gm_list)',
                        ExpressionAttributeValues: {
                            ':new_gm_list': finalUserIdsToLink,
                            ':empty_list': []
                        }
                    }));
                }
            }

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Updates completed successfully' })
            };
        }

        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid action' })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: String(error) })
        };
    }
};
