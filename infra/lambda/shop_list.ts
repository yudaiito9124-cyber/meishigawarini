/**
 * @file shop_list.ts
 * @role ショップ用：所属ショップ一覧取得（ダッシュボード入り口）
 * @responsibility
 *  - ログイン中のユーザーが管理権限を持つショップの一覧を返却します。
 *  - 【権限管理の二層構造】
 *    1. `USER#${userId} / SHOP`: ユーザーに紐付くショップ ID リストを保持（高速な一覧取得用）。
 *    2. `SHOP#${shopId} / METADATA`: ショップ自体のメタデータ（権限レコードから得た ID で実体を取得）。
 *  - 【自己修復・プロビジョニング機能】
 *    - 権限管理レコードが存在しない場合、過去のオーナーシップ情報（GSI2）から自動移行。
 *    - それでもショップが見つからない場合、初回ログインと見なして「デフォルトショップ」を自動生成します。
 * @context
 *  - 管理画面（/shop/dashboard）の最初に呼び出され、ユーザーにどの店舗の管理権限があるかを決定するゲートウェイです。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, QueryCommand, BatchGetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { generateId } from './utils/id';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, USER_POOL_ID } from './share/db';
import { getUserId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';

const cognito = new CognitoIdentityProviderClient({});

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const userId = getUserId(event);
        if (!userId) return errorResponse(401, 'Unauthorized');

        const body = JSON.parse(event.body || '{}') as ShopApiSchema['shop_list'];
        const noCreate = body.no_create === true;

        // 1. ユーザーの権限管理レコード（直接的な所属リスト）を確認
        const userRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `USER#${userId}`, SK: 'SHOP' }, ConsistentRead: true
        }));

        let roles: string[] = [];
        let ownerShopIds: string[] = [];
        let gmShopIds: string[] = [];

        if (userRes.Item) {
            roles = userRes.Item.roles || [];
            ownerShopIds = userRes.Item.owner_shop_ids || [];
            gmShopIds = userRes.Item.gm_shop_ids || [];
        } else {
            // 【Legacy Migration / Auto Provisioning】
            // 権限管理レコードがない場合、既存のショップから自身がオーナーであるものを検索します。
            const legacyRes = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME, IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :uid', ExpressionAttributeValues: { ':uid': `USER#${userId}` }
            }));
            const legacyIds = legacyRes.Items?.map(i => i.PK.replace('SHOP#', '')) || [];

            if (legacyIds.length > 0) {
                // 最新のメールアドレスを Cognito から取得
                let email = null;
                if (USER_POOL_ID) {
                    try {
                        const userRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: userId }));
                        email = userRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
                    } catch (e) {
                        console.warn(`Failed to fetch email for user: ${userId}`, e);
                    }
                }

                // 発見されたショップ情報を元に権限レコードを新規作成（移行完了）
                await ddb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        PK: `USER#${userId}`, SK: 'SHOP',
                        email,
                        roles: ['SHOP_MANAGER'], owner_shop_ids: legacyIds, gm_shop_ids: [],
                        ts_created_at: new Date().toISOString()
                    }
                }));
                roles = ['SHOP_MANAGER']; ownerShopIds = legacyIds;
            } 
            // else if (!noCreate) {
            //     // 【Default Shop Creation】
            //     // 本システムに初めて訪れた加盟店ユーザーに対し、空のデフォルトショップを用意します。
            //     const newShopId = generateId();
            //     const now = new Date().toISOString();
                
            //     await ddb.send(new PutCommand({
            //         TableName: TABLE_NAME,
            //         Item: {
            //             PK: `SHOP#${newShopId}`, SK: 'METADATA',
            //             name: "My Default Shop", owner_id: userId,
            //             GSI2_PK: `USER#${userId}`, GSI2_SK: now, ts_created_at: now
            //         }
            //     }));
            //     await ddb.send(new PutCommand({
            //         TableName: TABLE_NAME,
            //         Item: {
            //             PK: `USER#${userId}`, SK: 'SHOP',
            //             roles: ['SHOP_MANAGER'], owner_shop_ids: [newShopId], gm_shop_ids: [], ts_created_at: now
            //         }
            //     }));
            //     roles = ['SHOP_MANAGER']; ownerShopIds = [newShopId];
            // }
        }

        const allShopIds = Array.from(new Set([...ownerShopIds, ...gmShopIds]));
        if (allShopIds.length === 0) {
            return successResponse({ shops: [], roles, owner_shop_ids: [], gm_shop_ids: [] });
        }

        // 【Enrichment: ショップ名のバルク取得】
        // ID リストだけでは不十分なため、各ショップの METADATA レコードから名称等を取得します。
        const shopKeys = allShopIds.map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' }));
        const batchRes = await ddb.send(new BatchGetCommand({
            RequestItems: { [TABLE_NAME]: { Keys: shopKeys } }
        }));

        const shopList = allShopIds.map(id => {
            const item = batchRes.Responses?.[TABLE_NAME]?.find(s => s.PK === `SHOP#${id}`);
            return item ? { id, name: item.name, ts_created_at: item.ts_created_at } : null;
        }).filter(Boolean); // 既に削除されたショップなどは除外

        return successResponse({ shops: shopList, roles, owner_shop_ids: ownerShopIds, gm_shop_ids: gmShopIds });

    } catch (error: any) {
        // console.error('Shop list error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
