/**
 * 概要: システム管理者向けショップとカードデザインの紐付け管理
 * 詳細: システム管理者が任意のショップに対して利用可能なカードデザイン (card_designs) を取得・更新できるようにする。
 * エンドポイント:
 *  - POST /admin/shop/carddesign/link/get (ショップ情報の取得)
 *  - POST /admin/shop/carddesign/link/update (ショップ情報の更新)
 * リクエストボディ:
 *  - shopId: 対象のショップID (必須)
 *  - card_designs: [update時] カードデザインIDの配列 (オプション)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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

        const body = JSON.parse(event.body || '{}');
        const { shopId, card_designs } = body;

        // Path-based action determination (consistent with internal routing)
        const path = event.path || "";
        let action = "";
        if (path.endsWith('/get')) action = 'get';
        else if (path.endsWith('/update')) action = 'update';

        if (!shopId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing shopId' }) };

        const cleanShopId = shopId.replace(/^SHOP#/, '');

        if (action === 'get') {
            // 【DB操作: GetItem】
            // - 目的: ショップのメタデータを取得し、現在のカードデザイン紐付け(card_designs)を確認する
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `SHOP#${cleanShopId}`, SK: 'METADATA' }
            // - 取得カラム: ALL (項目全体、特に名前、メール、card_designs等)
            const res = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${cleanShopId}`, SK: 'METADATA' }
            }));

            if (!res.Item) {
                return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Shop not found' }) };
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(res.Item) };
        }

        if (action === 'update') {
            const updateExprParts = [];
            const attrValues: any = { ':now': new Date().toISOString() };

            if (card_designs !== undefined) {
                if (!Array.isArray(card_designs)) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'card_designs must be an array' }) };
                }
                updateExprParts.push('card_designs = :cd');
                attrValues[':cd'] = card_designs;
            }

            if (updateExprParts.length === 0) {
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'No changes provided' }) };
            }

            // Always update ts_updated_at for metadata tracking
            updateExprParts.push('ts_updated_at = :now');

            // 【DB操作: UpdateItem】
            // - 目的: ショップのメタデータ項目に対して、利用可能なカードデザインIDのリスト(card_designs)を保存する
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `SHOP#${cleanShopId}`, SK: 'METADATA' }
            // - 更新内容: card_designs 属性の上書き、および ts_updated_at の更新
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${cleanShopId}`, SK: 'METADATA' },
                UpdateExpression: `SET ${updateExprParts.join(', ')}`,
                ExpressionAttributeValues: attrValues
            }));

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Shop card designs linked successfully' }) };
        }

        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action or path' }) };
    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
