/**
 * 概要: 商品インポートの管理
 * 詳細: ログイン中ユーザーがアクセス可能な他ショップの一覧取得や、他ショップからの商品インポートを行います。
 * エンドポイント:
 *  - POST /shop/products/import/list (インポート元候補ショップの一覧取得)
 *  - POST /shop/products/import/execute (インポートの実行)
 * リクエストボディ:
 *  - shop_id: インポート先(自ショップ)のID (必須)
 *  [execute の場合]
 *  - importShopId: インポート元のショップID (必須)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, CopyObjectCommand } from '@aws-sdk/client-s3';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { parseGroups, isGlobalAdmin } from './utils/auth';
import { generateId } from './utils/id';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const s3 = new S3Client({});
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

        const claims = event.requestContext?.authorizer?.claims;
        const userId = claims?.sub;
        const userGroups = parseGroups(claims?.['cognito:groups']);
        if (!userId) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        const { shop_id } = body;

        // Determine action from path or body
        let action = body.action;
        const resPath = event.resource;
        if (resPath.endsWith('/list')) action = 'list_shops';
        else if (resPath.endsWith('/execute')) action = 'execute_import';

        if (!shop_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing shop_id' }) };
        if (!action || !['list_shops', 'execute_import'].includes(action)) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };
        }

        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shop_id, userId, event);
        if (shopMetadata === false) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        if (action === 'list_shops') {
            let res;
            if (isGlobalAdmin(userGroups)) {
                // 【DB操作: Scan】
                // - 目的: グローバル管理者の場合、システム内の全ショップのメタデータを取得しインポート元候補とする
                // - テーブル: TABLE_NAME
                // - 検索(フィルタ)条件: FilterExpressionにて SK = 'METADATA'
                // - 取得カラム: ALL
                res = await ddb.send(new ScanCommand({
                    TableName: TABLE_NAME,
                    FilterExpression: 'SK = :sk',
                    ExpressionAttributeValues: { ':sk': 'METADATA' }
                }));
            } else {
                // 【DB操作: Query】
                // - 目的: 通常利用者の場合、自身がアクセス権限を持つショップの一覧を取得しインポート元候補とする
                // - テーブル: TABLE_NAME
                // - インデックス: GSI2
                // - 検索条件: GSI2_PK = `USER#${userId}`
                // - 取得カラム: ALL
                // 使用インデックス: GSI2 (GSI2_PK = USER#{userId})
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
            }));
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ shops }) };
        }

        if (action === 'execute_import') {
            let { importShopId } = body;
            if (!importShopId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing importShopId' }) };
            importShopId = String(importShopId).replace('SHOP#', '');

            // インポート元ショップの所有権確認も必須
            let importShopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, importShopId, userId, event);
            if (importShopMetadata === false) {
                return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized for import source shop' }) };
            }

            // 【DB操作: Query】
            // - 目的: インポート元として指定されたショップ内の全商品一覧を取得
            // - テーブル: TABLE_NAME
            // - 検索条件: PK = `SHOP#${importShopId}` AND begins_with(SK, 'PRODUCT#')
            // - 取得カラム: ALL
            // 操作: Query
            // 検索条件: PK = SHOP#{importShopId} かつ SK が 'PRODUCT#' で始まる
            const prodsRes = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: { ':pk': `SHOP#${importShopId}`, ':sk': 'PRODUCT#' }
            }));

            const productsToImport = prodsRes.Items || [];
            if (productsToImport.length === 0) {
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "The source shop has no products", imported: 0 }) };
            }

            const region = process.env.AWS_REGION || 'ap-northeast-1';
            let importedCount = 0;

            for (const prod of productsToImport) {
                let newImageUrl = prod.image_url;
                if (prod.image_url && prod.image_url.includes(BUCKET_NAME)) {
                    try {
                        const urlObj = new URL(prod.image_url);
                        const sourceKey = decodeURIComponent(urlObj.pathname.substring(1));
                        const ext = sourceKey.split('.').pop() || 'jpg';
                        const newFilename = `${generateId()}.${ext}`;
                        const newKey = `shop/${shop_id}/products/${newFilename}`;

                        // S3バケット間で画像コピー
                        await s3.send(new CopyObjectCommand({
                            Bucket: BUCKET_NAME,
                            CopySource: encodeURI(`${BUCKET_NAME}/${sourceKey}`),
                            Key: newKey
                        }));
                        newImageUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${newKey}`;
                    } catch (e) {
                        console.error('Failed to copy image for product', prod.product_id, e);
                    }
                }

                const copyItem = { ...prod };
                copyItem.PK = `SHOP#${shop_id}`;
                copyItem.image_url = newImageUrl;
                if (prod.detail_html) copyItem.detail_html = prod.detail_html;
                if (copyItem.GSI2_SK && copyItem.GSI2_SK.startsWith('SHOP#')) {
                    copyItem.GSI2_SK = `SHOP#${shop_id}`;
                }

                // 【DB操作: PutItem (ループ実行)】
                // - 目的: インポートでコピーした商品レコードを自分のショップ下に新規保存
                // - テーブル: TABLE_NAME
                // - リクエストキー: { PK: `SHOP#${shop_id}`, SK: `PRODUCT#${元のプロダクトID}` }
                // - 登録カラム: インポート元の全カラムを継承（画像URLやPK/GSI2_SKなど自ショップ向けに書き換え済みの状態）
                // 操作: PutItem
                await ddb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: copyItem
                }));
                importedCount++;
            }
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "Products imported successfully", imported: importedCount }) };
        }

        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };
    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
