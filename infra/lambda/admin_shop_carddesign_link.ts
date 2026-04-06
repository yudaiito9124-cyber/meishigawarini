/**
 * 概要: システム管理者向けショップとカードデザインの紐付け管理
 * 詳細: システム管理者が任意のショップに対して利用可能なカードデザイン(card_designs)を取得・更新できるようにします。
 * エンドポイント: POST /admin/shop/carddesign/link
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

        // パスベースのルーティング互換性
        if (event.resource.endsWith('/get')) action = 'get';
        else if (event.resource.endsWith('/update')) action = 'update';

        if (!shopIdInput) return errorResponse(400, 'Missing shop_id');
        const shopId = shopIdInput.replace(/^SHOP#/, '');

        // ====================================================================
        // ACTION: get (紐付け状況の取得)
        // ====================================================================
        if (action === 'get') {
            const { shop_id } = body as AdminApiSchema['admin_shop_carddesign_link_get'];
            // 【DB操作: GetItem】
            // 理由: 指定されたショップのメタデータを取得し、現在のデザインリストを確認。
            const res = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
            }));
            if (!res.Item) return errorResponse(404, 'Shop not found');
            return successResponse(res.Item);
        }

        // ====================================================================
        // ACTION: update (カードデザインの紐付け更新)
        // ====================================================================
        if (action === 'update') {
            const { card_designs } = body as AdminApiSchema['admin_shop_carddesign_link_update'];
            if (!Array.isArray(card_designs)) {
                return errorResponse(400, 'card_designs must be an array');
            }

            // 【DB操作: UpdateItem】
            // 理由: ショップメタデータの card_designs プロパティを上書き。
            // また、追跡のために ts_updated_at を更新します。
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
