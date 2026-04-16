/**
 * @file shop_delete_images.ts
 * @role ショップ用：画像ファイル（S3 アセット）物理削除ハンドラー
 * @responsibility
 *  - 指定された S3 オブジェクト（商品画像等）をバケットから物理的に削除します。
 *  - 【厳格なパス検証】削除実行前に、URL が自身のショップディレクトリ（`shop/{shopId}/`）に属していることを文字列レベルで検証し、他ショップやシステム重要ファイルの誤削除を防止します。
 *  - 【クリーンアップ】不要になったアセットを抹消することで、ストレージコストの最適化とデータ整合性の維持に寄与します。
 * @context
 *  - 商品編集画面等で「古い画像を消して新しいものをアップロードする」際のリソース整理用に呼び出されます。
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
