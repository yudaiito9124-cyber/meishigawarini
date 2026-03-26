/**
 * 概要: 管理者用QRコード一覧の取得および検索を行う。
 * 詳細: ステータス別のフィルタリングやUUID/PINによるQRコードの検索を行い、そのQRコードに関連するショップ情報や配送先住所、デザイン情報などの紐付け（Enrichment）を行って返す。
 * エンドポイント: POST /admin/qr/list
 * リクエストボディ:
 *  - status: [任意のQRコードのstatus] | "SEARCH"
 *  - keyword: 検索キーワード (statusがSEARCHの場合に使用)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { signUrlIfS3 } from './utils/s3';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});
const TABLE_NAME = process.env.TABLE_NAME || '';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const INDEX_NAME = 'GSI1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'OK' }) };
        }
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const status = body.status || 'UNASSIGNED';
        // 取得件数の制限（デフォルト50件）。DynamoDBの読み取りコストを抑えるために使用。
        const limit = Number(body.limit) || 50;
        const keyword = body.keyword || '';

        let result;

        if (status === 'SEARCH') {
            const trimmedKeyword = keyword.trim();
            console.log(`Searching for keyword: "${trimmedKeyword}" (Limit: ${limit})`);

            // キーワード（UUIDの一部またはPIN）に一致するQRコードをスキャン
            // - フィルタ条件:
            //   - PK がキーワードを含む OR PIN がキーワードを含む
            //   - PK が "QR#" で始まる
            //   - SK が "METADATA" である
            // - 取得件数制限: limit (コスト削減のため)
            // - 取得カラム: 一致した項目の全属性
            // 注意: Scanに対してLimitをかけると、フィルタ前の読み取り件数が制限されます。
            result = await ddb.send(new ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: '(contains(PK, :kw) OR contains(pin, :kw)) AND begins_with(PK, :prefix) AND SK = :sk',
                ExpressionAttributeValues: {
                    ':kw': trimmedKeyword.toLowerCase(),
                    ':prefix': 'QR#',
                    ':sk': 'METADATA'
                },
                Limit: limit
            }));
        } else {
            // 特定ステータスのQRコードをインデックスから最新順に取得
            // - 検索条件: GSI1_PK = QR#{status}
            // - 取得カラム: ステータス別の全QR属性
            // - ソート: 作成日時の降順 (ScanIndexForward: false)
            // - 取得件数制限: limit (大量のデータがあっても最初の50件のみを読み取り、コストを削減します)
            result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: INDEX_NAME,
                KeyConditionExpression: 'GSI1_PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': `QR#${status}`
                },
                ScanIndexForward: false, // 作成日時の降順
                Limit: limit
            }));
        }

        const items = result.Items || [];

        // Enrich with Shop Info
        const shopIds = [...new Set(items.map((item: any) => item.shop_id).filter(Boolean))];
        const shopMap = new Map<string, any>();

        if (shopIds.length > 0) {
            // BatchGet has a limit of 100 items (and 16MB) - chunk it if necessary
            // For simplicity, assuming < 100 unique shops per page for now or implementing simple chunking
            const chunkedShopIds = [];
            for (let i = 0; i < shopIds.length; i += 100) {
                chunkedShopIds.push(shopIds.slice(i, i + 100));
            }

            for (const chunk of chunkedShopIds) {
                const keys = chunk.map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' }));

                // 一覧に含まれるショップ詳細を一括取得
                // - 検索条件: PK = SHOP#{id}, SK = "METADATA"
                // - 取得カラム: PK, name, email, owner_id
                const batchRes = await ddb.send(new BatchGetCommand({
                    RequestItems: {
                        [TABLE_NAME]: {
                            Keys: keys,
                            ProjectionExpression: 'PK, #name, email, owner_id', // Fetch owner_id for Cognito lookup
                            ExpressionAttributeNames: { '#name': 'name' }
                        }
                    }
                }));

                if (batchRes.Responses && batchRes.Responses[TABLE_NAME]) {
                    for (const shop of batchRes.Responses[TABLE_NAME]) {
                        const sid = shop.PK.replace('SHOP#', '');
                        shopMap.set(sid, shop);
                    }
                }
            }

            // Fallback: If shop email is missing, try to fetch from Cognito using owner_id
            for (const shop of Array.from(shopMap.values())) {
                if (!shop.email && shop.owner_id) {
                    try {
                        const userRes = await cognito.send(new AdminGetUserCommand({
                            UserPoolId: USER_POOL_ID,
                            Username: shop.owner_id
                        }));
                        const emailAttr = userRes.UserAttributes?.find(attr => attr.Name === 'email');
                        if (emailAttr) {
                            shop.email = emailAttr.Value;
                        }
                    } catch (e) {
                        console.warn(`Failed to fetch email for owner ${shop.owner_id}`, e);
                    }
                }
            }
        }

        // Fetch Order Details (SK=ORDER) for Recipient Info
        // Similar strategy: chunk keys and BatchGet
        const orderKeys = items.filter((i: any) => i.status !== 'UNASSIGNED').map((i: any) => ({
            PK: i.PK,
            SK: 'ORDER'
        }));

        const orderMap = new Map<string, any>();

        if (orderKeys.length > 0) {
            const chunkedOrderKeys = [];
            for (let i = 0; i < orderKeys.length; i += 100) {
                chunkedOrderKeys.push(orderKeys.slice(i, i + 100));
            }

            for (const chunk of chunkedOrderKeys) {
                // QRコードに紐付く配送先・注文情報を一括取得
                // - 検索条件: PK = QR#{uuid}, SK = "ORDER"
                // - 取得カラム: 項目の全属性
                const batchRes = await ddb.send(new BatchGetCommand({
                    RequestItems: {
                        [TABLE_NAME]: {
                            Keys: chunk
                        }
                    }
                }));

                if (batchRes.Responses && batchRes.Responses[TABLE_NAME]) {
                    for (const order of batchRes.Responses[TABLE_NAME]) {
                        orderMap.set(order.PK, order);
                    }
                }
            }
        }

        // Fetch Card Design Info (PK=CARD_DESIGN#METADATA, SK=design_id)
        const designIds = [...new Set(items.map((i: any) => i.card_design).filter(Boolean))];
        const designMap = new Map<string, any>();

        if (designIds.length > 0) {
            const chunkedDesignIds = [];
            for (let i = 0; i < designIds.length; i += 100) {
                chunkedDesignIds.push(designIds.slice(i, i + 100));
            }

            for (const chunk of chunkedDesignIds) {
                const keys = chunk.map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
                // 使用されているカードデザインの情報を一括取得
                // - 検索条件: PK = "CARD_DESIGN#METADATA", SK = designId
                // - 取得カラム: SK, thumbf, thumbb (サムネイル情報)
                const batchRes = await ddb.send(new BatchGetCommand({
                    RequestItems: {
                        [TABLE_NAME]: {
                            Keys: keys,
                            ProjectionExpression: 'SK, thumbf, thumbb'
                        }
                    }
                }));

                if (batchRes.Responses && batchRes.Responses[TABLE_NAME]) {
                    for (const design of batchRes.Responses[TABLE_NAME]) {
                        // Sign URLs for preview
                        if (design.thumbf) design.thumbf = await signUrlIfS3(design.thumbf, BUCKET_NAME);
                        if (design.thumbb) design.thumbb = await signUrlIfS3(design.thumbb, BUCKET_NAME);
                        designMap.set(design.SK, design);
                    }
                }
            }
        }

        const enrichedItems = items.map((item: any) => {
            const shop = item.shop_id ? shopMap.get(item.shop_id) : null;
            const order = orderMap.get(item.PK);
            const design = item.card_design ? designMap.get(item.card_design) : null;

            return {
                ...item,
                shop_name: shop ? shop.name : undefined,
                shop_email: shop ? shop.email : undefined,
                // Accessors for admin/page.tsx
                recipient_name: order?.name || undefined,
                postal_code: order?.zipCode || order?.postal_code || undefined,
                address: order?.address || undefined,
                shipping_info: order || undefined, // Pass full order object as shipping_info to match shop page structure if needed, or just specific fields
                thumbf: design?.thumbf,
                thumbb: design?.thumbb
            };
        });

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                status,
                count: result.Items?.length || 0, // 今回のレスポンスに含まれる件数
                hasMore: !!result.LastEvaluatedKey, // Limitを超えるデータがまだ存在するかどうかのフラグ
                items: enrichedItems
            })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: String(error) })
        };
    }
};
