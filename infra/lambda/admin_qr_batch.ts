/**
 * 概要: バッチIDから生成済みQRコードリストを取得する
 * 詳細: 
 *  - admin_qr_generate で作成された PK=QR_BATCH#<batch_id>, SK=METADATA のレコードを取得します。
 *  - 1回のGetItemで全件取得可能なため、効率的です。
 *
 * エンドポイント: POST /admin/qr/batch/get (想定)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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
        // admin_qr_generate で作成された PK=QR_BATCH#<batch_id> のレコードを取得します。
        // SK は以前は固定値 'METADATA' でしたが、現在は 'METADATA#<timestamp>' 形式に変更されています。
        // そのため QueryCommand と begins_with を使用して、両方の形式に対応させます。
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
