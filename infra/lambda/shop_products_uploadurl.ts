/**
 * 概要: 商品画像アップロード用のURL生成 (ショップ用)
 * 詳細: 
 *  - ショップ管理者が新商品の画像をアップロードするためのS3署名付きURL(PutObject)を発行します。
 *  - オブジェクトキーは `shop/{shopId}/products/{productId}/{id}.ext` の形式で保存され、ショップごとのディレクトリ分離を保証します。
 *
 * エンドポイント: POST /shop/products/upload-url
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { generateId } from './utils/id';
import { getPublicUrl, getPresignedViewUrl } from './utils/s3';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getShopId, getUserId, getProductId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';

const s3 = new S3Client({});

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}') as ShopApiSchema['shop_products_uploadurl'];
        const userId = getUserId(event);
        const shopId = getShopId(event, body);
        const productId = getProductId(event, body);
        const { filename, content_type, folder } = body;
        const finalContentType = content_type || 'image/jpeg';
        
        if (!shopId || !filename) return errorResponse(400, 'Missing required fields');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // ...権限チェック...
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        const id = generateId();
        const ext = filename.split('.').pop() || 'bin';
        
        // S3キーの構築 logic (HEAD~2 互換)
        let key = `shop/${shopId}/products/${productId || 'undefined'}/${id}.${ext}`;
        if (folder === 'shopcontent') {
            key = `shop/${shopId}/shopcontent/${filename}`;
        }

        // S3 PutObject 署名付きURLの生成 (有効期限: 1時間)
        // 理由: フロントエンドから直接S3へ安全に画像をアップロードさせるためのトークンを発行。
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: finalContentType,
            ACL: 'private'
        });
        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const finalUrl = getPublicUrl(BUCKET_NAME, key);
        const viewUrl = await getPresignedViewUrl(BUCKET_NAME, key, 3600); // 1h signed GET URL for immediate preview

        return successResponse({
            uploadUrl,
            key,
            fileUrl: finalUrl,
            publicUrl: finalUrl, // Stored in DB
            viewUrl // For immediate UI preview
        });

    } catch (error: any) {
        console.error('Shop products upload-url error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
