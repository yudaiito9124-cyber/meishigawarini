/**
 * @file admin_qr_deleteban.ts
 * @role 管理者用：BAN 済み QR コード物理削除ハンドラー
 * @responsibility
 *  - 悪用防止やデータ整理のため、ステータスが `BANNED`（利用停止）となっている QR コードをデータベースから物理的に削除します。
 *  - 【デュアルモード削除】
 *    1. 特定 ID 指定: 指定された一つの QR コード（BAN 状態必須）を削除。
 *    2. 一括パージ: GSI1 (`GSI1_PK = QR#BANNED`) をスキャンし、現在 BAN されている全てのアイテムをバッチ処理で一括削除。
 *  - 【安全・効率設計】物理削除前に、必ずインデックスやフィルタを用いて `BANNED` 状態であることを二重チェックします。また、25 件ずつのチャンクでバッチ書き込みを行い、効率化しています。
 * @context
 *  - BAN 処理後、法的な要求や運用上の理由でデータを完全に抹消する必要がある場合に使用されます。
 */

import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getAction } from './utils/request';
import { AdminApiSchema } from '@shared/api-types';

const INDEX_NAME = 'GSI1';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        const body = JSON.parse(event.body || '{}') as AdminApiSchema['admin_qr_deleteban'];
        const qr_id = body.target;
        const action = getAction(event, body);

        console.log('Delete BAN event started:', { qr_id, action });

        let deletedCount = 0;
        let lastEvaluatedKey: Record<string, any> | undefined;

        /**
         * 削除対象の抽出とバッチ処理
         * ループにより、LastEvaluatedKey が無くなるまで全件を処理します。
         */
        do {
            let result;
            if (qr_id) {
                // --------------------------------------------------------------------
                // モード 1: 特定の QR ID の削除
                // --------------------------------------------------------------------
                // 目的: 誤操作防止のため、直接 Key 指定(DeleteItem) ではなく Query + FilterExpression を使用し、
                // 対象が確実に BANNED 状態であることを確認してからキーを抽出します。
                result = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :pk',
                    FilterExpression: '#status = :status',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: { ':pk': `QR#${qr_id}`, ':status': 'BANNED' },
                    ProjectionExpression: 'PK, SK' // 削除に必要なキーのみ取得して通信量を節約
                }));
            } else {
                // --------------------------------------------------------------------
                // モード 2: BAN 全件の一括削除 (パージ)
                // --------------------------------------------------------------------
                // 目的: 管理画面からの一括クリーンアップ。GSI1 を用いて BANNED 全件を高速抽出。
                result = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME, IndexName: INDEX_NAME,
                    KeyConditionExpression: 'GSI1_PK = :pk',
                    ExpressionAttributeValues: { ':pk': 'QR#BANNED' },
                    ProjectionExpression: 'PK, SK',
                    ExclusiveStartKey: lastEvaluatedKey
                }));
            }

            if (result.Items && result.Items.length > 0) {
                const pageItems = result.Items;

                // DynamoDB の制限（1 リクエスト 25 件まで）に合わせ、チャンク分割して実行
                for (let i = 0; i < pageItems.length; i += 25) {
                    const chunk = pageItems.slice(i, i + 25);
                    const deleteRequests = chunk.map((item: any) => ({
                        DeleteRequest: { Key: { PK: item.PK, SK: item.SK } }
                    }));

                    await ddb.send(new BatchWriteCommand({
                        RequestItems: { [TABLE_NAME]: deleteRequests }
                    }));
                    deletedCount += chunk.length;
                }
            }

            lastEvaluatedKey = result.LastEvaluatedKey;
            
            // 単体指定(qr_id)の場合は、見つかった 1 件(あるいは 0 件)を処理して即終了
            if (qr_id) break;

        } while (lastEvaluatedKey);

        return successResponse({ message: 'Successfully deleted BANNED items', count: deletedCount });

    } catch (error: any) {
        console.error('Admin delete BAN error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
