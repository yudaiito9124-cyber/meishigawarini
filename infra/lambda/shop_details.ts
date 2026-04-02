/**
 * 概要: ショップ情報の取得・更新 (ショップ用)
 * 詳細: 
 *  - ショップのメタデータ（ショップ名、詳細説明HTML、アセット画像URL）の取得(get)と部分更新(update)を行います。
 *  - 更新時には、S3の署名付きURLの自動除去、および不要になった旧画像の物理削除を管理します。
 *
 * エンドポイント: POST /shop/details
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { signUrlsInHtml, signUrlIfS3, stripSignaturesInHtml, stripSignature, deleteFileByUrl } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getShopId, getAction, getUserId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const shopId = getShopId(event, body);
        let action = getAction(event, body);

        // パスベースのルーティング互換性
        const resPath = event.resource;
        if (resPath.endsWith('/get')) action = 'get';
        else if (resPath.endsWith('/update')) action = 'update';

        if (!shopId) return errorResponse(400, 'Missing shopId');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // 【DB操作: 内部モジュールによる GetItem・BatchGetItem】
        // 理由: 権限検証と同時に、ショップの全メタデータを取得。
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // ====================================================================
        // ACTION: get (ショップ詳細の取得)
        // ====================================================================
        if (action === 'get') {
            const result = { ...shopMetadata };
            
            // HTML内および画像URLリストに署名を付与
            if (result.detail_html) {
                result.detail_html = await signUrlsInHtml(result.detail_html, BUCKET_NAME);
            }
            if (result.html_image_urls && Array.isArray(result.html_image_urls)) {
                result.html_image_urls = await Promise.all(
                    result.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                );
            }

            // ショップに許可されているカードデザイン情報を一括取得(BatchGet)
            if (result.card_designs && Array.isArray(result.card_designs) && result.card_designs.length > 0) {
                const keys = result.card_designs.map((id: string) => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
                const batchRes = await ddb.send(new BatchGetCommand({
                    RequestItems: { [TABLE_NAME]: { Keys: keys } }
                }));

                const rawDesigns = batchRes.Responses?.[TABLE_NAME] || [];
                const designList = await Promise.all(rawDesigns.map(async (d) => ({
                    design_id: d.SK, name: d.name, description: d.description,
                    thumbf: d.thumbf ? await signUrlIfS3(d.thumbf, BUCKET_NAME) : undefined,
                    thumbb: d.thumbb ? await signUrlIfS3(d.thumbb, BUCKET_NAME) : undefined,
                    bgimgf: d.bgimgf ? await signUrlIfS3(d.bgimgf, BUCKET_NAME) : undefined
                })));
                
                // システムデザインの補完
                for (const id of result.card_designs) {
                    const sys = getSystemDesign(id);
                    if (sys && !designList.find(d => d.design_id === id)) {
                        designList.push({ design_id: id, name: id, description: "System Design", ...sys } as any);
                    }
                }
                result.allowed_designs = designList;
            } else {
                result.allowed_designs = [];
            }
            return successResponse(result);
        }

        // ====================================================================
        // ACTION: update (ショップ詳細の更新)
        // ====================================================================
        if (action === 'update') {
            const { name, detail_html, html_image_urls, deleted_html_image_urls } = body as ShopApiSchema['shop_details_update'];
            const updateExpr: string[] = ['ts_updated_at = :now'];
            const attrNames: any = {};
            const attrValues: any = { ':now': new Date().toISOString() };

            if (name !== undefined) { updateExpr.push('#name = :name'); attrNames['#name'] = 'name'; attrValues[':name'] = name; }
            if (detail_html !== undefined) { updateExpr.push('detail_html = :html'); attrValues[':html'] = stripSignaturesInHtml(detail_html, BUCKET_NAME); }

            // 画像URLリストの更新とS3クリーンアップ
            if (html_image_urls !== undefined) {
                const newUrls = Array.isArray(html_image_urls) ? html_image_urls.map((url: string) => stripSignature(url)) : [];
                const oldUrls = shopMetadata.html_image_urls || [];

                // 旧URLリストから消えた画像をS3から物理削除
                const toDelete = oldUrls.filter((url: string) => !newUrls.includes(url));
                for (const url of toDelete) await deleteFileByUrl(url, BUCKET_NAME);

                // 明示的な削除リクエストがあれば実行 (歴史的互換性)
                if (deleted_html_image_urls && Array.isArray(deleted_html_image_urls)) {
                    for (const url of deleted_html_image_urls) {
                        const cleanUrl = stripSignature(url);
                        if (cleanUrl && !toDelete.includes(cleanUrl)) await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                    }
                }
                updateExpr.push('html_image_urls = :hiu');
                attrValues[':hiu'] = newUrls;
            }

            // 【DB操作: UpdateItem】
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' },
                UpdateExpression: `SET ${updateExpr.join(', ')}`,
                ExpressionAttributeNames: Object.keys(attrNames).length > 0 ? attrNames : undefined,
                ExpressionAttributeValues: attrValues
            }));

            return successResponse({ message: 'Shop updated' });
        }

        return errorResponse(400, 'Invalid action');
    } catch (error: any) {
        console.error('Shop details error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
