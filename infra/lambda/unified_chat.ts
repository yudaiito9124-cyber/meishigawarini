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
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { getAction, getUserId } from './utils/request';
import { generateId } from './utils/id';
import { successResponse, errorResponse } from './utils/response';
import { getPublicUrl, signUrlIfS3, stripSignature } from './utils/s3';
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

// S3 アップロード関連の定数
const s3 = new S3Client({});
const FILE_SIZE_LIMIT_MB = 30; // 30MB（カードデザイン用画像アップロードに対応）

/** ISO8601文字列をエポックミリ秒へ変換します。 */
// ISO文字列をミリ秒に変換（reverse sort key 計算で使用）
function toEpochMs(iso: string): number {
    return new Date(iso).getTime();
}

/** inbox並び替え用の逆順時刻キーを生成します。 */
// 新しい時刻ほど小さい値になる「逆順時刻キー」を生成
// inbox(GSI2) を ScanIndexForward=true でクエリした際に、新着順で並ぶようにするために使う
function toReverseEpochMs(iso: string): string {
    const ms = toEpochMs(iso);
    return String(9999999999999 - ms).padStart(13, '0');
}

/** メッセージ連番をSK形式（MSG#000...）へ変換します。 */
// メッセージSKを固定桁で生成（文字列比較でも連番順を維持）
function toMsgSk(seq: number): string {
    return `MSG#${String(seq).padStart(12, '0')}`;
}

/** chat_idからGSI分散用シャード番号（00-15）を計算します。 */
// chat_id から 0..15 のシャードを安定計算
// GSI1 のホットパーティションを避けるため chat_type/status に shard を組み込む
function calcShard(chatId: string): string {
    let h = 0;
    for (let i = 0; i < chatId.length; i += 1) {
        h = (h * 31 + chatId.charCodeAt(i)) >>> 0;
    }
    return String(h % 16).padStart(2, '0');
}

/** chat_type/status/shard から GSI1 PK を組み立てます。 */
function buildGsi1Pk(chatType: string, status: string, shard: string): string {
    return `CHAT_TYPE#${chatType}#${status}#${shard}`;
}

/** chat_id から META/MSG 共通の PK を組み立てます。 */
function toChatPk(chatId: string): string {
    return `CHAT#${chatId}`;
}

