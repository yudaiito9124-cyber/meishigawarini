/**
 * 概要: ショップ管理者の取得
 * 詳細: ショップに紐づくオーナーおよびゼネラルマネージャー（GM）のユーザー情報を取得します。
 * エンドポイント: POST /shop/admins
 * リクエストボディ:
 *  - shop_id: 対象のショップID (必須)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        const authorizer = event.requestContext?.authorizer;
        const userId = authorizer?.principalId;
        const claims = authorizer;
        if (!userId) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        const { shopId } = body;

        if (!shopId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing shopId' }) };

        // 【DB操作: 内部モジュールによる GetItem・BatchGetItem】
        // - 目的: 実行ユーザーが対象ショップのオーナーまたはGMであるかの権限を検証し、ショップ情報を取得
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `SHOP#${shopId}`, SK: 'METADATA' } および { PK: `USER#${userId}`, SK: 'SHOP' }
        // - 取得カラム: ショップのメタデータ一式(owner_id, gm_ids 等)
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (shopMetadata === false) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        const ownerId = shopMetadata.owner_id;
        const gmIds = shopMetadata.gm_ids || [];

        // 【DB操作: GetItem】
        // - 目的: ショップオーナーのユーザー情報(メアド等)を取得
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `USER#${ownerId}`, SK: 'SHOP' }
        // - 取得カラム: email を含むレコード全体
        const ownerResP = ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${ownerId}`, SK: 'SHOP' }
        }));

        // 【DB操作: GetItem (並行実行)】
        // - 目的: 全GM候補のユーザー情報(メアド等)を並行取得
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `USER#${id}`, SK: 'SHOP' }
        // - 取得カラム: email を含むレコード全体
        const gmResPs = gmIds.map((id: string) => ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${id}`, SK: 'SHOP' }
        })));

        const [ownerRes, ...gmRes] = await Promise.all([ownerResP, ...gmResPs]);

        const owner = {
            id: ownerId,
            email: ownerRes.Item?.email || 'Unknown',
            role: 'OWNER'
        };

        const gms = gmRes.map((res: any, idx: number) => ({
            id: gmIds[idx],
            email: res.Item?.email || 'Unknown',
            role: 'GENERAL_MANAGER'
        }));

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ admins: [owner, ...gms] })
        };
    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
