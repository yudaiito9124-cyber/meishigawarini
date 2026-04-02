/**
 * 概要: ショップ関連の画像ファイル物理削除 (ショップ用)
 * 詳細: 
 *  - 指定されたS3オブジェクト（画像等）をバケットから物理的に削除します。
 *  - 削除実行前に、URLが自身のショップ(`shop/{shopId}/`)に属していることを厳格に検証し、不正な削除を防止します。
 *
 * エンドポイント: POST /shop/delete-images
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { stripSignature, deleteFileByUrl } from './utils/s3';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getShopId, getUserId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}') as ShopApiSchema['shop_delete_images'];
        const userId = getUserId(event);
        const shopId = getShopId(event, body);
        const { urls } = body;
        
        if (!shopId || !Array.isArray(urls)) {
            return errorResponse(400, 'Missing shopId or urls array');
        }
        if (!userId) return errorResponse(401, 'Unauthorized');

        // 【DB操作: 内部モジュールによる GetItem・BatchGetItem】
        // 理由: 実行ユーザーの管理権限を検証。
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        const deletedUrls = [];
        for (const url of urls) {
            const cleanUrl = stripSignature(url);
            
            // セキュリティチェック: バケット名が一致し、パスにショップIDが含まれていることを確認
            if (cleanUrl && cleanUrl.includes(BUCKET_NAME) && cleanUrl.includes(`/shop/${shopId}/`)) {
                // S3 DeleteObject を実行
                // 理由: 不要になった商品画像等をリソース節約のために削除。
                await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                deletedUrls.push(cleanUrl);
            }
        }

        return successResponse({ message: 'Images deleted', count: deletedUrls.length });

    } catch (error: any) {
        console.error('Shop delete images error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
