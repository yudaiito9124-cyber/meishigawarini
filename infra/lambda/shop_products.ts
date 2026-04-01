/**
 * 概要: 商品（プロダクト）の管理 (ショップ用)
 * 詳細: 
 *  - 署名付きアセットURLの生成、商品メタデータの更新、および論理削除処理を管理します。
 *  - 商品の作成・更新時には、カードデザインの権限チェックおよびS3パスのクリーンアップが行われます。
 *
 * エンドポイント: POST /shop/products
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

const DEFAULT_VALID_DAYS = parseInt(process.env.DEFAULT_VALID_DAYS || '180');

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const shopId = getShopId(event, body);
        let action = getAction(event, body);

        if (!userId) return errorResponse(401, 'Unauthorized');

        // パスベースのルーティング互換性
        const resPath = event.resource;
        if (resPath.endsWith('/list')) action = 'list';
        else if (resPath.endsWith('/create')) action = 'create';
        else if (resPath.endsWith('/update')) action = 'update';
        else if (resPath.endsWith('/delete')) action = 'delete';

        if (!shopId) return errorResponse(400, 'Missing shopId');

        // 権限チェック
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // ====================================================================
        // ACTION: create (新規商品の作成)
        // --------------------------------------------------------------------
        // 目的: ショップに紐づく新しい商品を登録します。
        // ====================================================================
        if (action === 'create') {
            const { name, description, image_url, price, valid_days, detail_html, card_design_id } = body;
            if (!name) return errorResponse(400, 'Missing product name');
            if (!card_design_id) return errorResponse(400, 'Missing card_design_id');

            // カードデザインの利用権限チェック
            const isSystemDesign = !!getSystemDesign(card_design_id);
            const isAllowedDesign = shopMetadata.card_designs?.includes(card_design_id);
            if (!isSystemDesign && !isAllowedDesign) return errorResponse(403, 'Disallowed card_design_id');

            const productId = generateId();
            const now = new Date().toISOString();

            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}`,
                    product_id: productId, name, description,
                    detail_html: stripSignaturesInHtml(detail_html || '', BUCKET_NAME),
                    image_url: stripSignature(image_url),
                    price, valid_days: Math.min(valid_days ? parseInt(valid_days) : DEFAULT_VALID_DAYS, 180),
                    card_design_id,
                    status: 'ACTIVE',
                    GSI1_PK: 'PRODUCT#ACTIVE', GSI1_SK: now,
                    GSI2_PK: `PRODUCT#${productId}`, GSI2_SK: `SHOP#${shopId}`,
                    ts_created_at: now, ts_updated_at: now
                }
            }));
            return apiResponse(201, { product_id: productId, message: 'Product created' });
        }

        // ====================================================================
        // ACTION: list (商品一覧の取得)
        // --------------------------------------------------------------------
        // 目的: ショップに紐づく全商品を一覧取得し、デザイン情報をマージします。
        // ====================================================================
        if (action === 'list') {
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: { ':pk': `SHOP#${shopId}`, ':sk': 'PRODUCT#' }
            }));

            // DELETED 以外を抽出
            const items = (res.Items || []).filter(item => item.status !== 'DELETED');
            const cardDesignIds = Array.from(new Set(items.map(item => item.card_design_id).filter(id => !!id)));
            const designMap: Record<string, any> = {};

            if (cardDesignIds.length > 0) {
                // デザインメタデータの一括取得
                const batchRes = await ddb.send(new BatchGetCommand({
                    RequestItems: { [TABLE_NAME]: { Keys: cardDesignIds.map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id })) } }
                }));
                const rawDesigns = batchRes.Responses?.[TABLE_NAME] || [];
                for (const d of rawDesigns) {
                    designMap[d.SK] = {
                        design_id: d.SK, name: d.name, description: d.description,
                        thumbf: await signUrlIfS3(d.thumbf, BUCKET_NAME),
                        thumbb: await signUrlIfS3(d.thumbb, BUCKET_NAME),
                        bgimgf: await signUrlIfS3(d.bgimgf, BUCKET_NAME)
                    };
                }
                // システムデザインの補完
                for (const id of cardDesignIds) {
                    if (!designMap[id]) {
                        const sys = getSystemDesign(id);
                        if (sys) designMap[id] = { design_id: id, name: id, ...sys };
                    }
                }
            }

            // 画像の署名とデザイン情報のアタッチ
            for (const item of items) {
                if (item.image_url) item.image_url = await signUrlIfS3(item.image_url, BUCKET_NAME);
                if (item.detail_html) item.detail_html = await signUrlsInHtml(item.detail_html, BUCKET_NAME);
                if (item.card_design_id) item.design = designMap[item.card_design_id];
            }
            return successResponse({ items });
        }

        // ====================================================================
        // ACTION: update (商品情報の更新)
        // --------------------------------------------------------------------
        // 目的: 価格、有効期間、デザインなどの属性を部分更新します。
        // ====================================================================
        if (action === 'update') {
            const product_id = getProductId(event, body);
            const { status, name, description, image_url, price, valid_days, detail_html, card_design_id } = body;
            
            if (!product_id) return errorResponse(400, 'Missing product ID');

            // 【確認フェーズ】
            // 理由: 更新対象の商品が存在するか、および現在の状態（削除済でないか等）を事前に確認します。
            const currentRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${product_id}` }
            }));
            if (!currentRes.Item) return errorResponse(404, 'Product not found');
            if (currentRes.Item.status === 'DELETED') return errorResponse(400, 'Cannot update a deleted product');

            // 【実施フェーズ】
            const updateExpr: string[] = ['ts_updated_at = :now'];
            const attrNames: Record<string, string> = { '#status': 'status' };
            const attrValues: Record<string, any> = { ':now': new Date().toISOString() };

            if (status) {
                if (!['ACTIVE', 'STOPPED'].includes(status)) return errorResponse(400, 'Invalid status');
                updateExpr.push('#status = :status, GSI1_PK = :gsi_pk');
                attrValues[':status'] = status;
                attrValues[':gsi_pk'] = `PRODUCT#${status}`;
            }
            if (name) { updateExpr.push('#name = :name'); attrNames['#name'] = 'name'; attrValues[':name'] = name; }
            if (description !== undefined) { updateExpr.push('description = :desc'); attrValues[':desc'] = description; }
            if (image_url !== undefined) { updateExpr.push('image_url = :img'); attrValues[':img'] = stripSignature(image_url); }
            if (price !== undefined) { updateExpr.push('price = :price'); attrValues[':price'] = price; }
            if (valid_days !== undefined) { updateExpr.push('valid_days = :vd'); attrValues[':vd'] = Math.min(parseInt(valid_days), 180); }
            if (detail_html !== undefined) { updateExpr.push('detail_html = :html'); attrValues[':html'] = stripSignaturesInHtml(detail_html, BUCKET_NAME); }
            
            if (card_design_id) {
                const isSystemDesign = !!getSystemDesign(card_design_id);
                const isAllowedDesign = shopMetadata.card_designs?.includes(card_design_id);
                if (!isSystemDesign && !isAllowedDesign) return errorResponse(403, 'Disallowed card_design_id');
                updateExpr.push('card_design_id = :cdid');
                attrValues[':cdid'] = card_design_id;
            }

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${product_id}` },
                UpdateExpression: 'SET ' + updateExpr.join(', '),
                ExpressionAttributeNames: attrNames, ExpressionAttributeValues: attrValues
            }));
            return successResponse({ message: 'Product updated' });
        }

        // ====================================================================
        // ACTION: delete (商品の論理削除)
        // --------------------------------------------------------------------
        // 目的: 商品を削除済み(DELETED)状態にします。稼働中のQRがある場合は不可。
        // ====================================================================
        if (action === 'delete') {
            const product_id = getProductId(event, body);
            if (!product_id) return errorResponse(400, 'Missing product ID');

            const prodRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${product_id}` }
            }));
            if (!prodRes.Item) return errorResponse(404, 'Product not found');
            if (prodRes.Item.status !== 'STOPPED') return errorResponse(400, 'Product must be STOPPED to delete');

            // 稼働中のQRコード検索
            const [usedRes, activeRes] = await Promise.all([
                ddb.send(new QueryCommand({ TableName: TABLE_NAME, IndexName: 'GSI1', KeyConditionExpression: 'GSI1_PK = :pk', ExpressionAttributeValues: { ':pk': 'QR#USED' } })),
                ddb.send(new QueryCommand({ TableName: TABLE_NAME, IndexName: 'GSI1', KeyConditionExpression: 'GSI1_PK = :pk', ExpressionAttributeValues: { ':pk': 'QR#ACTIVE' } }))
            ]);
            const relatedQRs = [...(usedRes.Items || []), ...(activeRes.Items || [])].filter(q => q.product_id === product_id && q.shop_id === shopId);
            if (relatedQRs.length > 0) return errorResponse(409, 'Cannot delete product with active QRs');

            // 論理削除の実行
            const deletedItem = { ...prodRes.Item, status: 'DELETED', GSI1_PK: 'PRODUCT#DELETED', ts_updated_at: new Date().toISOString() };
            await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: deletedItem }));
            
            return successResponse({ message: 'Product deleted' });
        }

        return errorResponse(404, 'Unknown action');
    } catch (error: any) {
        console.error('Shop product error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
