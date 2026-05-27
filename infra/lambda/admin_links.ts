/**
 * @file admin_links.ts
 * @role 管理者用：ショップ管理権限（GM）一括設定ハンドラー
 * @responsibility
 *  - 「オーナーではないが管理権限を持つユーザー（ゼネラルマネージャー / GM）」の一括紐付け・解除を管理します。
 *  - 【二重管理】以下の 2 つのレコードを同期的に更新します。
 *    1. ユーザーレコード (`USER#ID`, `SK:SHOP`): `gm_shop_ids` 配列にショップを追加し、`GENERAL_MANAGER` ロールを付与。
 *    2. ショップレコード (`SHOP#ID`, `SK:METADATA`): `gm_ids` 配列にユーザー ID を追加。
 *  - 【整合性フィルタ】既にオーナー権限を持つユーザーは GM リストから自動除外され、循環参照や権限の重複定義を防止します。
 * @context
 *  - 大規模ショップにおいて、店舗スタッフや委託先に管理画面へのアクセス権を付与する際に使用されます。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { successResponse, errorResponse, apiResponse } from './utils/response';
import { ddb, TABLE_NAME, USER_POOL_ID } from './share/db';
import { getUserId, getAction } from './utils/request';
import { AdminApiSchema } from '@shared/api-types';
import { refreshMailingLists } from './utils/mailing-list';

const cognito = new CognitoIdentityProviderClient({});

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const action = getAction(event, body);

        // --------------------------------------------------------------------
        // ACTION: validate (紐付け前の事前チェック)
        // --------------------------------------------------------------------
        // 目的: 指定された全てのユーザー ID とショップ ID が実在するかを確認し、存在しない ID が混じっている場合はエラーを返します。
        // --------------------------------------------------------------------
        if (action === 'validate') {
            let { shop_ids, user_ids } = body as AdminApiSchema['admin_links'];
            
            if (Array.isArray(shop_ids)) {
                shop_ids = Array.from(new Set(shop_ids.map(id => id.trim().replace(/^SHOP#/, '')))).filter(Boolean);
            }
            if (Array.isArray(user_ids)) {
                user_ids = Array.from(new Set(user_ids.map(id => id.trim().replace(/^USER#/, '')))).filter(Boolean);
            }

            if (!Array.isArray(shop_ids) || !Array.isArray(user_ids) || !action) {
                return errorResponse(400, 'Missing required fields: shop_ids, user_ids, action');
            }

            const userMetadataList = [];
            const shopMetadataList = [];
            const missingIds = [];

            // 1. ユーザーの存在確認
            for (const uid of user_ids) {
                const res = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${uid}`, SK: 'SHOP' }
                }));
                if (res.Item) {
                    userMetadataList.push({ id: uid, email: res.Item.email });
                } else {
                    // Fallback to Cognito if not found in DynamoDB (e.g. newly created user)
                    let cognitoEmail: string | undefined;
                    if (USER_POOL_ID) {
                        try {
                            const cognitoRes = await cognito.send(new AdminGetUserCommand({
                                UserPoolId: USER_POOL_ID,
                                Username: uid
                            }));
                            cognitoEmail = cognitoRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
                        } catch (e) {
                            console.warn(`Failed to fetch user from Cognito: ${uid}`, e);
                        }
                    }
                    if (cognitoEmail) {
                        userMetadataList.push({ id: uid, email: cognitoEmail });
                    } else {
                        missingIds.push(`USER#${uid}`);
                    }
                }
            }

            // 2. ショップの存在確認
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

            if (missingIds.length > 0) {
                return apiResponse(400, {
                    message: 'Some IDs not found',
                    error: 'Some IDs not found',
                    detail: 'Some IDs not found',
                    missingIds,
                    missingIdsFormatted: missingIds.join(', ')
                });
            }

            return successResponse({ users: userMetadataList, shops: shopMetadataList });
        }

        // --------------------------------------------------------------------
        // ACTION: execute (紐付けの実行)
        // --------------------------------------------------------------------
        // 目的: ユーザーとショップの双方向リンクを構築し、適切な管理ロールを付与します。
        // 備考: 複数エンティティの更新を含むため、各 ID ごとに UpdateItem を発行します。
        // --------------------------------------------------------------------
        if (action === 'execute') {
            let { shop_ids, user_ids } = body as AdminApiSchema['admin_links'];
            
            if (Array.isArray(shop_ids)) {
                shop_ids = Array.from(new Set(shop_ids.map(id => id.trim().replace(/^SHOP#/, '')))).filter(Boolean);
            }
            if (Array.isArray(user_ids)) {
                user_ids = Array.from(new Set(user_ids.map(id => id.trim().replace(/^USER#/, '')))).filter(Boolean);
            }

            if (!Array.isArray(shop_ids) || !Array.isArray(user_ids) || !action) {
                return errorResponse(400, 'Missing required fields: shop_ids, user_ids, action');
            }

            const now = new Date().toISOString();

            // 1. ユーザー側の更新 (全選択ユーザーに対してループ)
            for (const uid of user_ids) {
                const userRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${uid}`, SK: 'SHOP' } }));
                
                if (!userRes.Item) {
                    // ユーザーの最新のメールアドレスを取得（同期用）
                    let userEmail = null;
                    if (USER_POOL_ID) {
                        try {
                            const cognitoRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: uid }));
                            userEmail = cognitoRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
                        } catch (e) {
                            console.warn(`Failed to fetch email for GM user: ${uid}`, e);
                        }
                    }

                    // 既存のコード（admin_changeowner.tsなど）と同様に、PutCommandで標準レコードを新規作成
                    await ddb.send(new PutCommand({
                        TableName: TABLE_NAME,
                        Item: {
                            PK: `USER#${uid}`,
                            SK: 'SHOP',
                            email: userEmail || null,
                            roles: ['SHOP_MANAGER', 'GENERAL_MANAGER'],
                            owner_shop_ids: [],
                            gm_shop_ids: shop_ids,
                            ts_created_at: now,
                            ts_updated_at: now
                        }
                    }));
                } else {
                    const ownerShopIds = userRes.Item.owner_shop_ids || [];
                    const currentGmShopIds = userRes.Item.gm_shop_ids || [];

                    // フィルタ: 既にオーナー権限を持っている、または既に GM であるショップはスキップ
                    const finalShopIdsToLink = shop_ids.filter(id => !ownerShopIds.includes(id) && !currentGmShopIds.includes(id));

                    if (finalShopIdsToLink.length > 0) {
                        // ユーザーの最新のメールアドレスを取得（同期用）
                        let userEmail = userRes.Item.email;
                        if (!userEmail && USER_POOL_ID) {
                            try {
                                const cognitoRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: uid }));
                                userEmail = cognitoRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
                            } catch (e) {
                                console.warn(`Failed to fetch email for GM user: ${uid}`, e);
                            }
                        }

                        // GM 管理対象リストへのアペンド
                        await ddb.send(new UpdateCommand({
                            TableName: TABLE_NAME,
                            Key: { PK: `USER#${uid}`, SK: 'SHOP' },
                            UpdateExpression: 'SET gm_shop_ids = list_append(if_not_exists(gm_shop_ids, :empty_list), :new_shop_list), email = :email, ts_updated_at = :now',
                            ExpressionAttributeValues: { ':new_shop_list': finalShopIdsToLink, ':empty_list': [], ':email': userEmail || null, ':now': now }
                        }));
                    }

                    // 「GENERAL_MANAGER」ロールの条件付き付与
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
                        // 既にロールを持っている場合は ConditionalCheckFailedException が発生するが、問題ないので無視する
                        if (e.name !== 'ConditionalCheckFailedException') throw e;
                    }
                }
            }

            // 2. ショップ側の更新 (全選択ショップに対してループ)
            for (const sid of shop_ids) {
                const shopRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${sid}`, SK: 'METADATA' } }));
                if (!shopRes.Item) continue;

                const ownerId = shopRes.Item.owner_id;
                const currentGmIds = shopRes.Item.gm_ids || [];

                // フィルタ: オーナー自身を GM リストに加えない
                const finalUserIdsToLink = user_ids.filter(id => id !== ownerId && !currentGmIds.includes(id));

                if (finalUserIdsToLink.length > 0) {
                    // GM ID リストのリモートアペンド
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `SHOP#${sid}`, SK: 'METADATA' },
                        UpdateExpression: 'SET gm_ids = list_append(if_not_exists(gm_ids, :empty_list), :new_gm_list)',
                        ExpressionAttributeValues: { ':new_gm_list': finalUserIdsToLink, ':empty_list': [] }
                    }));
                }
                
                // メーリングリストの同期（新規追加時には既存リストにはいないが、整合性のために実行）
                await refreshMailingLists(ddb, TABLE_NAME, sid);
            }

            return successResponse({ message: 'Updates completed successfully' });
        }

        // --------------------------------------------------------------------
        // ACTION: unlink (紐付けの解除)
        // --------------------------------------------------------------------
        // 目的: ユーザーとショップの双方向リンクを削除し、必要に応じて管理ロールを剥奪します。
        // --------------------------------------------------------------------
        if (action === 'unlink') {
            let { shop_ids, user_ids } = body as AdminApiSchema['admin_links'];
            
            if (Array.isArray(shop_ids)) {
                shop_ids = Array.from(new Set(shop_ids.map(id => id.trim().replace(/^SHOP#/, '')))).filter(Boolean);
            }
            if (Array.isArray(user_ids)) {
                user_ids = Array.from(new Set(user_ids.map(id => id.trim().replace(/^USER#/, '')))).filter(Boolean);
            }

            if (!Array.isArray(shop_ids) || !Array.isArray(user_ids) || !action) {
                return errorResponse(400, 'Missing required fields: shop_ids, user_ids, action');
            }

            const now = new Date().toISOString();

            // 1. ユーザー側の更新 (全選択ユーザーに対してループ)
            // 目的: ユーザーの GM 対象ショップリストから指定されたショップを削除。
            // 全ての管理対象ショップがなくなった場合、GM ロール自体も剥奪します。
            for (const uid of user_ids) {
                const userRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${uid}`, SK: 'SHOP' } }));
                if (!userRes.Item) continue;

                const currentGmShopIds = userRes.Item.gm_shop_ids || [];
                // 指定されたショップを除外
                const newGmShopIds = currentGmShopIds.filter((id: string) => !shop_ids.includes(id));

                if (currentGmShopIds.length !== newGmShopIds.length) {
                    // ID リストの更新
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `USER#${uid}`, SK: 'SHOP' },
                        UpdateExpression: 'SET gm_shop_ids = :new_list, ts_updated_at = :now',
                        ExpressionAttributeValues: { ':new_list': newGmShopIds, ':now': now }
                    }));
                }

                // 「GENERAL_MANAGER」ロールの剥奪判定
                // 管理対象が一つもなくなった場合、権限としてのロールフラグを削除します（フールプルーフ）。
                if (newGmShopIds.length === 0) {
                    const currentRoles = userRes.Item.roles || [];
                    if (currentRoles.includes('GENERAL_MANAGER')) {
                        const newRoles = currentRoles.filter((r: string) => r !== 'GENERAL_MANAGER');
                        await ddb.send(new UpdateCommand({
                            TableName: TABLE_NAME,
                            Key: { PK: `USER#${uid}`, SK: 'SHOP' },
                            UpdateExpression: 'SET #roles = :new_roles',
                            ExpressionAttributeNames: { '#roles': 'roles' },
                            ExpressionAttributeValues: { ':new_roles': newRoles }
                        }));
                    }
                }
            }

            // 2. ショップ側の更新 (全選択ショップに対してループ)
            // 目的: ショップの権限者（gm_ids）リストから指定されたユーザーを削除します。
            for (const sid of shop_ids) {
                const shopRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${sid}`, SK: 'METADATA' } }));
                if (!shopRes.Item) continue;

                const currentGmIds = shopRes.Item.gm_ids || [];
                // 指定されたユーザーを除外
                const newGmIds = currentGmIds.filter((id: string) => !user_ids.includes(id));

                if (currentGmIds.length !== newGmIds.length) {
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `SHOP#${sid}`, SK: 'METADATA' },
                        UpdateExpression: 'SET gm_ids = :new_list',
                        ExpressionAttributeValues: { ':new_list': newGmIds }
                    }));
                }

                // メーリングリストの同期（除名されたユーザーをリストから排除）
                await refreshMailingLists(ddb, TABLE_NAME, sid);
            }

            return successResponse({ message: 'Unlinking completed successfully' });
        }

        return errorResponse(400, 'Invalid action');

    } catch (error: any) {
        console.error('Admin links error:', error);
        return errorResponse(500, "Internal Server Error", error.message);
    }
};