/** participant_id を保存・判定用に正規化します（ADMIN#... は ADMIN に集約）。 */
function normalizeParticipantId(participantId?: string): string {
    const id = String(participantId || '').trim();
    if (!id) return '';
    if (/^ADMIN(#.*)?$/i.test(id)) return 'ADMIN';
    return id;
}

/** 参加者配列を重複なし・空値なしに正規化します。 */
// 参加者IDの重複・空文字を除去して正規化
function normalizeParticipants(participants: string[]): string[] {
    return Array.from(new Set(participants.map((participantId) => normalizeParticipantId(participantId)).filter(Boolean)));
}

/** チャット一覧で使う最終メッセージプレビューを生成します。 */
// inbox 一覧に表示するプレビュー文字列を生成
// テキスト本文がなければ payload_type を角括弧で表示し、完全空なら定型文を使う
function makePreview(message?: string, payloadType?: string): string {
    if (message && message.trim()) {
        return message.slice(0, 120);
    }
    if (payloadType) {
        return `[${payloadType}]`;
    }
    return '(no text)';
}

/** sender_id を DB保存用の標準ラベルへ変換します。 */
function toStandardSenderLabel(senderId?: string): string {
    const id = String(senderId || '').trim();
    if (!id) return '-';

    if (id === 'ADMIN' || id.startsWith('ADMIN#')) {
        return 'ADMIN';
    }

    const m = id.match(/^(USER|SHOP)#(.+)$/i);
    if (!m) return id;

    const kind = m[1].toUpperCase();
    const suffix = m[2].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!suffix) return `${kind}-UNKNOWN`;
    return `${kind}-${suffix}`;
}

/** base64 cursor を DynamoDB ExclusiveStartKey へ復元します。 */
function parseCursor(cursor?: string): Record<string, unknown> | undefined {
    if (!cursor) return undefined;
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
}

/** DynamoDB LastEvaluatedKey をAPI返却用 cursor に変換します。 */
// DynamoDB LastEvaluatedKey を API 応答用 cursor 文字列へ変換
function encodeCursor(lastKey?: Record<string, unknown>): string | null {
    if (!lastKey) return null;
    return Buffer.from(JSON.stringify(lastKey), 'utf-8').toString('base64');
}

/**
 * チャットを新規作成します。
 * - META行・参加者inbox行・初期メッセージ行を1トランザクションで作成
 * - WORKFLOW初期payloadの契約検証を実施
 */
async function createChat(body: UnifiedChatApiSchema['unified_chat_create'], callerUserId?: string, groups: string[] = [], event?: any) {
    // chat_id はサーバー採番（クライアント指定不可）
    const chat_id = generateId();
    const now = new Date().toISOString();
    let shopOpeningFormSnapshot: ChatMeta['shop_opening_form_snapshot'] | undefined;

    // 参加者・起票者・chat_type の整合性を先に検証
    const initiatorId = normalizeParticipantId(body.initiator_id);
    const participants = normalizeParticipants(body.participants || []);
    if (participants.length === 0) {
        return errorResponse(400, 'participants is required');
    }

    if (!initiatorId) {
        return errorResponse(400, 'initiator_id is required');
    }

    if (!participants.includes(initiatorId)) {
        return errorResponse(400, 'initiator_id must be included in participants');
    }

    // 無関係ユーザーの inbox へチャットを混入させないため、参加者構成を厳密化
    // 現行仕様では管理窓口を必ず含む2者チャットのみ許可
    if (participants.length !== 2 || !participants.includes('ADMIN')) {
        return errorResponse(400, 'participants must include exactly two participants: initiator and ADMIN');
    }

    if (!WORKFLOW_REGISTRY[body.chat_type as keyof typeof WORKFLOW_REGISTRY]) {
        return errorResponse(400, `Unsupported chat_type: ${body.chat_type}`);
    }

    const workflow = WORKFLOW_REGISTRY[body.chat_type as keyof typeof WORKFLOW_REGISTRY];
    const initialStatus = workflow.initialStatus;

    const isSupportChatType = body.chat_type === 'USER_SUPPORT' || body.chat_type === 'SHOP_SUPPORT';
    if (isSupportChatType) {
        const expectedSupportType = initiatorId.startsWith('SHOP#') ? 'SHOP_SUPPORT' : 'USER_SUPPORT';
        if (body.chat_type !== expectedSupportType) {
            return errorResponse(400, `invalid chat_type for initiator: expected ${expectedSupportType}`);
        }
    }

    // initiator_id の立場（USER# / SHOP# / ADMIN）に応じて権限チェック
    // なりすましで他人名義のチャットを作れないようにする
    const isAllowedInitiator = await canAccessParticipantId(initiatorId, callerUserId, groups, event);
    if (!isAllowedInitiator) {
        return errorResponse(403, 'initiator_id does not match authenticated user or insufficient permissions');
    }

    const shard = calcShard(chat_id);
    const meta: ChatMeta = {
        PK: toChatPk(chat_id),
        SK: 'META',
        chat_id,
        participants,
        initiator_id: initiatorId,
        chat_type: body.chat_type,
        status: initialStatus,
        ts_created_at: now,
        ts_updated_at: now,
        ts_last_message_at: now,
        last_message_id: '',
        last_message_seq: 0,
        last_message_text: '',
        version: 1,
        GSI1_PK: buildGsi1Pk(body.chat_type, initialStatus, shard),
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

    // 参加者ごとに inbox 行（PK=participant, SK=CHAT#...）を作成
    // これにより participant 単位で一覧取得ができる
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
                    status: initialStatus,
                    GSI2_PK: `CHAT_INBOX#${participantId}`,
                    GSI2_SK: `TS#${toReverseEpochMs(now)}#CHAT#${chat_id}`,
                },
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
        });
    }

    if (body.initial_message) {
        // 初期メッセージを保存する場合は認証済みユーザー必須
        if (!callerUserId) {
            return errorResponse(401, 'authentication required');
        }

        const msgId = generateId();
        const preview = makePreview(body.initial_message.message, body.initial_message.payload_type);
        const seq = 1;

        // WORKFLOW 初期メッセージの payload を契約に沿って検証
        // - SHOP_OPENING + FORM_SUBMITTED の場合のみ form_snapshot を META に複写
        // - CARD_DESIGN + FORM_SUBMITTED の場合も form_snapshot を認可（簡易版、META複写なし）
        // - その他の workflow event はメッセージのみ保存
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
                    sender_id: initiatorId,
                    sender_user_id: callerUserId,
                    role: initiatorId.split('#')[0] || 'USER',
                    username: toStandardSenderLabel(initiatorId),
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
                    // 申請フォーム内容は後続管理画面の参照負荷を下げるため META 側にも保持
                    ...(shopOpeningFormSnapshot ? { shop_opening_form_snapshot: shopOpeningFormSnapshot } : {}),
                },
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
        };
    }

    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return successResponse({ chat_id, status: initialStatus, participants });
}

