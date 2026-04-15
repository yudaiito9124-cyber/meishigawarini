/**
 * Unified Chat workflow contract.
 *
 * Goal:
 * - Keep workflow/message contracts type-safe across frontend and backend.
 * - Make new workflow additions mechanical by editing only WORKFLOW_REGISTRY.
 *
 * -----------------------------------------------------------------------------
 * 日本語ガイド（重要）
 * -----------------------------------------------------------------------------
 * このファイルは、Unified Chat の「型定義」「payload 検証」「状態遷移」を
 * 1か所で管理するための正本です。
 *
 * 設計意図:
 * - chat_type ごとの差分を WORKFLOW_REGISTRY に集約し、追加時の変更箇所を固定化する
 * - フロントエンド / バックエンドが同じ型を参照し、実装ズレをコンパイル時に検知する
 * - 実行時に payload 構造を検証し、不正データを早期に reject する
 *
 * 新しいチャットタイプ追加時の変更手順（機械的に実施）:
 * 1) payload 型を追加
 *    - 例: XxxRequestedPayload, XxxCompletedPayload
 *    - 追加場所: 既存の payload type 群の近く（このファイル内）
 *
 * 2) payload 用 type guard(validate 関数)を追加
 *    - 例: isXxxRequestedPayload, isXxxCompletedPayload
 *    - 追加場所: 各 payload 型の直下
 *    - ルール: unknown を受け取り、value is PayloadType を返す
 *
 * 3) WORKFLOW_REGISTRY に chat_type を1ブロック追加
 *    - 必須キー:
 *      - chatType: チャット種別名（例: AUTH_PHONE_VERIFICATION）
 *      - initialStatus: 初期ステータス
 *      - statuses: 取りうる状態の配列
 *      - events: イベント定義（validate + nextStatuses）
 *    - 追加場所: WORKFLOW_REGISTRY 定義ブロック
 *
 * 4) 実装側（API/Lambda）でこのファイルの関数を必ず通す
 *    - payload 検証: assertValidWorkflowPayload(...) もしくは isValidWorkflowPayload(...)
 *    - 遷移検証: canTransitionTo(...)
 *
 * 5) DB/ドキュメント側の整合を更新
 *    - chat_type 列挙値、payload_type、workflow_status の説明を更新
 *
 * これらを守ると、追加作業は「型追加 -> validate 追加 -> レジストリ追加」で完結し、
 * 既存処理に副作用を出しにくくなります。
 */

export type Validator<T> = (value: unknown) => value is T;

type WorkflowEventDefinition<Payload, Status extends string> = {
    validate: Validator<Payload>;
    nextStatuses: readonly Status[];
};

type WorkflowDefinition<
    ChatType extends string,
    Status extends string,
    Events extends Record<string, WorkflowEventDefinition<unknown, Status>>
> = {
    chatType: ChatType;
    initialStatus: Status;
    statuses: readonly Status[];
    events: Events;
};

type WorkflowRegistryShape = {
    [K in string]: WorkflowDefinition<K, string, Record<string, WorkflowEventDefinition<unknown, string>>>;
};

