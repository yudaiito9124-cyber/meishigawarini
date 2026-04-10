/**
 * @file admin_check.ts
 * @role 管理者認証確認ハンドラー
 * @responsibility
 *  - Admin UI からの「ログイン状態と権限」の最終確認に応答します。
 *  - API Gateway Authorizer が正しく機能し、管理者の識別子（principalId）が解決できているかを検証します。
 * @context
 *  - フロントエンドの AdminLayout 等で、ページ遷移時や起動時の権限チェックに使用されます。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { successResponse, errorResponse } from './utils/response';

/**
 * 管理者認証の有効性確認。
 * 
 * @description
 * オーソライザー（adminAuthorizer）によって検証済みのリクエストのみがここに到達します。
 * 到達時点で「JWT は有効」「Administrators グループ所属」「MFA 済み」が保証されているため、
 * ここでは単に principalId を返すことで、フロントエンドへ認可成功を通知します。
 */
export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        // Authorizer によって抽出された principalId (Cognito sub) を確認
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