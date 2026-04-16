/**
 * @file admin_qr_batch.ts
 * @role 管理者用：QR コード生成バッチ取得ハンドラー
 * @responsibility
 *  - `admin_qr_generate` によって一括生成された QR コード群（バッチ）の情報を取得します。
 *  - 【互換性維持】SK の設計変更（'METADATA' -> 'METADATA#timestamp'）に対応するため、`begins_with` を用いた柔軟な検索を採用しています。
 *  - 【データ返却】バッチに含まれる全 QR コードの ID と PIN、および関連する注文 ID（order_id）を返却します。
 * @context
 *  - 生成完了直後のダウンロード画面や、過去の生成履歴を確認する際に使用されます。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { AdminApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}') as AdminApiSchema['admin_qr_batch_get'];
        const { batch_id } = body;

        if (!batch_id) {
            return errorResponse(400, 'batch_id is required');
        }

        // バッチ情報の検索
        // インデックス設計: PK=QR_BATCH#<batch_id>
        // 後方互換性処理: 
        // 以前は SK が固定文字列 'METADATA' でしたが、履歴管理のために 'METADATA#<timestamp>' 形式へ移行しました。
        // Query + begins_with を使用することで、新旧どちらのフォーマットのバッチデータも確実に取得できます。
        const result = await ddb.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk_prefix)',
            ExpressionAttributeValues: {
                ':pk': `QR_BATCH#${batch_id}`,
                ':sk_prefix': 'METADATA'
            }
        }));

        const item = result.Items?.[0];

        if (!item) {
            return errorResponse(404, 'Batch not found');
        }

        // 生成データ（data 配列: {qr_id, pin} のリスト）とメタデータを返却
        return successResponse({
            batch_id: batch_id,
            count: item.data?.length || 0,
            data: item.data,
            order_id: item.order_id,
            ts_created_at: item.ts_created_at
        });

    } catch (error: any) {
        console.error('Admin QR batch get error:', error);
        return errorResponse(500, 'Internal Server Error', error.message || String(error));
    }
};
