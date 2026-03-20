/**
 * 概要: ショップ情報の取得・更新
 * 詳細: ショップのメタデータ（名前、HTML詳細、利用中の画像URL）を取得、または部分更新します。
 * エンドポイント:
 *  - POST /shop/details/get (ショップ情報の取得)
 *  - POST /shop/details/update (ショップ情報の更新)
 * リクエストボディ:
 *  - shop_id: 取得・更新対象のショップID (必須)
 *  - name: [update時] 新しいショップ名 (オプション)
 *  - detail_html: [update時] 新しいショップ詳細HTML (オプション)
 *  - html_image_urls: [update時] 現在利用中の画像URL一覧 (オプション)
 *  - deleted_html_image_urls: [update時] 削除された画像URLの一覧 (オプション)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { signUrlIfS3, stripSignature, signUrlsInHtml, deleteFileByUrl, stripSignaturesInHtml } from './utils/s3';

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
        const { shopId, name, detail_html, html_image_urls, deleted_html_image_urls } = body;

        // Determine action from path or body
        let action = body.action;
        const resPath = event.resource;
        if (resPath.endsWith('/get')) action = 'get';
        else if (resPath.endsWith('/update')) action = 'update';

        if (!shopId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing shopId' }) };
        if (!action || !['get', 'update'].includes(action)) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action: ' + action + ' for ' + resPath }) };
        }

        // 【DB操作: 内部モジュールによる GetItem・BatchGetItem】
        // - 目的: 実行ユーザーが対象ショップのオーナーまたはGMであるかの権限検証と、ショップメタデータの取得
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `SHOP#${shopId}`, SK: 'METADATA' } および { PK: `USER#${userId}`, SK: 'SHOP' }
        // - 取得カラム: ショップのメタデータ一式、およびユーザーの権限リスト
        let shopMetadata: any = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (shopMetadata === false) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        if (action === 'get') {
            const result = { ...shopMetadata };
            if (result.detail_html) {
                result.detail_html = await signUrlsInHtml(result.detail_html, BUCKET_NAME);
            }
            if (result.html_image_urls && Array.isArray(result.html_image_urls)) {
                result.html_image_urls = await Promise.all(
                    result.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                );
            }
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) };
        }

        if (action === 'update') {
            const updateExprParts = [];
            const attrNames: any = {};
            const attrValues: any = {};

            if (name !== undefined) {
                updateExprParts.push('#name = :name');
                attrNames['#name'] = 'name';
                attrValues[':name'] = name;
            }
            if (detail_html !== undefined) {
                updateExprParts.push('detail_html = :html');
                attrValues[':html'] = stripSignaturesInHtml(detail_html, BUCKET_NAME);
            }

            if (html_image_urls !== undefined) {
                const newUrls = Array.isArray(html_image_urls) ? html_image_urls.map((url: string) => stripSignature(url)) : [];
                const oldUrls = shopMetadata.html_image_urls || [];

                // S3画像削除の処理
                const toDelete = oldUrls.filter((url: string) => !newUrls.includes(url));
                for (const url of toDelete) {
                    await deleteFileByUrl(url, BUCKET_NAME);
                }

                if (deleted_html_image_urls && Array.isArray(deleted_html_image_urls)) {
                    for (const url of deleted_html_image_urls) {
                        const cleanUrl = stripSignature(url);
                        if (cleanUrl && !toDelete.includes(cleanUrl)) {
                            await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                        }
                    }
                }

                updateExprParts.push('html_image_urls = :hiu');
                attrValues[':hiu'] = newUrls;
            }

            if (updateExprParts.length === 0) {
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'No changes provided' }) };
            }

            // 【DB操作: UpdateItem】
            // - 目的: ショップの基本情報(メタデータ)の部分更新
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
            // - 更新カラム: name, detail_html, html_image_urls からリクエストで指定されたもののみ
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' },
                UpdateExpression: `SET ${updateExprParts.join(', ')}`,
                ExpressionAttributeNames: Object.keys(attrNames).length > 0 ? attrNames : undefined,
                ExpressionAttributeValues: attrValues
            }));

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Shop updated' }) };
        }

        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };
    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
