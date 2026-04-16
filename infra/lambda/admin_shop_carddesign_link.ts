/**
 * @file admin_shop_carddesign_link.ts
 * @role 管理者用：ショップ・デザイン紐付け管理ハンドラー
 * @responsibility
 *  - 特定のショップが利用可能なカードデザイン（利用可能リスト）を取得および一括更新します。
 *  - 【権限制御】ショップ側でギフト（QR）を生成する際、ここで設定された `card_designs` 配列に含まれるデザインのみが選択可能になります。
 *  - 【シンプル設計】複雑なリレーションテーブルは持たず、ショップのメタデータレコードにデザイン ID の配列として直接保持します。
 * @context
 *  - 営業担当やシステム管理者が、契約内容に応じてショップに特定のデザイン（企業ロゴ入り等）を解放する際に使用されます。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getShopId, getAction } from './utils/request';
import { AdminApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        const body = JSON.parse(event.body || '{}');
        const shopIdInput = getShopId(event, body);
        let action = getAction(event, body);

        // 互換性処理: パスベースのルーティング（/admin/shop/carddesign/link/get 等）からの呼び出しに対応
        if (event.resource.endsWith('/get')) action = 'get';
        else if (event.resource.endsWith('/update')) action = 'update';

        if (!shopIdInput) return errorResponse(400, 'Missing shop_id');
        const shopId = shopIdInput.replace(/^SHOP#/, '');

        // --------------------------------------------------------------------
        // ACTION: get (紐付け状況の取得)
        // 目的: 指定されたショップの現在のメタデータを取得し、設定済みのデザイン ID リストを確認します。
        // --------------------------------------------------------------------
        if (action === 'get') {
            const res = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
            }));
            if (!res.Item) return errorResponse(404, 'Shop not found');
            
            // レスポンスにはショップメタデータが丸ごと含まれます（card_designs 配列を含む）
            return successResponse(res.Item);
        }

        // --------------------------------------------------------------------
        // ACTION: update (デザイン紐付けの更新)
        // 目的: ショップが利用可能なデザイン ID リストを一括上書きします。
        // --------------------------------------------------------------------
        if (action === 'update') {
            const { card_designs } = body as AdminApiSchema['admin_shop_carddesign_link_update'];
            if (!Array.isArray(card_designs)) {
                return errorResponse(400, 'card_designs must be an array');
            }

            // 更新履歴のため ts_updated_at も更新
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' },
                UpdateExpression: 'SET card_designs = :cd, ts_updated_at = :now',
                ExpressionAttributeValues: { ':cd': card_designs, ':now': new Date().toISOString() }
            }));

            return successResponse({ message: 'Shop card designs updated successfully' });
        }

        return errorResponse(400, 'Invalid action');

    } catch (error: any) {
        console.error('Admin shop carddesign link error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
