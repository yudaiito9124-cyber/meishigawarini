/**
 * 概要: ショップのオーナー権限を別のユーザーに移譲する。
 * 詳細: オーナー変更の検証（バリデーション）と、DynamoDBトランザクションを用いたアトミックな権限更新（旧オーナーからの剥奪と新オーナーへの付与）を実行する。
 * エンドポイント: POST /admin/changeowner
 * リクエストボディ:
 *  - shopId: 対象ショップのUUID
 *  - newUserId: 新オーナーのユーザーUUID
 *  - action: "validate" (確認のみ) | "execute" (実行)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const USER_POOL_ID = process.env.USER_POOL_ID || '';

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
        const { shopId, newUserId, action } = body;

        if (!shopId || !newUserId || !action) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Missing required fields: shopId, newUserId, action' })
            };
        }

        const cleanShopId = shopId.replace(/^SHOP#/, '');
        const cleanNewUserId = newUserId.replace(/^USER#/, '');

        if (action === 'validate') {
            // ショップのメタデータを取得
            // - 検索条件: PK = SHOP#{shopId}, SK = "METADATA"
            // - 取得カラム: owner_id (現在のオーナーID), name (ショップ名) 等の全属性
            const shopRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${cleanShopId}`, SK: 'METADATA' }
            }));
            // End: Fetch Shop Metadata

            if (!shopRes.Item) {
                return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Shop not found' }) };
            }

            const currentOwnerId = shopRes.Item.owner_id;
            const shopName = shopRes.Item.name;

            // 2. Fetch Old Owner Email (from Cognito)
            let oldOwnerEmail = 'Unknown';
            try {
                const oldUserRes = await cognito.send(new AdminGetUserCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: currentOwnerId
                }));
                oldOwnerEmail = oldUserRes.UserAttributes?.find(a => a.Name === 'email')?.Value || 'Unknown';
            } catch (e) {
                console.warn(`Failed to fetch old owner email: ${currentOwnerId}`, e);
            }

            // 3. Fetch New User Info (from DB first, then Cognito)
            // 新しいオーナー候補のユーザー情報を取得
            // - 検索条件: PK = USER#{userId}, SK = "SHOP"
            // - 取得カラム: email (存在する場合)
            const newUserRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${cleanNewUserId}`, SK: 'SHOP' }
            }));

            let newOwnerEmail = newUserRes.Item?.email;

            if (!newOwnerEmail) {
                try {
                    const cognitoRes = await cognito.send(new AdminGetUserCommand({
                        UserPoolId: USER_POOL_ID,
                        Username: cleanNewUserId
                    }));
                    newOwnerEmail = cognitoRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
                } catch (e) {
                    console.error(`Failed to fetch new user email: ${cleanNewUserId}`, e);
                    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'New user not found in Cognito' }) };
                }
            }

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    shopName,
                    oldOwnerEmail,
                    newOwnerEmail: newOwnerEmail || 'Unknown'
                })
            };
        }

        if (action === 'execute') {
            const now = new Date().toISOString();

            // 1. Fetch current data for atomic update logic
            // トランザクション実行前の最新状態を確認するため、ショップのメタデータを再取得
            // - 検索条件: PK = SHOP#{shopId}, SK = "METADATA"
            // - 取得カラム: owner_id, gm_ids
            const shopRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${cleanShopId}`, SK: 'METADATA' }
            }));
            if (!shopRes.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Shop not found' }) };

            const oldOwnerId = shopRes.Item.owner_id;
            const currentGmIds = shopRes.Item.gm_ids || [];
            const updatedGmIds = currentGmIds.filter((id: string) => id !== cleanNewUserId);

            if (oldOwnerId === cleanNewUserId) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'New owner is the same as the current owner' }) };
            }

            const newUserRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${cleanNewUserId}`, SK: 'SHOP' }
            }));

            // New user might not exist in our table yet, but we need their email for the shop record
            let newUserEmail = newUserRes.Item?.email;
            if (!newUserEmail) {
                const cognitoRes = await cognito.send(new AdminGetUserCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: cleanNewUserId
                }));
                newUserEmail = cognitoRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
            }

            if (!newUserEmail) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Could not resolve new user email' }) };
            }

            // 旧オーナーのユーザー情報を取得
            // - 検索条件: PK = USER#{oldOwnerId}, SK = "SHOP"
            // - 取得カラム: owner_shop_ids, roles
            const oldUserRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${oldOwnerId}`, SK: 'SHOP' }
            }));

            // Prepare Transaction
            const transactItems: any[] = [
                // 1. ショップのメタデータを更新
                // - 検索条件: PK = SHOP#{shopId}, SK = "METADATA"
                // - 更新カラム: 
                //   - owner_id: 新オーナーのUUID
                //   - GSI2_PK: 新オーナーに紐付けるためのインデックスキー
                //   - email: 新オーナーのメールアドレス
                //   - gm_ids: 新オーナーがGMだった場合、リストから除外
                //   - ts_updated_at: 現在時刻
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `SHOP#${cleanShopId}`, SK: 'METADATA' },
                        UpdateExpression: 'SET owner_id = :new_id, GSI2_PK = :gsi_pk, email = :email, gm_ids = :new_gm_ids, ts_updated_at = :now',
                        ExpressionAttributeValues: {
                            ':new_id': cleanNewUserId,
                            ':gsi_pk': `USER#${cleanNewUserId}`,
                            ':email': newUserEmail,
                            ':new_gm_ids': updatedGmIds,
                            ':now': now
                        }
                    }
                }
            ];

            // 2. Update Old Owner (if exists in our table)
            if (oldUserRes.Item) {
                const currentOwnerShops = oldUserRes.Item.owner_shop_ids || [];
                const updatedOwnerShops = currentOwnerShops.filter((id: string) => id !== cleanShopId);

                let updateExpr = 'SET owner_shop_ids = :new_list, ts_updated_at = :now';
                const attrValues: any = {
                    ':new_list': updatedOwnerShops,
                    ':now': now
                };
                const attrNames: any = {};

                if (updatedOwnerShops.length === 0) {
                    // Logic to remove SHOP_MANAGER role if it's the last shop
                    const roles = oldUserRes.Item.roles || [];
                    const updatedRoles = roles.filter((r: string) => r !== 'SHOP_MANAGER');
                    updateExpr += ', #roles = :new_roles';
                    attrValues[':new_roles'] = updatedRoles;
                    attrNames['#roles'] = 'roles';
                }

                // 2. 旧オーナーのユーザー項目を更新（権限剥奪）
                // - 検索条件: PK = USER#{oldOwnerId}, SK = "SHOP"
                // - 更新カラム:
                //   - owner_shop_ids: 当該ショップを除外したリスト
                //   - roles: 他に所有ショップがない場合、SHOP_MANAGERロールを削除
                //   - ts_updated_at: 現在時刻
                transactItems.push({
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `USER#${oldOwnerId}`, SK: 'SHOP' },
                        UpdateExpression: updateExpr,
                        ExpressionAttributeNames: Object.keys(attrNames).length > 0 ? attrNames : undefined,
                        ExpressionAttributeValues: attrValues
                    }
                });
            }

            // 3. Update New Owner
            const newUserOwnerShops = newUserRes.Item?.owner_shop_ids || [];
            const newUserGmShops = newUserRes.Item?.gm_shop_ids || [];

            // Add to owner_shop_ids if not already there
            const updatedNewUserOwnerShops = Array.from(new Set([...newUserOwnerShops, cleanShopId]));
            // Remove from gm_shop_ids if present
            const updatedNewUserGmShops = newUserGmShops.filter((id: string) => id !== cleanShopId);

            const roles = newUserRes.Item?.roles || [];
            const updatedNewUserRoles = Array.from(new Set([...roles, 'SHOP_MANAGER']));

            if (newUserRes.Item) {
                // Update existing user
                // 3. 新オーナーのユーザー項目を更新（権限付与）
                // - 検索条件: PK = USER#{newUserId}, SK = "SHOP"
                // - 更新カラム:
                //   - owner_shop_ids: 当該ショップを追加したリスト
                //   - gm_shop_ids: ショップがGMリストにある場合、除外
                //   - roles: SHOP_MANAGERロールを確実に追加
                //   - ts_updated_at: 現在時刻
                transactItems.push({
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `USER#${cleanNewUserId}`, SK: 'SHOP' },
                        UpdateExpression: 'SET owner_shop_ids = :new_owner_list, gm_shop_ids = :new_gm_list, #roles = :new_roles, ts_updated_at = :now',
                        ExpressionAttributeNames: { '#roles': 'roles' },
                        ExpressionAttributeValues: {
                            ':new_owner_list': updatedNewUserOwnerShops,
                            ':new_gm_list': updatedNewUserGmShops,
                            ':new_roles': updatedNewUserRoles,
                            ':now': now
                        }
                    }
                });
            } else {
                // Create new user record
                // 3. 新オーナーのユーザー項目が未存在の場合、新規作成（権限付与）
                // - PK: USER#{newUserId}, SK: "SHOP"
                // - 作成カラム: email, roles: ["SHOP_MANAGER"], owner_shop_ids: [shopId], ts_created_at, ts_updated_at
                transactItems.push({
                    Put: {
                        TableName: TABLE_NAME,
                        Item: {
                            PK: `USER#${cleanNewUserId}`,
                            SK: 'SHOP',
                            email: newUserEmail,
                            roles: ['SHOP_MANAGER'],
                            owner_shop_ids: [cleanShopId],
                            gm_shop_ids: [],
                            ts_created_at: now,
                            ts_updated_at: now
                        }
                    }
                });
            }

            // これまでの更新・作成リクエストを１つのアトミックなトランザクションとして実行
            await ddb.send(new TransactWriteCommand({
                TransactItems: transactItems
            }));

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Owner changed successfully' })
            };
        }

        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };

    } catch (error: any) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: `Internal Server Error: ${error.message || 'Unknown error'}`,
                error: String(error),
                stack: error.stack,
                code: error.code,
                name: error.name
            })
        };
    }
}
