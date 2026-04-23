/**
 * @file shop_owner_transfer.ts
 * @role ショップ用：オーナー権限譲渡ハンドラー
 * @responsibility
 *  - ショップの所有権（owner_id）を別のユーザーへ譲渡します。
 *  - 【オーナー限定】この操作は、現在のオーナー本人にのみ許可されます。
 *  - 【アトミック性】DynamoDB TransactWriteCommand を使用し、ショップ、旧オーナー、新オーナーの 3 つのレコード更新を同期的に実行します。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, USER_POOL_ID } from './share/db';
import { getShopId, getUserId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';
import { refreshMailingLists } from './utils/mailing-list';

const cognito = new CognitoIdentityProviderClient({});

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const userId = getUserId(event);
        const body = JSON.parse(event.body || '{}');
        const shopId = getShopId(event, body);
        const path = event.resource || event.path || '';

        if (!shopId) return errorResponse(400, 'Missing shopId');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // 権限検証: 対象ショップのオーナーであることを確認
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');
        if (shopMetadata.owner_id !== userId) return errorResponse(403, 'Forbidden: Only the owner can transfer ownership');

        const action = path.endsWith('/validate') ? 'validate' : 'execute';

        // --------------------------------------------------------------------
        // ACTION: validate (譲渡前の事前確認)
        // --------------------------------------------------------------------
        if (action === 'validate') {
            const { new_user_id } = body as ShopApiSchema['shop_owner_transfer_validate'];
            if (!new_user_id) return errorResponse(400, 'Missing new_user_id');

            const cleanNewUserId = new_user_id.replace(/^USER#/, '');

            // 新オーナー候補情報の取得
            const newUserRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${cleanNewUserId}`, SK: 'SHOP' } }));
            let newOwnerEmail = newUserRes.Item?.email;

            if (!newOwnerEmail) {
                try {
                    const cognitoRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: cleanNewUserId }));
                    newOwnerEmail = cognitoRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
                } catch (e) {
                    console.error(`Failed to fetch new user email: ${cleanNewUserId}`, e);
                    return errorResponse(404, 'New user not found');
                }
            }

            return successResponse({ 
                shopName: shopMetadata.name, 
                oldOwnerEmail: shopMetadata.email || 'Unknown', 
                newOwnerEmail: newOwnerEmail || 'Unknown' 
            });
        }

        // --------------------------------------------------------------------
        // ACTION: execute (権限譲渡の実行)
        // --------------------------------------------------------------------
        if (action === 'execute') {
            const { new_user_id } = body as ShopApiSchema['shop_owner_transfer_execute'];
            if (!new_user_id) return errorResponse(400, 'Missing new_user_id');

            const cleanNewUserId = new_user_id.replace(/^USER#/, '');
            const now = new Date().toISOString();

            if (userId === cleanNewUserId) return errorResponse(400, 'New owner is the same as the current owner');

            // 1. 新オーナーの情報を取得
            const newUserRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${cleanNewUserId}`, SK: 'SHOP' } }));
            let newUserEmail = newUserRes.Item?.email;
            if (!newUserEmail) {
                const cognitoRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: cleanNewUserId }));
                newUserEmail = cognitoRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
            }
            if (!newUserEmail) return errorResponse(400, 'Could not resolve new user email');

            // 2. トランザクション構築
            // 旧オーナーを管理者（GM）として残す設定
            const currentGmIds = shopMetadata.gm_ids || [];
            // 新オーナーがGMリストにいた場合は除外し、旧オーナーをGMリストに追加する
            const updatedGmIds = Array.from(new Set([...currentGmIds.filter((id: string) => id !== cleanNewUserId), userId]));

            const transactItems: any[] = [
                // 処理 A: ショップ情報の更新
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' },
                        UpdateExpression: 'SET owner_id = :new_id, GSI2_PK = :gsi_pk, GSI2_SK = :now, email = :email, gm_ids = :new_gm_ids, ts_updated_at = :now',
                        ExpressionAttributeValues: { ':new_id': cleanNewUserId, ':gsi_pk': `USER#${cleanNewUserId}`, ':now': now, ':email': newUserEmail, ':new_gm_ids': updatedGmIds }
                    }
                }
            ];

            // 処理 B: 旧オーナーのリスト更新 (オーナー -> 管理者へ)
            const oldUserRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${userId}`, SK: 'SHOP' } }));
            if (oldUserRes.Item) {
                const currentOwnerShops = oldUserRes.Item.owner_shop_ids || [];
                const updatedOwnerShops = currentOwnerShops.filter((id: string) => id !== shopId);
                
                const currentGmShops = oldUserRes.Item.gm_shop_ids || [];
                const updatedGmShops = Array.from(new Set([...currentGmShops, shopId]));

                const currentRoles = oldUserRes.Item.roles || [];
                const updatedRoles = Array.from(new Set([...currentRoles, 'SHOP_MANAGER', 'GENERAL_MANAGER']));

                transactItems.push({
                    Update: { 
                        TableName: TABLE_NAME, 
                        Key: { PK: `USER#${userId}`, SK: 'SHOP' }, 
                        UpdateExpression: 'SET owner_shop_ids = :new_owner_list, gm_shop_ids = :new_gm_list, #roles = :new_roles, ts_updated_at = :now',
                        ExpressionAttributeNames: { '#roles': 'roles' },
                        ExpressionAttributeValues: { ':new_owner_list': updatedOwnerShops, ':new_gm_list': updatedGmShops, ':new_roles': updatedRoles, ':now': now }
                    }
                });
            }

            // 処理 C: 新オーナーへの権限追加
            const newUserOwnerShops = newUserRes.Item?.owner_shop_ids || [];
            const newUserGmShops = newUserRes.Item?.gm_shop_ids || [];
            const updatedNewUserOwnerShops = Array.from(new Set([...newUserOwnerShops, shopId]));
            const updatedNewUserGmShops = newUserGmShops.filter((id: string) => id !== shopId);
            const roles = newUserRes.Item?.roles || [];
            const updatedNewUserRoles = Array.from(new Set([...roles, 'SHOP_MANAGER']));

            if (newUserRes.Item) {
                transactItems.push({
                    Update: { TableName: TABLE_NAME, Key: { PK: `USER#${cleanNewUserId}`, SK: 'SHOP' }, UpdateExpression: 'SET owner_shop_ids = :new_owner_list, gm_shop_ids = :new_gm_list, #roles = :new_roles, email = :email, ts_updated_at = :now', ExpressionAttributeNames: { '#roles': 'roles' }, ExpressionAttributeValues: { ':new_owner_list': updatedNewUserOwnerShops, ':new_gm_list': updatedNewUserGmShops, ':new_roles': updatedNewUserRoles, ':email': newUserEmail, ':now': now } }
                });
            } else {
                transactItems.push({
                    Put: { TableName: TABLE_NAME, Item: { PK: `USER#${cleanNewUserId}`, SK: 'SHOP', email: newUserEmail, roles: ['SHOP_MANAGER'], owner_shop_ids: [shopId], gm_shop_ids: [], ts_created_at: now, ts_updated_at: now } }
                });
            }

            // 実行
            await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));

            // メーリングリストの同期
            await refreshMailingLists(ddb, TABLE_NAME, shopId);

            return successResponse({ message: 'Owner transfer completed successfully' });
        }

        return errorResponse(400, 'Invalid action');

    } catch (error: any) {
        console.error('Shop owner transfer error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
