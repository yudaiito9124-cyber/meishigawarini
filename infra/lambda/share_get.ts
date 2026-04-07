/**
 * 概要: シェア用公開情報の取得
 * 詳細: 
 *  - PIN認証なしで、QR IDに関連付けられた公開可能なギフト情報（商品、ショップ、デザイン）を取得します。
 *  - 被贈答者の個人情報や、贈り主(Sender)の氏名・プロフィール・メッセージ等は一切含みません。
 *  - ギフトがBANNED（利用停止）状態の場合はエラーを返します。
 *
 * エンドポイント: GET /share/{qr_id}
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { signUrlIfS3, signUrlsInHtml } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { checkAndExpire } from './utils/expiration';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getQrId } from './utils/request';
import { PublicApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        
        const qr_id = getQrId(event);
        if (!qr_id) return errorResponse(400, 'Missing qr_id');

        // 【フェーズ 1: ギフトの基本ステータス確認】
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        if (!qrRes.Item) return errorResponse(404, 'Gift Not Found');

        const item = qrRes.Item;
        const currentStatus = await checkAndExpire(ddb, TABLE_NAME, qr_id, item as any);

        // BANNED（停止中）の場合は情報を返さない
        if (item.status === 'BANNED') {
            return errorResponse(403, 'This gift is restricted');
        }

        // 【フェーズ 2: 関連情報の取得 (Enrichment)】
        const shopId = item.shop_id;
        const productId = item.product_id;
        const designId = item.design_id || (item as any).card_design;

        const keys = [];
        if (shopId) keys.push({ PK: `SHOP#${shopId}`, SK: 'METADATA' });
        if (shopId && productId) keys.push({ PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` });
        if (designId) keys.push({ PK: 'CARD_DESIGN#METADATA', SK: designId });

        let shop: any = null;
        let product: any = null;
        let design: any = null;

        if (keys.length > 0) {
            const batchRes = await ddb.send(new BatchGetCommand({
                RequestItems: { [TABLE_NAME]: { Keys: keys } }
            }));
            const responses = batchRes.Responses?.[TABLE_NAME] || [];

            shop = responses.find(r => r.PK === `SHOP#${shopId}` && r.SK === 'METADATA');
            product = responses.find(r => r.PK === `SHOP#${shopId}` && r.SK === `PRODUCT#${productId}`);
            const designMeta = responses.find(r => r.PK === 'CARD_DESIGN#METADATA' && r.SK === designId);
            design = designMeta || (designId ? getSystemDesign(designId) : null);
        }

        // 【フェーズ 3: レスポンスの構築】
        // セキュリティのため、公開して良い項目のみを厳選して返却
        const result = {
            qr_id,
            status: currentStatus,
            shop: shop ? {
                name: shop.name || 'Unknown Shop',
                // detail_html は必要に応じて含める（署名が必要な画像が含まれている可能性があるため signUrlsInHtml を通す）
                detail_html: shop.detail_html ? await signUrlsInHtml(shop.detail_html, BUCKET_NAME) : undefined
            } : null,
            // 受け取りページ(receive_verify.ts)との互換性のためのフィールド
            shop_name: shop?.name,
            shop_detail_html: shop?.detail_html ? await signUrlsInHtml(shop.detail_html, BUCKET_NAME) : undefined,
            product: product ? {
                name: product.name,
                image_url: product.image_url ? await signUrlIfS3(product.image_url, BUCKET_NAME) : undefined,
                detail_html: product.detail_html ? await signUrlsInHtml(product.detail_html, BUCKET_NAME) : undefined,
                price: product.price // 価格は公開情報として含めても良いか？（通常はギフトなので隠す場合もあるが、シェア用ならあっても良いかも。今回は含める）
            } : null,
            design: design ? {
                design_id: designId,
                thumbf: design.thumbf?.startsWith('/') ? design.thumbf : await signUrlIfS3(design.thumbf, BUCKET_NAME),
                thumbb: design.thumbb?.startsWith('/') ? design.thumbb : await signUrlIfS3(design.thumbb, BUCKET_NAME),
                bgimgf: design.bgimgf?.startsWith('/') ? design.bgimgf : await signUrlIfS3(design.bgimgf, BUCKET_NAME),
                bgimgb: design.bgimgb?.startsWith('/') ? design.bgimgb : await signUrlIfS3(design.bgimgb, BUCKET_NAME)
            } : null
        };

        return successResponse(result);

    } catch (error: any) {
        console.error('Share info error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
