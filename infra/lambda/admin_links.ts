/**
 * 概要: ショップ管理権限（GM）の一括付与・削除（管理者用）
 * 詳細: 
 *  - 複数のユーザーを複数のショップに対し、同時に「ゼネラルマネージャー（GM）」として紐付けます。
 *  - ユーザー側レコード（USER#SHOP）の gm_shop_ids リストを更新。
 *  - ショップ側レコード（SHOP#METADATA）の gm_ids リストを更新。
 *  - ユーザーに「GENERAL_MANAGER」ロールを自動付与。
 *  - 既にオーナーである場合はGMとしては追加しないよう自動フィルタリング。
 *
 * エンドポイント: POST /admin/links
 * リクエストボディ:
 *  - shopIds (string[]): 紐付け対象のショップID配列
 *  - userIds (string[]): 紐付け対象のユーザーID配列
 *  - action (string): "validate" (事前チェック) | "execute" (実行)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getUserId, getAction } from './utils/request';
import { AdminApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // CORSプリフライトへの即時対応
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const action = getAction(event, body);

        if (action === 'validate') {
            let { shop_ids, user_ids } = body as AdminApiSchema['admin_links'];
            
            // リクエストデータのクリーンアップ（重複除去）
            if (Array.isArray(shop_ids)) shop_ids = Array.from(new Set(shop_ids));
            if (Array.isArray(user_ids)) user_ids = Array.from(new Set(user_ids));

            // 必須チェック
            if (!Array.isArray(shop_ids) || !Array.isArray(user_ids) || !action) {
                return errorResponse(400, 'Missing required fields: shop_ids, user_ids, action');
            }

            const userMetadataList = [];
            const shopMetadataList = [];
            const missingIds = [];

            /**
             * 【ユーザーの存在確認】
             */
            for (const uid of user_ids) {
                const res = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${uid}`, SK: 'SHOP' }
                }));
                if (res.Item) {
                    userMetadataList.push({ id: uid, email: res.Item.email });
                } else {
                    missingIds.push(`USER#${uid}`);
                }
            }

            /**
             * 【ショップの存在確認】
             */
            for (const sid of shop_ids) {
                const res = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `SHOP#${sid}`, SK: 'METADATA' }
                }));
                if (res.Item) {
                    shopMetadataList.push({ id: sid, name: res.Item.name, owner_id: res.Item.owner_id, email: res.Item.email });
                } else {
                    missingIds.push(`SHOP#${sid}`);
                }
            }

            // 一つでも存在しないIDがあればエラー
            if (missingIds.length > 0) {
                return errorResponse(400, 'Some IDs not found', { missingIds, missingIdsFormatted: missingIds.join(', ') });
            }

            return successResponse({ users: userMetadataList, shops: shopMetadataList });
        }

        // ====================================================================
        // ACTION: execute (紐付けの実行)
        // --------------------------------------------------------------------
        // 目的: ユーザーとショップの双方向リンクをUpdateItemで構築します。
        // ====================================================================
        if (action === 'execute') {
            let { shop_ids, user_ids } = body as AdminApiSchema['admin_links'];
            
            // リクエストデータのクリーンアップ（重複除去）
            if (Array.isArray(shop_ids)) shop_ids = Array.from(new Set(shop_ids));
            if (Array.isArray(user_ids)) user_ids = Array.from(new Set(user_ids));

            // 必須チェック
            if (!Array.isArray(shop_ids) || !Array.isArray(user_ids) || !action) {
                return errorResponse(400, 'Missing required fields: shop_ids, user_ids, action');
            }

            const now = new Date().toISOString();

            /**
             * 【1. ユーザー側の更新】
             * ユーザープロフィールにGM管理下のショップIDを追加し、ロールを付与します。
             */
            for (const uid of user_ids) {
                const userRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${uid}`, SK: 'SHOP' } }));
                if (!userRes.Item) continue;

                const ownerShopIds = userRes.Item.owner_shop_ids || [];
                const currentGmShopIds = userRes.Item.gm_shop_ids || [];

                // 既にオーナーであるショップはリンク対象から除外
                const finalShopIdsToLink = shop_ids.filter(id => !ownerShopIds.includes(id) && !currentGmShopIds.includes(id));

                if (finalShopIdsToLink.length > 0) {
                    // ショップIDを配列(list_append)に追加
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `USER#${uid}`, SK: 'SHOP' },
                        UpdateExpression: 'SET gm_shop_ids = list_append(if_not_exists(gm_shop_ids, :empty_list), :new_shop_list), ts_updated_at = :now',
                        ExpressionAttributeValues: { ':new_shop_list': finalShopIdsToLink, ':empty_list': [], ':now': now }
                    }));
                }

                // 「GENERAL_MANAGER」ロールの付与（重複防止のConditionExpression付き）
                try {
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `USER#${uid}`, SK: 'SHOP' },
                        UpdateExpression: 'SET #roles = list_append(if_not_exists(#roles, :empty_list), :gm_role_list)',
                        ConditionExpression: 'attribute_not_exists(#roles) OR NOT contains(#roles, :gm_role_str)',
                        ExpressionAttributeNames: { '#roles': 'roles' },
                        ExpressionAttributeValues: { ':gm_role_list': ['GENERAL_MANAGER'], ':gm_role_str': 'GENERAL_MANAGER', ':empty_list': [] }
                    }));
                } catch (e: any) {
                    if (e.name !== 'ConditionalCheckFailedException') throw e;
                }
            }

            /**
             * 【2. ショップ側の更新】
             * ショップ側の管理メタデータに、所属するGMのユーザーIDを追加します。
             */
            for (const sid of shop_ids) {
                const shopRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${sid}`, SK: 'METADATA' } }));
                if (!shopRes.Item) continue;

                const ownerId = shopRes.Item.owner_id;
                const currentGmIds = shopRes.Item.gm_ids || [];

                // オーナー自身をGMには登録しないようにフィルタリング
                const finalUserIdsToLink = user_ids.filter(id => id !== ownerId && !currentGmIds.includes(id));

                if (finalUserIdsToLink.length > 0) {
                    // GM IDを配列に追加
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `SHOP#${sid}`, SK: 'METADATA' },
                        UpdateExpression: 'SET gm_ids = list_append(if_not_exists(gm_ids, :empty_list), :new_gm_list)',
                        ExpressionAttributeValues: { ':new_gm_list': finalUserIdsToLink, ':empty_list': [] }
                    }));
                }
            }

            return successResponse({ message: 'Updates completed successfully' });
        }

        return errorResponse(400, 'Invalid action');

    } catch (error: any) {
        console.error('Admin links error:', error);
        return errorResponse(500, "Internal Server Error", error.message);
    }
};
