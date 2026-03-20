/**
 * 概要: 商品（プロダクト）の管理
 * 詳細: ショップに紐づく商品の作成、一覧取得、ステータス更新、及び削除を行います。
 * エンドポイント:
 *  - POST /shop/products/list (商品一覧取得)
 *  - POST /shop/products/create (商品作成)
 *  - POST /shop/products/update (商品ステータス更新)
 *  - POST /shop/products/delete (商品削除)
 * リクエストボディ:
 *  - shop_id: 操作対象のショップID (必須)
 *  [POST /shop/products/create の場合]
 *  - name: 商品名 (必須)
 *  - description: 商品説明 (オプション)
 *  - image_url: 商品メイン画像のURL (オプション)
 *  - price: 価格 (オプション)
 *  - valid_days: 商品の有効期限(日) (オプション)
 *  - detail_html: 商品の詳細説明HTML (オプション)
 *  [updateの場合]
 *  - product_id: 商品ID (必須)
 *  - status: "ACTIVE" | "STOPPED" (必須)
 *  [deleteの場合]
 *  - product_id: 商品ID (必須)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { generateId } from './utils/id';
import { stripSignaturesInHtml, stripSignature, signUrlIfS3, signUrlsInHtml } from './utils/s3';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const DEFAULT_VALID_DAYS = parseInt(process.env.DEFAULT_VALID_DAYS || '180');

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
        const { shop_id } = body;
        
        // Determine action from path or body
        let action = body.action;
        const res = event.resource;
        if (res.endsWith('/list')) action = 'list';
        else if (res.endsWith('/create')) action = 'create';
        else if (res.endsWith('/update')) action = 'update_status';
        else if (res.endsWith('/delete')) action = 'delete';

        if (!shop_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing shop_id' }) };
        if (!action || !['create', 'list', 'update_status', 'delete'].includes(action)) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action. Received: ' + action + ' for ' + res }) };
        }

        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shop_id, userId, event);
        if (shopMetadata === false) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        if (action === 'create') {
            const { name, description, image_url, price, valid_days, detail_html } = body;
            if (!name) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing product name' }) };

            const productId = generateId();
            const validityPeriod = Math.min(valid_days ? parseInt(valid_days) : DEFAULT_VALID_DAYS, 180);
            const now = new Date().toISOString();

            // 【DB操作: PutItem】
            // - 目的: ショップに紐づく新規商品(PRODUCT)レコードの作成
            // - テーブル: TABLE_NAME
            // - リクエストキー(プライマリ): { PK: `SHOP#${shop_id}`, SK: `PRODUCT#${productId}` }
            // - 登録カラム: product_id, name, description, image_url, price, status, GSI1_PK, GSI2_PK 等すべて
            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `SHOP#${shop_id}`, SK: `PRODUCT#${productId}`,
                    product_id: productId, name, description,
                    detail_html: stripSignaturesInHtml(detail_html || '', BUCKET_NAME),
                    image_url: stripSignature(image_url),
                    price, valid_days: validityPeriod,
                    status: 'ACTIVE',
                    GSI1_PK: 'PRODUCT#ACTIVE', GSI1_SK: now,
                    GSI2_PK: `PRODUCT#${productId}`, GSI2_SK: `SHOP#${shop_id}`,
                    ts_created_at: now
                }
            }));
            return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ product_id: productId, message: 'Product created' }) };
        }

        if (action === 'list') {
            // 【DB操作: Query】
            // - 目的: 指定したショップに紐づく全商品の一覧取得
            // - テーブル: TABLE_NAME
            // - 検索条件: PK = `SHOP#${shop_id}` AND begins_with(SK, 'PRODUCT#')
            // - 取得カラム: ALL (プログラム側で後続処理にて status !== 'DELETED' をフィルタ)
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: { ':pk': `SHOP#${shop_id}`, ':sk': 'PRODUCT#' }
            }));
            const items: any[] = (res.Items || [])
                .filter(item => item.status !== 'DELETED')
                .map(item => ({ ...item, product_id: item.SK.replace('PRODUCT#', '') }));

            for (const item of items) {
                if (item.image_url) item.image_url = await signUrlIfS3(item.image_url, BUCKET_NAME);
                if (item.detail_html) item.detail_html = await signUrlsInHtml(item.detail_html, BUCKET_NAME);
            }
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items }) };
        }

        if (action === 'update_status') {
            const { product_id, status } = body;
            if (!product_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing product ID' }) };
            if (!['ACTIVE', 'STOPPED'].includes(status)) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid status. Must be ACTIVE or STOPPED' }) };
            }

            // 【DB操作: UpdateItem】
            // - 目的: 商品のステータス(ACTIVE⇆STOPPED)の更新
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `SHOP#${shop_id}`, SK: `PRODUCT#${product_id}` }
            // - 更新カラム: status および GSI1_PK (QR一覧取得等のインデックスに連動させるため)
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shop_id}`, SK: `PRODUCT#${product_id}` },
                UpdateExpression: 'SET #status = :s, GSI1_PK = :gsi_pk',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':s': status, ':gsi_pk': `PRODUCT#${status}` }
            }));
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Product status updated' }) };
        }

        if (action === 'delete') {
            const { product_id } = body;
            if (!product_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing product ID' }) };

            // 【DB操作: GetItem】
            // - 目的: 削除対象となる商品の存在確認、および現在のステータスがSTOPPEDかの確認
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `SHOP#${shop_id}`, SK: `PRODUCT#${product_id}` }
            // - 取得カラム: レコード全体
            const prodRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shop_id}`, SK: `PRODUCT#${product_id}` }
            }));
            if (!prodRes.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Product not found' }) };
            if (prodRes.Item.status !== 'STOPPED') {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Cannot delete product unless it is STOPPED' }) };
            }

            // 【DB操作: Query (複数並行実行)】
            // - 目的: このショップ全体のQRコードのうち、ACTIVE または USED なものを全て一括取得
            // - テーブル: TABLE_NAME
            // - インデックス: GSI1
            // - 検索条件: GSI1_PK = 'QR#USED' および GSI1_PK = 'QR#ACTIVE'
            // - 取得カラム: ALL (プログラム側で対象商品に紐づいているかをさらにフィルタする)
            const [usedRes, activeRes] = await Promise.all([
                ddb.send(new QueryCommand({
                    TableName: TABLE_NAME, IndexName: 'GSI1',
                    KeyConditionExpression: 'GSI1_PK = :pk', ExpressionAttributeValues: { ':pk': 'QR#USED' }
                })),
                ddb.send(new QueryCommand({
                    TableName: TABLE_NAME, IndexName: 'GSI1',
                    KeyConditionExpression: 'GSI1_PK = :pk', ExpressionAttributeValues: { ':pk': 'QR#ACTIVE' }
                }))
            ]);
            
            const activeOrUsedQRs = [...(usedRes.Items || []), ...(activeRes.Items || [])];
            const relatedQRs = activeOrUsedQRs.filter(item => item.product_id === product_id && item.shop_id === shop_id);
            if (relatedQRs.length > 0) {
                return {
                    statusCode: 409, headers: corsHeaders, body: JSON.stringify({
                        message: 'Cannot delete product with active QRs or unshipped orders',
                        relatedQRs: relatedQRs.map(qr => qr.PK.replace('QR#', ''))
                    })
                };
            }

            const deletedItem = { ...prodRes.Item };
            deletedItem.GSI1_PK = 'PRODUCT#DELETED';
            deletedItem.status = 'DELETED';

            // 【DB操作: PutItem】
            // - 目的: 商品の論理削除（実際に物理削除はせず、ステータスをDELETEDに上書き更新する）
            // - テーブル: TABLE_NAME
            // - リクエストキー: { PK: `SHOP#${shop_id}`, SK: `PRODUCT#${product_id}` }
            // - 更新カラム: status = 'DELETED', GSI1_PK = 'PRODUCT#DELETED' に書き換えたレコード全体をPut
            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: deletedItem
            }));
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Product deleted' }) };
        }

        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };
    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