export function defineWorkflowRegistry<const T extends WorkflowRegistryShape>(registry: T): T {
    return registry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

function hasOnlyKeys(record: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
    return Object.keys(record).every((key) => allowedKeys.includes(key));
}

// --------------------------------------------------
// SHOP_OPENING workflow payloads
// --------------------------------------------------
//
// この領域には「chat_type ごとの payload 型」と「その検証関数」を置きます。
// 新規 chat_type を追加するときも、同じパターンで以下2点を追加してください。
// - Payload 型（export type ...）
// - Type Guard（isXxxPayload）

export type ShopOpeningDraftSavedPayload = {
    form_snapshot: {
        shop_name?: string;
        owner_name?: string;
        contact_email?: string;
        notes?: string;
    };
};

export type ShopOpeningSubmittedPayload = {
    form_snapshot: {
        shop_name: string;
        owner_name: string;
        contact_email: string;
        notes?: string;
    };
    submitted_at: string;
};

export type ShopOpeningAdminDecisionPayload = {
    approved: boolean;
    reason?: string;
    reviewer_id: string;
    reviewed_at: string;
    linked_shop_id?: string;
    default_design_id?: string;
};

function isShopOpeningDraftSavedPayload(value: unknown): value is ShopOpeningDraftSavedPayload {
    if (!isRecord(value) || !isRecord(value.form_snapshot)) {
        return false;
    }

    if (!hasOnlyKeys(value, ['form_snapshot'])) {
        return false;
    }

    const snapshot = value.form_snapshot;
    if (!hasOnlyKeys(snapshot, ['shop_name', 'owner_name', 'contact_email', 'notes'])) {
        return false;
    }

    return (
        isOptionalString(snapshot.shop_name) &&
        isOptionalString(snapshot.owner_name) &&
        isOptionalString(snapshot.contact_email) &&
        isOptionalString(snapshot.notes)
    );
}

function isShopOpeningSubmittedPayload(value: unknown): value is ShopOpeningSubmittedPayload {
    if (!isRecord(value) || !isRecord(value.form_snapshot)) {
        return false;
    }

    if (!hasOnlyKeys(value, ['form_snapshot', 'submitted_at'])) {
        return false;
    }

    const snapshot = value.form_snapshot;
    if (!hasOnlyKeys(snapshot, ['shop_name', 'owner_name', 'contact_email', 'notes'])) {
        return false;
    }

    return (
        isString(snapshot.shop_name) &&
        isString(snapshot.owner_name) &&
        isString(snapshot.contact_email) &&
        isOptionalString(snapshot.notes) &&
        isString(value.submitted_at)
    );
}

function isShopOpeningAdminDecisionPayload(value: unknown): value is ShopOpeningAdminDecisionPayload {
    if (!isRecord(value)) {
        return false;
    }

    if (!hasOnlyKeys(value, ['approved', 'reason', 'reviewer_id', 'reviewed_at', 'linked_shop_id', 'default_design_id'])) {
        return false;
    }

    return (
        isBoolean(value.approved) &&
        isOptionalString(value.reason) &&
        isString(value.reviewer_id) &&
        isString(value.reviewed_at) &&
        isOptionalString(value.linked_shop_id) &&
        isOptionalString(value.default_design_id)
    );
}

// --------------------------------------------------
// CARD_DESIGN workflow payloads
// --------------------------------------------------

export type CardDesignRequestSubmittedPayload = {
    form_snapshot: {
        design_ready: boolean;
        reference_urls?: string;
        notes?: string;
        contact_email: string;
    };
    submitted_at: string;
};

export type CardDesignCompletedPayload = {
    completed_by: string;
    completed_at: string;
    note?: string;
};

function isCardDesignRequestSubmittedPayload(value: unknown): value is CardDesignRequestSubmittedPayload {
    if (!isRecord(value) || !isRecord(value.form_snapshot)) {
        return false;
    }

    if (!hasOnlyKeys(value, ['form_snapshot', 'submitted_at'])) {
        return false;
    }

    const snapshot = value.form_snapshot;
    if (!hasOnlyKeys(snapshot, ['design_ready', 'reference_urls', 'notes', 'contact_email'])) {
        return false;
    }

    return (
        isBoolean(snapshot.design_ready) &&
        isOptionalString(snapshot.reference_urls) &&
        isOptionalString(snapshot.notes) &&
        isString(snapshot.contact_email) &&
        isString(value.submitted_at)
    );
}

function isCardDesignCompletedPayload(value: unknown): value is CardDesignCompletedPayload {
    if (!isRecord(value)) {
        return false;
    }

    if (!hasOnlyKeys(value, ['completed_by', 'completed_at', 'note'])) {
        return false;
    }

    return (
        isString(value.completed_by) &&
        isString(value.completed_at) &&
        isOptionalString(value.note)
    );
}

export const WORKFLOW_REGISTRY = defineWorkflowRegistry({
    // -------------------------------------------------------------------------
    // 追加手順の最重要ポイント:
    // 新しい chat_type を増やすときは、このオブジェクトに1ブロック追加します。
    //
    // 例:
    // AUTH_PHONE_VERIFICATION: {
    //   chatType: 'AUTH_PHONE_VERIFICATION',
    //   initialStatus: 'PENDING',
    //   statuses: ['PENDING', 'VERIFIED', 'EXPIRED', 'FAILED'],
    //   events: {
    //     VERIFICATION_REQUESTED: { validate: isXxx, nextStatuses: ['PENDING'] },
    //     VERIFICATION_COMPLETED: { validate: isYyy, nextStatuses: ['VERIFIED'] }
    //   }
    // }
    //
    // 注意:
    // - chatType の文字列値とオブジェクトキー名を一致させる
    // - statuses に存在しない値を nextStatuses に書かない
    // - validate 関数は unknown を厳密チェックし、曖昧な any を使わない
    //
    // -------------------------------------------------------------------------
    // ワークフロータイプ毎のステート遷移説明:
    //
    // 1) SHOP_OPENING: 詳細フロー型（フォーム保存と申請が分離）
    //    DRAFT → SUBMITTED → IN_REVIEW → { APPROVED | REJECTED }
    //    - initialStatus: DRAFT
    //    - 特徴: 申請者のフォーム入力が複数段階、管理者の審査が明確な終端
    //    - events: FORM_DRAFT_SAVED (途中保存)
    //             FORM_SUBMITTED (完全送信)
    //             ADMIN_DECISION (承認/却下)
    //
    // 2) CARD_DESIGN: 一般チャット型（構造化フォーム初回送信 + フリーテキストやり取り）
    //    OPEN → { RESOLVED | CANCELLED }
    //    - initialStatus: OPEN
    //    - 特徴: デザイン申請フォーム（form_snapshot）を初回送信
    //           ショップと管理者がテキスト/ファイルでやり取り
    //           管理者が「デザイン完了」で RESOLVED へ遷移
    //           必要に応じて RESOLVED → OPEN へ再開可
    //    - events: FORM_SUBMITTED (申請入力送信)
    //             DESIGN_COMPLETED (デザイン完了メッセージ送信)
    //    - payload: 申請時は form_snapshot（design_ready, reference_urls, notes等）
    //              完了時は completed_by, completed_at, note
    //
    // 3) USER_SUPPORT / SHOP_SUPPORT / SHOP_DESIGN / MISC: 一般チャット型
    //    OPEN → { RESOLVED | CANCELLED }
    //    RESOLVED → { CLOSED | OPEN }
    //    - initialStatus: OPEN
    //    - 特徴: 構造化フォームなし、純粋なテキスト/ファイルやり取り
    //    - events: {} (workflow event なし)
    //    - 状態遷移はUI/管理者の手動操作のみ
    //
    // 補足: RESOLVED と CLOSED の使い分け:
    //       RESOLVED = 一度対応完了と判定したが、再開の可能性あり
    //       CLOSED = 完全終了。以降対応なし（記録化フェーズ）
    // -------------------------------------------------------------------------
    // SHOP_OPENING: 詳細フロー型（ショップ開設申請）
    SHOP_OPENING: {
        chatType: 'SHOP_OPENING',
        initialStatus: 'DRAFT',
        statuses: ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
        events: {
            FORM_DRAFT_SAVED: {
                validate: isShopOpeningDraftSavedPayload,
                nextStatuses: ['DRAFT']
            },
            FORM_SUBMITTED: {
                validate: isShopOpeningSubmittedPayload,
                nextStatuses: ['SUBMITTED', 'IN_REVIEW']
            },
            ADMIN_DECISION: {
                validate: isShopOpeningAdminDecisionPayload,
                nextStatuses: ['APPROVED', 'REJECTED']
            }
        }
    },
    USER_SUPPORT: {
        chatType: 'USER_SUPPORT',
        initialStatus: 'OPEN',
        statuses: ['OPEN', 'RESOLVED', 'CLOSED', 'CANCELLED'],
        events: {}
    },
    SHOP_SUPPORT: {
        chatType: 'SHOP_SUPPORT',
        initialStatus: 'OPEN',
        statuses: ['OPEN', 'RESOLVED', 'CLOSED', 'CANCELLED'],
        events: {}
    },
    SHOP_DESIGN: {
        chatType: 'SHOP_DESIGN',
        initialStatus: 'OPEN',
        statuses: ['OPEN', 'RESOLVED', 'CLOSED', 'CANCELLED'],
        events: {}
    },
    MISC: {
        chatType: 'MISC',
        initialStatus: 'OPEN',
        statuses: ['OPEN', 'RESOLVED', 'CLOSED', 'CANCELLED'],
        events: {}
    },
    CARD_DESIGN: {
        chatType: 'CARD_DESIGN',
        initialStatus: 'OPEN',
        statuses: ['OPEN', 'RESOLVED', 'CLOSED', 'CANCELLED'],
        events: {
            FORM_SUBMITTED: {
                validate: isCardDesignRequestSubmittedPayload,
                nextStatuses: ['OPEN', 'RESOLVED']
            },
            DESIGN_COMPLETED: {
                validate: isCardDesignCompletedPayload,
                nextStatuses: ['RESOLVED']
            }
        }
    }
} as const);

export type WorkflowChatType = keyof typeof WORKFLOW_REGISTRY;

type WorkflowEvents<C extends WorkflowChatType> =
    (typeof WORKFLOW_REGISTRY)[C]['events'];

export type WorkflowStatus<C extends WorkflowChatType> =
    (typeof WORKFLOW_REGISTRY)[C]['statuses'][number];

export type WorkflowEventType<C extends WorkflowChatType> =
    Extract<keyof WorkflowEvents<C>, string>;

type InferValidatorPayload<T> = T extends Validator<infer P> ? P : never;

export type WorkflowPayload<
    C extends WorkflowChatType,
    E extends WorkflowEventType<C>
> = InferValidatorPayload<
    WorkflowEvents<C>[E] extends { validate: infer V } ? V : never
>;

export type UnifiedChatWorkflowMessage<
    C extends WorkflowChatType = WorkflowChatType,
    E extends WorkflowEventType<C> = WorkflowEventType<C>
> = {
    // chat_type と payload_type の組み合わせで payload の型が自動決定される
    // ため、呼び出し側は不正な payload をコンパイル時に検知できます。
    chat_type: C;
    type: 'WORKFLOW';
    payload_type: E;
    workflow_status: WorkflowStatus<C>;
    payload: WorkflowPayload<C, E>;
    ts_created_at: string;
};

export function isValidWorkflowPayload<
    C extends WorkflowChatType,
    E extends WorkflowEventType<C>
>(chatType: C, payloadType: E, payload: unknown): payload is WorkflowPayload<C, E> {
    // 実行時の緩い入力（API body 等）を安全に絞り込むための入口です。
    // 成功時のみ payload は WorkflowPayload<C, E> として扱えます。
    const events = WORKFLOW_REGISTRY[chatType].events as WorkflowEvents<C>;
    const event = events[payloadType] as WorkflowEventDefinition<unknown, WorkflowStatus<C>>;
    return event.validate(payload);
}

export function assertValidWorkflowPayload<
    C extends WorkflowChatType,
    E extends WorkflowEventType<C>
>(chatType: C, payloadType: E, payload: unknown): WorkflowPayload<C, E> {
    // バックエンドで「不正 payload は即エラー」にしたい場合の推奨入口です。
    // 保存処理前に必ず通すことで、データ汚染を防げます。
    if (!isValidWorkflowPayload(chatType, payloadType, payload)) {
        throw new Error(`Invalid workflow payload: ${chatType}/${String(payloadType)}`);
    }

    return payload;
}

export function canTransitionTo<
    C extends WorkflowChatType,
    E extends WorkflowEventType<C>
>(chatType: C, payloadType: E, nextStatus: WorkflowStatus<C>): boolean {
    // イベントごとの許可遷移（nextStatuses）を判定します。
    // 例: PENDING のまま許可、VERIFIED へのみ許可、など。
    // API 側では update 前に必ずこの判定を通してください。
    const events = WORKFLOW_REGISTRY[chatType].events as WorkflowEvents<C>;
    const event = events[payloadType] as WorkflowEventDefinition<unknown, WorkflowStatus<C>>;
    const transitions = event.nextStatuses;
    return transitions.includes(nextStatus);
}
