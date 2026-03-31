/**
 * 概要: 管理者認証の有効性確認 (管理者用)
 * 詳細: 
 *  - API Gatewayのオーソライザー経由での呼び出しを検証し、管理者が正しく認証されている場合に200 OKを返します。
 *  - フロントエンドでの管理画面アクセス時の疎通確認に使用されます。
 *
 * エンドポイント: GET /admin/check
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { successResponse, errorResponse } from './utils/response';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        // オーソライザーによって principalId がセットされていることを確認
        const authorizer = event.requestContext?.authorizer;
        if (!authorizer || !authorizer.principalId) {
            return errorResponse(401, 'Unauthorized');
        }

        return successResponse({ 
            message: "Authenticated as Admin",
            admin_id: authorizer.principalId
        });

    } catch (error: any) {
        console.error('Admin check error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};