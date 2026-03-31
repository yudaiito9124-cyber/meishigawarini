/**
 * 概要: 指定されたパーティションキー（PK）に紐づく全データのダンプ (管理者用)
 * 詳細: 
 *  - デバッグやデータメンテナンスを目的として、指定されたPKの各項目に対し、全ソートキー（SK）の属性情報を取得して返却します。
 *  - 開発および管理用途での詳細なデータ調査に使用。
 *
 * エンドポイント: POST /admin/dump
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        const body = JSON.parse(event.body || '{}');
        const pks = body.pks;

        if (!Array.isArray(pks) || pks.length === 0) {
            return errorResponse(400, 'Missing pks array');
        }

        let allItems: any[] = [];

        // 指定された各PKに対し、SKを条件とせずにQueryを実行して全関連アイテムを取得
        for (const pk of pks) {
            // 【DB操作: Query】
            // 理由: 同一PKを持つ全アイテム(METADATA, ORDER, CHAT 等)を一括で取得。
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk',
                ExpressionAttributeValues: { ':pk': pk }
            }));
            
            if (res.Items && res.Items.length > 0) {
                // 調査対象の区切りとしてヘッダーを挿入
                allItems.push({ __HEADER__: `--- Data for PK: ${pk} ---` });
                allItems = allItems.concat(res.Items);
            }
        }

        return successResponse({ 
            count: allItems.length,
            items: allItems 
        });

    } catch (error: any) {
        console.error('Admin dump error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
