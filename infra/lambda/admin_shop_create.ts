/**
 * 概要: 新規ショップ作成 (システム管理者専用)
 * 詳細: システム管理者が新しいショップを作成し、オーナーおよびゼネラルマネージャー（GM）を割り振ります。
 * エンドポイント: POST /shop/create
 * リクエストボディ:
 *  - name: 作成するショップの名前 (必須)
 *  - owner_id: ショップオーナーのユーザーID (必須)
 *  - gm_ids: (オプション) ゼネラルマネージャーのユーザーID配列 または セミコロン区切りの文字列
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { generateId } from './utils/id';
import { parseGroups, isSystemAdmin } from './utils/auth';

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

        const authorizer = event.requestContext?.authorizer;
        const userId = authorizer?.principalId;
        const isAdmin = authorizer?.isGlobalAdmin === 'true';

        if (!userId || !isAdmin) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        const { name, owner_id, gm_ids } = body;
        if (!name) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing name' }) };
        if (!owner_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing owner_id' }) };

        // 【DB操作: GetItem】
        // - 目的: オーナー候補となるユーザーの存在確認とメールアドレスの取得
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `USER#${owner_id}`, SK: 'SHOP' }
        // - 取得カラム: email を含むユーザーレコード全体
        let userownerRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${owner_id}`, SK: 'SHOP' }
        }));
        if (!userownerRes?.Item) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid owner_id' }) };
        }

        const gm_idslist: string[] = Array.isArray(gm_ids) ? gm_ids : (gm_ids ? gm_ids.split(';').map((gmid: string) => gmid.trim()) : []);

        // 【DB操作: GetItem (ループ実行)】
        // - 目的: 指定された全ゼネラルマネージャー候補ユーザーの存在確認
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `USER#${gmid}`, SK: 'SHOP' }
        // - 取得カラム: ユーザーレコード全体
        for (const gmid of gm_idslist) {
            let usergmRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${gmid}`, SK: 'SHOP' }
            }));
            if (!usergmRes?.Item) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid gm_id', detail: gmid }) };
            }
        }

        const email = userownerRes?.Item.email;
        const newShopId = generateId();
        const now = new Date().toISOString();

        // 【DB操作: PutItem】
        // - 目的: 新規作成するショップの基本情報(メタデータ)を保存
        // - テーブル: TABLE_NAME
        // - リクエストキー(プライマリ): { PK: `SHOP#${newShopId}`, SK: 'METADATA' }
        // - 登録カラム: name, owner_id, gm_ids, email, GSI2_PK(`USER#${owner_id}`), GSI2_SK(日時), ts_created_at
        // - 備考: GSI2を利用して「あるユーザーがオーナーであるショップ一覧」をクエリ可能にする
        await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: `SHOP#${newShopId}`, SK: 'METADATA',
                name, owner_id, gm_ids: gm_idslist, email,
                GSI2_PK: `USER#${owner_id}`, GSI2_SK: now, ts_created_at: now
            }
        }));

        // 【DB操作: UpdateItem】
        // - 目的: ショップ作成者の所有ショップ一覧(owner_shop_ids)に、新しく作成したショップIDを追加
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `USER#${owner_id}`, SK: 'SHOP' }
        // - 更新カラム: owner_shop_ids に対して list_append (要素追加)、ts_updated_at に現在時刻
        // - 備考: もしリストが存在しない場合は空リストを作成してから要素を追加する (if_not_exists)
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${owner_id}`, SK: 'SHOP' },
            UpdateExpression: 'SET owner_shop_ids = list_append(if_not_exists(owner_shop_ids, :empty_list), :new_shop_list), ts_updated_at = :now',
            ExpressionAttributeValues: { ':new_shop_list': [newShopId], ':empty_list': [], ':now': now }
        }));

        // 【DB操作: UpdateItem (ループ実行)】
        // - 目的: 各ゼネラルマネージャーの管理ショップリスト(gm_shop_ids)に新ショップIDを追加
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `USER#${gmid}`, SK: 'SHOP' }
        // - 更新カラム: gm_shop_ids に対して list_append、ts_updated_at に現在時刻
        for (const gmid of gm_idslist) {
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${gmid}`, SK: 'SHOP' },
                UpdateExpression: 'SET gm_shop_ids = list_append(if_not_exists(gm_shop_ids, :empty_list), :new_shop_list), ts_updated_at = :now',
                ExpressionAttributeValues: { ':new_shop_list': [newShopId], ':empty_list': [], ':now': now }
            }));

            // 【DB操作: UpdateItem (条件付)】
            // - 目的: 各GMユーザーに 'GENERAL_MANAGER' ロールが未付与の場合は追加で付与する
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `USER#${gmid}`, SK: 'SHOP' }
            // - 条件式 (ConditionExpression): roles属性が存在しない、または 'GENERAL_MANAGER' を含まない場合
            // - 更新カラム: roles リストに対して 'GENERAL_MANAGER' 文字列を追加
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

        return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ shopId: newShopId, message: 'Shop created' }) };
    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
