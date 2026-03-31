/**
 * 概要: 新規ショップの作成 (管理者用)
 * 詳細: 
 *  - 指定されたオーナーIDに対して新しいショップメタデータを生成し、管理権限を割り当てます。
 *  - オーナーおよび指定されたGMユーザーの権限管理レコード(PK=USER#{id}, SK=SHOP)を更新・初期化します。
 *
 * エンドポイント: POST /admin/shop/create
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { generateId } from './utils/id';
import { successResponse, errorResponse, apiResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        const body = JSON.parse(event.body || '{}');
        const { owner_id, name, email, gm_ids } = body;
        
        if (!owner_id || !name) return errorResponse(400, 'Missing owner_id or name');

        const newShopId = generateId();
        const now = new Date().toISOString();
        const gm_idslist = Array.isArray(gm_ids) ? gm_ids : [];

        // 【DB操作: PutItem (SHOP METADATA)】
        // 理由: ショップの基本属性(名前、メアド、オーナーID)を保存。
        // GSI2_PK/SKにより、ユーザーIDからのショップ逆引きを可能にします。
        await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: `SHOP#${newShopId}`, SK: 'METADATA',
                name, email, owner_id, gm_ids: gm_idslist,
                GSI2_PK: `USER#${owner_id}`, GSI2_SK: now,
                ts_created_at: now, ts_updated_at: now
            }
        }));

        // 【DB操作: UpdateItem (OWNER)】
        // 理由: オーナーの所有ショップリスト(owner_shop_ids)に新ショップIDを追加。
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${owner_id}`, SK: 'SHOP' },
            UpdateExpression: 'SET owner_shop_ids = list_append(if_not_exists(owner_shop_ids, :empty_list), :new_shop_list), ts_updated_at = :now',
            ExpressionAttributeValues: { ':new_shop_list': [newShopId], ':empty_list': [], ':now': now }
        }));

        // 【DB操作: UpdateItem (GM)】
        // 理由: 各GMユーザーの管理ショップリスト(gm_shop_ids)に新ショップIDを追加し、ロールを付与。
        for (const gmid of gm_idslist) {
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${gmid}`, SK: 'SHOP' },
                UpdateExpression: 'SET gm_shop_ids = list_append(if_not_exists(gm_shop_ids, :empty_list), :new_shop_list), ts_updated_at = :now',
                ExpressionAttributeValues: { ':new_shop_list': [newShopId], ':empty_list': [], ':now': now }
            }));

            // ロールの付与(未付与の場合のみ)
            try {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${gmid}`, SK: 'SHOP' },
                    UpdateExpression: 'SET #roles = list_append(if_not_exists(#roles, :empty_list), :gm_role_list)',
                    ConditionExpression: 'attribute_not_exists(#roles) OR NOT contains(#roles, :gm_role_str)',
                    ExpressionAttributeNames: { '#roles': 'roles' },
                    ExpressionAttributeValues: { ':gm_role_list': ['GENERAL_MANAGER'], ':gm_role_str': 'GENERAL_MANAGER', ':empty_list': [] }
                }));
            } catch (e: any) {
                if (e.name !== 'ConditionalCheckFailedException') throw e;
            }
        }

        return apiResponse(201, { shop_id: newShopId, message: 'Shop created' });

    } catch (error: any) {
        console.error('Admin shop create error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
