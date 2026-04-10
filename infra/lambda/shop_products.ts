/**
 * @file shop_products.ts
 * @role ショップ用：商品（Product）管理ハンドラー
 * @responsibility
 *  - ショップが提供するギフト商品のカタログ情報を管理します。
 *  - 【S3アセット管理の安全性】
 *    DynamoDB には一時的な署名付き URL を保存せず、`stripSignature` で純粋な S3 パスのみを永続化。
 *    取得時（`list`）に `signUrlIfS3` を通じて動的に閲覧用 URL を生成することで、URL の期限切れや流出を防ぎます。
 *  - 【デザイン資産の保護】
 *    ショップが利用できるカードデザイン（`design_id`）を厳格に制限。システム共通デザイン、または管理者が当該ショップに個別に許可したもののみが設定可能です。
 *  - 【安全な削除（Logical Delete）】
 *    `status = DELETED` による論理削除を実装。既にアクティブなギフト券（QR）が紐付いている場合は、整合性保護のため削除を拒否します。
 * @context
 *  - 店舗が「どのカードで何を贈るか」を定義するための、マスターデータ管理の主要な口となります。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { generateId } from './utils/id';
import { stripSignaturesInHtml, stripSignature, signUrlIfS3, signUrlsInHtml } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { successResponse, errorResponse, apiResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getProductId, getShopId, getAction, getUserId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';

const DEFAULT_VALID_DAYS = parseInt(process.env.DEFAULT_VALID_DAYS || '180');

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const shopId = getShopId(event, body);
        let action = getAction(event, body);

        if (!userId) return errorResponse(401, 'Unauthorized');

        // 互換性: 旧パスベースのルーティングに対応
        const resPath = event.resource;
        if (resPath.endsWith('/list')) action = 'list';
        else if (resPath.endsWith('/create')) action = 'create';
        else if (resPath.endsWith('/update')) action = 'update';
        else if (resPath.endsWith('/delete')) action = 'delete';

        if (!shopId) return errorResponse(400, 'Missing shopId');

        // 権限検証: ショップの管理者であることを確認
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // --------------------------------------------------------------------
        // ACTION: create (新規商品の作成)
        // 目的: ショップ固有のギフト券（商品）を新規登録。
        // --------------------------------------------------------------------
        if (action === 'create') {
            const { name, description, image_url, price, valid_days, detail_html, design_id } = body as ShopApiSchema['shop_products_create'];
            if (!name) return errorResponse(400, 'Missing product name');
            if (!design_id) return errorResponse(400, 'Missing design_id');

            // セキュリティ: 指定されたデザイン ID がそのショップで許可されているか評価
            const isSystemDesign = !!getSystemDesign(design_id);
            const isAllowedDesign = shopMetadata.card_designs?.includes(design_id);
            if (!isSystemDesign && !isAllowedDesign) return errorResponse(403, 'Disallowed design_id');

            const productId = generateId();
            const now = new Date().toISOString();

            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}`,
                    product_id: productId, name, description,
                    // 重要: RichText 領域内の画像 URL から署名を除去して保存
                    detail_html: stripSignaturesInHtml(detail_html || '', BUCKET_NAME),
                    image_url: stripSignature(image_url),
                    price, valid_days: Math.min(valid_days || DEFAULT_VALID_DAYS, 180),
                    design_id,
                    status: 'ACTIVE',
                    GSI1_PK: 'PRODUCT#ACTIVE', GSI1_SK: now,
                    GSI2_PK: `PRODUCT#${productId}`, GSI2_SK: now,
                    ts_created_at: now, ts_updated_at: now
                }
            }));
            return apiResponse(201, { product_id: productId, message: 'Product created' });
        }

        // --------------------------------------------------------------------
        // ACTION: list (商品一覧の取得とアセットの署名)
        // 目的: カタログデータを取得し、ブラウザで表示可能な URL へ結合・変換。
        // --------------------------------------------------------------------
        if (action === 'list') {
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: { ':pk': `SHOP#${shopId}`, ':sk': 'PRODUCT#' }
            }));

            // 論理削除済みのアイテムは非表示
            const items = (res.Items || []).filter(item => item.status !== 'DELETED');
            
            // 下位互換処理
            items.forEach(item => {
                if (!item.design_id && (item as any).card_design_id) {
                    item.design_id = (item as any).card_design_id;
                }
            });

            // 【Enrichment: カードデザインのメタデータを一括マージ】
            const designIds = Array.from(new Set(items.map(item => item.design_id).filter(id => !!id)));
            const designMap: Record<string, any> = {};

            if (designIds.length > 0) {
                const batchRes = await ddb.send(new BatchGetCommand({
                    RequestItems: { [TABLE_NAME]: { Keys: designIds.map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id })) } }
                }));
                const rawDesigns = batchRes.Responses?.[TABLE_NAME] || [];
                for (const d of rawDesigns) {
                    designMap[d.SK] = {
                        design_id: d.SK, name: d.name, description: d.description,
                        width: d.width, height: d.height,
                        thumbf: await signUrlIfS3(d.thumbf, BUCKET_NAME),
                        thumbb: await signUrlIfS3(d.thumbb, BUCKET_NAME),
                        bgimgf: await signUrlIfS3(d.bgimgf, BUCKET_NAME)
                    };
                }
                // システム標準デザインのフォールバック
                for (const id of designIds) {
                    if (!designMap[id]) {
                        const sys = getSystemDesign(id);
                        if (sys) designMap[id] = { design_id: id, name: id, ...sys };
                    }
                }
            }

            // 【URL 署名: 相対パスを一時的な閲覧用 URL へ置換】
            for (const item of items) {
                if (item.image_url) item.image_url = await signUrlIfS3(item.image_url, BUCKET_NAME);
                if (item.detail_html) item.detail_html = await signUrlsInHtml(item.detail_html, BUCKET_NAME);
                if (item.design_id) item.design = designMap[item.design_id];
            }
            return successResponse({ items });
        }

        // --------------------------------------------------------------------
        // ACTION: update (商品の属性更新)
        // 目的: 既存商品の価格やデザインの変更に対応。
        // --------------------------------------------------------------------
        if (action === 'update') {
            const product_id = getProductId(event, body);
            const { status, name, description, image_url, price, valid_days, detail_html, design_id } = body as ShopApiSchema['shop_products_update'];
            
            if (!product_id) return errorResponse(400, 'Missing product ID');

            const currentRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${product_id}` }
            }));
            if (!currentRes.Item) return errorResponse(404, 'Product not found');
            if (currentRes.Item.status === 'DELETED') return errorResponse(400, 'Cannot update a deleted product');

            const updateExpr: string[] = ['ts_updated_at = :now'];
            const attrNames: Record<string, string> = { '#status': 'status' };
            const attrValues: Record<string, any> = { ':now': new Date().toISOString() };

            if (status) {
                if (!['ACTIVE', 'STOPPED'].includes(status)) return errorResponse(400, 'Invalid status');
                updateExpr.push('#status = :status, GSI1_PK = :gsi_pk, GSI1_SK = :now');
                attrValues[':status'] = status;
                attrValues[':gsi_pk'] = `PRODUCT#${status}`;
            }
            if (name) { updateExpr.push('#name = :name'); attrNames['#name'] = 'name'; attrValues[':name'] = name; }
            if (description !== undefined) { updateExpr.push('description = :desc'); attrValues[':desc'] = description; }
            // 保存前に S3 パスから署名（QueryString）を除去
            if (image_url !== undefined) { updateExpr.push('image_url = :img'); attrValues[':img'] = stripSignature(image_url); }
            if (price !== undefined) { updateExpr.push('price = :price'); attrValues[':price'] = price; }
            if (valid_days !== undefined) { updateExpr.push('valid_days = :vd'); attrValues[':vd'] = Math.min(valid_days, 180); }
            if (detail_html !== undefined) { updateExpr.push('detail_html = :html'); attrValues[':html'] = stripSignaturesInHtml(detail_html, BUCKET_NAME); }
            
            if (design_id) {
                const isSystemDesign = !!getSystemDesign(design_id);
                const isAllowedDesign = shopMetadata.card_designs?.includes(design_id);
                if (!isSystemDesign && !isAllowedDesign) return errorResponse(403, 'Disallowed design_id');
                updateExpr.push('design_id = :cdid');
                attrValues[':cdid'] = design_id;
            }

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${product_id}` },
                UpdateExpression: 'SET ' + updateExpr.join(', '),
                ExpressionAttributeNames: attrNames, ExpressionAttributeValues: attrValues
            }));
            return successResponse({ message: 'Product updated' });
        }

        // --------------------------------------------------------------------
        // ACTION: delete (商品の論理削除と安全チェック)
        // 目的: 公開停止済みの商品を削除（DELETED 状態に移行）させます。
        // --------------------------------------------------------------------
        if (action === 'delete') {
            const product_id = getProductId(event, body);
            if (!product_id) return errorResponse(400, 'Missing product ID');

            const prodRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${product_id}` }
            }));
            if (!prodRes.Item) return errorResponse(404, 'Product not found');
            if (prodRes.Item.status !== 'STOPPED') return errorResponse(400, 'Product must be STOPPED to delete');

            // 安全チェック: 現在進行中の QR コードが存在する場合は削除を許可しない
            const [usedRes, activeRes] = await Promise.all([
                ddb.send(new QueryCommand({ TableName: TABLE_NAME, IndexName: 'GSI1', KeyConditionExpression: 'GSI1_PK = :pk', ExpressionAttributeValues: { ':pk': 'QR#USED' } })),
                ddb.send(new QueryCommand({ TableName: TABLE_NAME, IndexName: 'GSI1', KeyConditionExpression: 'GSI1_PK = :pk', ExpressionAttributeValues: { ':pk': 'QR#ACTIVE' } }))
            ]);
            const relatedQRs = [...(usedRes.Items || []), ...(activeRes.Items || [])].filter(q => q.product_id === product_id && q.shop_id === shopId);
            if (relatedQRs.length > 0) return errorResponse(409, 'Cannot delete product with active QRs');

            // 論理削除の実施
            const deletedItem = { ...prodRes.Item, status: 'DELETED', GSI1_PK: 'PRODUCT#DELETED', GSI1_SK: new Date().toISOString(), ts_updated_at: new Date().toISOString() };
            await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: deletedItem }));
            
            return successResponse({ message: 'Product deleted' });
        }

        return errorResponse(404, 'Unknown action');
    } catch (error: any) {
        console.error('Shop product error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
