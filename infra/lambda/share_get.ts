/**
 * @file share_get.ts
 * @role 一般公開用：ギフト券公開情報取得ハンドラー
 * @responsibility
 *  - SNS 等でシェアされたギフト ID を元に、公開可能な範囲の商品・店舗情報を返却します。
 *  - 【プライバシー保護の徹底】
 *    - シェア用エンドポイントは PIN 認証を必要としないため、被贈答者の実名、配送先、メッセージ内容、贈り主の個人プロフィール等は一切含めない設計になっています。
 *    - ユーザーのプライバシーを侵害することなく、受け取ったデジタルギフトの「嬉しさ（商品とデザイン）」だけをシェア可能です。
 *  - 【可視性の制御（Kill-switch）】
 *    - `status === 'BANNED'` の場合のみ、情報の開示を完全にブロックします。その他の状態（EXPIRED 等）では、アーカイブとして過去の情報を閲覧可能です。
 *  - 【パブリック・エンリッチメント】
 *    - `BatchGetCommand` を用い、ショップ情報、商品情報、デザイン情報を一括取得し、必要最低限の項目に絞って返却します。
 * @context
 *  - 認証なしでアクセスされるため、セキュリティとプライバシーへの配慮が最も強く求められる領域です。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { signUrlIfS3, signUrlsInHtml } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { checkAndExpire } from './utils/expiration';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getQrId } from './utils/request';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        
        const qr_id = getQrId(event);
        if (!qr_id) return errorResponse(400, 'Missing qr_id');

        // 1. ギフトの基本ステータス確認
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        if (!qrRes.Item) return errorResponse(404, 'Gift Not Found');

        const item = qrRes.Item;
        const currentStatus = await checkAndExpire(ddb, TABLE_NAME, qr_id, item as any);

        // BANNED（停止中）の場合は情報を一切返さない（緊急遮断）
        if (item.status === 'BANNED') {
            return errorResponse(403, 'This gift is restricted');
        }

        // 2. 関連情報の結合（Enrichment）
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

        // 3. レスポンスの構築（厳選された公開項目のみ）
        const result = {
            qr_id,
            status: currentStatus,
            shop: shop ? {
                name: shop.name || 'Unknown Shop',
                detail_html: shop.detail_html ? await signUrlsInHtml(shop.detail_html, BUCKET_NAME) : undefined
            } : null,
            // 被贈答者用 verify ページ等との互換性フィールド。
            shop_name: shop?.name,
            shop_detail_html: shop?.detail_html ? await signUrlsInHtml(shop.detail_html, BUCKET_NAME) : undefined,
            product: product ? {
                name: product.name,
                image_url: product.image_url ? await signUrlIfS3(product.image_url, BUCKET_NAME) : undefined,
                detail_html: product.detail_html ? await signUrlsInHtml(product.detail_html, BUCKET_NAME) : undefined,
                price: product.price
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