/** Authorizer context から Cognito グループ配列を安全に抽出します。 */
function getGroupsFromEvent(event: any): string[] {
    // Authorizer が配列またはJSON文字列で返す場合があるため両対応
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

/** 管理者グループ所属かを判定します。 */
function isAdminGroups(groups: string[]): boolean {
    return groups.includes('Administrators') || groups.includes('GlobalAdmins');
}

/** caller userId を participant_id 形式（USER#...）へ変換します。 */
function getCallerParticipantId(userId?: string): string | null {
    if (!userId) return null;
    return `USER#${userId}`;
}

/**
 * participant_id 単位のアクセス可否を判定します。
 * - ADMIN: 管理者グループ必須
 * - USER#: 本人一致必須
 * - SHOP#: owner/gm 権限必須
 */
async function canAccessParticipantId(participantId: string, callerUserId?: string, groups: string[] = [], event?: any): Promise<boolean> {
    const normalizedParticipantId = normalizeParticipantId(participantId);

    // ADMIN inbox は管理者グループのみアクセス可能
    if (normalizedParticipantId === 'ADMIN') {
        return isAdminGroups(groups);
    }

    // USER#xxx inbox は本人のみアクセス可能
    if (normalizedParticipantId.startsWith('USER#')) {
        return normalizedParticipantId === getCallerParticipantId(callerUserId);
    }

    // SHOP#xxx inbox は shop-owner/gm チェックで判定
    if (normalizedParticipantId.startsWith('SHOP#') && callerUserId) {
        const shopId = normalizedParticipantId.replace('SHOP#', '');
        const permission = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, callerUserId, event, groups);
        return !!permission;
    }

    return false;
}

/**
 * チャット参加者のうち、呼び出し元がアクセス可能な participant が1つでもあるか判定します。
 */
async function canAccessChat(meta: ChatMeta, callerUserId?: string, groups: string[] = [], event?: any): Promise<boolean> {
    // 参加者のいずれかとしてアクセス可能ならチャット閲覧可
    for (const participantId of meta.participants) {
        if (await canAccessParticipantId(participantId, callerUserId, groups, event)) {
            return true;
        }
    }
    return false;
}

type ChatAccessResult = { ok: true; meta: ChatMeta } | { ok: false; response: ReturnType<typeof errorResponse> };

