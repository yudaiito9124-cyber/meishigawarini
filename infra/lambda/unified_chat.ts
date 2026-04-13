/**
 * @file unified_chat.ts
 * @role Unified Chat API ハンドラー
 * @responsibility
 *  - 汎用チャット（作成、一覧、詳細、メッセージ送受信、既読、状態更新）を提供します。
 *  - `shared/unified-chat-workflows.ts` の契約に従い、workflow payload の型検証と遷移検証を実行します。
 * @context
 *  - `POST /unified/chat/*` 系のエンドポイントから呼び出される想定です。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import {
    GetCommand,
    PutCommand,
    QueryCommand,
    TransactWriteCommand,
    UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from './share/db';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { getAction, getUserId } from './utils/request';
import { generateId } from './utils/id';
import { successResponse, errorResponse } from './utils/response';
import { UnifiedChatApiSchema } from '@shared/api-types';
import {
    assertValidWorkflowPayload,
    canTransitionTo,
    isValidWorkflowPayload,
    WORKFLOW_REGISTRY,
} from '@shared/unified-chat-workflows';

type ChatMeta = {
    PK: string;
    SK: 'META';
    chat_id: string;
    participants: string[];
    initiator_id: string;
    chat_type: string;
    status: string;
    ts_created_at: string;
    ts_updated_at: string;
    ts_last_message_at: string;
    last_message_id: string;
    last_message_seq: number;
    last_message_text: string;
    version: number;
    shop_opening_form_snapshot?: {
        shop_name: string;
        owner_name: string;
        contact_email: string;
        notes?: string;
    };
    GSI1_PK: string;
    GSI1_SK: string;
};

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

function toEpochMs(iso: string): number {
    return new Date(iso).getTime();
}

function toReverseEpochMs(iso: string): string {
    const ms = toEpochMs(iso);
    return String(9999999999999 - ms).padStart(13, '0');
}

function toMsgSk(seq: number): string {
    return `MSG#${String(seq).padStart(12, '0')}`;
}

function calcShard(chatId: string): string {
    let h = 0;
    for (let i = 0; i < chatId.length; i += 1) {
        h = (h * 31 + chatId.charCodeAt(i)) >>> 0;
    }
    return String(h % 16).padStart(2, '0');
}

function buildGsi1Pk(chatType: string, status: string, shard: string): string {
    return `CHAT_TYPE#${chatType}#${status}#${shard}`;
}

function toChatPk(chatId: string): string {
    return `CHAT#${chatId}`;
}

function normalizeParticipants(participants: string[]): string[] {
    return Array.from(new Set(participants.filter(Boolean)));
}

function makePreview(message?: string, payloadType?: string): string {
    if (message && message.trim()) {
        return message.slice(0, 120);
    }
    if (payloadType) {
        return `[${payloadType}]`;
    }
    return '(no text)';
}

function parseCursor(cursor?: string): Record<string, unknown> | undefined {
    if (!cursor) return undefined;
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
}

function encodeCursor(lastKey?: Record<string, unknown>): string | null {
    if (!lastKey) return null;
    return Buffer.from(JSON.stringify(lastKey), 'utf-8').toString('base64');
}

async function createChat(body: UnifiedChatApiSchema['unified_chat_create'], callerUserId?: string) {
    const chat_id = generateId();
    const now = new Date().toISOString();
    let shopOpeningFormSnapshot: ChatMeta['shop_opening_form_snapshot'] | undefined;

    const participants = normalizeParticipants(body.participants || []);
    if (participants.length === 0) {
        return errorResponse(400, 'participants is required');
    }

    if (!participants.includes(body.initiator_id)) {
        return errorResponse(400, 'initiator_id must be included in participants');
    }

    if (!WORKFLOW_REGISTRY[body.chat_type as keyof typeof WORKFLOW_REGISTRY]) {
        return errorResponse(400, `Unsupported chat_type: ${body.chat_type}`);
    }

    if (body.initiator_id.startsWith('USER#') && callerUserId) {
        const expected = `USER#${callerUserId}`;
        if (body.initiator_id !== expected) {
            return errorResponse(403, 'initiator_id does not match authenticated user');
        }
    }

    const shard = calcShard(chat_id);
    const meta: ChatMeta = {
        PK: toChatPk(chat_id),
        SK: 'META',
        chat_id,
        participants,
        initiator_id: body.initiator_id,
        chat_type: body.chat_type,
        status: 'OPEN',
        ts_created_at: now,
        ts_updated_at: now,
        ts_last_message_at: now,
        last_message_id: '',
        last_message_seq: 0,
        last_message_text: '',
        version: 1,
        GSI1_PK: buildGsi1Pk(body.chat_type, 'OPEN', shard),
        GSI1_SK: `TS#${now}#CHAT#${chat_id}`,
    };

    const transactItems: any[] = [
        {
            Put: {
                TableName: TABLE_NAME,
                Item: meta,
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
        },
    ];

    for (const participantId of participants) {
        transactItems.push({
            Put: {
                TableName: TABLE_NAME,
                Item: {
                    PK: participantId,
                    SK: `CHAT#${chat_id}`,
                    chat_id,
                    participant_id: participantId,
                    joined_at: now,
                    last_read_seq: 0,
                    ts_last_read_at: now,
                    ts_last_message_at: now,
                    last_message_text: '',
                    unread_count_cache: 0,
                    is_muted: false,
                    is_archived: false,
                    chat_type: body.chat_type,
                    status: 'OPEN',
                    GSI2_PK: `CHAT_INBOX#${participantId}`,
                    GSI2_SK: `TS#${toReverseEpochMs(now)}#CHAT#${chat_id}`,
                },
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
        });
    }

    if (body.initial_message) {
        const msgId = generateId();
        const preview = makePreview(body.initial_message.message, body.initial_message.payload_type);
        const seq = 1;

        if (body.initial_message.type === 'WORKFLOW') {
            if (!body.initial_message.payload_type) {
                return errorResponse(400, 'payload_type is required for WORKFLOW initial_message');
            }

            const ct = body.chat_type as keyof typeof WORKFLOW_REGISTRY;
            const payloadType = body.initial_message.payload_type as any;
            const payload = body.initial_message.payload;

            try {
                const validatedPayload = (assertValidWorkflowPayload as any)(ct, payloadType, payload);
                if (ct === 'SHOP_OPENING' && payloadType === 'FORM_SUBMITTED') {
                    shopOpeningFormSnapshot = validatedPayload.form_snapshot;
                }
            } catch (e: any) {
                return errorResponse(400, e?.message || 'invalid initial workflow payload');
            }
        } else if (body.initial_message.payload_type !== undefined || body.initial_message.payload !== undefined) {
            return errorResponse(400, 'payload_type/payload are only allowed for WORKFLOW initial_message');
        }

        transactItems.push({
            Put: {
                TableName: TABLE_NAME,
                Item: {
                    PK: toChatPk(chat_id),
                    SK: toMsgSk(seq),
                    message_id: msgId,
                    seq,
                    sender_id: body.initiator_id,
                    role: body.initiator_id.split('#')[0] || 'USER',
                    username: body.initiator_id,
                    message: body.initial_message.message || '',
                    type: body.initial_message.type || 'TEXT',
                    payload_type: body.initial_message.payload_type,
                    payload: body.initial_message.payload,
                    ts_created_at: now,
                    is_deleted: false,
                },
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
        });

        transactItems[0] = {
            Put: {
                TableName: TABLE_NAME,
                Item: {
                    ...meta,
                    last_message_id: msgId,
                    last_message_seq: seq,
                    last_message_text: preview,
                    ...(shopOpeningFormSnapshot ? { shop_opening_form_snapshot: shopOpeningFormSnapshot } : {}),
                },
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
        };
    }

    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return successResponse({ chat_id, status: 'OPEN', participants });
}

function getGroupsFromEvent(event: any): string[] {
    const raw = event?.requestContext?.authorizer?.groups;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function isAdminGroups(groups: string[]): boolean {
    return groups.includes('Administrators') || groups.includes('GlobalAdmins');
}

function getCallerParticipantId(userId?: string): string | null {
    if (!userId) return null;
    return `USER#${userId}`;
}

async function canAccessParticipantId(participantId: string, callerUserId?: string, groups: string[] = [], event?: any): Promise<boolean> {
    if (participantId === 'ADMIN') {
        return isAdminGroups(groups);
    }

    if (participantId.startsWith('USER#')) {
        return participantId === getCallerParticipantId(callerUserId);
    }

    if (participantId.startsWith('SHOP#') && callerUserId) {
        const shopId = participantId.replace('SHOP#', '');
        const permission = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, callerUserId, event, groups);
        return !!permission;
    }

    return false;
}

async function canAccessChat(meta: ChatMeta, callerUserId?: string, groups: string[] = [], event?: any): Promise<boolean> {
    for (const participantId of meta.participants) {
        if (await canAccessParticipantId(participantId, callerUserId, groups, event)) {
            return true;
        }
    }
    return false;
}

async function listChats(body: UnifiedChatApiSchema['unified_chat_list'], callerUserId?: string, groups: string[] = [], event?: any) {
    if (!body.participant_id) {
        return errorResponse(400, 'participant_id is required');
    }

    const isAllowedParticipant = await canAccessParticipantId(body.participant_id, callerUserId, groups, event);
    if (!isAllowedParticipant) {
        return errorResponse(403, 'participant_id does not match caller');
    }

    const limit = Math.min(Math.max(body.limit || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const exclusiveKey = parseCursor(body.cursor);

    const params: any = {
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2_PK = :pk',
        ExpressionAttributeValues: {
            ':pk': `CHAT_INBOX#${body.participant_id}`,
        },
        Limit: limit,
        ScanIndexForward: true,
    };

    if (exclusiveKey) {
        params.ExclusiveStartKey = exclusiveKey;
    }

    const res = await ddb.send(new QueryCommand(params));
    let items = res.Items || [];

    if (!body.include_archived) {
        items = items.filter((x) => !x.is_archived);
    }
    if (body.chat_type) {
        items = items.filter((x) => x.chat_type === body.chat_type);
    }
    if (body.status) {
        items = items.filter((x) => x.status === body.status);
    }

    const nextCursor = encodeCursor(res.LastEvaluatedKey as Record<string, unknown> | undefined);
    return successResponse({ items, cursor: nextCursor });
}

async function getChat(body: UnifiedChatApiSchema['unified_chat_get'], callerUserId?: string, groups: string[] = [], event?: any) {
    if (!body.chat_id) {
        return errorResponse(400, 'chat_id is required');
    }

    const res = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: toChatPk(body.chat_id), SK: 'META' },
    }));

    if (!res.Item) {
        return errorResponse(404, 'chat not found');
    }

    const chat = res.Item as ChatMeta;
    if (!(await canAccessChat(chat, callerUserId, groups, event))) {
        return errorResponse(403, 'forbidden');
    }

    return successResponse({ chat: res.Item });
}

async function getMessages(body: UnifiedChatApiSchema['unified_chat_messages_get'], callerUserId?: string, groups: string[] = [], event?: any) {
    if (!body.chat_id) {
        return errorResponse(400, 'chat_id is required');
    }

    const metaRes = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: toChatPk(body.chat_id), SK: 'META' },
    }));
    const meta = metaRes.Item as ChatMeta | undefined;
    if (!meta) {
        return errorResponse(404, 'chat not found');
    }

    if (!(await canAccessChat(meta, callerUserId, groups, event))) {
        return errorResponse(403, 'forbidden');
    }

    const limit = Math.min(Math.max(body.limit || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const exprValues: Record<string, unknown> = {
        ':pk': toChatPk(body.chat_id),
        ':prefix': 'MSG#',
    };

    let keyCondition = 'PK = :pk AND begins_with(SK, :prefix)';
    if (body.before_seq !== undefined) {
        exprValues[':before'] = toMsgSk(body.before_seq);
        keyCondition = 'PK = :pk AND SK < :before';
    }

    const res = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: exprValues,
        Limit: limit,
        ScanIndexForward: false,
    }));

    return successResponse({ messages: res.Items || [] });
}

async function sendMessage(body: UnifiedChatApiSchema['unified_chat_messages_send'], callerUserId?: string, groups: string[] = [], event?: any) {
    if (!body.chat_id || !body.sender_id || !body.type) {
        return errorResponse(400, 'chat_id, sender_id, type are required');
    }

    const metaRes = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: toChatPk(body.chat_id), SK: 'META' },
    }));
    const meta = metaRes.Item as ChatMeta | undefined;
    if (!meta) {
        return errorResponse(404, 'chat not found');
    }

    if (!meta.participants.includes(body.sender_id)) {
        return errorResponse(403, 'sender is not chat participant');
    }

    const isAllowedSender = await canAccessParticipantId(body.sender_id, callerUserId, groups, event);
    if (!isAllowedSender) {
        return errorResponse(403, 'sender_id does not match caller');
    }

    const now = new Date().toISOString();
    const seq = (meta.last_message_seq || 0) + 1;
    const msgId = generateId();
    const preview = makePreview(body.message, body.payload_type);

    let workflowStatus = body.workflow_status;
    if (body.type === 'WORKFLOW') {
        if (!body.payload_type) {
            return errorResponse(400, 'payload_type is required for WORKFLOW message');
        }

        if (body.payload === undefined) {
            return errorResponse(400, 'payload is required for WORKFLOW message');
        }

        const chatType = meta.chat_type as keyof typeof WORKFLOW_REGISTRY;
        const payloadType = body.payload_type as any;

        try {
            (assertValidWorkflowPayload as any)(chatType, payloadType, body.payload);
        } catch (e: any) {
            return errorResponse(400, e.message || 'invalid workflow payload');
        }

        if (workflowStatus) {
            const allowed = (canTransitionTo as any)(chatType, payloadType, workflowStatus);
            if (!allowed) {
                return errorResponse(400, `invalid workflow transition to ${workflowStatus}`);
            }
        }
    } else if (body.payload_type !== undefined || body.payload !== undefined || body.workflow_status !== undefined) {
        return errorResponse(400, 'payload_type/payload/workflow_status are only allowed for WORKFLOW message');
    }

    const shard = calcShard(meta.chat_id);
    const newMeta = {
        ...meta,
        ts_updated_at: now,
        ts_last_message_at: now,
        last_message_id: msgId,
        last_message_seq: seq,
        last_message_text: preview,
        version: (meta.version || 0) + 1,
        GSI1_PK: buildGsi1Pk(meta.chat_type, meta.status, shard),
        GSI1_SK: `TS#${now}#CHAT#${meta.chat_id}`,
    };

    const transactItems: any[] = [
        {
            Put: {
                TableName: TABLE_NAME,
                Item: {
                    PK: toChatPk(meta.chat_id),
                    SK: toMsgSk(seq),
                    message_id: msgId,
                    seq,
                    sender_id: body.sender_id,
                    role: body.sender_id.split('#')[0] || 'USER',
                    username: body.sender_id,
                    message: body.message || '',
                    type: body.type,
                    payload_type: body.payload_type,
                    payload: body.payload,
                    workflow_status: workflowStatus,
                    file_url: body.file_url,
                    file_name: body.file_name,
                    file_size: body.file_size,
                    ts_created_at: now,
                    is_deleted: false,
                },
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
        },
        {
            Put: {
                TableName: TABLE_NAME,
                Item: newMeta,
                ConditionExpression: 'version = :expectedVersion',
                ExpressionAttributeValues: {
                    ':expectedVersion': meta.version,
                },
            },
        },
    ];

    for (const participantId of meta.participants) {
        const isSender = participantId === body.sender_id;
        const lastReadSeq = isSender ? seq : undefined;

        transactItems.push({
            Update: {
                TableName: TABLE_NAME,
                Key: {
                    PK: participantId,
                    SK: `CHAT#${meta.chat_id}`,
                },
                UpdateExpression:
                    'SET ts_last_message_at = :ts, last_message_text = :preview, GSI2_SK = :gsi2, #status = :status, chat_type = :chatType, unread_count_cache = :unread' +
                    (isSender ? ', last_read_seq = :lastRead, ts_last_read_at = :ts' : ''),
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':ts': now,
                    ':preview': preview,
                    ':gsi2': `TS#${toReverseEpochMs(now)}#CHAT#${meta.chat_id}`,
                    ':status': meta.status,
                    ':chatType': meta.chat_type,
                    ':unread': isSender ? 0 : seq,
                    ...(isSender ? { ':lastRead': seq } : {}),
                },
            },
        });
    }

    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return successResponse({
        message_id: msgId,
        seq,
        ts_created_at: now,
    });
}

async function markRead(body: UnifiedChatApiSchema['unified_chat_read_mark'], callerUserId?: string, groups: string[] = [], event?: any) {
    if (!body.chat_id || !body.participant_id || body.last_read_seq === undefined) {
        return errorResponse(400, 'chat_id, participant_id, last_read_seq are required');
    }

    const metaRes = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: toChatPk(body.chat_id), SK: 'META' },
    }));

    const meta = metaRes.Item as ChatMeta | undefined;
    if (!meta) {
        return errorResponse(404, 'chat not found');
    }

    const isAllowedParticipant = await canAccessParticipantId(body.participant_id, callerUserId, groups, event);
    if (!isAllowedParticipant) {
        return errorResponse(403, 'participant_id does not match caller');
    }

    if (body.last_read_seq > meta.last_message_seq) {
        return errorResponse(400, 'last_read_seq must be <= last_message_seq');
    }

    await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: body.participant_id, SK: `CHAT#${body.chat_id}` },
        UpdateExpression: 'SET last_read_seq = :seq, ts_last_read_at = :ts, unread_count_cache = :unread',
        ExpressionAttributeValues: {
            ':seq': body.last_read_seq,
            ':ts': new Date().toISOString(),
            ':unread': Math.max(meta.last_message_seq - body.last_read_seq, 0),
        },
    }));

    return successResponse({ ok: true });
}

async function updateStatus(body: UnifiedChatApiSchema['unified_chat_status_update'], groups: string[] = []) {
    if (!body.chat_id || !body.next_status || body.expected_version === undefined) {
        return errorResponse(400, 'chat_id, next_status, expected_version are required');
    }

    if (!isAdminGroups(groups)) {
        return errorResponse(403, 'status update requires admin privileges');
    }

    const metaRes = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: toChatPk(body.chat_id), SK: 'META' },
    }));

    const meta = metaRes.Item as ChatMeta | undefined;
    if (!meta) {
        return errorResponse(404, 'chat not found');
    }

    const now = new Date().toISOString();
    const shard = calcShard(meta.chat_id);

    if (meta.participants.length > 24) {
        return errorResponse(400, 'too many participants to update atomically');
    }

    const transactItems: any[] = [
        {
            Update: {
                TableName: TABLE_NAME,
                Key: { PK: toChatPk(body.chat_id), SK: 'META' },
                UpdateExpression: 'SET #status = :status, ts_updated_at = :ts, GSI1_PK = :gsi1pk, GSI1_SK = :gsi1sk, version = :nextVersion',
                ConditionExpression: 'version = :expectedVersion',
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':status': body.next_status,
                    ':ts': now,
                    ':gsi1pk': buildGsi1Pk(meta.chat_type, body.next_status, shard),
                    ':gsi1sk': `TS#${meta.ts_last_message_at}#CHAT#${meta.chat_id}`,
                    ':expectedVersion': body.expected_version,
                    ':nextVersion': body.expected_version + 1,
                },
            },
        },
    ];

    for (const participantId of meta.participants) {
        transactItems.push({
            Update: {
                TableName: TABLE_NAME,
                Key: { PK: participantId, SK: `CHAT#${meta.chat_id}` },
                UpdateExpression: 'SET #status = :status, ts_last_message_at = :ts',
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':status': body.next_status,
                    ':ts': now,
                },
            },
        });
    }

    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return successResponse({ ok: true, next_status: body.next_status });
}

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // ─── CORSプリフライト処理 ───────────────────────────────────────────────────
        // ブラウザは実際のリクエストを送る前に OPTIONS メソッドで「このAPIへのアクセスを
        // 許可するか」事前確認（プリフライト）を行います。
        // ここでは処理なしで即座に成功レスポンス（CORSヘッダー付き）を返します。
        if (event.httpMethod === 'OPTIONS') {
            return successResponse();
        }

        // ─── リクエストボディのパース ──────────────────────────────────────────────
        // フロントエンドから送られてきた JSON 文字列をオブジェクトに変換します。
        // ボディが空（undefined や null）の場合は空オブジェクトをデフォルト値として使用します。
        const body = JSON.parse(event.body || '{}');

        // ─── ルーティング：パスの完全一致でアクションを決定 ──────────────────────
        //
        // このLambda関数は一つのファイルで以下の7つのエンドポイントを処理します。
        //   POST /unified/chat/create       → チャット作成
        //   POST /unified/chat/list         → チャット一覧取得
        //   POST /unified/chat/get          → チャット詳細取得
        //   POST /unified/chat/messages/get → メッセージ一覧取得
        //   POST /unified/chat/messages/send→ メッセージ送信
        //   POST /unified/chat/read/mark    → 既読位置の更新
        //   POST /unified/chat/status/update→ チャットステータス更新
        //
        // API Gateway は event.resource に「定義時のパスパターン」を正確に設定します。
        // 例: /unified/chat/messages/get
        //
        // 【重要：なぜ === による完全一致を使うのか】
        //   以前は path.endsWith('/get') のような「部分一致」を使っていました。
        //   しかしこの方法では:
        //     /unified/chat/messages/get も /get で終わるため
        //     より具体的な messages/get より先に /get の条件にマッチしてしまい、
        //     「メッセージ取得」が「チャット詳細取得」として処理されるバグが発生しました。
        //
        //   これにより /unified/chat/messages/get を呼んでも messages が空配列で
        //   返り続け、審査結果が「審査中」のまま表示されない不具合の根本原因でした。
        //
        //   === による完全一致を使うことで、この種の曖昧マッチを完全に防止します。
        //
        // event.resource: API Gatewayが付与する定義済みパス（最も信頼性が高い）
        // event.path:     実際に受信したリクエストのパス（フォールバック）
        const path = event.resource || event.path || '';

        // パスの完全一致でアクション名を決定します。
        // どのパスにもマッチしない場合は undefined のまま進み、最後の 404 に到達します。
        let action: string | undefined;
        if (path === '/unified/chat/create') {
            // 新しいチャットルームを作成します（ショップ開設申請などのワークフロー起点）。
            action = 'create';
        } else if (path === '/unified/chat/list') {
            // 指定した参加者ID（USER#xxx / SHOP#xxx）が参加しているチャット一覧を取得します。
            action = 'list';
        } else if (path === '/unified/chat/messages/get') {
            // 完全一致（===）で判定しているため、/unified/chat/get との誤判定は発生しません。
            // （部分一致のときに起きた衝突を避けるため、現在は === に統一しています。）
            // 指定チャットのメッセージ一覧（本文・ペイロード・ワークフロー状態等）を取得します。
            action = 'messages_get';
        } else if (path === '/unified/chat/messages/send') {
            // チャットに新しいメッセージを送信します（テキスト・ワークフロー判定含む）。
            action = 'messages_send';
        } else if (path === '/unified/chat/get') {
            // 特定チャットのメタデータ（参加者・ステータス・最終メッセージ連番等）を1件取得します。
            action = 'get';
        } else if (path === '/unified/chat/read/mark') {
            // 既読位置（last_read_seq）を記録し、未読バッジのカウントを解消します。
            action = 'read_mark';
        } else if (path === '/unified/chat/status/update') {
            // チャットのステータスを変更します（例: OPEN → RESOLVED）。
            action = 'status_update';
        } else {
            // 上記のいずれにもマッチしない場合は、リクエストボディの action フィールドを参照します。
            // 主に開発・デバッグ時の後方互換目的のフォールバックです。
            action = getAction(event, body);
        }

        // ─── 認証情報の抽出 ──────────────────────────────────────────────────────
        // Lambda Authorizer が JWT を検証し、ユーザーIDを event.requestContext に付与しています。
        // getUserId() はそこから Cognito sub（ユーザーの一意識別子）を取り出します。
        const callerUserId = getUserId(event);

        // Cognito ユーザープールのグループ（例: "Admins"）は管理者権限の判定に使用します。
        const groups = getGroupsFromEvent(event);

        // ─── アクション別ディスパッチ ─────────────────────────────────────────────
        // 決定したアクション名に応じて対応するビジネスロジック関数に処理を委譲します。
        // 各関数の内部でさらにアクセス権チェック・バリデーション・DB操作が行われます。

        if (action === 'create') {
            // チャット作成: 参加者リストと初期メッセージを受け取り、DynamoDBに保存します。
            return await createChat(body as UnifiedChatApiSchema['unified_chat_create'], callerUserId);
        }
        if (action === 'list') {
            // チャット一覧: GSI2 を使って参加者インボックスをクエリします。
            return await listChats(body as UnifiedChatApiSchema['unified_chat_list'], callerUserId, groups, event);
        }
        if (action === 'get') {
            // チャット詳細: PK=CHAT#xxx / SK=META のアイテムを1件取得します。
            return await getChat(body as UnifiedChatApiSchema['unified_chat_get'], callerUserId, groups, event);
        }
        if (action === 'messages_get') {
            // メッセージ一覧: PK=CHAT#xxx / SK begins_with MSG# でクエリします。
            return await getMessages(body as UnifiedChatApiSchema['unified_chat_messages_get'], callerUserId, groups, event);
        }
        if (action === 'messages_send') {
            // メッセージ送信: メッセージを保存し、チャットMETAの最終メッセージ情報を更新します。
            return await sendMessage(body as UnifiedChatApiSchema['unified_chat_messages_send'], callerUserId, groups, event);
        }
        if (action === 'read_mark') {
            // 既読マーク: 参加者ごとの last_read_seq と unread_count_cache を更新します。
            return await markRead(body as UnifiedChatApiSchema['unified_chat_read_mark'], callerUserId, groups, event);
        }
        if (action === 'status_update') {
            // ステータス更新: チャットの status フィールドを楽観的ロック（version）付きで変更します。
            return await updateStatus(body as UnifiedChatApiSchema['unified_chat_status_update'], groups);
        }

        // どのアクションにも該当しないリクエストは 404 を返します。
        return errorResponse(404, 'Unknown action');
    } catch (error: any) {
        // 予期しないエラー（DB接続失敗・JSON パースエラー等）をキャッチしてログに残します。
        // クライアントには詳細なスタックトレースを露出せず、汎用の500エラーを返します。
        console.error('Unified chat error:', error);
        return errorResponse(500, 'Internal Server Error', error?.message || 'unknown error');
    }
};
