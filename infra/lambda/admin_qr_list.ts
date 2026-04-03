/**
 * 概要: 管理者用QRコード一覧の取得および検索
 * 詳細: 
 *  - ステータス別のフィルタ取得(GSI1利用)や、UUID/PINによる部分一致・完全一致検索をサポート。
 *  - 各項目に対し、関連ショップ名、配送先住所(ORDER)、デザイン情報(METADATA)を複数のBatchGetにより高効率に紐付け(Enrichment)します。
 *
 * エンドポイント: POST /admin/qr/list
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand, ScanCommand, BatchGetCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { signUrlIfS3 } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { checkAndExpire } from './utils/expiration';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME, USER_POOL_ID } from './share/db';
import { AdminApiSchema } from '@shared/api-types';

const cognito = new CognitoIdentityProviderClient({});
const INDEX_NAME = 'GSI1';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        const body = JSON.parse(event.body || '{}') as AdminApiSchema['admin_qr_list'];
        const status = body.status || 'UNASSIGNED';
        const limit = Number(body.limit) || 50;
        const keyword = (body.keyword || '').trim();

        let result;

        // ====================================================================
        // SEARCH logic (完全一致 or Scanによる部分一致)
        // ====================================================================
        if (status === 'SEARCH' && keyword) {
            let searchId = keyword;
            if (searchId.toLowerCase().startsWith('qr#')) searchId = 'QR#' + searchId.substring(3);
            else if (!searchId.startsWith('QR#')) searchId = `QR#${searchId}`;

            // 【DB操作: GetItem】
            // 理由: UUIDが完全に入力された場合、スキャンより高速かつ低コストで取得可能なため最初に試行。
            const exactRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: searchId, SK: 'METADATA' } }));

            if (exactRes.Item) {
                result = { Items: [exactRes.Item] };
            } else {
                // 【DB操作: Scan】
                // 理由: 部分一致キーワード(UUIDの一部やPIN)で全文検索を行います。
                const scanKeyword = keyword.toLowerCase().replace(/^qr#/, '');
                const scanParams: any = {
                    TableName: TABLE_NAME,
                    FilterExpression: '(contains(PK, :kw) OR contains(pin, :kw)) AND begins_with(PK, :prefix) AND SK = :sk',
                    ExpressionAttributeValues: { ':kw': scanKeyword, ':prefix': 'QR#', ':sk': 'METADATA' },
                    Limit: Math.min(limit * 2, 100) 
                };
                result = await ddb.send(new ScanCommand(scanParams));
            }
        } else {
            // ====================================================================
            // LIST logic (ステータス順Query)
            // ====================================================================
            // 【DB操作: Query】
            // 理由: 指定ステータスのQRを一括取得。最新順にソート(GSI1)。
            result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME, IndexName: INDEX_NAME,
                KeyConditionExpression: 'GSI1_PK = :pk',
                ExpressionAttributeValues: { ':pk': `QR#${status}` },
                ScanIndexForward: false, Limit: limit
            }));
        }

        const items = result.Items || [];
        const shopMap = new Map<string, any>();
        const orderMap = new Map<string, any>();
        const designMap = new Map<string, any>();

        // 1. ショップ情報のEnrichment (BatchGet)
        const shopIds = [...new Set(items.map((i: any) => i.shop_id).filter(Boolean))];
        if (shopIds.length > 0) {
            const keys = shopIds.map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' }));
            const batchRes = await ddb.send(new BatchGetCommand({
                RequestItems: { [TABLE_NAME]: { Keys: keys, ProjectionExpression: 'PK, #name, email, owner_id', ExpressionAttributeNames: { '#name': 'name' } } }
            }));
            const rawShops = batchRes.Responses?.[TABLE_NAME] || [];
            for (const s of rawShops) {
                const sid = s.PK.replace('SHOP#', '');
                // owner_idはあるがemailが無い場合はCognitoから補完（歴史的理由）
                if (!s.email && s.owner_id) {
                    try {
                        const userRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: s.owner_id }));
                        s.email = userRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
                    } catch (e) {}
                }
                shopMap.set(sid, s);
            }
        }

        // 2. 配送・注文情報のEnrichment (BatchGet, PK=QR#{qr_id}, SK=ORDER)
        const orderKeys = items.filter((i: any) => i.status !== 'UNASSIGNED').map((i: any) => ({ PK: i.PK, SK: 'ORDER' }));
        if (orderKeys.length > 0) {
            const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: orderKeys } } }));
            for (const o of (batchRes.Responses?.[TABLE_NAME] || [])) orderMap.set(o.PK, o);
        }

        // 3. デザイン情報のEnrichment (BatchGet, PK=CARD_DESIGN#METADATA, SK=design_id)
        const designIds = [...new Set(items.map((i: any) => i.card_design).filter(Boolean))];
        if (designIds.length > 0) {
            const keys = designIds.map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
            const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: keys, ProjectionExpression: 'SK, thumbf, thumbb' } } }));
            for (const d of (batchRes.Responses?.[TABLE_NAME] || [])) {
                if (d.thumbf) d.thumbf = await signUrlIfS3(d.thumbf, BUCKET_NAME);
                if (d.thumbb) d.thumbb = await signUrlIfS3(d.thumbb, BUCKET_NAME);
                designMap.set(d.SK, d);
            }
        }

        // 全項目のマージおよび遅延評価(期限切れチェック)
        const enrichedItems = await Promise.all(items.map(async (item: any) => {
            const qr_id = item.PK.replace('QR#', '');
            
            // 【確認フェーズ: 期限切れチェック (遅延評価)】
            const currentStatus = await checkAndExpire(ddb, TABLE_NAME, qr_id, item);
            
            const shop = item.shop_id ? shopMap.get(item.shop_id) : null;
            const order = orderMap.get(item.PK);
            const design = item.card_design ? (designMap.get(item.card_design) || getSystemDesign(item.card_design)) : null;

            return {
                ...item,
                qr_id, // Add unified qr_id
                status: currentStatus, // 最新の判定結果を反映
                shop_name: shop?.name, 
                shop_email: shop?.email,
                recipient_name: order?.name || order?.recipient_name, 
                postal_code: order?.zipCode || order?.postal_code, 
                address: order?.address,
                shipping_info: order, 
                thumbf: design?.thumbf, 
                thumbb: design?.thumbb
            };
        }));

        return successResponse({ status, count: enrichedItems.length, hasMore: !!result.LastEvaluatedKey, items: enrichedItems });

    } catch (error: any) {
        console.error('Admin QR list error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
