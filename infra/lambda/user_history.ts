/**
 * 概要: 送信・受信履歴の取得およびギフトの紐付け
 * 詳細:
 *  - ユーザーに関連するすべての送信ログ(SENDLOG)と受信ログ(RECEIVEDLOG)を取得します。
 *  - また、新しくギフト（QRコード）をスキャンした際に、それを自分の送信履歴として登録する機能を提供します。
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
import { getUUID, getAction, getUserId } from './utils/request';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const action = getAction(event, body);
        
        if (!userId) return errorResponse(401, 'Unauthorized');

        // ====================================================================
        // ACTION: history_get (送信・受信履歴の取得)
        // --------------------------------------------------------------------
        // 目的: 指定されたログタイプ(SENDLOG / RECEIVEDLOG)の履歴データをすべて取得します。
        // ====================================================================
        if (action === 'history_get') {
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
                const allUuids: Array<{ uuid: string, timestamp: string }> = [];
                for (const item of queryRes.Items || []) {
                    if (item.logs && Array.isArray(item.logs)) {
                        allUuids.push(...item.logs);
                    }
                }
                // Timestamp降順でソート
                allUuids.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                return allUuids;
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
        // ACTION: history_sendgift (ギフトの紐付け)
        // --------------------------------------------------------------------
        // 目的: QRをスキャンして、自分を送信者として登録し、送信履歴に追加します。
        // ※PINチェックはユーザー要望により省略しています。
        // ====================================================================
        if (action === 'history_sendgift') {
            const uuid = getUUID(event, body);
            if (!uuid) return errorResponse(400, 'Missing UUID');

            // 1. CHATレコードに自分を送信者として紐付ける
            // ※元の動作に合わせて単純なSET操作を行います。
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                UpdateExpression: 'SET sender_id = :sid, ts_updated_at = :now',
                ExpressionAttributeValues: { ':sid': userId, ':now': new Date().toISOString() }
            }));

            // 2. SENDLOG に追記する
            await appendToHistory(ddb, TABLE_NAME, userId, 'SENDLOG', uuid);

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
async function enrichLogs(logs: Array<{ uuid: string, timestamp: string }>) {
    if (logs.length === 0) return [];

    const uuids = logs.map(l => l.uuid);
    const results = [];

    // 100件ずつのバッチ取得
    for (let i = 0; i < uuids.length; i += 100) {
        const chunk = uuids.slice(i, i + 100);
        
        // METADATA, ORDER, CHAT(sender_info)などの一括取得
        const keys = [
            ...chunk.map(uuid => ({ PK: `QR#${uuid}`, SK: 'METADATA' })),
            ...chunk.map(uuid => ({ PK: `QR#${uuid}`, SK: 'ORDER' })),
            ...chunk.map(uuid => ({ PK: `QR#${uuid}`, SK: 'CHAT' }))
        ];

        const batchRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: keys } } }));
        const items = batchRes.Responses?.[TABLE_NAME] || [];
        const itemMap = new Map();
        items.forEach(it => itemMap.set(`${it.PK}#${it.SK}`, it));

        // デザイン情報の一括取得用
        const designIds = [...new Set(items.filter(it => it.SK === 'METADATA').map(it => it.card_design).filter(Boolean))];
        const designMap = new Map();
        if (designIds.length > 0) {
            const designKeys = designIds.map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
            const dRes = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: designKeys } } }));
            dRes.Responses?.[TABLE_NAME]?.forEach(d => designMap.set(d.SK, d));
        }

        for (const uuid of chunk) {
            const meta = itemMap.get(`QR#${uuid}#METADATA`);
            if (!meta) continue;

            const order = itemMap.get(`QR#${uuid}#ORDER`) || {};
            const chat = itemMap.get(`QR#${uuid}#CHAT`) || {};
            
            // 期限切れチェック(遅延評価)
            const currentStatus = await checkAndExpire(ddb, TABLE_NAME, uuid, meta);

            const designId = meta.card_design;
            const design = designId ? (designMap.get(designId) || getSystemDesign(designId)) : null;

            results.push({
                uuid,
                status: currentStatus,
                pin: meta.pin,
                product_id: meta.product_id,
                card_design: designId,
                thumbf: design ? await signUrlIfS3(design.thumbf, BUCKET_NAME) : null,
                thumbb: design ? await signUrlIfS3(design.thumbb, BUCKET_NAME) : null,
                recipient_name: order.name,
                sender_info: chat.sender_info,
                ts_created_at: meta.ts_created_at,
                ts_updated_at: meta.ts_updated_at,
                ts_history_at: logs.find(l => l.uuid === uuid)?.timestamp
            });
        }
    }
    
    // 元のソート順(履歴追加日)で再ソート
    return results.sort((a, b) => new Date(b.ts_history_at!).getTime() - new Date(a.ts_history_at!).getTime());
}
