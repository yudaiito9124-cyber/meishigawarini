/**
 * 概要: 商品情報のインポート (ショップ間コピー)
 * 詳細: 
 *  - 別のショップ(ソースショップ)に登録されている商品情報を、自身のショップへコピーしてインポートします。
 *  - 商品名、説明、画像URLなどの全属性を継承し、自身のショップID(shop_id)向けにメタデータを書き換えて保存します。
 *  - インポート時には、商品画像のS3ファイルも自分のショップ用ディレクトリへ物理コピー(S3 Copy)し、URLを更新します。
 *
 * エンドポイント: POST /shop/products/import
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, CopyObjectCommand } from '@aws-sdk/client-s3';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { successResponse, errorResponse, apiResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getShopId, getUserId, getAction } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';
import { generateId } from './utils/id';

const s3 = new S3Client({});

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const shopId = getShopId(event, body);
        let action = getAction(event, body);

        if (!userId) return errorResponse(401, 'Unauthorized');
        if (!shopId) return errorResponse(400, 'Missing shopId');

        // パスベースのルーティング互換性
        const resPath = event.resource || '';
        if (resPath.endsWith('/list')) action = 'list_shops';
        else if (resPath.endsWith('/execute')) action = 'execute_import';

        // 理由: インポート先のショップに対して適切な管理権限があるか検証。 (確認フェーズ)
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId as string, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // ====================================================================
        // ACTION: list_shops (インポート元候補ショップの一覧取得)
        // --------------------------------------------------------------------
        // 目的: 管理権限を持つ、またはシステム全体のショップをリストアップ。
        // ====================================================================
        if (action === 'list_shops') {
            const isGlobalAdmin = event.requestContext?.authorizer?.isGlobalAdmin === 'true';
            let res;

            if (isGlobalAdmin) {
                // グローバル管理者は全ショップを表示
                res = await ddb.send(new ScanCommand({
                    TableName: TABLE_NAME,
                    FilterExpression: 'SK = :sk',
                    ExpressionAttributeValues: { ':sk': 'METADATA' }
                }));
            } else {
                // 一般ユーザーは自身がオーナーまたはGMのショップのみを表示 (GSI2を利用)
                res = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI2',
                    KeyConditionExpression: 'GSI2_PK = :uid',
                    ExpressionAttributeValues: { ':uid': `USER#${userId}` }
                }));
            }

            const shops = (res.Items || []).map(s => ({
                id: s.PK.replace('SHOP#', ''),
                name: s.name
            })).filter(s => s.id !== shopId); // 自分自身は除外

            return successResponse({ shops });
        }

        // ====================================================================
        // ACTION: execute_import (インポートの実行)
        // --------------------------------------------------------------------
        // 目的: 指定されたショップから商品をコピーし、画像アセットも実体コピーします。
        // ====================================================================
        if (action === 'execute_import') {
            const { source_shop_id, product_ids } = body as ShopApiSchema['shop_products_import_execute'];
            if (!source_shop_id) return errorResponse(400, 'Missing source_shop_id');

            // インポート元ショップの権限も念のため確認 (確認フェーズ)
            const sourceShopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, source_shop_id, userId, event);
            if (!sourceShopMetadata) return errorResponse(403, 'Forbidden for source shop');

            // インポート元の商品情報を取得
            let productsToImport: any[] = [];
            if (Array.isArray(product_ids) && product_ids.length > 0) {
                // 特定ID指定
                const keys = product_ids.map(id => ({ PK: `SHOP#${source_shop_id}`, SK: `PRODUCT#${id}` }));
                const { BatchGetCommand } = await import('@aws-sdk/lib-dynamodb');
                const batchRes = await ddb.send(new BatchGetCommand({
                    RequestItems: { [TABLE_NAME]: { Keys: keys } }
                }));
                productsToImport = batchRes.Responses?.[TABLE_NAME] || [];
            } else {
                // 指定がない場合は全商品をインポート
                const prodsRes = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                    ExpressionAttributeValues: { ':pk': `SHOP#${source_shop_id}`, ':sk': 'PRODUCT#' }
                }));
                productsToImport = prodsRes.Items || [];
            }

            if (productsToImport.length === 0) return successResponse({ message: 'No products found to import', imported: 0 });

            let importedCount = 0;
            const now = new Date().toISOString();
            const region = process.env.AWS_REGION || 'ap-northeast-1';

            // 実施フェーズ: 各商品をコピー
            for (const product of productsToImport) {
                // S3画像の物理コピー
                let newImageUrl = product.image_url;
                if (newImageUrl && newImageUrl.includes(BUCKET_NAME)) {
                    try {
                        const urlObj = new URL(newImageUrl);
                        const sourceKey = decodeURIComponent(urlObj.pathname.substring(1));
                        const ext = sourceKey.split('.').pop() || 'png';
                        const newKey = `shop/${shopId}/products/${generateId()}.${ext}`;

                        await s3.send(new CopyObjectCommand({
                            Bucket: BUCKET_NAME,
                            CopySource: encodeURI(`${BUCKET_NAME}/${sourceKey}`),
                            Key: newKey
                        }));
                        newImageUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${newKey}`;
                    } catch (e) {
                        console.error('Failed to copy S3 asset for product:', product.SK, e);
                    }
                }

                // DynamoDBレコードの書き換え
                const newItem = {
                    ...product,
                    PK: `SHOP#${shopId}`,
                    GSI2_SK: `SHOP#${shopId}`,
                    image_url: newImageUrl,
                    ts_created_at: now,
                    ts_updated_at: now
                };

                await ddb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: newItem
                }));
                importedCount++;
            }

            return successResponse({ message: 'Products imported successfully', imported: importedCount });
        }

        return errorResponse(404, 'Unknown action');

    } catch (error: any) {
        console.error('Shop products import error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
