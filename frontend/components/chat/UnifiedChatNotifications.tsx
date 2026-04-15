'use client';
/**
 * @file UnifiedChatNotifications.tsx
 * @role ショップ・ユーザー共用の通知UIコンポーネント
 * @responsibility
 *  - ベルアイコンボタンを表示し、クリックするとチャット通知ダイアログを開きます。
 *  - ショップ管理画面（ShopHeader）とユーザーマイページ（user/page.tsx）の両方で使い回せる
 *    汎用コンポーネントとして設計されています。
 *  - ショップ開設申請の審査結果（承認・却下・審査中）を視覚的に表示します。
 *  - チャットを開いた際に自動で既読マークをつけ、未読バッジをリセットします。
 * @context
 *  - このコンポーネントは `/unified/chat/*` 系のAPIを呼び出します。
 *  - apiFetchPost に shopApi または userApi の fetch_post を渡すことで、
 *    それぞれのロールに対応した認証トークンでAPIにアクセスします。
 */

import React, { useEffect, useMemo, useState } from 'react';
// チャットアイコン（lucide-react はアイコンライブラリ）
import { MessageCircle } from 'lucide-react';
// next-intl の翻訳フック（テキストを ja.json / en.json から取得します）
import { useTranslations } from 'next-intl';
// i18n対応のLinkコンポーネント（URLに言語プレフィックスを自動付与します）
import { Link } from '@/i18n/routing';
// 共通UIコンポーネント（shadcn/ui ライブラリ）
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useImperativeHandle } from 'react';
import { isValidWorkflowPayload } from '@shared/unified-chat-workflows';
import { getDisplayMessage } from '@/lib/chatMessage';
import { uploadChatFile, ChatFileData } from '@/lib/uploadChatFile';
import { toDisplayParticipantId } from '@/lib/chatId';
import ChatAttachment from '@/components/chat/ChatAttachment';

/**
 * チャット一覧の各行に対応する型定義。
 * /unified/chat/list APIのレスポンス items[] の各要素の形状です。
 * DynamoDBに保存されているCHAT#{chatId}/META アイテムの一部フィールドです。
 */
type ChatListItem = {
    chat_id: string;
    chat_type?: string;            // チャットの種別（例: "SHOP_OPENING"）
    status?: string;               // チャットの状態（例: "OPEN", "RESOLVED"）
    ts_last_message_at?: string;   // 最後にメッセージが送られた日時（ISO 8601形式）
    unread_count_cache?: number;   // 未読メッセージ数（DBにキャッシュされた値）
};

/**
 * 個別メッセージに対応する型定義。
 * /unified/chat/messages/get APIのレスポンス messages[] の各要素です。
 * DynamoDBの CHAT#{chatId}/MSG#{seq:012d} アイテムの形状です。
 */
type ChatMessage = {
    message_id?: string;           // メッセージの一意なID
    seq?: number;                  // チャット内のメッセージ連番（既読管理に使用）
    sender_id?: string;            // 送信者ID（例: "ADMIN", "USER#xxx", "SHOP#xxx"）
    username?: string;             // 表示用ユーザー名（保存済みの場合）
    ts_created_at?: string;        // メッセージ作成日時
    message?: string;              // メッセージ本文
    payload_type?: string;         // WORKFLOWメッセージの種別（例: "ADMIN_DECISION"）
    workflow_status?: string;      // ワークフローの状態（"APPROVED" / "REJECTED"）
    payload?: {
        approved?: boolean;        // 承認可否（true=承認, false=却下）
        reason?: string;           // 審査コメント・理由
        reviewed_at?: string;      // 審査日時（ISO 8601形式）
        linked_shop_id?: string;   // 承認時に紐付けられたショップID
        shop_id?: string;          // linked_shop_id の別名フィールド（互換用）
        default_design_id?: string;// デフォルトカードデザインのID
        file_url?: string;            // 添付ファイルのS3 URL
        file_name?: string;           // 添付ファイルの名前
        file_size?: number;           // 添付ファイルのサイズ（バイト）
    };
};

/**
 * チャットのメタデータ（ヘッダー情報）に対応する型定義。
 * /unified/chat/get APIのレスポンス chat フィールドの形状です。
 */
type ChatMeta = {
    chat_id?: string;              // チャットID
    chat_type?: string;            // チャット種別
    status?: string;               // チャット全体の状態
    ts_last_message_at?: string;   // 最終メッセージ日時
    last_message_seq?: number;     // 最後のメッセージ連番（既読処理に使用）
    participants?: string[];       // 参加者IDの配列（例: ["USER#xxx", "ADMIN", "SHOP#xxx"]）
};

/**
 * APIの fetch_post メソッドの型エイリアス。
 * shopApi.fetch_post と userApi.fetch_post は同じシグネチャを持つため共通型で扱います。
 */
type FetchPost = (path: string, data: any) => Promise<any>;

/**
 * UnifiedChatNotifications コンポーネントの Props 定義。
 * このコンポーネントはショップ・ユーザー双方で使い回すため、
 * 実行コンテキスト（誰として呼ぶか）を Props で外部から注入します。
 */
interface UnifiedChatNotificationsProps {
    /**
     * 通知を取得する際の参加者ID。
     * ショップ: "SHOP#{shopId}"  例: "SHOP#20260413..."
     * ユーザー: "USER#{userId}"  例: "USER#abc123..."
     */
    participantId: string;
    /**
     * APIの fetch_post メソッド（認証トークン付きPOSTリクエストを実行する関数）。
     * ショップ: shopApi.fetch_post.bind(shopApi)
     * ユーザー: userApi.fetch_post.bind(userApi)
     */
    apiFetchPost: FetchPost;
    /**
     * next-intl の翻訳ネームスペース名。
     * ショップ: "ShopPage"  → ja.json の ShopPage.notifications.* を参照
     * ユーザー: "UserProfilePage" → ja.json の UserProfilePage.notifications.* を参照
     */
    translationNamespace: string;
    /** ベルボタンに追加する Tailwind CSS クラス（省略可） */
    buttonClassName?: string;
    /** ベルボタンのスタイル種別（省略時は 'ghost'） */
    buttonVariant?: 'default' | 'outline' | 'ghost' | 'link' | 'secondary' | 'destructive';
    /** true の場合はボタンを無効化します（ユーザーIDが未取得の間など） */
    disabled?: boolean;
    /** ログイン中ユーザーのメールアドレス（SHOP_OPENINGフォームの固定表示に利用） */
    currentUserEmail?: string;
}

/**
 * 通知ベルボタン + チャット一覧ダイアログを提供する共用コンポーネント。
 *
 * 使用例（ショップ）:
 *   <UnifiedChatNotifications
 *     participantId={`SHOP#${shopId}`}
 *     apiFetchPost={shopApi.fetch_post.bind(shopApi)}
 *     translationNamespace="ShopPage"
 *   />
 *
 * 使用例（ユーザー）:
 *   <UnifiedChatNotifications
 *     participantId={`USER#${userId}`}
 *     apiFetchPost={userApi.fetch_post.bind(userApi)}
 *     translationNamespace="UserProfilePage"
 *   />
 */
