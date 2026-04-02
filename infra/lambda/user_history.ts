/**
 * 概要: 送信・受信履歴の取得およびギフトの紐付け
 * 詳細:
 *  - ユーザーに関連するすべての送信ログ(SENDLOG)と受信ログ(RECEIVEDLOG)を取得します。
 *  - また、新しくギフト（QR ID）をスキャンした際に、それを自分の送信履歴として登録する機能を提供します。
 *
 * エンドポイント:
 *  - POST /user/history/get (送信・受信履歴の一覧取得)
 *  - POST /user/history/sendgift (ギフトのスキャン・紐付け)
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

        // ====================================================================
        // ACTION: get (送信・受信履歴の取得)
        // --------------------------------------------------------------------
        // 目的: 指定されたログタイプ(SENDLOG / RECEIVEDLOG)の履歴データをすべて取得します。
        // ====================================================================
        if (action === 'get') {
            const pk = `USER#${userId}`;

            const fetchLogs = async (logType: string) => {
                const queryRes = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
                    ExpressionAttributeValues: {
                        ':pk': pk,
                        ':skPrefix': `${logType}#`
                    }
                }));
                const allQrIds: Array<{ qr_id: string, timestamp: string }> = [];
                for (const item of queryRes.Items || []) {
                    if (item.logs && Array.isArray(item.logs)) {
                        // 互換性のため uuid もチェック
                        allQrIds.push(...item.logs.map((l: any) => ({
                            qr_id: l.qr_id || l.uuid,
                            timestamp: l.timestamp
                        })));
                    }
                }
                // Timestamp降順でソート
                allQrIds.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                return allQrIds;
            };

            const [sentLogs, receivedLogs] = await Promise.all([
                fetchLogs('SENDLOG'),
                fetchLogs('RECEIVEDLOG')
            ]);

            // メタデータ紐付け(Enrichment)
            const [sent, received] = await Promise.all([
                enrichLogs(sentLogs),
                enrichLogs(receivedLogs)
            ]);

            return successResponse({ sent, received });
        }

        // ====================================================================
        // ACTION: sendgift (ギフトの紐付け)
        // --------------------------------------------------------------------
        // 目的: QR IDをスキャンして、自分を送信者として登録し、送信履歴に追加します。
        // ====================================================================
        if (action === 'sendgift') {
            const { qr_id: body_qr_id, pin: body_pin } = body as UserApiSchema['user_history_sendgift'];
            const qr_id = getQrId(event, body);
            const pin = getPIN(event, body);

            if (!qr_id) return errorResponse(400, 'Missing QR ID');

            // 1. PINの妥当性とステータスを確認
            const qrRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            }));
            if (!qrRes.Item) {
                return errorResponse(404, 'QR code not found');
            }

            // ユーザーの最新プロフィール（SENDER）を取得してスナップショットとして保存する
            const profileRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${userId}`, SK: 'SENDER' }
            }));
            const sender_info = profileRes.Item ? { ...profileRes.Item } : { user_id: userId };
            delete (sender_info as any).PK;
            delete (sender_info as any).SK;

            // 1. CHATレコードに自分を送信者として紐付ける (既に紐付け済みの場合は例外を発生させる)
            try {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                    UpdateExpression: 'SET sender_id = :sid, sender_info = :sinfo, ts_updated_at = :now',
                    ConditionExpression: 'attribute_not_exists(sender_id)',
                    ExpressionAttributeValues: {
                        ':sid': userId,
                        ':sinfo': sender_info,
                        ':now': new Date().toISOString()
                    }
                }));
            } catch (err: any) {
                if (err.name === 'ConditionalCheckFailedException') {
                    return errorResponse(409, 'This gift is already linked to a sender');
                }
                throw err;
            }

            // 2. SENDLOG に追記する
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
 * 履歴用の項目をメタデータによって多重化(Enrichment)
 */
