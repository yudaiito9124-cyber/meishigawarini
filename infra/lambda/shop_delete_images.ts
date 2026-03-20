/**
 * 概要: S3画像ファイルの削除
 * 詳細: 指定されたS3オブジェクト（画像）を削除します。ショップに属するファイルのみ削除可能です。
 * エンドポイント: POST /shop/delete-images
 * リクエストボディ:
 *  - shop_id: 紐付け対象のショップID (必須)
 *  - urls: 削除するS3画像URLの配列 (必須)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { stripSignature, deleteFileByUrl } from './utils/s3';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
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

        const authorizer = event.requestContext?.authorizer;
        const userId = authorizer?.principalId;
        const claims = authorizer;
        if (!userId) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        const { shopId, urls } = body;

        if (!shopId || !urls || !Array.isArray(urls)) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing shopId or urls array' }) };
        }
        
        // 【DB操作: 内部モジュールによる GetItem・BatchGetItem】
        // - 目的: 実行ユーザーが対象ショップのオーナーまたはGMであるかの権限を検証し、ショップ情報を取得
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `SHOP#${shopId}`, SK: 'METADATA' } および { PK: `USER#${userId}`, SK: 'SHOP' }
        // - 取得カラム: ショップのメタデータ一式(owner_id, gm_ids 等)
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (shopMetadata === false) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        for (const url of urls) {
            // S3画像削除のセキュリティチェック (バケット名とショップIDが含まれているか確認)
            const cleanUrl = stripSignature(url);
            if (cleanUrl && cleanUrl.includes(BUCKET_NAME) && cleanUrl.includes(`/shop/${shopId}/`)) {
                // S3 DeleteObject を実行
                await deleteFileByUrl(cleanUrl, BUCKET_NAME);
            }
        }

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Images deleted' }) };

    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