/**
 * チャット META を取得し、呼び出し元のアクセス権を一括検証する共通ヘルパーです。
 *
 * 全チャット操作エンドポイント（取得・送信・既読・アップロード）から呼び出し、
 * 以下を1か所で保証します。
 *  1. 認証済みユーザーであること（未認証 → 401）
 *  2. チャットが存在すること（存在しない → 404）
 *  3. 参加者として正当なアクセス権を持つこと（canAccessChat → 403）
 *     - USER#xxx : Cognito sub の完全一致
 *     - SHOP#xxx : checkShopOwnerOrGM による owner / gm 確認
 *     - ADMIN    : Administrators / GlobalAdmins グループ所属確認
 */
async function fetchAndAuthorizeChatMeta(
    chatId: string,
    callerUserId: string | undefined,
    groups: string[],
    event: any,
): Promise<ChatAccessResult> {
    if (!callerUserId && !isAdminGroups(groups)) {
        return { ok: false, response: errorResponse(401, 'authentication required') };
    }

    const res = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: toChatPk(chatId), SK: 'META' },
    }));

    if (!res.Item) {
        return { ok: false, response: errorResponse(404, 'chat not found') };
    }

    const meta = res.Item as ChatMeta;
    if (!(await canAccessChat(meta, callerUserId, groups, event))) {
        return { ok: false, response: errorResponse(403, 'forbidden') };
    }

    return { ok: true, meta };
}

/**
 * 指定 participant の inbox 一覧を取得します（ページング対応）。
 * 取得後に include_archived/chat_type/status フィルタを適用します。
 */
