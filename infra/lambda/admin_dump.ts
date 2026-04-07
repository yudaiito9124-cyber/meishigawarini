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
import { AdminApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        const body = JSON.parse(event.body || '{}') as AdminApiSchema['admin_dump'];
        const pks = body.pks || [];
        const keys = body.keys || [];
        const gsi2_pks = body.gsi2_pks || [];

        if (pks.length === 0 && keys.length === 0 && gsi2_pks.length === 0) {
            return errorResponse(400, 'Missing pks, keys, or gsi2_pks array');
        }

        let allItems: any[] = [];

        // 1. 指定された各PKに対し、SKを条件とせずにQueryを実行して全関連アイテムを取得
        for (const pk of pks) {
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk',
                ExpressionAttributeValues: { ':pk': pk }
            }));
            
            if (res.Items && res.Items.length > 0) {
                allItems.push({ __HEADER__: `--- Data for PK: ${pk} ---` });
                allItems = allItems.concat(res.Items);
            }
        }

        // 2. 指定されたPKとSKのペア(keys)に対し、特定のアイテムを取得
        for (const key of keys) {
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND SK = :sk',
                ExpressionAttributeValues: { ':pk': key.pk, ':sk': key.sk }
            }));
            
            if (res.Items && res.Items.length > 0) {
                allItems.push({ __HEADER__: `--- Data for PK: ${key.pk} SK: ${key.sk} ---` });
                allItems = allItems.concat(res.Items);
            }
        }

        // 3. GSI2 インデックスを使用して、特定のインデックスキー(GSI2_PK)からアイテムを取得
        for (const gsi2_pk of gsi2_pks) {
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :pk',
                ExpressionAttributeValues: { ':pk': gsi2_pk }
            }));
            
            if (res.Items && res.Items.length > 0) {
                allItems.push({ __HEADER__: `--- Data for GSI2_PK: ${gsi2_pk} ---` });
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
