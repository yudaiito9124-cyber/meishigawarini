/**
 * @file admin_qr_list.ts
 * @role 管理者用：QR コード / ギフト一覧および検索ハンドラー
 * @responsibility
 *  - 全ての QR コードのステータス別一覧取得、およびキーワード（ID、PIN）による横断検索を提供します。
 *  - 【データ・エンリッチメント】 DynamoDB の「薄い」データを、以下の関連情報と結合してリッチなレスポンスを生成します。
 *    1. ショップ情報: `shop_id` から名前、連絡先を結合。
 *    2. 配送・住所情報: `PK=QR#ID, SK=ORDER` レコードから受取人情報を結合。
 *    3. デザイン情報: デザイン ID から S3 署名付きのサムネイル URL（前面・背面）を生成。
 *  - 【検索アルゴリズム】
 *    1. 完全一致: `QR#` から始まる UUID の場合は GetItem で最速解決。
 *    2. 部分一致/PIN 検索: Scan を用いて属性 `pin` または `PK` の部分一致を検索。
 *  - 【期限切れの遅延評価】リスト取得のタイミングで各アイテムの有効期限を `checkAndExpire` ユーティリティで検証し、必要に応じて DB ステータスを `EXPIRED` へ同期・自動更新します。
 * @context
 *  - カスタマーサポートがギフトの配送状況を確認したり、特定コードのステータスを調査する際の一次ソースです。
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

        // --------------------------------------------------------------------
        // 1. データの抽出（一覧取得 or 検索）
        // --------------------------------------------------------------------
        if (status === 'SEARCH' && keyword) {
            // --------------------------------------------------------------------
            // 1. キーワードの正規化 (Normalization)
            // 先頭の 'QR#' プレフィックスを除去してクリーンな ID 部分のみを抽出します。
            // --------------------------------------------------------------------
            let cleanId = keyword.trim();
            if (cleanId.toLowerCase().startsWith('qr#')) {
                cleanId = cleanId.substring(3);
            }

            // 完全一致検索用の Partition Key を構築 ('QR#' を再付与)
            const targetPK = `QR#${cleanId}`;

            // --------------------------------------------------------------------
            // 2. 完全一致検索（高速パス: GetItem）
            // 大文字小文字の差異を考慮し、まずは入力通り、次に小文字化した ID で試行します。
            // --------------------------------------------------------------------
            let exactRes = await ddb.send(new GetCommand({ 
                TableName: TABLE_NAME, 
                Key: { PK: targetPK, SK: 'METADATA' } 
            }));

            // 指定されたケースで見つからない場合、小文字でも試行（IDがUUID/Timestampベースである標準仕様に合わせる）
            if (!exactRes.Item && targetPK !== targetPK.toLowerCase()) {
                exactRes = await ddb.send(new GetCommand({ 
                    TableName: TABLE_NAME, 
                    Key: { PK: targetPK.toLowerCase(), SK: 'METADATA' } 
                }));
            }

            if (exactRes.Item) {
                result = { Items: [exactRes.Item] };
            } else {
                // --------------------------------------------------------------------
                // 3. 部分一致検索（スキャンパス: Scan）
                // カード印字用の 16 文字指定などに対応するため、PK の部分一致検索を行います。
                // 【重要】従来設定されていた Limit: 100 を削除し、全件スキャンを可能にすることで
                // データ量が多い環境でも確実に検索結果がヒットするように修正しました。
                // --------------------------------------------------------------------
                const scanKeyword = cleanId.toLowerCase();
                const scanParams: any = {
                    TableName: TABLE_NAME,
                    // PK にキーワードが含まれ、かつ QR コードのメタデータであるものを抽出（PIN 検索は要件に基づき除外）
                    FilterExpression: 'contains(PK, :kw) AND begins_with(PK, :prefix) AND SK = :sk',
                    ExpressionAttributeValues: { 
                        ':kw': scanKeyword, 
                        ':prefix': 'QR#', 
                        ':sk': 'METADATA' 
                    }
                    // Limit は指定せず、Lambda タイムアウトの許す限りスキャンを継続します。
                };
                result = await ddb.send(new ScanCommand(scanParams));
            }
        } else {
            // C. ステータス別一覧（GSI1 インデックスによる効率的な Query）
            result = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME, IndexName: INDEX_NAME,
                KeyConditionExpression: 'GSI1_PK = :pk',
                ExpressionAttributeValues: { ':pk': `QR#${status}` },
                ScanIndexForward: false, // 降順（最新順）
                Limit: limit
            }));
        }

        const items = result.Items || [];

        // 互換性維持: レガシーな design_id フィールド名を正規化
        items.forEach((item: any) => {
            if (!item.design_id && item.card_design) {
                item.design_id = item.card_design;
            }
        });

        // --------------------------------------------------------------------
        // 2. データ・エンリッチメント（関連情報の並列バッチ取得）
        // --------------------------------------------------------------------
        const shopMap = new Map<string, any>();
        const orderMap = new Map<string, any>();
        const designMap = new Map<string, any>();

        // ① ショップ情報の取得
        const shopIds = [...new Set(items.map((i: any) => i.shop_id).filter(Boolean))];
        if (shopIds.length > 0) {
            const keys = shopIds.map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' }));
            const batchRes = await ddb.send(new BatchGetCommand({
                RequestItems: { [TABLE_NAME]: { Keys: keys, ProjectionExpression: 'PK, #name, email, owner_id', ExpressionAttributeNames: { '#name': 'name' } } }
            }));
            const rawShops = batchRes.Responses?.[TABLE_NAME] || [];
            for (const s of rawShops) {
                const sid = s.PK.replace('SHOP#', '');
                // 補完: コアデータにメールがない場合のみ Cognito から取得（マイグレーション途上のデータ用）
                if (!s.email && s.owner_id) {
                    try {
                        const userRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID!, Username: s.owner_id }));
                        s.email = userRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
                    } catch (e) { }
                }
                shopMap.set(sid, s);
            }
        }

        // ② 住所/配送情報の取得
        const orderKeys = items.filter((i: any) => i.status !== 'UNASSIGNED').map((i: any) => ({ PK: i.PK, SK: 'ORDER' }));
        if (orderKeys.length > 0) {
            const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: orderKeys } } }));
            for (const o of (batchRes.Responses?.[TABLE_NAME] || [])) orderMap.set(o.PK, o);
        }

        // ③ デザイン/サムネイル情報の取得
        const designIds = [...new Set(items.map((i: any) => i.design_id).filter(Boolean))];
        if (designIds.length > 0) {
            const keys = designIds.map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
            const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: keys, ProjectionExpression: 'SK, thumbf, thumbb' } } }));
            for (const d of (batchRes.Responses?.[TABLE_NAME] || [])) {
                // S3 アセットの場合は一時的な署名付き URL を発行（有効期限付き）
                if (d.thumbf) d.thumbf = await signUrlIfS3(d.thumbf, BUCKET_NAME);
                if (d.thumbb) d.thumbb = await signUrlIfS3(d.thumbb, BUCKET_NAME);
                designMap.set(d.SK, d);
            }
        }

        // --------------------------------------------------------------------
        // 3. 最終結合とステータス最終判定（マッピング）
        // --------------------------------------------------------------------
        // 全項目のマージおよび遅延評価(期限切れチェック)
        const enrichedItems = await Promise.all(items.map(async (item: any) => {
            const qr_id = item.PK.replace('QR#', '');

            // 【確認フェーズ: 期限切れチェック (遅延評価)】
            const currentStatus = await checkAndExpire(ddb, TABLE_NAME, qr_id, item);

            const shop = item.shop_id ? shopMap.get(item.shop_id) : null;
            const order = orderMap.get(item.PK);
            const designId = item.design_id;
            const design = designId ? (designMap.get(designId) || getSystemDesign(designId)) : null;

            return {
                ...item,
                qr_id, // Add unified qr_id
                design_id: designId, // Ensure design_id is present
                status: currentStatus, // 最新の判定結果を反映
                shop_name: shop?.name,
                shop_email: shop?.email,
                recipient_name: order?.name || order?.recipient_name,
                postal_code: order?.zipCode || order?.zip_code || order?.postal_code,
                address: order?.address,
                phone: order?.phone,
                zip_code: order?.zipCode || order?.zip_code, // normalization
                preferred_date: order?.preferredDate || order?.preferred_date,
                preferred_time: order?.preferredTime || order?.preferred_time,
                submitted_email: order?.email,
                receiver_user_id: item.receiver_user_id || order?.receiver_user_id,
                ts_submitted_at: item.ts_submitted_at || order?.ts_submitted_at,
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
