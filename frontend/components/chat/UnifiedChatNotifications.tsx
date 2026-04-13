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
// ベルアイコン（lucide-react はアイコンライブラリ）
import { Bell } from 'lucide-react';
// next-intl の翻訳フック（テキストを ja.json / en.json から取得します）
import { useTranslations } from 'next-intl';
// i18n対応のLinkコンポーネント（URLに言語プレフィックスを自動付与します）
import { Link } from '@/i18n/routing';
// 共通UIコンポーネント（shadcn/ui ライブラリ）
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
export function UnifiedChatNotifications({
    participantId,
    apiFetchPost,
    translationNamespace,
    buttonClassName,
    buttonVariant = 'ghost',
    disabled = false,
}: UnifiedChatNotificationsProps) {
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

    // ─── 審査証拠メッセージの検出 ───────────────────────────────────────────
    /**
     * メッセージ一覧の中から「審査結果が含まれているメッセージ」を探します。
     * 新しいメッセージ（後ろ）から順番に探し、最初に見つかったものを返します。
     *
     * 審査証拠とみなす条件（いずれかに該当すれば証拠とみなす）:
     *   1. workflow_status が "APPROVED" または "REJECTED"
     *   2. payload.approved が true または false（ブール値）
     *   3. payload.linked_shop_id または payload.shop_id が文字列として存在
     *
     * 【なぜ payload_type === 'ADMIN_DECISION' で絞り込まないのか】
     *   古いデータや特定の保存経路ではこのフィールドが欠落している場合があるため、
     *   payload_type には依存せず、審査の証拠となるフィールドの有無で判定しています。
     */
    const decisionEvidence = useMemo(() => {
        for (let i = selectedMessages.length - 1; i >= 0; i -= 1) {
            const message = selectedMessages[i];

            // 判定1: workflow_status フィールドが承認/却下を示している場合
            const wf = (message?.workflow_status || '').toUpperCase();
            if (wf === 'APPROVED' || wf === 'REJECTED') {
                return message;
            }

            // 判定2: payload.approved が明示的に boolean 値で設定されている場合
            if (message?.payload?.approved === true || message?.payload?.approved === false) {
                return message;
            }

            // 判定3: 承認時に紐付けられたショップIDが存在する場合
            const maybeShopId = message?.payload?.linked_shop_id || message?.payload?.shop_id;
            if (typeof maybeShopId === 'string' && maybeShopId.trim()) {
                return message;
            }
        }
        // 審査証拠が見つからない = まだ審査されていない
        return null;
    }, [selectedMessages]);

    // ─── 審査結果ステータスの判定 ────────────────────────────────────────────
    /**
     * 審査証拠メッセージとチャットメタデータから最終的な審査結果を文字列で返します。
     *
     * 返り値:
     *   'APPROVED'  ... 承認された
     *   'REJECTED'  ... 却下された
     *   'RESOLVED'  ... チャットが解決済みだが、具体的な判定内容が読み取れない場合
     *   'PENDING'   ... まだ審査されていない（デフォルト）
     *
     * 優先順位:
     *   1. workflow_status フィールド（最も信頼性が高い）
     *   2. payload.approved フィールド
     *   3. チャット全体の status（RESOLVED / CLOSED）
     *   4. PENDING（デフォルト）
     */
    const decisionStatus = useMemo(() => {
        // 優先度1: workflow_status が明示的に設定されている場合はそれを使用
        const wf = (decisionEvidence?.workflow_status || '').toUpperCase();
        if (wf === 'APPROVED') return 'APPROVED';
        if (wf === 'REJECTED') return 'REJECTED';

        // 優先度2: payload.approved（boolean）から判定
        if (decisionEvidence?.payload?.approved === true) return 'APPROVED';
        if (decisionEvidence?.payload?.approved === false) return 'REJECTED';

        // 優先度3: チャット自体が解決済みステータスの場合はその旨を表示
        // （個別メッセージに審査フィールドがない古いデータへのフォールバック）
        const metaStatus = (selectedChat?.status || '').toUpperCase();
        if (metaStatus === 'RESOLVED' || metaStatus === 'CLOSED') return 'RESOLVED';

        // デフォルト: 審査証拠が見つからない = まだ審査中
        return 'PENDING';
    }, [decisionEvidence, selectedChat]);

    // ─── 紐付けられたショップIDの抽出 ────────────────────────────────────────
    /**
     * 承認時に作成されたショップのIDを3段階で探します。
     *
     * 探索順序:
     *   1. 審査証拠メッセージ（decisionEvidence）の payload から直接取得
     *   2. 全メッセージをスキャンして linked_shop_id / shop_id を探す
     *   3. チャットの participants 配列から "SHOP#" プレフィックスを探す
     *
     * 取得できた場合は "SHOP#" プレフィックスを除去した純粋なIDを返します。
     * 取得できなかった場合は空文字 '' を返します。
     */
    const linkedShopId = useMemo(() => {
        // 探索1: 審査証拠メッセージのペイロードから直接取得（最も確実）
        const direct = decisionEvidence?.payload?.linked_shop_id || decisionEvidence?.payload?.shop_id;
        if (typeof direct === 'string' && direct.trim()) {
            // "SHOP#xxx" 形式のプレフィックスを除去して純粋なIDだけを返す
            return direct.trim().replace(/^SHOP#/, '');
        }

        // 探索2: 全メッセージをスキャン（審査証拠ではないメッセージにIDが含まれる場合）
        for (let i = selectedMessages.length - 1; i >= 0; i -= 1) {
            const payload = selectedMessages[i]?.payload;
            const candidate = payload?.linked_shop_id || payload?.shop_id;
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate.trim().replace(/^SHOP#/, '');
            }
        }

        // 探索3: チャットのparticipants配列から "SHOP#" で始まるIDを探す
        // （メッセージにIDが記録されていない場合の最終フォールバック）
        const participantShopId = selectedChat?.participants?.find((p) => typeof p === 'string' && p.startsWith('SHOP#'));
        if (participantShopId) {
            return participantShopId.replace(/^SHOP#/, '');
        }

        // どこにもショップIDが見つからない場合は空文字を返す
        return '';
    }, [decisionEvidence, selectedMessages, selectedChat]);

    // ─── 未読件数の合計 ───────────────────────────────────────────────────────
    /**
     * 全チャットの未読カウントを合計します。
     * ベルボタン横の赤いバッジに表示する数値です。
     * 0 の場合はバッジを表示しません。
     */
    const unreadTotal = useMemo(() => chats.reduce((sum, chat) => sum + (chat.unread_count_cache ?? 0), 0), [chats]);

    // ─── チャット一覧の取得 ───────────────────────────────────────────────────
    /**
     * /unified/chat/list APIを呼び出してチャット一覧を取得します。
     * participantId に対応する全チャット（最大100件）を取得し、state に保存します。
     * ダイアログを開いたとき・更新ボタンを押したときに呼ばれます。
     */
    const fetchNotifications = async () => {
        setNotificationLoading(true);
        try {
            const response = await apiFetchPost('/unified/chat/list', {
                participant_id: participantId,
                include_archived: false, // アーカイブ済みは除外
                limit: 100,
            });
            // API レスポンスの items 配列を state にセット（なければ空配列）
            setChats(response.items || []);
        } catch (e) {
            console.error('Failed to fetch notifications', e);
        } finally {
            setNotificationLoading(false);
        }
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
        // 選択中チャットIDを即座に更新（右パネルのローディング表示に使用）
        setSelectedChatId(chatId);
        setDetailLoading(true);
        try {
            // チャットメタとメッセージ一覧を並列で取得（Promise.all で同時リクエスト）
            const [chatRes, messagesRes] = await Promise.all([
                apiFetchPost('/unified/chat/get', { chat_id: chatId }),
                apiFetchPost('/unified/chat/messages/get', { chat_id: chatId, limit: 200 }),
            ]);

            // チャットメタデータを state にセット
            setSelectedChat(chatRes.chat || null);

            // メッセージはAPIからは「新しい順（降順）」で返ってくるため、
            // .reverse() で「古い順（昇順）」にしてから表示します
            setSelectedMessages((messagesRes.messages || []).slice().reverse());

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
        }
    }, [isOpen]);

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
                {/* ベルアイコン */}
                <Bell className="w-5 h-5 mr-2" />
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
                高さ: 画面高さの90%以内（max-h-[90vh]）に収め、内部をスクロール可能にします。
            ─────────────────────────────────────────────────────────────────────── */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-[96vw] lg:max-w-[92vw] xl:max-w-[1600px] max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{t('notifications.title')}</DialogTitle>
                        <DialogDescription>{t('notifications.description')}</DialogDescription>
                    </DialogHeader>

                    {/* 2カラムグリッド: 左=チャット一覧、右=チャット詳細
                        モバイルでは1カラム（grid-cols-1）、PCでは2カラム（lg:grid-cols-2）に切替 */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">

                        {/* ─── 左パネル: チャット一覧 ────────────────────────────── */}
                        <Card className="overflow-hidden flex flex-col">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle>{t('notifications.listTitle')}</CardTitle>
                                {/* 更新ボタン: 最新のチャット一覧を再取得します */}
                                <Button variant="outline" size="sm" onClick={fetchNotifications} disabled={notificationLoading}>
                                    {notificationLoading ? t('notifications.loading') : t('notifications.refresh')}
                                </Button>
                            </CardHeader>
                            <CardContent className="overflow-auto">
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
                                                    className="cursor-pointer hover:bg-gray-50"
                                                    onClick={() => openChatDetail(chat.chat_id)}
                                                >
                                                    {/* 最終更新日時: ISO文字列をロケール形式に変換 */}
                                                    <TableCell>{chat.ts_last_message_at ? new Date(chat.ts_last_message_at).toLocaleString() : '-'}</TableCell>
                                                    <TableCell>{chat.chat_type || '-'}</TableCell>
                                                    <TableCell>{chat.status || '-'}</TableCell>
                                                    {/* 未読数: null/undefined の場合は 0 と表示 */}
                                                    <TableCell>{chat.unread_count_cache ?? 0}</TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        {/* ─── 右パネル: チャット詳細 ────────────────────────────── */}
                        <Card className="overflow-hidden flex flex-col">
                            <CardHeader>
                                <CardTitle>{t('notifications.detailTitle')}</CardTitle>
                            </CardHeader>
                            <CardContent className="overflow-auto space-y-4">
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
                                            <div><span className="text-gray-500">{t('notifications.detail.type')}:</span> {selectedChat?.chat_type || '-'}</div>
                                            <div><span className="text-gray-500">{t('notifications.detail.status')}:</span> {selectedChat?.status || '-'}</div>
                                            <div><span className="text-gray-500">{t('notifications.detail.updatedAt')}:</span> {selectedChat?.ts_last_message_at ? new Date(selectedChat.ts_last_message_at).toLocaleString() : '-'}</div>
                                        </div>

                                        {/* ─── 審査結果サマリーパネル（アンバー色のボックス） ────────
                                            decisionStatus・decisionEvidence・linkedShopId をもとに
                                            審査の結論を分かりやすくまとめて表示します。
                                        ──────────────────────────────────────────────────── */}
                                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm space-y-1">
                                            <div className="font-semibold text-amber-900">{t('notifications.decision.label')}</div>

                                            {/* 審査結果: APPROVED/REJECTED/RESOLVED/PENDING を日本語で表示 */}
                                            <div>
                                                <span className="text-gray-500">{t('notifications.decision.result')}:</span>{' '}
                                                {decisionStatus === 'APPROVED'
                                                    ? t('notifications.decision.approved')
                                                    : decisionStatus === 'REJECTED'
                                                        ? t('notifications.decision.rejected')
                                                        : decisionStatus === 'RESOLVED'
                                                            ? t('notifications.decision.resolved')
                                                        : t('notifications.decision.pending')}
                                            </div>

                                            {/* 審査日時: reviewed_at フィールドが存在する場合のみ有効な値を表示 */}
                                            <div>
                                                <span className="text-gray-500">{t('notifications.decision.reviewedAt')}:</span>{' '}
                                                {decisionEvidence?.payload?.reviewed_at ? new Date(decisionEvidence.payload.reviewed_at).toLocaleString() : '-'}
                                            </div>

                                            {/* 審査コメント（却下理由など） */}
                                            <div>
                                                <span className="text-gray-500">{t('notifications.decision.reason')}:</span>{' '}
                                                {decisionEvidence?.payload?.reason || '-'}
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
                                            {decisionEvidence?.payload?.default_design_id && (
                                                <div>
                                                    <span className="text-gray-500">{t('notifications.decision.defaultDesignId')}:</span>{' '}
                                                    {decisionEvidence.payload.default_design_id}
                                                </div>
                                            )}
                                        </div>

                                        {/* ─── メッセージ一覧 ────────────────────────────────────
                                            チャット内の全メッセージを古い順（昇順）で表示します。
                                            各メッセージには送信者・日時・本文・ペイロード種別を表示します。
                                        ──────────────────────────────────────────────────── */}
                                        <div className="space-y-2">
                                            {selectedMessages.length === 0 ? (
                                                <p className="text-sm text-gray-500">{t('notifications.noMessages')}</p>
                                            ) : (
                                                selectedMessages.map((message) => (
                                                    // key: message_id を優先、なければ連番 seq を使用
                                                    <div key={message.message_id || `${message.seq}`} className="rounded-md border p-3 text-sm">
                                                        {/* メッセージヘッダー: 送信者ID と 日時 */}
                                                        <div className="mb-1 flex justify-between text-xs text-gray-500">
                                                            <span>{message.sender_id || '-'}</span>
                                                            <span>{message.ts_created_at ? new Date(message.ts_created_at).toLocaleString() : '-'}</span>
                                                        </div>
                                                        {/* メッセージ本文 */}
                                                        <div className="font-medium break-words">{message.message || '-'}</div>
                                                        {/* ワークフロー種別（例: "ADMIN_DECISION"）が存在する場合のみ表示 */}
                                                        {message.payload_type && (
                                                            <div className="mt-1 text-xs text-gray-500">{message.payload_type}</div>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
