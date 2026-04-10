/**
 * @file user_history.ts
 * @role ユーザー用：送受信履歴・ギフト紐付けハンドラー
 * @responsibility
 *  - ユーザーが「贈ったギフト（SENDLOG）」と「受け取ったギフト（RECEIVEDLOG）」の個人台帳を管理します。
 *  - 【高度なデータ集約（Deep Enrichment）】
 *    DynamoDB 上で完全に正規化（分散）されたデータ（QRメタ, 注文, チャット, デザイン, 商品, 店舗）を、
 *    再帰的な `BatchGet` パターンを用いて抽出し、履歴画面に必要なリッチな表示オブジェクトへ集約します。
 *  - 【アトミックな送信者紐付け】
 *    `sendgift` アクションでは、`ConditionExpression` を用いて、一つのギフト券（QR）に複数の送信者が紐付くことを排他的に防止します。
 *  - 【プロフィール・スナップショット】
 *    ギフトに関連付けられた「送り主情報」は、その時点のプロフィール状態を `CHAT` レコードへコピー（Snapshot）して保存します。
 *    これにより、将来的にユーザーがプロフィールを変更しても、過去に贈ったギフトのメッセージカード上の送り主情報は当時のまま維持されます。
 * @context
 *  - ユーザーのマイページ（利用履歴）における中核機能を担います。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { appendToHistory } from './utils/history';
import { signUrlIfS3 } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { checkAndExpire } from './utils/expiration';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getQrId, getPIN, getAction, getUserId } from './utils/request';
import { UserApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const action = getAction(event, body);

        if (!userId) return errorResponse(401, 'Unauthorized');

        // --------------------------------------------------------------------
        // ACTION: get (送信・受信履歴の取得)
        // 目的: 自身の「贈ったもの」「受け取ったもの」を最新のデザイン/商品情報と共に一覧取得。
        // --------------------------------------------------------------------
        if (action === 'get') {
            const pk = `USER#${userId}`;

            /**
             * 指定されたログ種別の ID リストを取得してソートする内部関数。
             */
            const fetchLogs = async (logType: string) => {
                const queryRes = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
                    ExpressionAttributeValues: { ':pk': pk, ':skPrefix': `${logType}#` }
                }));
                const allQrIds: Array<{ qr_id: string, timestamp: string }> = [];
                for (const item of queryRes.Items || []) {
                    if (item.logs && Array.isArray(item.logs)) {
                        // 下位互換性: uuid フィールドも考慮
                        allQrIds.push(...item.logs.map((l: any) => ({
                            qr_id: l.qr_id || l.uuid,
                            timestamp: l.timestamp
                        })));
                    }
                }
                allQrIds.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                return allQrIds;
            };

            // 送信ログと受信ログを並行取得
            const [sentLogs, receivedLogs] = await Promise.all([
                fetchLogs('SENDLOG'),
                fetchLogs('RECEIVEDLOG')
            ]);

            // 各 ID に対し、QR メタデータ、デザイン、商品などの詳細情報を結合（Deep Enrichment）
            const [sent, received] = await Promise.all([
                enrichLogs(sentLogs),
                enrichLogs(receivedLogs)
            ]);

            return successResponse({ sent, received });
        }

        // --------------------------------------------------------------------
        // ACTION: sendgift (ギフトの送信者紐付け)
        // 目的: 未紐付けの QR を自分の「送信履歴」として登録。
        // --------------------------------------------------------------------
        if (action === 'sendgift') {
            const qr_id = getQrId(event, body);
            if (!qr_id) return errorResponse(400, 'Missing QR ID');

            const qrRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            }));
            if (!qrRes.Item) return errorResponse(404, 'QR code not found');

            // 【プロフィール・スナップショットの取得】
            const profileRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `USER#${userId}`, SK: 'SENDER' }
            }));
            const sender_info = profileRes.Item ? { ...profileRes.Item } : { user_id: userId };
            delete (sender_info as any).PK;
            delete (sender_info as any).SK;

            // 【アトミック更新】sender_id が未設定の場合のみ自分を書き込む
            try {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                    UpdateExpression: 'SET sender_id = :sid, sender_info = :sinfo, ts_updated_at = :now',
                    ConditionExpression: 'attribute_not_exists(sender_id)',
                    ExpressionAttributeValues: {
                        ':sid': userId, ':sinfo': sender_info, ':now': new Date().toISOString()
                    }
                }));
            } catch (err: any) {
                if (err.name === 'ConditionalCheckFailedException') {
                    return errorResponse(409, 'This gift is already linked to a sender');
                }
                throw err;
            }

            // 自身の送信履歴ログ（SENDLOG）に ID を追記
            await appendToHistory(ddb, TABLE_NAME, userId, 'SENDLOG', qr_id);

            return successResponse({ message: 'Gift successfully linked to your sender profile' });
        }

        return errorResponse(404, 'Unknown action');

    } catch (error: any) {
        console.error('User history handler error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};

/**
 * 履歴ログ一覧（QR ID リスト）に対し、必要な全ての関連データを結合してリッチなオブジェクトを構築します。
 * パフォーマンス最適化のため、各種 BatchGet を段階的に実行します。
 */
async function enrichLogs(logs: Array<{ qr_id: string, timestamp: string }>) {
    if (logs.length === 0) return [];

    const qrIds = logs.map(l => l.qr_id);
    const results = [];

    // DynamoDB BatchGet の上限(100)ごとに分割処理
    for (let i = 0; i < qrIds.length; i += 100) {
        const chunk = qrIds.slice(i, i + 100);

        // Stage 1: QR 基本情報のバルク取得（METADATA / ORDER / CHAT）
        const keys = [
            ...chunk.map(qr_id => ({ PK: `QR#${qr_id}`, SK: 'METADATA' })),
            ...chunk.map(qr_id => ({ PK: `QR#${qr_id}`, SK: 'ORDER' })),
            ...chunk.map(qr_id => ({ PK: `QR#${qr_id}`, SK: 'CHAT' }))
        ];

        const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: keys } } }));
        const items = batchRes.Responses?.[TABLE_NAME] || [];
        const itemMap = new Map();
        items.forEach(it => itemMap.set(`${it.PK}#${it.SK}`, it));

        const metaList = items.filter(it => it.SK === 'METADATA');
        metaList.forEach(m => { if (!m.design_id && (m as any).card_design) m.design_id = (m as any).card_design; });

        // Stage 2: 外部マスタデータ（デザイン、商品、店舗）の ID リストを抽出して並行取得
        const designIds = [...new Set(metaList.map(it => it.design_id).filter(Boolean))];
        const shopProductPairs = [...new Set(metaList.map(it => `${it.shop_id}#${it.product_id}`).filter(p => !p.startsWith('undefined')))];
        const shopIds = [...new Set(metaList.map(it => it.shop_id).filter(Boolean))];

        const designMap = new Map();
        const productMap = new Map();
        const shopMap = new Map();

        // --------------------------------------------------------------------
        // Stage 2: 外部マスタデータの取得 (Enrichment)
        // 目的: QR メタデータから抽出された各 ID に基づき、表示に必要な情報を各マスタテーブルから引き当てます。
        // パフォーマンス: 並行処理ではなく直列のバルク取得を行うことで、エラー発生時の特定を容易にし、コードの可読性を高めています。
        // --------------------------------------------------------------------

        // 2-1. カードデザイン情報の取得 (CARD_DESIGN#METADATA / SK: <id>)
        if (designIds.length > 0) {
            const designKeys = (designIds as string[]).map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
            const dRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: designKeys } } }));
            dRes.Responses?.[TABLE_NAME]?.forEach(d => designMap.set(d.SK, d));
        }

        // 2-2. 商品情報の取得 (SHOP#<id> / PRODUCT#<id>)
        if (shopProductPairs.length > 0) {
            const productKeys = shopProductPairs.map(p => {
                const [sid, pid] = p.split('#');
                return { PK: `SHOP#${sid}`, SK: `PRODUCT#${pid}` };
            });
            const pRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: productKeys } } }));
            pRes.Responses?.[TABLE_NAME]?.forEach(p => productMap.set(`${p.PK}#${p.SK}`, p));
        }

        // 2-3. ショップ名の取得 (SHOP#<id> / METADATA)
        if (shopIds.length > 0) {
            const shopKeys = (shopIds as string[]).map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' }));
            const sRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: shopKeys } } }));
            sRes.Responses?.[TABLE_NAME]?.forEach(s => shopMap.set(s.PK, s));
        }

        // --------------------------------------------------------------------
        // Stage 3: 個々のログエントリーへの結合とアセット署名
        // --------------------------------------------------------------------
        for (const qr_id of chunk) {
            const meta = itemMap.get(`QR#${qr_id}#METADATA`);
            if (!meta) continue;

            // 期限切れのリアルタイム判定（Lazy Evaluation）
            const currentStatus = await checkAndExpire(ddb, TABLE_NAME, qr_id, meta);

            const design = meta.design_id ? (designMap.get(meta.design_id) || getSystemDesign(meta.design_id)) : null;
            const product = productMap.get(`SHOP#${meta.shop_id}#PRODUCT#${meta.product_id}`);
            const shop = shopMap.get(`SHOP#${meta.shop_id}`);
            const order = itemMap.get(`QR#${qr_id}#ORDER`) || {};
            const chat = itemMap.get(`QR#${qr_id}#CHAT`) || {};

            results.push({
                qr_id, status: currentStatus, pin: meta.pin,
                product_id: meta.product_id, product_name: product?.name,
                // アセットの URL 署名
                product_image_url: product ? await signUrlIfS3(product.image_url, BUCKET_NAME) : null,
                shop_id: meta.shop_id, shop_name: shop?.name,
                design_id: meta.design_id,
                thumbf: design ? await signUrlIfS3(design.thumbf, BUCKET_NAME) : null,
                thumbb: design ? await signUrlIfS3(design.thumbb, BUCKET_NAME) : null,
                bgimgf: design ? await signUrlIfS3(design.bgimgf, BUCKET_NAME) : null,
                bgimgb: design ? await signUrlIfS3(design.bgimgb, BUCKET_NAME) : null,
                recipient_name: order.name,
                sender_info: chat.sender_info, // スナップショットされた送り主情報
                ts_created_at: meta.ts_created_at, ts_updated_at: meta.ts_updated_at,
                timestamp: logs.find(l => l.qr_id === qr_id)?.timestamp
            });
        }
    }

    // 最後に履歴追加日時（timestamp）で再ソート
    return results.sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime());
}
