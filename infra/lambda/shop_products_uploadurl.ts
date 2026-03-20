/**
 * 概要: 商品画像アップロード用URLの発行
 * 詳細: S3へ画像を直接アップロードするための署名付きURL（Presigned URL）を発行します。
 * エンドポイント: POST /shop/products/upload-url
 * リクエストボディ:
 *  - shop_id: 紐付け対象のショップID (必須)
 *  - filename: アップロード予定のファイル名 (必須)
 *  - contentType: ファイルのMIMEタイプ (例: image/jpeg) (必須)
 *  - folder: 格納先指定 (例: 'shopcontent'。デフォルトはproducts) (オプション)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { signUrlIfS3 } from './utils/s3';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const s3 = new S3Client({});
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        const claims = event.requestContext?.authorizer?.claims;
        const userId = claims?.sub;
        if (!userId) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        const { shop_id, filename, contentType, folder } = body;

        if (!shop_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing shop_id' }) };
        
        // 【DB操作: 内部モジュールによる GetItem・BatchGetItem】
        // - 目的: 実行ユーザーが対象ショップのオーナーまたはGMであるかの権限を検証
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `SHOP#${shop_id}`, SK: 'METADATA' } および { PK: `USER#${userId}`, SK: 'SHOP' }
        // - 取得カラム: ショップのメタデータ一式、およびユーザーの権限リストmand が実行される PK = SHOP#{shop_id})
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shop_id, userId, event);
        if (shopMetadata === false) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        if (!filename || !contentType) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing filename or contentType' }) };

        const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid content type. Only images are allowed.' }) };
        }

        const ext = filename.split('.').pop()?.toLowerCase();
        const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid file extension. Only images are allowed.' }) };
        }

        let key = `shop/${shop_id}/products/${filename}`;
        if (folder === 'shopcontent') {
            key = `shop/${shop_id}/shopcontent/${filename}`;
        }
        
        // S3 PutObject用コマンド生成および署名付きURL発行
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: contentType
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
        const region = process.env.AWS_REGION || 'ap-northeast-1';
        const publicUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;

        // フロントエンド用の一時プレビューURL生成処理
        const signedPublicUrl = await signUrlIfS3(publicUrl, BUCKET_NAME);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ uploadUrl, publicUrl: signedPublicUrl }) };
    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
