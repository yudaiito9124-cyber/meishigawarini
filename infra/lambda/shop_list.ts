/**
 * 概要: マイショップ一覧の取得 (ショップ用)
 * 詳細: 
 *  - ログイン中のユーザーが「オーナー」または「GM」として所属しているショップの一覧を取得します。
 *  - ユーザー専用の権限管理レコード(PK=USER#{id}, SK=SHOP)が存在しない場合、レガシーデータからの移行、またはデフォルトショップの自動生成を行います。
 *
 * エンドポイント: POST /shop/list
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, QueryCommand, BatchGetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { generateId } from './utils/id';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getUserId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const userId = getUserId(event);
        if (!userId) return errorResponse(401, 'Unauthorized');

        const body = JSON.parse(event.body || '{}') as ShopApiSchema['shop_list'];
        const noCreate = body.no_create === true;

        // 【DB操作: GetItem】
        // 理由: ユーザーの所属ショップIDリスト(owner_shop_ids, gm_shop_ids)を直接取得。
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
            // レガシー対応: 権限管理レコードが無い場合、既存のショップから検索
            // 【DB操作: Query】
            // 理由: GSI2(オーナーID)を利用して、過去に作成したショップを検索。
            const legacyRes = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME, IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :uid', ExpressionAttributeValues: { ':uid': `USER#${userId}` }
            }));
            const legacyIds = legacyRes.Items?.map(i => i.PK.replace('SHOP#', '')) || [];

            if (legacyIds.length > 0) {
                // 【DB操作: PutItem】
                // 理由: 発見したレガシーIDを元に、新しい権限管理レコードを作成(移行)。
                await ddb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        PK: `USER#${userId}`, SK: 'SHOP',
                        roles: ['SHOP_MANAGER'], owner_shop_ids: legacyIds, gm_shop_ids: [],
                        ts_created_at: new Date().toISOString()
                    }
                }));
                roles = ['SHOP_MANAGER']; ownerShopIds = legacyIds;
            } else if (!noCreate) {
                // 初回ログイン対応: ショップが1つも無い場合はデフォルトショップを作成
                const newShopId = generateId();
                const now = new Date().toISOString();
                
                // 【DB操作: PutItem × 2】
                // 1. ショップメタデータの作成
                await ddb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        PK: `SHOP#${newShopId}`, SK: 'METADATA',
                        name: "My Default Shop", owner_id: userId,
                        GSI2_PK: `USER#${userId}`, GSI2_SK: now, ts_created_at: now
                    }
                }));
                // 2. ユーザー権限レコードの作成
                await ddb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        PK: `USER#${userId}`, SK: 'SHOP',
                        roles: ['SHOP_MANAGER'], owner_shop_ids: [newShopId], gm_shop_ids: [], ts_created_at: now
                    }
                }));
                roles = ['SHOP_MANAGER']; ownerShopIds = [newShopId];
            }
        }

        const allShopIds = Array.from(new Set([...ownerShopIds, ...gmShopIds]));
        if (allShopIds.length === 0) {
            return successResponse({ shops: [], roles, owner_shop_ids: [], gm_shop_ids: [] });
        }

        // 【DB操作: BatchGetItem】
        // 理由: 各ショップの基本情報(名前、作成日)を効率的に一括取得。
        const shopKeys = allShopIds.map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' }));
        const batchRes = await ddb.send(new BatchGetCommand({
            RequestItems: { [TABLE_NAME]: { Keys: shopKeys } }
        }));

        const shopList = allShopIds.map(id => {
            const item = batchRes.Responses?.[TABLE_NAME]?.find(s => s.PK === `SHOP#${id}`);
            return item ? { id, name: item.name, ts_created_at: item.ts_created_at } : null;
        }).filter(Boolean);

        return successResponse({ shops: shopList, roles, owner_shop_ids: ownerShopIds, gm_shop_ids: gmShopIds });

    } catch (error: any) {
        console.error('Shop list error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