export const UnifiedChatNotifications = React.forwardRef<
    { openShopOpeningForm: (email: string) => void },
    UnifiedChatNotificationsProps
>(({
    participantId,
    apiFetchPost,
    translationNamespace,
    buttonClassName,
    buttonVariant = 'ghost',
    disabled = false,
    currentUserEmail,
}, ref) => {
    // 指定されたネームスペースの翻訳関数。t('notifications.button') のように使用します。
    const t = useTranslations(translationNamespace);

    // ─── ローカルステート定義 ─────────────────────────────────────────────────

    /** 通知ダイアログの開閉状態 */
    const [isOpen, setIsOpen] = useState(false);
    /** チャット一覧の取得中フラグ */
    const [notificationLoading, setNotificationLoading] = useState(false);
    /** 取得したチャット一覧データ */
    const [chats, setChats] = useState<ChatListItem[]>([]);
    /** 現在選択中のチャットID（null なら未選択） */
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    /** 選択中チャットのメタデータ（参加者・ステータス等） */
    const [selectedChat, setSelectedChat] = useState<ChatMeta | null>(null);
    /** 選択中チャットのメッセージ一覧（古い順に並べ替え済み） */
    const [selectedMessages, setSelectedMessages] = useState<ChatMessage[]>([]);
    /** チャット詳細の取得中フラグ */
    const [detailLoading, setDetailLoading] = useState(false);
    /** チャット一覧のページサイズ（選択可能: 5 / 10 / 25 / 50） */
    const [chatPageSize, setChatPageSize] = useState<number>(10);
    /** ページごとのカーソル配列。index = ページ番号（0始まり）、値 = そのページを取得する際に使うカーソル */
    const [chatPageCursors, setChatPageCursors] = useState<(string | null)[]>([null]);
    /** 現在表示しているページ番号（0始まり） */
    const [chatPageIdx, setChatPageIdx] = useState<number>(0);
    /** 次のページが存在するか */
    const [chatHasNext, setChatHasNext] = useState(false);
    /** メッセージ入力テキスト */
    const [inputMessage, setInputMessage] = useState('');
    /** メッセージ送信中フラグ */
    const [sendingMessage, setSendingMessage] = useState(false);
    /** Safari含む各ブラウザで確実に追従させるためのダイアログ高さ(px) */
    const [dialogHeightPx, setDialogHeightPx] = useState<number | null>(null);

    // ─── ファイルアップロード用ステート ──────────────────────────────────────
    /** 選択されたファイル */
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    /** ファイルアップロード中フラグ */
    const [uploading, setUploading] = useState(false);

    // ─── 新規チャット作成用ステート ────────────────────────────────────────────
    /** 新規チャット作成ダイアログの開閉状態 */
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    /** 新規チャット作成フォームのデータ */
    const defaultSupportChatType = participantId.startsWith('SHOP#') ? 'SHOP_SUPPORT' : 'USER_SUPPORT';
    const [createFormData, setCreateFormData] = useState<{
        chat_type: string;
        initial_message?: string;
    }>({ chat_type: defaultSupportChatType, initial_message: '' });
    /** チャット作成中フラグ */
    const [creatingChat, setCreatingChat] = useState(false);

    // ─── ショップ開設フォーム用ステート ─────────────────────────────────────────
    /** ショップ開設フォーム: ショップ名 */
    const [shopOpenShopName, setShopOpenShopName] = useState('');
    /** ショップ開設フォーム: 申請者名 */
    const [shopOpenOwnerName, setShopOpenOwnerName] = useState('');
    /** ショップ開設フォーム: 備考 */
    const [shopOpenNotes, setShopOpenNotes] = useState('');
    /** ショップ開設フォーム: エラー表示 */
    const [shopOpenError, setShopOpenError] = useState('');
    /** ショップ開設フォーム用のメールアドレス（ログイン中メールで固定表示） */
    const [userEmail, setUserEmail] = useState('');

    // ─── カードデザインフォーム用ステート ─────────────────────────────────────
    /** カードデザインフォーム: デザイン確定フラグ */
    const [cardDesignReady, setCardDesignReady] = useState(false);
    /** カードデザインフォーム: 参考URL */
    const [cardDesignReferenceUrls, setCardDesignReferenceUrls] = useState('');
    /** カードデザインフォーム: その他要望 */
    const [cardDesignNotes, setCardDesignNotes] = useState('');
    /** カードデザインフォーム: エラー表示 */
    const [cardDesignError, setCardDesignError] = useState('');
    /** カードデザインフォーム用のメールアドレス（ショップ情報から取得） */
    const [shopContactEmail, setShopContactEmail] = useState('');

    // ─── 審査判定（単一ルール） ─────────────────────────────────────────────
    /**
     * 審査結果は「最新の ADMIN_DECISION メッセージ」だけを根拠にします。
     * payload.approved が true/false のどちらかなら確定、なければ未判定として扱います。
     */
    const adminDecisionMessage = useMemo(() => {
        for (let i = selectedMessages.length - 1; i >= 0; i -= 1) {
            const message = selectedMessages[i];
            if (message?.payload_type === 'ADMIN_DECISION') {
                return message;
            }
        }
        return null;
    }, [selectedMessages]);

    const decisionStatus = useMemo(() => {
        if (adminDecisionMessage?.payload?.approved === true) return 'APPROVED';
        if (adminDecisionMessage?.payload?.approved === false) return 'REJECTED';
        return 'PENDING';
    }, [adminDecisionMessage]);

    /**
     * 紐付けショップIDも同じ ADMIN_DECISION メッセージだけから取得します。
     */
    const linkedShopId = useMemo(() => {
        const raw = adminDecisionMessage?.payload?.linked_shop_id || adminDecisionMessage?.payload?.shop_id;
        if (typeof raw === 'string' && raw.trim()) {
            return raw.trim().replace(/^SHOP#/, '');
        }
        return '';
    }, [adminDecisionMessage]);

    const isShopOpeningChat = useMemo(() => {
        return String(selectedChat?.chat_type || '').toUpperCase() === 'SHOP_OPENING';
    }, [selectedChat?.chat_type]);

    const selectedParticipantIds = useMemo(() => {
        return Array.isArray(selectedChat?.participants) ? selectedChat.participants : [];
    }, [selectedChat]);

    /**
     * 送信者名の表示ルール:
     * - 自分の発言: 「あなた」
     * - ADMIN のみ固定ラベル
     * - それ以外は sender_id を標準表示フォーマット化して表示
     */
    const getSenderDisplayName = (message: ChatMessage): string => {
        const senderId = message.sender_id || '';
        if (senderId && senderId === participantId) {
            return t('notifications.youLabel');
        }
        if (senderId === 'ADMIN' || senderId.startsWith('ADMIN#')) {
            return t('notifications.adminLabel');
        }
        return toDisplayParticipantId(senderId);
    };

    const getChatTypeLabel = (chatType?: string): string => {
        if (!chatType) return '-';
        const labels: Record<string, string> = {
            SHOP_OPENING: 'ショップ開設申請',
            USER_SUPPORT: '一般問い合わせ',
            SHOP_SUPPORT: 'ショップ運営サポート',
            SHOP_DESIGN: 'ショップデザイン相談',
            CARD_DESIGN: 'カードデザイン追加申請',
            MISC: 'その他',
        };
        return labels[chatType] || chatType;
    };

    const getStatusLabel = (status?: string): string => {
        if (!status) return '-';
        const labels: Record<string, string> = {
            OPEN: '対応中',
            RESOLVED: '解決済み',
            CLOSED: 'クローズ',
            DRAFT: '下書き',
            SUBMITTED: '申請済み',
            IN_REVIEW: '審査中',
            APPROVED: '承認',
            REJECTED: '却下',
            CANCELLED: '取消',
            PENDING: '保留',
            VERIFIED: '認証済み',
            EXPIRED: '期限切れ',
            FAILED: '失敗',
        };
        return labels[status] || status;
    };

    const renderWorkflowPayload = (message: ChatMessage): React.ReactNode => {
        if (!message.payload_type) return null;

        if (message.payload_type === 'FORM_SUBMITTED') {
            const formSnapshot = message.payload && typeof message.payload === 'object'
                ? (message.payload as any).form_snapshot
                : null;
            const submittedAt = message.payload && typeof message.payload === 'object'
                ? (message.payload as any).submitted_at
                : null;

            return (
                <div className="mt-2 rounded-md border bg-gray-50 p-2 text-xs text-gray-700 space-y-1">
                    <div className="font-semibold text-gray-800">{t('notifications.formSubmitted.title')}</div>
                    <div>
                        <span className="text-gray-500">{t('notifications.formSubmitted.shopName')}:</span>{' '}
                        {formSnapshot?.shop_name || '-'}
                    </div>
                    <div>
                        <span className="text-gray-500">{t('notifications.formSubmitted.ownerName')}:</span>{' '}
                        {formSnapshot?.owner_name || '-'}
                    </div>
                    <div>
                        <span className="text-gray-500">{t('notifications.formSubmitted.contactEmail')}:</span>{' '}
                        {formSnapshot?.contact_email || '-'}
                    </div>
                    <div>
                        <span className="text-gray-500">{t('notifications.formSubmitted.notes')}:</span>{' '}
                        {formSnapshot?.notes || '-'}
                    </div>
                    <div>
                        <span className="text-gray-500">{t('notifications.formSubmitted.submittedAt')}:</span>{' '}
                        {submittedAt ? new Date(submittedAt).toLocaleString() : '-'}
                    </div>
                    <details>
                        <summary className="cursor-pointer text-gray-500">{t('notifications.formSubmitted.rawJson')}</summary>
                        <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-gray-600">
                            {JSON.stringify(message.payload, null, 2)}
                        </pre>
                    </details>
                </div>
            );
        }

        return (
            <div className="mt-1 text-xs text-gray-500">{message.payload_type}</div>
        );
    };

    // ─── 未読件数の合計 ───────────────────────────────────────────────────────
    /**
     * 全チャットの未読カウントを合計します。
     * ベルボタン横の赤いバッジに表示する数値です。
     * 0 の場合はバッジを表示しません。
     */
    const unreadTotal = useMemo(() => chats.reduce((sum, chat) => sum + (chat.unread_count_cache ?? 0), 0), [chats]);

    /**
     * 完了ステータス（APPROVED / REJECTED / CANCELLED / RESOLVED / CLOSED）かどうか。
     * チャットが封じられている間はメッセージ入力欄を非表示にします。
     */
    const TERMINAL_STATUSES = new Set(['APPROVED', 'REJECTED', 'CANCELLED', 'RESOLVED', 'CLOSED']);
    const isChatClosed = useMemo(
        () => TERMINAL_STATUSES.has((selectedChat?.status || '').toUpperCase()),
        [selectedChat],
    );
    const canSubmitShopOpening = participantId.startsWith('USER#');
    /** CARD_DESIGN 申請ボタンを表示するかどうか（SHOP# だけ利用可能） */
    const canSubmitCardDesign = participantId.startsWith('SHOP#');

    // 呼び出し元から渡されたログイン中メールをフォーム表示用stateへ同期
    useEffect(() => {
        setUserEmail(currentUserEmail || '');
    }, [currentUserEmail]);

    // ショップの連絡先メールを参加者IDから取得試行
    useEffect(() => {
        if (!participantId.startsWith('SHOP#')) return;
        apiFetchPost('/shop/details/get', { shop_id: participantId.replace('SHOP#', '') })
            .then((res: any) => {
                const email = res?.shop?.email || res?.shop?.contact_email || '';
                if (email) setShopContactEmail(email);
            })
            .catch(() => {});
    }, [participantId]);

    // ─── チャット一覧の取得 ───────────────────────────────────────────────────
    /**
     * /unified/chat/list APIを呼び出してチャット一覧を取得します。
     * participantId に対応する全チャット（最大100件）を取得し、state に保存します。
     * ダイアログを開いたとき・更新ボタンを押したときに呼ばれます。
     */
    /**
     * 指定ページ番号のチャット一覧を取得してリストを置き換えます。
     * @param idx 取得するページのインデックス（0始まり）
     * @param cursors 最新のカーソル配列（state 遅延を避けるため引数で渡す）
     */
    const fetchPage = async (idx: number, cursors: (string | null)[] = chatPageCursors) => {
        setNotificationLoading(true);
        try {
            const body: Record<string, any> = {
                participant_id: participantId,
                include_archived: false,
                limit: chatPageSize,
            };
            const cursor = cursors[idx] ?? null;
            if (cursor) body.cursor = cursor;
            const response = await apiFetchPost('/unified/chat/list', body);
            const items: ChatListItem[] = response.items || [];
            const nextCursor: string | null = response.cursor ?? null;
            setChats(items);
            setChatPageIdx(idx);
            // 次ページのカーソルを配列に記録（ページサイズ変更後は上書き）
            setChatPageCursors((prev) => {
                const updated = [...prev];
                updated[idx] = cursor;
                if (nextCursor) updated[idx + 1] = nextCursor;
                else updated.splice(idx + 1); // 次ページ不在なら以降を削除
                return updated;
            });
            setChatHasNext(!!nextCursor);
        } catch (e) {
            console.error('Failed to fetch notifications', e);
        } finally {
            setNotificationLoading(false);
        }
    };

    /** ダイアログを開いたとき・更新ボタンを押したときに1ページ目から取り直す */
    const fetchNotifications = () => {
        const fresh: (string | null)[] = [null];
        setChatPageCursors(fresh);
        setChatPageIdx(0);
        setChatHasNext(false);
        fetchPage(0, fresh);
    };

    // ─── 全メッセージの取得（古い履歴まで自動で遡る） ─────────────────────────
    const fetchAllMessages = async (chatId: string): Promise<ChatMessage[]> => {
        const pageLimit = 100;
        let beforeSeq: number | undefined = undefined;
        const allDesc: ChatMessage[] = [];

        for (let i = 0; i < 200; i += 1) {
            const res = await apiFetchPost('/unified/chat/messages/get', {
                chat_id: chatId,
                limit: pageLimit,
                ...(typeof beforeSeq === 'number' ? { before_seq: beforeSeq } : {}),
            });

            const batch: ChatMessage[] = Array.isArray(res?.messages) ? res.messages : [];
            if (batch.length === 0) break;
            allDesc.push(...batch);

            const seqs = batch.map((m) => m.seq).filter((v): v is number => typeof v === 'number');
            if (seqs.length === 0) break;
            const oldestSeq = Math.min(...seqs);
            if (oldestSeq <= 1 || batch.length < pageLimit) break;
            beforeSeq = oldestSeq;
        }

        const seen = new Set<string>();
        const dedupedDesc = allDesc.filter((m) => {
            const key = `${m.seq ?? ''}:${m.message_id ?? ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return dedupedDesc.slice().reverse();
    };

    // ─── チャット詳細の表示と既読処理 ────────────────────────────────────────
    /**
     * チャット一覧の行をクリックしたときに呼ばれます。
     * 以下の3つの処理をまとめて行います:
     *   1. チャットのメタデータ（参加者・ステータス・最終連番）を取得
     *   2. チャットのメッセージ一覧を取得し、古い順（昇順）に並べ替える
     *   3. 未読があれば /unified/chat/read/mark を呼んで既読にし、ローカルのバッジも解消
     *
     * @param chatId 選択されたチャットのID
     */
    const openChatDetail = async (chatId: string) => {
        // チャットを切り替えるとき入力をリセット
        setInputMessage('');
        // 選択中チャットIDを即座に更新（右パネルのローディング表示に使用）
        setSelectedChatId(chatId);
        setDetailLoading(true);
        try {
            // チャットメタとメッセージ一覧を並列で取得（Promise.all で同時リクエスト）
            const [chatRes, messagesRes] = await Promise.all([
                apiFetchPost('/unified/chat/get', { chat_id: chatId }),
                fetchAllMessages(chatId),
            ]);

            // チャットメタデータを state にセット
            setSelectedChat(chatRes.chat || null);

            // メッセージはAPIからは「新しい順（降順）」で返ってくるため、
            // .reverse() で「古い順（昇順）」にしてから表示します
            const history = messagesRes as ChatMessage[];
            setSelectedMessages(history);

            // ─── 既読処理 ────────────────────────────────────────────────────
            // 未読数が1件以上あり、最終メッセージ連番が取得できた場合のみ既読APIを呼ぶ
            const unreadBefore = chats.find((chat) => chat.chat_id === chatId)?.unread_count_cache ?? 0;
            const lastMessageSeq = chatRes?.chat?.last_message_seq;
            if (unreadBefore > 0 && typeof lastMessageSeq === 'number') {
                // /unified/chat/read/mark: DynamoDB上の last_read_seq と unread_count_cache を更新
                await apiFetchPost('/unified/chat/read/mark', {
                    chat_id: chatId,
                    participant_id: participantId,
                    last_read_seq: lastMessageSeq, // この連番まで読んだと記録
                });

                // APIの再取得を待たずに、ローカルのキャッシュを即座に0にして
                // バッジが消えるUIの反応速度を上げます（楽観的更新）
                setChats((prev) => prev.map((chat) => (
                    chat.chat_id === chatId ? { ...chat, unread_count_cache: 0 } : chat
                )));
            }
        } catch (e) {
            console.error('Failed to fetch chat detail', e);
        } finally {
            setDetailLoading(false);
        }
    };

    // ─── ダイアログ開閉時の副作用 ────────────────────────────────────────────
    /**
     * isOpen が変化したときに実行されます。
     * - ダイアログを開いた場合: チャット一覧を取得します
     * - ダイアログを閉じた場合: 選択中チャットのデータをクリアします
     *   （次回開いたときに古いデータが残らないように）
     */
    useEffect(() => {
        if (isOpen) {
            fetchNotifications();
        } else {
            // ダイアログを閉じるときに選択状態をリセット
            setSelectedChatId(null);
            setSelectedChat(null);
            setSelectedMessages([]);
            setInputMessage('');
        }
    }, [isOpen]);

    // チャット一覧のページサイズが変わったらカーソル履歴をリセットして1ページ目から取り直す
    useEffect(() => {
        if (!isOpen) return;
        const fresh: (string | null)[] = [null];
        setChatPageCursors(fresh);
        setChatPageIdx(0);
        setChatHasNext(false);
        setChats([]);
        fetchPage(0, fresh);
    }, [chatPageSize]);

    // ─── 新規チャット作成 ────────────────────────────────────────────────────
    /**
     * 新規チャットを作成します。
     * /unified/chat/create APIを呼び出し、chat_type・participants・initiator_id を送信します。
     * 作成完了後はチャット一覧をリロードしてダイアログを閉じます。
     */
    const createNewChat = async (overridePayload?: Record<string, any>) => {
        if (!createFormData.chat_type || creatingChat) return;
        setCreatingChat(true);
        try {
            const validOverride = overridePayload && typeof overridePayload === 'object' && !('nativeEvent' in (overridePayload as any));
            const payload: Record<string, any> = validOverride ? overridePayload : {
                chat_type: createFormData.chat_type,
                participants: [participantId, 'ADMIN'],
                initiator_id: participantId,
            };
            
            // overridePayload がない場合は initial_message を追加
            if (!validOverride && createFormData.initial_message?.trim()) {
                payload.initial_message = {
                    type: 'TEXT',
                    message: createFormData.initial_message.trim(),
                };
            }
            const res = await apiFetchPost('/unified/chat/create', payload);
            // console.log('Created chat:', res.chat_id);
            // 作成成功後はダイアログを閉じてチャット一覧をリロード
            setIsCreateDialogOpen(false);
            setCreateFormData({ chat_type: defaultSupportChatType, initial_message: '' });
            setShopOpenShopName('');
            setShopOpenOwnerName('');
            setShopOpenNotes('');
            setShopOpenError('');
            setCardDesignReady(false);
            setCardDesignReferenceUrls('');
            setCardDesignNotes('');
            setCardDesignError('');
            fetchNotifications();
        } catch (e) {
            console.error('Failed to create chat', e);
            const detail = (e as any)?.message || (e as any)?.error || (e as any)?.detail || (e as any)?.statusText || '';
            alert(detail ? `チャット作成に失敗しました\n${detail}` : 'チャット作成に失敗しました');
        } finally {
            setCreatingChat(false);
        }
    };

    // ─── ショップ開設フォーム送信 ─────────────────────────────────────────────
    /**
     * ショップ開設フォームを送信し、SHOP_OPENING チャットを作成します。
     */
    const handleSubmitShopOpening = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!shopOpenShopName.trim() || !shopOpenOwnerName.trim()) {
            setShopOpenError(t('shopOpenForm.errors.required'));
            return;
        }
        if (!userEmail.trim()) {
            setShopOpenError(t('shopOpenForm.errors.noUserEmail'));
            return;
        }

        setShopOpenError('');
        try {
            const payload = {
                form_snapshot: {
                    shop_name: shopOpenShopName.trim(),
                    owner_name: shopOpenOwnerName.trim(),
                    contact_email: userEmail.trim(),
                    notes: shopOpenNotes.trim() || undefined,
                },
                submitted_at: new Date().toISOString(),
            };

            // フロント側でも事前検証
            if (!isValidWorkflowPayload('SHOP_OPENING', 'FORM_SUBMITTED', payload)) {
                setShopOpenError(t('shopOpenForm.errors.invalidPayload'));
                return;
            }

            await createNewChat({
                chat_type: 'SHOP_OPENING',
                participants: [participantId, 'ADMIN'],
                initiator_id: participantId,
                initial_message: {
                    type: 'WORKFLOW',
                    message: t('shopOpenForm.submittedMessage'),
                    payload_type: 'FORM_SUBMITTED',
                    payload,
                }
            });
        } catch (error: any) {
            const message = error?.message || t('shopOpenForm.errors.submitFailed');
            setShopOpenError(message);
        }
    };

    // ─── カードデザイン申請フォーム送信 ──────────────────────────────────────
    /**
     * カードデザイン申請フォームを送信し、CARD_DESIGN チャットを作成します。
     */
    const handleSubmitCardDesign = async (e: React.FormEvent) => {
        e.preventDefault();

        const contactEmail = shopContactEmail.trim() || currentUserEmail?.trim() || '';
        if (!contactEmail) {
            setCardDesignError(t('cardDesignForm.errors.noContactEmail'));
            return;
        }

        setCardDesignError('');
        try {
            const payload = {
                form_snapshot: {
                    design_ready: cardDesignReady,
                    reference_urls: cardDesignReferenceUrls.trim() || undefined,
                    notes: cardDesignNotes.trim() || undefined,
                    contact_email: contactEmail,
                },
                submitted_at: new Date().toISOString(),
            };

            if (!isValidWorkflowPayload('CARD_DESIGN', 'FORM_SUBMITTED', payload)) {
                setCardDesignError(t('cardDesignForm.errors.invalidPayload'));
                return;
            }

            await createNewChat({
                chat_type: 'CARD_DESIGN',
                participants: [participantId, 'ADMIN'],
                initiator_id: participantId,
                initial_message: {
                    type: 'WORKFLOW',
                    message: t('cardDesignForm.submittedMessage'),
                    payload_type: 'FORM_SUBMITTED',
                    payload,
                },
            });

            setCardDesignReady(false);
            setCardDesignReferenceUrls('');
            setCardDesignNotes('');
            setCardDesignError('');
        } catch (error: any) {
            const message = error?.message || t('cardDesignForm.errors.submitFailed');
            setCardDesignError(message);
        }
    };

    // ─── imperative handle: 外部からショップ開設ダイアログを制御 ────────────────
    useImperativeHandle(ref, () => ({
        openShopOpeningForm: (email: string) => {
            setUserEmail(email || currentUserEmail || '');
            setShopOpenShopName('');
            setShopOpenOwnerName('');
            setShopOpenNotes('');
            setShopOpenError('');
            setCreateFormData({ chat_type: 'SHOP_OPENING', initial_message: '' });
            setIsCreateDialogOpen(true);
        }
    }), [currentUserEmail]);

    // ─── フリーテキスト送信 ──────────────────────────────────────────────────
    /**
     * 開いているチャットに TEXT または FILE タイプのメッセージを送信します。
     * ファイルが選択されている場合は、まずアップロード用URLを取得してS3にアップロードし、
     * その後メッセージを送信します。
     * 送信後はメッセージ一覧をリロードし、入力欄をクリアします。
     */
    const sendFreeText = async () => {
        const text = inputMessage.trim();
        const hasFile = selectedFile !== null;
        
        // テキストかファイルのいずれかは必須
        if (!text && !hasFile) return;
        if (!selectedChatId || sendingMessage || uploading) return;
        
        setSendingMessage(true);
        try {
            let fileData: ChatFileData | null = null;

            if (selectedFile) {
                setUploading(true);
                try {
                    fileData = await uploadChatFile(apiFetchPost, selectedChatId, selectedFile);
                } finally {
                    setUploading(false);
                }
            }
            
            // メッセージを送信
            await apiFetchPost('/unified/chat/messages/send', {
                chat_id: selectedChatId,
                sender_id: participantId,
                type: fileData ? 'FILE' : 'TEXT',
                message: text || '',
                ...fileData,
            });
            
            // フォームをリセット
            setInputMessage('');
            setSelectedFile(null);
            
            // メッセージ一覧を再取得
            const allMessages = await fetchAllMessages(selectedChatId);
            setSelectedMessages(allMessages);
            
            // チャット一覧側の最終更新日時も楽観的に更新
            setChats((prev) =>
                prev.map((c) =>
                    c.chat_id === selectedChatId
                        ? { ...c, ts_last_message_at: new Date().toISOString() }
                        : c,
                ),
            );
        } catch (e) {
            console.error('Failed to send message', e);
            alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            setSendingMessage(false);
        }
    };

    // Safariでvh/dvhがウィンドウリサイズに追従しないケースに備え、実測値で高さを更新
    useEffect(() => {
        const updateDialogHeight = () => {
            const viewportHeight = window.visualViewport?.height || window.innerHeight;
            setDialogHeightPx(Math.floor(viewportHeight * 0.9));
        };

        updateDialogHeight();
        window.addEventListener('resize', updateDialogHeight);
        window.visualViewport?.addEventListener('resize', updateDialogHeight);

        return () => {
            window.removeEventListener('resize', updateDialogHeight);
            window.visualViewport?.removeEventListener('resize', updateDialogHeight);
        };
    }, []);

    return (
        <>
            {/* ─── ベルボタン ────────────────────────────────────────────────────────
                通知ダイアログを開くトリガーボタンです。
                未読が1件以上ある場合は件数を示す赤いバッジ（丸）を右側に表示します。
            ─────────────────────────────────────────────────────────────────────── */}
            <Button
                variant={buttonVariant}
                className={buttonClassName}
                onClick={() => setIsOpen(true)}
                disabled={disabled}
            >
                {/* チャットアイコン */}
                <MessageCircle className="w-5 h-5 mr-2" />
                {/* 翻訳テキスト（例: "通知"） */}
                {t('notifications.button')}
                {/* 未読バッジ: unreadTotal が 0 より大きい場合のみ表示 */}
                {unreadTotal > 0 && (
                    <span className="ml-2 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                        {unreadTotal}
                    </span>
                )}
            </Button>

            {/* ─── 通知ダイアログ ──────────────────────────────────────────────────────
                Dialogは isOpen が true のときに画面中央にモーダル表示されます。
                onOpenChange は閉じる操作（×ボタン/背景クリック/Escキー）を受け取ります。

                幅の設定について:
                  モバイル: 画面幅の98%（w-[98vw]）
                  タブレット以上: 96%（sm:max-w-[96vw]）
                  デスクトップ以上: 92%（lg:max-w-[92vw]）
                  大画面: 最大1600px（xl:max-w-[1600px]）
                高さ: 画面高さの90%以内（max-h-[90vh] / max-h-[90dvh]）に収め、内部をスクロール可能にします。
            ─────────────────────────────────────────────────────────────────────── */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent
                    className="w-[98vw] max-w-[98vw] sm:max-w-[96vw] lg:max-w-[92vw] xl:max-w-[1600px] max-h-[90vh] max-h-[90dvh] overflow-y-auto flex flex-col"
                    style={{
                        ...(dialogHeightPx ? { maxHeight: `${dialogHeightPx}px` } : {}),
                        WebkitOverflowScrolling: 'touch',
                        touchAction: 'pan-y',
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{t('notifications.title')}</DialogTitle>
                        <DialogDescription>{t('notifications.description')}</DialogDescription>
                    </DialogHeader>

                    {/* 通知一覧とは分離した作成アクション */}
                    <div className="flex flex-wrap justify-end gap-2 pb-2">
                        <Button
                            className="h-11 px-6 text-base font-semibold"
                            onClick={() => {
                                setCreateFormData({ chat_type: defaultSupportChatType, initial_message: '' });
                                setShopOpenError('');
                                setIsCreateDialogOpen(true);
                            }}
                        >
                            {t('notifications.createGeneral')}
                        </Button>
                        {canSubmitShopOpening && (
                            <Button
                                variant="outline"
                                className="h-11 px-6 text-base font-semibold"
                                onClick={() => {
                                    setCreateFormData({ chat_type: 'SHOP_OPENING', initial_message: '' });
                                    setShopOpenError('');
                                    setIsCreateDialogOpen(true);
                                }}
                            >
                                {t('notifications.createShopOpening')}
                            </Button>
                        )}
                        {canSubmitCardDesign && (
                            <Button
                                variant="outline"
                                className="h-11 px-6 text-base font-semibold"
                                onClick={() => {
                                    setCreateFormData({ chat_type: 'CARD_DESIGN', initial_message: '' });
                                    setCardDesignReady(false);
                                    setCardDesignReferenceUrls('');
                                    setCardDesignNotes('');
                                    setCardDesignError('');
                                    setIsCreateDialogOpen(true);
                                }}
                            >
                                {t('notifications.createCardDesign')}
                            </Button>
                        )}
                    </div>

                    {/* 2カラムグリッド: 左=チャット一覧、右=チャット詳細
                        モバイルでは1カラム（grid-cols-1）、PCでは2カラム（lg:grid-cols-2）に切替 */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0 items-start">

                        {/* ─── 左パネル: チャット一覧 ────────────────────────────── */}
                        <Card className="overflow-hidden flex flex-col h-[67rem]">
                            <CardHeader className="flex flex-col gap-3 pb-3 border-b bg-gray-50/60">
                                <div className="flex flex-row items-center justify-between">
                                    <CardTitle>{t('notifications.listTitle')}</CardTitle>
                                </div>

                                {/* チャット一覧のページサイズ選択 */}
                                <div className="flex items-center gap-1">
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs text-gray-500 mr-1">件数:</span>
                                        {([5, 10, 25, 50] as const).map((s) => (
                                            <button
                                                type="button"
                                                key={s}
                                                onClick={() => setChatPageSize(s)}
                                                className={`px-2 py-0.5 text-xs rounded border ${chatPageSize === s ? 'text-white' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                                                style={chatPageSize === s ? { backgroundColor: '#374151', borderColor: '#374151', color: '#ffffff' } : undefined}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="overflow-auto min-h-0 flex-1">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('notifications.table.updatedAt')}</TableHead>
                                            <TableHead>{t('notifications.table.type')}</TableHead>
                                            <TableHead>{t('notifications.table.status')}</TableHead>
                                            <TableHead>{t('notifications.table.unread')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {/* チャットが0件の場合は空メッセージを表示 */}
                                        {chats.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-gray-500">
                                                    {t('notifications.empty')}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            // チャット一覧をテーブル行としてレンダリング
                                            // クリックで openChatDetail を呼び出して右パネルに詳細を表示
                                            chats.map((chat) => (
                                                <TableRow
                                                    key={chat.chat_id}
                                                    className={`cursor-pointer hover:bg-gray-50 ${selectedChatId === chat.chat_id ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
                                                    onClick={() => openChatDetail(chat.chat_id)}
                                                >
                                                    {/* 最終更新日時: ISO文字列をロケール形式に変換 */}
                                                    <TableCell>{chat.ts_last_message_at ? new Date(chat.ts_last_message_at).toLocaleString() : '-'}</TableCell>
                                                    <TableCell>{getChatTypeLabel(chat.chat_type)}</TableCell>
                                                    <TableCell>{getStatusLabel(chat.status)}</TableCell>
                                                    {/* 未読数: null/undefined の場合は 0 と表示 */}
                                                    <TableCell>{chat.unread_count_cache ?? 0}</TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                                {/* 前ページ / 次ページのナビゲーション */}
                                <div className="mt-3 flex items-center justify-between">
                                    <Button
                                        variant="outline" size="sm"
                                        onClick={() => fetchPage(chatPageIdx - 1)}
                                        disabled={notificationLoading || chatPageIdx === 0}
                                    >
                                        {t('notifications.prevPage')}
                                    </Button>
                                    <span className="text-xs text-gray-500">{chatPageIdx + 1} {t('notifications.pageOf')}</span>
                                    <Button
                                        variant="outline" size="sm"
                                        onClick={() => fetchPage(chatPageIdx + 1)}
                                        disabled={notificationLoading || !chatHasNext}
                                    >
                                        {t('notifications.nextPage')}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* ─── 右パネル: チャット詳細 ────────────────────────────── */}
                        <Card className="overflow-hidden flex flex-col h-[67rem]">
                            <CardHeader>
                                <CardTitle>{t('notifications.detailTitle')}</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col flex-1 overflow-hidden min-h-0 space-y-4">
                                {/* 未選択状態: チャットを選ぶよう促す */}
                                {!selectedChatId ? (
                                    <p className="text-sm text-gray-500">{t('notifications.selectPrompt')}</p>
                                ) : detailLoading ? (
                                    // 読み込み中状態
                                    <p className="text-sm text-gray-500">{t('notifications.loading')}</p>
                                ) : (
                                    <>
                                        {/* チャット基本情報（ID・種別・ステータス・更新日時） */}
                                        <div className="space-y-1 text-sm">
                                            <div><span className="text-gray-500">{t('notifications.detail.chatId')}:</span> {selectedChat?.chat_id || '-'}</div>
                                            <div><span className="text-gray-500">{t('notifications.detail.type')}:</span> {getChatTypeLabel(selectedChat?.chat_type)}</div>
                                            <div><span className="text-gray-500">{t('notifications.detail.status')}:</span> {getStatusLabel(selectedChat?.status)}</div>
                                            <div><span className="text-gray-500">{t('notifications.detail.updatedAt')}:</span> {selectedChat?.ts_last_message_at ? new Date(selectedChat.ts_last_message_at).toLocaleString() : '-'}</div>
                                            <div className="pt-1">
                                                <span className="text-gray-500">参加者:</span>
                                                <div className="mt-1 space-y-1">
                                                    {selectedParticipantIds.length === 0 ? (
                                                        <div className="text-xs text-gray-500">-</div>
                                                    ) : (
                                                        selectedParticipantIds.map((id) => {
                                                            return (
                                                                <div key={id} className="text-xs text-gray-700 break-all">
                                                                    {toDisplayParticipantId(id)}
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* ─── 審査結果サマリーパネル（アンバー色のボックス） ────────
                                            decisionStatus・adminDecisionMessage・linkedShopId をもとに
                                            審査の結論を分かりやすくまとめて表示します。
                                        ──────────────────────────────────────────────────── */}
                                        {isShopOpeningChat && (
                                            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm space-y-1">
                                                <div className="font-semibold text-amber-900">{t('notifications.decision.label')}</div>

                                                {/* 審査結果: APPROVED/REJECTED/RESOLVED/PENDING を日本語で表示 */}
                                                <div>
                                                    <span className="text-gray-500">{t('notifications.decision.result')}:</span>{' '}
                                                    <span className={decisionStatus === 'APPROVED' ? 'font-bold text-green-700' : decisionStatus === 'REJECTED' ? 'font-bold text-red-700' : ''}>
                                                        {decisionStatus === 'APPROVED'
                                                            ? t('notifications.decision.approved')
                                                            : decisionStatus === 'REJECTED'
                                                                ? t('notifications.decision.rejected')
                                                                : t('notifications.decision.pending')}
                                                    </span>
                                                </div>

                                                {/* 審査日時: reviewed_at フィールドが存在する場合のみ有効な値を表示 */}
                                                <div>
                                                    <span className="text-gray-500">{t('notifications.decision.reviewedAt')}:</span>{' '}
                                                    {adminDecisionMessage?.payload?.reviewed_at ? new Date(adminDecisionMessage.payload.reviewed_at).toLocaleString() : '-'}
                                                </div>

                                                {/* 審査コメント（却下理由など） */}
                                                <div>
                                                    <span className="text-gray-500">{t('notifications.decision.reason')}:</span>{' '}
                                                    {adminDecisionMessage?.payload?.reason || '-'}
                                                </div>

                                                {/* 紐付けられたショップIDが存在する場合のみ表示
                                                    Linkコンポーネントで /shop/{shopId} ページへ遷移できます */}
                                                {linkedShopId && (
                                                    <div>
                                                        <span className="text-gray-500">{t('notifications.decision.linkedShopId')}:</span>{' '}
                                                        <Link href={`/shop/${linkedShopId}`} className="text-blue-700 underline hover:text-blue-900">
                                                            {linkedShopId}
                                                        </Link>
                                                        <span className="ml-2 text-xs text-gray-500">
                                                            ({t('notifications.decision.openShop')})
                                                        </span>
                                                    </div>
                                                )}

                                                {/* デフォルトデザインIDが存在する場合のみ表示 */}
                                                {adminDecisionMessage?.payload?.default_design_id && (
                                                    <div>
                                                        <span className="text-gray-500">{t('notifications.decision.defaultDesignId')}:</span>{' '}
                                                        {adminDecisionMessage.payload.default_design_id}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* ─── メッセージ一覧 ────────────────────────────────────
                                            チャット内の全メッセージを古い順（昇順）で表示します。
                                            各メッセージには送信者・日時・本文・ペイロード種別を表示します。
                                        ──────────────────────────────────────────────────── */}
                                        <div
                                            className="space-y-2 flex-1 min-h-0 max-h-[45vh] overflow-y-auto pr-1 overscroll-contain lg:max-h-none"
                                            style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                                        >
                                            {selectedMessages.length === 0 ? (
                                                <p className="text-sm text-gray-500">{t('notifications.noMessages')}</p>
                                            ) : (
                                                selectedMessages.map((message) => (
                                                    <div key={message.message_id || `${message.seq}`} className="rounded-md border p-3 text-sm">
                                                        <div className="mb-1 flex justify-between text-xs text-gray-500">
                                                            <span>{getSenderDisplayName(message)}</span>
                                                            <span>{message.ts_created_at ? new Date(message.ts_created_at).toLocaleString() : '-'}</span>
                                                        </div>
                                                        <div className="font-medium whitespace-pre-wrap break-words">{getDisplayMessage(message.message, (message as any).file_url)}</div>
                                                        {renderWorkflowPayload(message)}
                                                        {(message as any).file_url && (
                                                            <ChatAttachment
                                                                fileUrl={(message as any).file_url}
                                                                fileName={(message as any).file_name}
                                                                fileSize={(message as any).file_size}
                                                            />
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {isChatClosed ? (
                                            <p className="text-xs text-center text-gray-400 border rounded-md py-2">
                                                {t('notifications.chatClosed')}
                                            </p>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                <Textarea
                                                    value={inputMessage}
                                                    onChange={(e) => setInputMessage(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            sendFreeText();
                                                        }
                                                    }}
                                                    placeholder={t('notifications.messagePlaceholder')}
                                                    rows={3}
                                                    disabled={sendingMessage || uploading}
                                                    className="resize-none"
                                                />
                                                
                                                {/* ファイル選択 */}
                                                {selectedFile && (
                                                    <div className="flex items-center justify-between gap-2 p-2 bg-blue-50 rounded border border-blue-200">
                                                        <span className="text-xs text-blue-700 truncate">
                                                            📎 {selectedFile.name}
                                                        </span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setSelectedFile(null)}
                                                            disabled={uploading}
                                                        >
                                                            ✕
                                                        </Button>
                                                    </div>
                                                )}
                                                
                                                <div className="flex gap-2">
                                                    <input
                                                        type="file"
                                                        id="chatFileInput"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                if (file.size > 30 * 1024 * 1024) {
                                                                    alert(t('notifications.fileTooLarge') || 'File size exceeds 30MB');
                                                                } else {
                                                                    setSelectedFile(file);
                                                                }
                                                            }
                                                            e.target.value = '';
                                                        }}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => document.getElementById('chatFileInput')?.click()}
                                                        disabled={sendingMessage || uploading}
                                                    >
                                                        📎 {t('notifications.attachFile') || 'Attach'}
                                                    </Button>
                                                    
                                                    <Button
                                                        className="self-end"
                                                        size="sm"
                                                        onClick={sendFreeText}
                                                        disabled={sendingMessage || uploading || (!inputMessage.trim() && !selectedFile)}
                                                    >
                                                        {uploading ? (t('notifications.uploading') || 'Uploading...') 
                                                         : sendingMessage ? (t('notifications.loading') || 'Sending...') 
                                                         : (t('notifications.sendButton') || 'Send')}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ─── 新規チャット作成ダイアログ ─────────────────────────────────────────
                ユーザーが新規チャット作成ボタンを押したときに表示されます。
                チャットタイプに応じて異なるフォームを表示します。
            ────────────────────────────────────────────────────────────────── */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent
                    className="max-w-md max-h-[90vh] max-h-[90dvh] overflow-y-auto"
                    style={dialogHeightPx ? { maxHeight: `${dialogHeightPx}px` } : undefined}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {createFormData.chat_type === 'SHOP_OPENING'
                                ? t('notifications.createShopOpening')
                                : createFormData.chat_type === 'CARD_DESIGN'
                                    ? t('notifications.createCardDesign')
                                    : t('notifications.createGeneral')}
                        </DialogTitle>
                    </DialogHeader>

                    {createFormData.chat_type === 'SHOP_OPENING' ? (
                        // ─── ショップ開設フォーム ────────────────────────────────────
                        <form onSubmit={handleSubmitShopOpening} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="shop-open-name">{t('shopOpenForm.shopNameLabel')}</Label>
                                <Input
                                    id="shop-open-name"
                                    value={shopOpenShopName}
                                    onChange={(e) => setShopOpenShopName(e.target.value)}
                                    placeholder={t('shopOpenForm.shopNamePlaceholder')}
                                    disabled={creatingChat}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="shop-open-owner">{t('shopOpenForm.ownerNameLabel')}</Label>
                                <Input
                                    id="shop-open-owner"
                                    value={shopOpenOwnerName}
                                    onChange={(e) => setShopOpenOwnerName(e.target.value)}
                                    placeholder={t('shopOpenForm.ownerNamePlaceholder')}
                                    disabled={creatingChat}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="shop-open-email">{t('shopOpenForm.contactEmailLabel')}</Label>
                                <Input
                                    id="shop-open-email"
                                    type="email"
                                    value={userEmail}
                                    placeholder={t('shopOpenForm.contactEmailPlaceholder')}
                                    readOnly
                                    disabled
                                />
                                <p className="text-xs text-gray-500">
                                    {userEmail.trim() ? t('shopOpenForm.contactEmailFixed') : t('shopOpenForm.contactEmailPlaceholder')}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="shop-open-notes">{t('shopOpenForm.notesLabel')}</Label>
                                <Textarea
                                    id="shop-open-notes"
                                    value={shopOpenNotes}
                                    onChange={(e) => setShopOpenNotes(e.target.value)}
                                    placeholder={t('shopOpenForm.notesPlaceholder')}
                                    disabled={creatingChat}
                                    rows={3}
                                    className="resize-none"
                                />
                            </div>

                            {shopOpenError && (
                                <p className="text-sm text-red-600 font-medium">{shopOpenError}</p>
                            )}

                            <div className="flex justify-end gap-2 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setIsCreateDialogOpen(false);
                                        setCreateFormData({ chat_type: defaultSupportChatType, initial_message: '' });
                                    }}
                                    disabled={creatingChat}
                                >
                                    {t('notifications.cancel')}
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={creatingChat}
                                >
                                    {creatingChat ? t('notifications.loading') : t('shopOpenForm.submit')}
                                </Button>
                            </div>
                        </form>
                    ) : createFormData.chat_type === 'CARD_DESIGN' ? (
                        // ─── カードデザイン申請フォーム ──────────────────────────────
                        <form onSubmit={handleSubmitCardDesign} className="space-y-4">
                            <p className="text-sm text-gray-600">{t('cardDesignForm.description')}</p>

                            <div className="space-y-2">
                                <Label>{t('cardDesignForm.designReadyLabel')}</Label>
                                <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="card-design-ready"
                                            checked={!cardDesignReady}
                                            onChange={() => setCardDesignReady(false)}
                                            disabled={creatingChat}
                                        />
                                        <span className="text-sm">{t('cardDesignForm.designReadyNo')}</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="card-design-ready"
                                            checked={cardDesignReady}
                                            onChange={() => setCardDesignReady(true)}
                                            disabled={creatingChat}
                                        />
                                        <span className="text-sm">{t('cardDesignForm.designReadyYes')}</span>
                                    </label>
                                </div>
                            </div>

                            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
                                {t('cardDesignForm.imageUploadNote')}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="card-design-urls">{t('cardDesignForm.referenceUrlsLabel')}</Label>
                                <Textarea
                                    id="card-design-urls"
                                    value={cardDesignReferenceUrls}
                                    onChange={(e) => setCardDesignReferenceUrls(e.target.value)}
                                    placeholder={t('cardDesignForm.referenceUrlsPlaceholder')}
                                    disabled={creatingChat}
                                    rows={3}
                                    className="resize-none"
                                />
                                <p className="text-xs text-gray-500">{t('cardDesignForm.referenceUrlsHint')}</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="card-design-notes">{t('cardDesignForm.notesLabel')}</Label>
                                <Textarea
                                    id="card-design-notes"
                                    value={cardDesignNotes}
                                    onChange={(e) => setCardDesignNotes(e.target.value)}
                                    placeholder={t('cardDesignForm.notesPlaceholder')}
                                    disabled={creatingChat}
                                    rows={4}
                                    className="resize-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>{t('cardDesignForm.contactEmailLabel')}</Label>
                                <Input
                                    type="email"
                                    value={shopContactEmail || currentUserEmail || ''}
                                    readOnly
                                    disabled
                                />
                                <p className="text-xs text-gray-500">{t('cardDesignForm.contactEmailFixed')}</p>
                            </div>

                            {cardDesignError && (
                                <p className="text-sm text-red-600 font-medium">{cardDesignError}</p>
                            )}

                            <div className="flex justify-end gap-2 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setIsCreateDialogOpen(false);
                                        setCreateFormData({ chat_type: defaultSupportChatType, initial_message: '' });
                                    }}
                                    disabled={creatingChat}
                                >
                                    {t('cardDesignForm.cancel')}
                                </Button>
                                <Button type="submit" disabled={creatingChat}>
                                    {creatingChat ? t('notifications.loading') : t('cardDesignForm.submit')}
                                </Button>
                            </div>
                        </form>
                    ) : (
                        // ─── 汎用フォーム（テキストメッセージ） ─────────────────────
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    {t('notifications.initialMessage')}
                                </label>
                                <Textarea
                                    value={createFormData.initial_message}
                                    onChange={(e) =>
                                        setCreateFormData((prev) => ({
                                            ...prev,
                                            initial_message: e.target.value,
                                        }))
                                    }
                                    placeholder={t('notifications.initialMessagePlaceholder')}
                                    rows={3}
                                    className="resize-none"
                                />
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setIsCreateDialogOpen(false);
                                        setCreateFormData({ chat_type: defaultSupportChatType, initial_message: '' });
                                    }}
                                >
                                    {t('notifications.cancel')}
                                </Button>
                                <Button
                                    onClick={() => {
                                        createNewChat();
                                    }}
                                    disabled={creatingChat || !createFormData.chat_type}
                                >
                                    {creatingChat ? t('notifications.loading') : t('notifications.create')}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
});

