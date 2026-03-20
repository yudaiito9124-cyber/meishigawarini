/**
 * 概要: マイショップ一覧の取得
 * 詳細: ログイン中ユーザーがオーナーまたはGMとして所属するショップの一覧を取得します。
 * エンドポイント: POST /shop/list
 * リクエストボディ: なし
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, BatchGetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { generateId } from './utils/id';
import { parseGroups, isSystemAdmin } from './utils/auth';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        const authorizer = event.requestContext?.authorizer;
        const userId = authorizer?.principalId;
        const claims = authorizer;
        if (!userId) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };

        let roles = [];
        let owner_shop_ids = []; 
        let gm_shop_ids = [];

        // 【DB操作: GetItem】
        // - 目的: アクセスしたユーザーの所持するロールやショップ権限情報の取得
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `USER#${userId}`, SK: 'SHOP' }
        // - 取得カラム: roles, owner_shop_ids, gm_shop_ids
        let userRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: 'SHOP' }
        }));

        if (!userRes?.Item) {
            // 【DB操作: Query】
            // - 目的: (レガシー対応)ユーザー専用レコード未作成時代の、オーナーになっているショップ一覧の取得
            // - テーブル: TABLE_NAME
            // - インデックス: GSI2
            // - 検索条件: GSI2_PK = `USER#${userId}`
            // - 取得カラム: ALL (結果のPKからショップIDを抽出して利用)
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :uid',
                ExpressionAttributeValues: { ':uid': `USER#${userId}` }
            }));
            let regacy_shop_ids = res.Items?.map((item: any) => item.PK.replace('SHOP#', '')) || [];

            if (regacy_shop_ids && regacy_shop_ids.length > 0) {
                const now = new Date().toISOString();
                const email = claims?.email;
                // 【DB操作: PutItem】
                // - 目的: レガシーユーザー向けに新形式のユーザー権限レコードを自動生成
                // - テーブル: TABLE_NAME
                // - リクエストキー: { PK: `USER#${userId}`, SK: 'SHOP' }
                // - 登録カラム: email, roles, owner_shop_ids, gm_shop_ids, ts_created_at
                await ddb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        PK: `USER#${userId}`, SK: 'SHOP',
                        email, roles: ['SHOP_MANAGER'], owner_shop_ids: regacy_shop_ids, gm_shop_ids: [], ts_created_at: now
                    }
                }));
                roles = ['SHOP_MANAGER'];
                owner_shop_ids = regacy_shop_ids;
                gm_shop_ids = [];
            }
        }

        if (!userRes?.Item && owner_shop_ids.length === 0) {
            const newShopId = generateId();
            const now = new Date().toISOString();
            const email = claims?.email;
            
            // 【DB操作: PutItem】
            // - 目的: 完全新規のユーザー向けにデフォルトのショップメタデータを自動作成
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `SHOP#${newShopId}`, SK: 'METADATA' }
            // - 登録カラム: name, email, owner_id, GSI2_PK, GSI2_SK, ts_created_at
            // - 備考: GSI2を利用してオーナー検索を可能にする
            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `SHOP#${newShopId}`, SK: 'METADATA',
                    name: "My Default Shop", email, owner_id: userId,
                    GSI2_PK: `USER#${userId}`, GSI2_SK: now, ts_created_at: now
                }
            }));

            // 【DB操作: PutItem】
            // - 目的: 完全新規のユーザー向けにロールとショップ権限の管理レコードを自動作成
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `USER#${userId}`, SK: 'SHOP' }
            // - 登録カラム: email, roles(SHOP_MANAGER), owner_shop_ids(初期ショップID), gm_shop_ids, ts_created_at
            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `USER#${userId}`, SK: 'SHOP',
                    email, roles: ['SHOP_MANAGER'], owner_shop_ids: [newShopId], gm_shop_ids: [], ts_created_at: now
                }
            }));
            roles = ['SHOP_MANAGER'];
            owner_shop_ids = [newShopId];
            gm_shop_ids = [];
        } else if (userRes?.Item) {
            roles = userRes?.Item?.roles;
            owner_shop_ids = userRes?.Item?.owner_shop_ids || [];
            gm_shop_ids = userRes?.Item?.gm_shop_ids || [];
        }

        let shops = [...owner_shop_ids, ...gm_shop_ids];

        if (shops.length === 0) {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ shops: [], roles, owner_shop_ids, gm_shop_ids }) };
        }

        // 【DB操作: BatchGetItem】
        // - 目的: 権限として紐付いている全所属ショップリストのメタデータを一括高速取得
        // - テーブル: TABLE_NAME
        // - リクエストキー配列: 取得した所属ショップIDごとに { PK: `SHOP#${id}`, SK: 'METADATA' }
        // - 取得カラム: ALL (名前や作成日時等を取得)
        const shopKeys = shops.map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' }));
        const res = await ddb.send(new BatchGetCommand({
            RequestItems: {
                [TABLE_NAME]: { Keys: shopKeys }
            }
        }));

        const shopList = shops.map(id => {
            const item = res.Responses?.[TABLE_NAME]?.find(s => s.PK === `SHOP#${id}`);
            return item ? {
                id: id,
                name: item.name,
                ts_created_at: item.ts_created_at
            } : null;
        }).filter(Boolean);

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ shops: shopList, roles, owner_shop_ids, gm_shop_ids })
        };
    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
