/**
 * @file admin_qr_batch_list.ts
 * @role 管理者用：QR 生成バッチ一覧・検索ハンドラー
 * @responsibility
 *  - 過去に生成された QR バッチ（一括生成データ）の一覧を最新順に取得します。
 *  - キーワード（バッチ ID または注文 ID）による検索を提供します。
 *  - 【ページング】LastEvaluatedKey による続きのデータ取得に対応しています。
 * @context
 *  - 管理画面の「カード印刷」セクションで、過去の生成履歴を確認し再印刷等を行うために使用されます。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { AdminApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        const body = JSON.parse(event.body || '{}') as AdminApiSchema['admin_qr_batch_list'];
        const limit = Number(body.limit) || 10;
        const keyword = (body.keyword || '').trim();
        const cursor = body.cursor;

        let items: any[] = [];
        let nextCursor = null;

        if (keyword) {
            // --------------------------------------------------------------------
            // 検索モード (Scan を使用して PK プレフィックス一致 = ワイルドカード検索をサポート)
            // --------------------------------------------------------------------
            const cleanId = keyword.replace(/^(QR_BATCH#|CARD_ORDER#)/, '');
            
            const result = await ddb.send(new ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: "(begins_with(PK, :pk_prefix) OR begins_with(GSI2_PK, :order_prefix)) AND begins_with(SK, :sk_prefix)",
                ExpressionAttributeValues: {
                    ':pk_prefix': `QR_BATCH#${cleanId}`,
                    ':order_prefix': `CARD_ORDER#${cleanId}`,
                    ':sk_prefix': 'METADATA'
                },
                Limit: limit,
                ExclusiveStartKey: cursor
            }));

            items = result.Items || [];
            // 検索結果も日付順（最新順）に並べる
            items.sort((a, b) => (b.ts_created_at || "").localeCompare(a.ts_created_at || ""));
            nextCursor = result.LastEvaluatedKey;
        } else {
            // --------------------------------------------------------------------
            // 一覧モード (GSI1 を使用して最新順に取得)
            // --------------------------------------------------------------------
            const result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1_PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': 'QR_BATCH#METADATA'
                },
                ScanIndexForward: false, // 降順 (最新順)
                Limit: limit,
                ExclusiveStartKey: cursor
            }));

            items = result.Items || [];
            nextCursor = result.LastEvaluatedKey;
        }

        // フロントエンドの期待する形式に整形
        const formattedItems = items.map(item => ({
            id: item.PK.replace('QR_BATCH#', ''),
            batch_id: item.PK.replace('QR_BATCH#', ''),
            count: item.data?.length || 0,
            codes: item.data || [], // 詳細表示用
            date: item.ts_created_at || item.GSI1_SK,
            status: 'ready', // 保存済みバッチは常に準備完了
            order_id: item.order_id,
            design_id: item.design_id
        }));

        return successResponse({
            items: formattedItems,
            cursor: nextCursor,
            count: formattedItems.length
        });

    } catch (error: any) {
        console.error('Admin QR batch list error:', error);
        return errorResponse(500, 'Internal Server Error', error.message || String(error));
    }
};