async function listChats(body: UnifiedChatApiSchema['unified_chat_list'], callerUserId?: string, groups: string[] = [], event?: any) {
    const participantId = normalizeParticipantId(body.participant_id);
    if (!participantId) {
        return errorResponse(400, 'participant_id is required');
    }

    const isAllowedParticipant = await canAccessParticipantId(participantId, callerUserId, groups, event);
    if (!isAllowedParticipant) {
        return errorResponse(403, 'participant_id does not match caller');
    }

    // page size は [1, MAX_PAGE_SIZE] に丸める（過大リクエスト防止）
    const limit = Math.min(Math.max(body.limit || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const exclusiveKey = parseCursor(body.cursor);

    const params: any = {
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2_PK = :pk',
        ExpressionAttributeValues: {
            ':pk': `CHAT_INBOX#${participantId}`,
        },
        Limit: limit,
        ScanIndexForward: true,
    };

    if (exclusiveKey) {
        params.ExclusiveStartKey = exclusiveKey;
    }

    const res = await ddb.send(new QueryCommand(params));
    let items = res.Items || [];

    // 追加フィルタはアプリ側で適用（participant inbox の同一PK上で絞り込み）
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

/** chat_id 指定でチャットMETAを1件取得し、閲覧権限を検証します。 */
async function getChat(body: UnifiedChatApiSchema['unified_chat_get'], callerUserId?: string, groups: string[] = [], event?: any) {
    if (!body.chat_id) {
        return errorResponse(400, 'chat_id is required');
    }

    const result = await fetchAndAuthorizeChatMeta(body.chat_id, callerUserId, groups, event);
    if (!result.ok) return result.response;

    return successResponse({ chat: result.meta });
}

/**
 * チャットメッセージ一覧を取得します。
 * before_seq 指定時は「それより古いメッセージ」を降順で返します。
 */
async function getMessages(body: UnifiedChatApiSchema['unified_chat_messages_get'], callerUserId?: string, groups: string[] = [], event?: any) {
    if (!body.chat_id) {
        return errorResponse(400, 'chat_id is required');
    }

    const result = await fetchAndAuthorizeChatMeta(body.chat_id, callerUserId, groups, event);
    if (!result.ok) return result.response;
    const meta = result.meta;

    // メッセージは新しい順で返す（UI側で必要に応じて reverse）
    const limit = Math.min(Math.max(body.limit || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const exprValues: Record<string, unknown> = {
        ':pk': toChatPk(body.chat_id),
        ':prefix': 'MSG#',
    };

    let keyCondition = 'PK = :pk AND begins_with(SK, :prefix)';
    let filterExpression: string | undefined;
    if (body.before_seq !== undefined) {
        exprValues[':before'] = toMsgSk(body.before_seq);
        keyCondition = 'PK = :pk AND SK < :before';
        // :prefix を KeyConditionExpression に含められなくなるため FilterExpression へ移す。
        // これにより ExpressionAttributeValues の未参照キーが原因となる
        // DynamoDB ValidationException を回避します。
        filterExpression = 'begins_with(SK, :prefix)';
    }

    const res = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: keyCondition,
        ...(filterExpression ? { FilterExpression: filterExpression } : {}),
        ExpressionAttributeValues: exprValues,
        Limit: limit,
        ScanIndexForward: false,
    }));

    // 添付ファイルの file_url を署名付き URL に変換する（receive_chat.ts と同じパターン）
    const items = res.Items || [];
    for (const item of items) {
        if (item.file_url) item.file_url = await signUrlIfS3(item.file_url, BUCKET_NAME);
    }

    return successResponse({ messages: items });
}

/**
 * メッセージ送信処理です。
 * - メッセージ行を追加
 * - META最終状態を更新
 * - 参加者inboxの未読/既読キャッシュを更新
 */
async function sendMessage(body: UnifiedChatApiSchema['unified_chat_messages_send'], callerUserId?: string, groups: string[] = [], event?: any) {
    if (!body.chat_id || !body.sender_id || !body.type) {
        return errorResponse(400, 'chat_id, sender_id, type are required');
    }

    const senderId = normalizeParticipantId(body.sender_id);

    // メッセージ送信は常に認証済みユーザーのみ許可
    if (!callerUserId) {
        return errorResponse(401, 'authentication required');
    }

    const result = await fetchAndAuthorizeChatMeta(body.chat_id, callerUserId, groups, event);
    if (!result.ok) return result.response;
    const meta = result.meta;

    const normalizedStatus = String(meta.status || '').toUpperCase();
    if (['APPROVED', 'REJECTED', 'CANCELLED', 'RESOLVED', 'CLOSED'].includes(normalizedStatus)) {
        return errorResponse(400, 'chat is already closed');
    }

    // sender_id が参加者に含まれていることを必須化
    if (!meta.participants.includes(senderId)) {
        return errorResponse(403, 'sender is not chat participant');
    }

    // sender_id の実アクセス権（本人/管理者/ショップ権限）を検証
    const isAllowedSender = await canAccessParticipantId(senderId, callerUserId, groups, event);
    if (!isAllowedSender) {
        return errorResponse(403, 'sender_id does not match caller');
    }

    // 連番は META.last_message_seq + 1 で採番
    const now = new Date().toISOString();
    const seq = (meta.last_message_seq || 0) + 1;
    const msgId = generateId();
    const preview = makePreview(body.message, body.payload_type);

    let workflowStatus = body.workflow_status;
    if (body.type === 'WORKFLOW') {
        // WORKFLOW は payload_type と payload を必須化
        if (!body.payload_type) {
            return errorResponse(400, 'payload_type is required for WORKFLOW message');
        }

        if (body.payload === undefined) {
            return errorResponse(400, 'payload is required for WORKFLOW message');
        }

        const chatType = meta.chat_type as keyof typeof WORKFLOW_REGISTRY;
        const payloadType = body.payload_type as any;

        // workflow payload 契約検証 + 状態遷移検証
        // 例: CARD_DESIGN/DESIGN_COMPLETED なら workflow_status = RESOLVED に遷移
        //    SHOP_OPENING/ADMIN_DECISION なら workflow_status = APPROVED|REJECTED に遷移
        try {
            (assertValidWorkflowPayload as any)(chatType, payloadType, body.payload);
        } catch (e: any) {
            return errorResponse(400, e.message || 'invalid workflow payload');
        }

        if (workflowStatus) {
            // workflow_status は payload_type ごとに許可ステータスが決まっている
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
                    sender_id: senderId,
                    sender_user_id: callerUserId,
                    role: senderId.split('#')[0] || 'USER',
                    username: toStandardSenderLabel(senderId),
                    message: body.message || '',
                    type: body.type,
                    payload_type: body.payload_type,
                    payload: body.payload,
                    workflow_status: workflowStatus,
                    file_url: body.file_url ? stripSignature(body.file_url) : undefined,
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
        const isSender = participantId === senderId;
        const lastReadSeq = isSender ? seq : undefined;

        // inbox 更新方針:
        // - 送信者: unread=0, last_read_seq=seq に進める
        // - 非送信者: unread_count_cache を最新seqに更新（簡易未読キャッシュ）
        if (isSender) {
            transactItems.push({
                Update: {
                    TableName: TABLE_NAME,
                    Key: {
                        PK: participantId,
                        SK: `CHAT#${meta.chat_id}`,
                    },
                    UpdateExpression:
                        'SET ts_last_message_at = :ts, last_message_text = :preview, GSI2_SK = :gsi2, #status = :status, chat_type = :chatType, unread_count_cache = :unread, last_read_seq = :lastRead, ts_last_read_at = :ts',
                    ExpressionAttributeNames: {
                        '#status': 'status',
                    },
                    ExpressionAttributeValues: {
                        ':ts': now,
                        ':preview': preview,
                        ':gsi2': `TS#${toReverseEpochMs(now)}#CHAT#${meta.chat_id}`,
                        ':status': meta.status,
                        ':chatType': meta.chat_type,
                        ':unread': 0,
                        ':lastRead': lastReadSeq,
                    },
                },
            });
            continue;
        }

        transactItems.push({
            Update: {
                TableName: TABLE_NAME,
                Key: {
                    PK: participantId,
                    SK: `CHAT#${meta.chat_id}`,
                },
                UpdateExpression:
                    'SET ts_last_message_at = :ts, last_message_text = :preview, GSI2_SK = :gsi2, #status = :status, chat_type = :chatType, unread_count_cache = :seq - if_not_exists(last_read_seq, :zero)',
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':ts': now,
                    ':preview': preview,
                    ':gsi2': `TS#${toReverseEpochMs(now)}#CHAT#${meta.chat_id}`,
                    ':status': meta.status,
                    ':chatType': meta.chat_type,
                    ':seq': seq,
                    ':zero': 0,
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

/**
 * 既読位置（last_read_seq）を更新します。
 * メッセージ総数との整合性を検証してから inbox 行を更新します。
 */
async function markRead(body: UnifiedChatApiSchema['unified_chat_read_mark'], callerUserId?: string, groups: string[] = [], event?: any) {
    const participantId = normalizeParticipantId(body.participant_id);
    if (!body.chat_id || !participantId || body.last_read_seq === undefined) {
        return errorResponse(400, 'chat_id, participant_id, last_read_seq are required');
    }

    const result = await fetchAndAuthorizeChatMeta(body.chat_id, callerUserId, groups, event);
    if (!result.ok) return result.response;
    const meta = result.meta;

    // participant_id がこのチャットの参加者リストに含まれることを検証
    if (!meta.participants.includes(participantId)) {
        return errorResponse(403, 'participant_id is not a chat participant');
    }

    // participant_id に対する呼び出し元の権限を検証（checkShopOwnerOrGM 経由）
    const isAllowedParticipant = await canAccessParticipantId(participantId, callerUserId, groups, event);
    if (!isAllowedParticipant) {
        return errorResponse(403, 'participant_id does not match caller');
    }

    // 既読位置は未来値を禁止
    if (body.last_read_seq > meta.last_message_seq) {
        return errorResponse(400, 'last_read_seq must be <= last_message_seq');
    }

    await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: participantId, SK: `CHAT#${body.chat_id}` },
        UpdateExpression: 'SET last_read_seq = :seq, ts_last_read_at = :ts, unread_count_cache = :unread',
        ExpressionAttributeValues: {
            ':seq': body.last_read_seq,
            ':ts': new Date().toISOString(),
            ':unread': Math.max(meta.last_message_seq - body.last_read_seq, 0),
        },
    }));

    return successResponse({ ok: true });
}

/**
 * 管理者によるチャットステータス更新処理です。
 * METAと全参加者inboxの status をトランザクションで同期更新します。
 */
/**
 * 管理者のステータス遷移可否を WORKFLOW_REGISTRY に基づいて判定します。
 *
 * ルール:
 *  - 遷移元は常に OPEN のみ（終了ステータスからの再動作を禁止）
 *  - 遷移先は OPEN 以外の値（OPEN に戻す操作は不可）
 *  - 遷移先は WORKFLOW_REGISTRY.statuses に含まれる値のみ許可
 */
function canAdminTransition(chatType: string, currentStatus: string, nextStatus: string): boolean {
    if (currentStatus !== 'OPEN') return false;
    if (nextStatus === 'OPEN') return false;

    const workflow = WORKFLOW_REGISTRY[chatType as keyof typeof WORKFLOW_REGISTRY];
    if (!workflow) return false;

    const allowedTargets = workflow.statuses.filter((s) => s !== 'OPEN');
    return (allowedTargets as readonly string[]).includes(nextStatus);
}

/**
 * 起票者自身によるキャンセル可否を判定します。
 *
 *  - USER# 起票者: Cognito sub が一致する呼び出し元のみ許可
 *  - SHOP# 起票者: canAccessParticipantId による SHOP 権限確認が updateStatus 内で
 *    isAllowedInitiator として別途実施済みのため、ここでは initiator_id が SHOP# か否かを確認するだけでよい
 */
function isInitiatorOf(meta: ChatMeta, callerUserId?: string): boolean {
    const callerParticipantId = getCallerParticipantId(callerUserId);
    if (!callerParticipantId) return false;
    if (meta.initiator_id.startsWith('USER#')) {
        return meta.initiator_id === callerParticipantId;
    }
    // SHOP# 起票者: アクセス権は canAccessParticipantId 済みなので initiator_id が SHOP# であることだけ確認
    if (meta.initiator_id.startsWith('SHOP#')) {
        return true;
    }
    return false;
}

async function updateStatus(body: UnifiedChatApiSchema['unified_chat_status_update'], callerUserId?: string, groups: string[] = [], event?: any) {
    if (!body.chat_id || !body.next_status || body.expected_version === undefined) {
        return errorResponse(400, 'chat_id, next_status, expected_version are required');
    }

    // updateStatus は管理者が参加者でないチャットも操作できるため fetchAndAuthorizeChatMeta は使わず
    // 認証の有無のみ先に確認する
    if (!callerUserId && !isAdminGroups(groups)) {
        return errorResponse(401, 'authentication required');
    }

    const metaRes = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: toChatPk(body.chat_id), SK: 'META' },
    }));

    const meta = metaRes.Item as ChatMeta | undefined;
    if (!meta) {
        return errorResponse(404, 'chat not found');
    }

    const isAdmin = isAdminGroups(groups);
    const normalizedCurrentStatus = String(meta.status || '').toUpperCase();

    // chat_type ごとの許可ステータスを強制し、不正値への更新を防止
    // 例: CARD_DESIGN なら statuses = ['OPEN', 'RESOLVED', 'CANCELLED']
    //    SHOP_OPENING なら statuses = ['OPEN', 'APPROVED', 'REJECTED', 'CANCELLED']
    // これにより、レジストリに定義されているステートのみへの遷移を許可
    const workflow = WORKFLOW_REGISTRY[meta.chat_type as keyof typeof WORKFLOW_REGISTRY];
    if (!workflow) {
        return errorResponse(400, `Unsupported chat_type: ${meta.chat_type}`);
    }
    const normalizedNextStatus = String(body.next_status || '').toUpperCase();
    const allowedStatuses = workflow.statuses.map((status) => String(status).toUpperCase());
    if (!allowedStatuses.includes(normalizedNextStatus)) {
        return errorResponse(400, `invalid next_status for ${meta.chat_type}: ${body.next_status}`);
    }

    // SHOP# 起票者のキャンセルは canAccessParticipantId による権限確認も必須
    const shopInitiatorHasAccess = meta.initiator_id.startsWith('SHOP#')
        ? await canAccessParticipantId(meta.initiator_id, callerUserId, groups, event)
        : true;
    const isUserInitiatorCancel = !isAdmin
        && normalizedNextStatus === 'CANCELLED'
        && normalizedCurrentStatus === 'OPEN'
        && isInitiatorOf(meta, callerUserId)
        && shopInitiatorHasAccess;
    const isAllowedAdminTransition = isAdmin
        && canAdminTransition(String(meta.chat_type || '').toUpperCase(), normalizedCurrentStatus, normalizedNextStatus);

    if (!isAllowedAdminTransition && !isUserInitiatorCancel) {
        return errorResponse(403, 'status transition is not allowed');
    }

    const now = new Date().toISOString();
    const shard = calcShard(meta.chat_id);

    // DynamoDB TransactWrite 上限（25）を考慮し、META + 参加者行更新数に余裕を持たせる
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
                    ':status': normalizedNextStatus,
                    ':ts': now,
                    ':gsi1pk': buildGsi1Pk(meta.chat_type, normalizedNextStatus, shard),
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
                    ':status': normalizedNextStatus,
                    ':ts': now,
                },
            },
        });
    }

    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return successResponse({ ok: true, next_status: normalizedNextStatus });
}