async function enrichLogs(logs: Array<{ qr_id: string, timestamp: string }>) {
    if (logs.length === 0) return [];

    const qrIds = logs.map(l => l.qr_id);
    const results = [];

    // 100件ずつのバッチ取得
    for (let i = 0; i < qrIds.length; i += 100) {
        const chunk = qrIds.slice(i, i + 100);

        // METADATA, ORDER, CHAT(sender_info)などの一括取得
        const keys = [
            ...chunk.map(qr_id => ({ PK: `QR#${qr_id}`, SK: 'METADATA' })),
            ...chunk.map(qr_id => ({ PK: `QR#${qr_id}`, SK: 'ORDER' })),
            ...chunk.map(qr_id => ({ PK: `QR#${qr_id}`, SK: 'CHAT' }))
        ];

        const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: keys } } }));
        const items = batchRes.Responses?.[TABLE_NAME] || [];
        const itemMap = new Map();
        items.forEach(it => itemMap.set(`${it.PK}#${it.SK}`, it));

        // デザイン情報、商品情報、ショップ情報の取得用
        const metaList = items.filter(it => it.SK === 'METADATA');
        const designIds = [...new Set(metaList.map(it => it.card_design).filter(Boolean))];
        const shopProductPairs = [...new Set(metaList.map(it => `${it.shop_id}#${it.product_id}`).filter(p => !p.startsWith('undefined')))];
        const shopIds = [...new Set(metaList.map(it => it.shop_id).filter(Boolean))];

        const designMap = new Map();
        const productMap = new Map();
        const shopMap = new Map();

        // 1. デザイン情報の取得
        if (designIds.length > 0) {
            const designKeys = (designIds as string[]).map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
            const dRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: designKeys } } }));
            dRes.Responses?.[TABLE_NAME]?.forEach(d => designMap.set(d.SK, d));
        }

        // 2. 商品情報の取得 (SHOP#ID, PRODUCT#ID)
        if (shopProductPairs.length > 0) {
            const productKeys = shopProductPairs.map(p => {
                const [sid, pid] = p.split('#');
                return { PK: `SHOP#${sid}`, SK: `PRODUCT#${pid}` };
            });
            const pRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: productKeys } } }));
            pRes.Responses?.[TABLE_NAME]?.forEach(p => productMap.set(`${p.PK}#${p.SK}`, p));
        }

        // 3. ショップ情報の取得 (SHOP#ID, METADATA)
        if (shopIds.length > 0) {
            const shopKeys = (shopIds as string[]).map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' }));
            const sRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: shopKeys } } }));
            sRes.Responses?.[TABLE_NAME]?.forEach(s => shopMap.set(s.PK, s));
        }

        for (const qr_id of chunk) {
            const meta = itemMap.get(`QR#${qr_id}#METADATA`);
            if (!meta) continue;

            const order = itemMap.get(`QR#${qr_id}#ORDER`) || {};
            const chat = itemMap.get(`QR#${qr_id}#CHAT`) || {};

            // 期限切れチェック(遅延評価)
            const currentStatus = await checkAndExpire(ddb, TABLE_NAME, qr_id, meta);

            const designId = meta.card_design;
            const design = designId ? (designMap.get(designId) || getSystemDesign(designId)) : null;
            const product = productMap.get(`SHOP#${meta.shop_id}#PRODUCT#${meta.product_id}`);
            const shop = shopMap.get(`SHOP#${meta.shop_id}`);

            results.push({
                qr_id,
                status: currentStatus,
                pin: meta.pin,
                product_id: meta.product_id,
                product_name: product?.name,
                product_image_url: product ? await signUrlIfS3(product.image_url, BUCKET_NAME) : null,
                shop_id: meta.shop_id,
                shop_name: shop?.name,
                card_design: designId,
                card_design_thumbf: design ? await signUrlIfS3(design.thumbf, BUCKET_NAME) : null,
                card_design_thumbb: design ? await signUrlIfS3(design.thumbb, BUCKET_NAME) : null,
                recipient_name: order.name,
                sender_info: chat.sender_info,
                ts_created_at: meta.ts_created_at,
                ts_updated_at: meta.ts_updated_at,
                timestamp: logs.find(l => l.qr_id === qr_id)?.timestamp
            });
        }
    }

    // 元のソート順(履歴追加日)で再ソート
    return results.sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime());
}
