/**
 * 概要: ショップオーナー権限の譲渡（管理者用）
 * 詳細:
 *  - 特定のショップ（SHOP#METADATA）の所有者（owner_id）を別のユーザーへ変更します。
 *  - この操作はデータの不整合を防ぐため、DynamoDBの「トランザクション」(TransactWriteCommand)を使用してアトミックに実行します。
 *  - 以下の3つの処理を同期的・不可分に実行します。
 *    1. ショップ側の「現在のオーナーID」と「参照用インデックス(GSI2)」を新オーナーのものに書き換え。
 *    2. 旧オーナー側の「所有ショップリスト(owner_shop_ids)」から当該ショップIDを削除し、必要に応じてロール(SHOP_MANAGER)を剥奪。
 *    3. 新オーナー側の「所有ショップリスト」へ当該ショップIDを追加し、ロール(SHOP_MANAGER)を付与。
 *
 * エンドポイント: POST /admin/changeowner
 * リクエストボディ:
 *  - shopId (string): 対象ショップID (必須)
 *  - newUserId (string): 譲渡先のユーザーUUID (必須)
 *  - action (string): "validate" (事前確認) | "execute" (実行) (必須)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, USER_POOL_ID } from './share/db';
import { getShopId, getUserId, getAction } from './utils/request';

const cognito = new CognitoIdentityProviderClient({});

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // CORSプリフライトへの即時対応
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const shopId = getShopId(event, body);
        const action = getAction(event, body);
        const { newUserId } = body;

        // 必須項目のチェック
        if (!shopId || !newUserId || !action) {
            return errorResponse(400, 'Missing required fields: shopId, newUserId, action');
        }

        // 接頭辞(SHOP#, USER#)が混在していても正常に動作するよう正規化
        const cleanShopId = shopId.replace(/^SHOP#/, '');
        const cleanNewUserId = newUserId.replace(/^USER#/, '');

        // ====================================================================
        // ACTION: validate (オーナー変更の事前確認)
        // --------------------------------------------------------------------
        // 目的: 現在のオーナーと新オーナーの情報を取得し、不整合がないか確認します。
        // ====================================================================
        if (action === 'validate') {
            /**
             * 【ステップ1: ショップ情報の取得】
             * 指定ショップの現在のオーナーID(oldOwnerId)とショップ名(shopName)を確認。
             */
            const shopRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${cleanShopId}`, SK: 'METADATA' }
            }));

            if (!shopRes.Item) return errorResponse(404, 'Shop not found');
            const currentOwnerId = shopRes.Item.owner_id;
            const shopName = shopRes.Item.name;

            /**
             * 【ステップ2: 旧オーナーの連絡先取得】
             * Cognitoからメールアドレスを取得（表示用）。
             */
            let oldOwnerEmail = 'Unknown';
            try {
                const oldUserRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: currentOwnerId }));
                oldOwnerEmail = oldUserRes.UserAttributes?.find(a => a.Name === 'email')?.Value || 'Unknown';
            } catch (e) {
                console.warn(`Failed to fetch old owner email: ${currentOwnerId}`, e);
            }

            /**
             * 【ステップ3: 新オーナー候補の確認】
             * Cognitoからメールアドレスを取得。新オーナーが存在しない場合は権限譲渡不可。
             */
            const newUserRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${cleanNewUserId}`, SK: 'SHOP' } }));
            let newOwnerEmail = newUserRes.Item?.email;

            if (!newOwnerEmail) {
                try {
                    const cognitoRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: cleanNewUserId }));
                    newOwnerEmail = cognitoRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
                } catch (e) {
                    console.error(`Failed to fetch new user email: ${cleanNewUserId}`, e);
                    return errorResponse(404, 'New user not found in Cognito');
                }
            }

            return successResponse({ shopName, oldOwnerEmail, newOwnerEmail: newOwnerEmail || 'Unknown' });
        }

        // ====================================================================
        // ACTION: execute (オーナー変更の実行)
        // --------------------------------------------------------------------
        // 目的: 複数テーブルの整合性を保ちつつ、オーナー権限を一括譲渡します。
        // ====================================================================
        if (action === 'execute') {
            const now = new Date().toISOString();

            /**
             * 1. 現在のショップ状態を再取得
             */
            const shopRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${cleanShopId}`, SK: 'METADATA' } }));
            if (!shopRes.Item) return errorResponse(404, 'Shop not found');

            const oldOwnerId = shopRes.Item.owner_id;
            const currentGmIds = shopRes.Item.gm_ids || [];
            const updatedGmIds = currentGmIds.filter((id: string) => id !== cleanNewUserId);

            if (oldOwnerId === cleanNewUserId) return errorResponse(400, 'New owner is the same as the current owner');

            /**
             * 2. 新オーナー候補の解決
             */
            const newUserRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${cleanNewUserId}`, SK: 'SHOP' } }));
            let newUserEmail = newUserRes.Item?.email;
            if (!newUserEmail) {
                const cognitoRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: cleanNewUserId }));
                newUserEmail = cognitoRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
            }
            if (!newUserEmail) return errorResponse(400, 'Could not resolve new user email');

            /**
             * 3. 旧オーナーの現在情報の取得
             */
            const oldUserRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${oldOwnerId}`, SK: 'SHOP' } }));

            /**
             * 4. トランザクション・バッチの構築 (TransactWriteCommand)
             */
            const transactItems: any[] = [
                /**
                 * 【処理A: ショップメタデータの所有権更新】
                 */
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `SHOP#${cleanShopId}`, SK: 'METADATA' },
                        UpdateExpression: 'SET owner_id = :new_id, GSI2_PK = :gsi_pk, email = :email, gm_ids = :new_gm_ids, ts_updated_at = :now',
                        ExpressionAttributeValues: { ':new_id': cleanNewUserId, ':gsi_pk': `USER#${cleanNewUserId}`, ':email': newUserEmail, ':new_gm_ids': updatedGmIds, ':now': now }
                    }
                }
            ];

            /**
             * 【処理B: 旧オーナーの権限剥奪】
             */
            if (oldUserRes.Item) {
                const currentOwnerShops = oldUserRes.Item.owner_shop_ids || [];
                const updatedOwnerShops = currentOwnerShops.filter((id: string) => id !== cleanShopId);
                let updateExpr = 'SET owner_shop_ids = :new_list, ts_updated_at = :now';
                const attrValues: any = { ':new_list': updatedOwnerShops, ':now': now };
                const attrNames: any = {};

                if (updatedOwnerShops.length === 0) {
                    const roles = oldUserRes.Item.roles || [];
                    const updatedRoles = roles.filter((r: string) => r !== 'SHOP_MANAGER');
                    updateExpr += ', #roles = :new_roles';
                    attrValues[':new_roles'] = updatedRoles;
                    attrNames['#roles'] = 'roles';
                }
                transactItems.push({
                    Update: { TableName: TABLE_NAME, Key: { PK: `USER#${oldOwnerId}`, SK: 'SHOP' }, UpdateExpression: updateExpr, ExpressionAttributeNames: Object.keys(attrNames).length > 0 ? attrNames : undefined, ExpressionAttributeValues: attrValues }
                });
            }

            /**
             * 【処理C: 新オーナーへの権限付与】
             */
            const newUserOwnerShops = newUserRes.Item?.owner_shop_ids || [];
            const newUserGmShops = newUserRes.Item?.gm_shop_ids || [];
            const updatedNewUserOwnerShops = Array.from(new Set([...newUserOwnerShops, cleanShopId]));
            const updatedNewUserGmShops = newUserGmShops.filter((id: string) => id !== cleanShopId);
            const roles = newUserRes.Item?.roles || [];
            const updatedNewUserRoles = Array.from(new Set([...roles, 'SHOP_MANAGER']));

            if (newUserRes.Item) {
                transactItems.push({
                    Update: { TableName: TABLE_NAME, Key: { PK: `USER#${cleanNewUserId}`, SK: 'SHOP' }, UpdateExpression: 'SET owner_shop_ids = :new_owner_list, gm_shop_ids = :new_gm_list, #roles = :new_roles, ts_updated_at = :now', ExpressionAttributeNames: { '#roles': 'roles' }, ExpressionAttributeValues: { ':new_owner_list': updatedNewUserOwnerShops, ':new_gm_list': updatedNewUserGmShops, ':new_roles': updatedNewUserRoles, ':now': now } }
                });
            } else {
                transactItems.push({
                    Put: { TableName: TABLE_NAME, Item: { PK: `USER#${cleanNewUserId}`, SK: 'SHOP', email: newUserEmail, roles: ['SHOP_MANAGER'], owner_shop_ids: [cleanShopId], gm_shop_ids: [], ts_created_at: now, ts_updated_at: now } }
                });
            }

            /**
             * トランザクションの実行。いずれかの処理が失敗すれば、全てがロールバックされます。
             */
            await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));

            return successResponse({ message: 'Owner changed successfully' });
        }

        return errorResponse(400, 'Invalid action');

    } catch (error: any) {
        console.error('Change owner error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
}
