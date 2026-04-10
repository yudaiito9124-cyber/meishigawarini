/**
 * @file admin_dump.ts
 * @role 管理者用：汎用データダンプユーティリティ
 * @responsibility
 *  - 開発およびデバッグを目的として、特定のキー（PK、PK+SK、GSI2_PK）に紐づく生の DynamoDB データを抽出します。
 *  - 【マルチモード検索】以下の 3 つの方式でデータを一括取得します。
 *    1. `pks`: パーティションキー単位での全件スキャン（Query）。
 *    2. `keys`: 完結したプライマリキー（PK + SK）による特定レコードの取得。
 *    3. `gsi2_pks`: 逆引きインデックス（GSI2）を用いたレコード群の取得。
 * @context
 *  - システムの挙動が期待と異なる際、アプリケーション層の加工を通さない「生のデータ状態」を迅速に目視確認するために使用されます。
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

        // --------------------------------------------------------------------
        // 1. パーティションキー(PK)単位でのダンプ
        // 目的: 特定のエンティティ（例: USER#ID）に紐づく全レコード（SK 群）を一覧化します。
        // --------------------------------------------------------------------
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

        // --------------------------------------------------------------------
        // 2. 特定キーペア(PK+SK)でのピンポイント取得
        // 目的: 完全に特定された 1 レコードの詳細情報を取得します。
        // --------------------------------------------------------------------
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

        // --------------------------------------------------------------------
        // 3. 逆引きインデックス(GSI2)での検索
        // 目的: UUID 等のグローバル ID から、その実体（PK/SK ペア）を特定します。
        // --------------------------------------------------------------------
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
