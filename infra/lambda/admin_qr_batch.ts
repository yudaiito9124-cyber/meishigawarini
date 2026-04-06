/**
 * 概要: バッチIDから生成済みQRコードリストを取得する
 * 詳細: 
 *  - admin_qr_generate で作成された PK=QRBATCH#<batch_id>, SK=METADATA のレコードを取得します。
 *  - 1回のGetItemで全件取得可能なため、効率的です。
 *
 * エンドポイント: POST /admin/qr/batch/get (想定)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
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

        const result = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `QRBATCH#${batch_id}`,
                SK: 'METADATA'
            }
        }));

        if (!result.Item) {
            return errorResponse(404, 'Batch not found');
        }

        return successResponse({
            batch_id: batch_id,
            count: result.Item.data?.length || 0,
            data: result.Item.data,
            order_id: result.Item.order_id,
            ts_created_at: result.Item.ts_created_at
        });

    } catch (error: any) {
        console.error('Admin QR batch get error:', error);
        return errorResponse(500, 'Internal Server Error', error.message || String(error));
    }
};
