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
            // 検索モード (完全一致検索)
            // --------------------------------------------------------------------
            // 入力からプレフィックスを除去して正規化された ID を取得します。
            // ユーザーが ID 全体を入力することを想定し、完全一致での検索を行います。
            const cleanId = keyword.replace(/^(QR_BATCH#|CARD_ORDER#)/, '');
            
            // 1. バッチ ID (PK) による検索
            // 操作: Query
            // 理由: PK (QR_BATCH#ID) と SK (METADATA#timestamp) の組み合わせで一意に特定可能なため。
            // インデックス: 基本テーブル (Primary Key)
            const batchResult = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk_prefix)",
                ExpressionAttributeValues: {
                    ':pk': `QR_BATCH#${cleanId}`,
                    ':sk_prefix': 'METADATA'
                },
                Limit: limit
            }));

            // 2. カード注文 ID (GSI2_PK) による検索
            // 操作: Query
            // 理由: 特定の注文に関連付けられたバッチを効率的に抽出するため。
            // インデックス: GSI2 (GSI2_PK = CARD_ORDER#order_id)
            const orderResult = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: "GSI2_PK = :order_prefix",
                ExpressionAttributeValues: {
                    ':order_prefix': `CARD_ORDER#${cleanId}`
                },
                Limit: limit
            }));

            // 両方の検索結果を統合し、重複を排除（通常は発生しないが安全のため）
            const combinedItems = [...(batchResult.Items || []), ...(orderResult.Items || [])];
            const uniqueItems = Array.from(new Map(combinedItems.map(item => [item.PK + item.SK, item])).values());
            
            items = uniqueItems;
            
            // 検索結果も日付順（最新順）にソート
            items.sort((a, b) => (b.ts_created_at || "").localeCompare(a.ts_created_at || ""));
            
            // ID 指定による検索では通常結果が少数のため、検索結果のページングはサポートせず null を返却します。
            nextCursor = null;
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
