/**
 * @file chat-notification.ts
 * @role チャット通知ヘルパー
 * @responsibility
 *  - 「通知のみ（即クローズ）」の Unified Chat を簡単に作成するための共通関数を提供します。
 *  - 注文通知、お問い合わせ通知など、ショップオーナーへの通知履歴をチャット形式で残す際に利用します。
 */

import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../share/db';
import { generateId } from './id';

interface ClosedChatNotificationParams {
    /** チャット種別 (e.g., 'SHOP_SUPPORT', 'MISC') */
    chatType: string;
    /** 参加者リスト (e.g., ['SHOP#xxx', 'GUEST#...']) */
    participants: string[];
    /** 起票者 ID */
    initiatorId: string;
    /** 初期メッセージ */
    message: string;
    /** 初期メッセージのペイロード種別 (任意) */
    payloadType?: string;
    /** 初期メッセージのペイロード (任意) */
    payload?: Record<string, unknown>;
}

/**
 * 読み取り専用（即 RESOLVED）のチャット通知を 1 トランザクションで作成します。
 */
export async function createClosedChatNotification(params: ClosedChatNotificationParams) {
    const { chatType, participants, initiatorId, message, payloadType, payload } = params;
    const chat_id = generateId();
    const msgId = generateId();
    const now = new Date().toISOString();
    const seq = 1;
    const status = 'NOTIFICATION'; // 通知（即クローズ）状態で作成

    const preview = (message || '').slice(0, 120);

    // GSI1 のシャード計算 (unified_chat.ts と同ロジック)
    let h = 0;
    for (let i = 0; i < chat_id.length; i += 1) {
        h = (h * 31 + chat_id.charCodeAt(i)) >>> 0;
    }
    const shard = String(h % 16).padStart(2, '0');

    const transactItems: any[] = [];

    // 1. META レコード
    transactItems.push({
        Put: {
            TableName: TABLE_NAME,
            Item: {
                PK: `CHAT#${chat_id}`,
                SK: 'META',
                chat_id,
                participants,
                initiator_id: initiatorId,
                chat_type: chatType,
                status,
                ts_created_at: now,
                ts_updated_at: now,
                ts_last_message_at: now,
                last_message_id: msgId,
                last_message_seq: seq,
                last_message_text: preview,
                version: 1,
                GSI1_PK: `CHAT_TYPE#${chatType}#${status}#${shard}`,
                GSI1_SK: `TS#${now}#CHAT#${chat_id}`,
            }
        }
    });

    // 2. 参加者ごとの Inbox レコード
    for (const pId of participants) {
        // 通知なので、起票者以外は未読 1
        const isInitiator = pId === initiatorId;
        transactItems.push({
            Put: {
                TableName: TABLE_NAME,
                Item: {
                    PK: pId,
                    SK: `CHAT#${chat_id}`,
                    chat_id,
                    participant_id: pId,
                    joined_at: now,
                    last_read_seq: isInitiator ? 1 : 0,
                    ts_last_read_at: now,
                    ts_last_message_at: now,
                    last_message_text: preview,
                    unread_count_cache: isInitiator ? 0 : 1,
                    is_muted: false,
                    is_archived: false,
                    chat_type: chatType,
                    status,
                    GSI2_PK: `CHAT_INBOX#${pId}`,
                    GSI2_SK: `TS#${String(9999999999999 - new Date(now).getTime()).padStart(13, '0')}#CHAT#${chat_id}`,
                }
            }
        });
    }

    // 3. 初期メッセージレコード
    transactItems.push({
        Put: {
            TableName: TABLE_NAME,
            Item: {
                PK: `CHAT#${chat_id}`,
                SK: `MSG#${String(seq).padStart(12, '0')}`,
                message_id: msgId,
                seq,
                sender_id: initiatorId,
                role: initiatorId.split('#')[0] || 'USER',
                username: initiatorId,
                message: message || '',
                type: payloadType ? 'WORKFLOW' : 'TEXT',
                payload_type: payloadType,
                payload: payload,
                ts_created_at: now,
                is_deleted: false,
            }
        }
    });

    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));
    
    return { chat_id };
}
