/**
 * @file shop_details.ts
 * @role ショップ用：店舗プロフィール・設定管理ハンドラー
 * @responsibility
 *  - 店舗名、説明文（HTML）、および店舗紹介用の画像アセットを管理します。
 *  - 【アセット・ライフサイクル管理】
 *    - 更新時（`update`）: 新旧の画像 URL リストを比較し、不要になった画像を S3 から物理削除（`deleteFileByUrl`）します。これによりストレージの肥大化を防ぎます。
 *    - 保存時: `stripSignature` により、署名情報（QueryString）を除去した純粋なパスのみを DynamoDB に永続化します。
 *    - 取得時（`get`）: 保存されたパスに対し、動的に署名を付与し、ブラウザで閲覧可能な URL へ変換します。
 *  - 【デザイン認可の集約】
 *    - 店舗に許可されているカードデザイン一覧（`card_designs`）を、リッチなデザインメタデータへ変換（Enrichment）して返却します。
 * @context
 *  - 被贈答者が商品選択画面などで目にする「店舗情報」を司る、ブランディングの根幹となるハンドラーです。
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

        // 互換性: 旧パスベースのルーティングに対応
        const resPath = event.resource;
        if (resPath.endsWith('/get')) action = 'get';
        else if (resPath.endsWith('/update')) action = 'update';

        if (!shopId) return errorResponse(400, 'Missing shopId');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // 権限検証: 同時に最新のショップメタデータを取得
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // --------------------------------------------------------------------
        // ACTION: get (ショップ詳細の取得と情報の整形)
        // 目的: 管理画面表示用に、署名付き URL の生成とデザイン情報の結合を行います。
        // --------------------------------------------------------------------
        if (action === 'get') {
            const result = { ...shopMetadata };
            
            // RichText (HTML) 内の S3 パスを署名付き URL へ置換
            if (result.detail_html) {
                result.detail_html = await signUrlsInHtml(result.detail_html, BUCKET_NAME);
            }
            // 画像配列の署名化
            if (result.html_image_urls && Array.isArray(result.html_image_urls)) {
                result.html_image_urls = await Promise.all(
                    result.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                );
            }

            // 【Enrichment】許可されているカードデザイン情報を BatchGet で一括取得
            const allowedDesignIds = result.card_designs;
            if (allowedDesignIds && Array.isArray(allowedDesignIds) && allowedDesignIds.length > 0) {
                const keys = allowedDesignIds.map((id: string) => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
                const batchRes = await ddb.send(new BatchGetCommand({
                    RequestItems: { [TABLE_NAME]: { Keys: keys } }
                }));

                const rawDesigns = batchRes.Responses?.[TABLE_NAME] || [];
                const designList = await Promise.all(rawDesigns.map(async (d) => ({
                    design_id: d.SK, name: d.name, description: d.description,
                    width: d.width, height: d.height,
                    thumbf: d.thumbf ? await signUrlIfS3(d.thumbf, BUCKET_NAME) : undefined,
                    thumbb: d.thumbb ? await signUrlIfS3(d.thumbb, BUCKET_NAME) : undefined,
                    bgimgf: d.bgimgf ? await signUrlIfS3(d.bgimgf, BUCKET_NAME) : undefined
                })));
                
                // システム共通デザインの補完
                for (const id of allowedDesignIds) {
                    const sys = getSystemDesign(id);
                    if (sys && !designList.find(d => d.design_id === id)) {
                        designList.push({ design_id: id, name: id, description: "System Design", ...sys } as any);
                    }
                }
                result.allowed_designs = designList;
            } else {
                result.allowed_designs = [];
            }
            
            // レスポンスのクリーンアップ: 内部管理用の ID 配列は削除
            delete result.card_designs;
            
            return successResponse(result);
        }

        // --------------------------------------------------------------------
        // ACTION: update (ショップ情報の部分更新とアセット掃除)
        // 目的: プロフィール更新、および「使われなくなった画像」の自動削除。
        // --------------------------------------------------------------------
        if (action === 'update') {
            const {
                name,
                detail_html,
                html_image_urls,
                deleted_html_image_urls,
                shop_postal_code,
                shop_address,
                shop_phone
            } = body as ShopApiSchema['shop_details_update'];
            const updateExpr: string[] = ['ts_updated_at = :now'];
            const attrNames: any = {};
            const attrValues: any = { ':now': new Date().toISOString() };

            if (name !== undefined) { updateExpr.push('#name = :name'); attrNames['#name'] = 'name'; attrValues[':name'] = name; }
            // 保存前に署名を除去（DB には純粋な S3 Key のみを格納する方針）
            if (detail_html !== undefined) { updateExpr.push('detail_html = :html'); attrValues[':html'] = stripSignaturesInHtml(detail_html, BUCKET_NAME); }
            if (shop_postal_code !== undefined) { updateExpr.push('shop_postal_code = :shop_postal_code'); attrValues[':shop_postal_code'] = shop_postal_code; }
            if (shop_address !== undefined) { updateExpr.push('shop_address = :shop_address'); attrValues[':shop_address'] = shop_address; }
            if (shop_phone !== undefined) { updateExpr.push('shop_phone = :shop_phone'); attrValues[':shop_phone'] = shop_phone; }

            // 画像 URL リストの同期と物理削除処理
            if (html_image_urls !== undefined) {
                const newUrls = Array.isArray(html_image_urls) ? html_image_urls.map((url: string) => stripSignature(url)) : [];
                const oldUrls = shopMetadata.html_image_urls || [];

                // 【物理削除】以前のリストにはあったが、新しいリストからは消えた画像を S3 から抹消
                const toDelete = oldUrls.filter((url: string) => !newUrls.includes(url));
                for (const url of toDelete) await deleteFileByUrl(url, BUCKET_NAME);

                // 歴史的互換性: クライアントが明示的に削除を要求した場合も対応
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