/**
 * チャット用ファイルアップロード用のPresigned URLを生成します。
 * - chat_id から chat Meta を取得
 * - 参加者認証を行う
 * - ファイルサイズをチェック
 * - S3 署名付きURLを生成
 */
async function uploadUrl(body: UnifiedChatApiSchema['unified_chat_uploadurl_get'], callerUserId?: string, groups: string[] = [], event?: any) {
    if (!body.chat_id || !body.filename || !body.content_type) {
        return errorResponse(400, 'chat_id, filename, content_type are required');
    }

    const fileSize = body.file_size || 0;
    if (fileSize > FILE_SIZE_LIMIT_MB * 1024 * 1024) {
        return errorResponse(413, `File size exceeds ${FILE_SIZE_LIMIT_MB}MB limit`);
    }

    const result = await fetchAndAuthorizeChatMeta(body.chat_id, callerUserId, groups, event);
    if (!result.ok) return result.response;

    // S3 のキーを生成 (CHAT#chat_id/file_id.ext)
    const fileId = generateId();
    const ext = body.filename.split('.').pop() || 'bin';
    const key = `unified-chat/${body.chat_id}/${fileId}.${ext}`;

    // Presigned URL を生成
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: body.content_type,
    });

    const uploadUrl_val = await getSignedUrl(s3, command, { expiresIn: 3600 });
    const fileUrl = getPublicUrl(BUCKET_NAME, key);

    return successResponse({
        uploadUrl: uploadUrl_val,
        fileUrl,
        key,
    });
}

/**
 * Unified Chat の単一エントリポイント。
 * パス完全一致でアクションを解決し、各ユースケース関数へディスパッチします。
 */
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
        } else if (path === '/unified/chat/uploadurl/get') {
            // ファイルアップロード用のPresigned URLを生成します。
            action = 'uploadurl';
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
            return await createChat(body as UnifiedChatApiSchema['unified_chat_create'], callerUserId, groups, event);
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
            return await updateStatus(body as UnifiedChatApiSchema['unified_chat_status_update'], callerUserId, groups, event);
        }
        if (action === 'uploadurl') {
            // ファイルアップロード: Presigned URL を生成します。
            return await uploadUrl(body as UnifiedChatApiSchema['unified_chat_uploadurl_get'], callerUserId, groups, event);
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
