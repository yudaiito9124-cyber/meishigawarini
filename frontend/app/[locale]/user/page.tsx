/**
 * ファイル概要: 一般ユーザー向けマイページ (User Dashboard)
 * 
 * 役割:
 * 会員登録した一般ユーザーが、自身のプロフィール確認、ギフト送信、
 * 送受信履歴の閲覧、配送先設定など、システム内の主要アクションへアクセスするための
 * ハブ（ポータル）画面として機能します。
 * 
 * 主要機能:
 * 1. プロフィール閲覧（ユーザーID、メールアドレスの表示）。
 * 2. 各機能へのナビゲーション（プロフィール編集、ギフト送信、送信履歴、受信履歴、配送設定）。
 * 3. ログアウト処理。
 * 4. ショップオーナー向け管理画面への誘導。
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserPen, Send, Inbox, QrCode, LogOut, ChevronDown, Truck, Copy, Check } from 'lucide-react';
import { signOut, fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth';
import { userApi } from '@/lib/api/user';
import { isValidWorkflowPayload } from '@shared/unified-chat-workflows';
import { UnifiedChatNotifications } from '@/components/chat/UnifiedChatNotifications';

/**
 * ユーザーダッシュボード（マイページ）コンポーネント
 */
export default function UserDashboardPage() {
    /** 翻訳用フック (UserProfilePage namespace) */
    const t = useTranslations('UserProfilePage');
    /** ルーター */
    const router = useRouter();
    /** ユーザーのメールアドレス */
    const [userEmail, setUserEmail] = useState<string>('');
    /** ユーザーの一意なID (Cognito sub) */
    const [userId, setUserId] = useState<string>('');
    /** コピー完了表示用のID保持ステート */
    const [copiedId, setCopiedId] = useState<string | null>(null);
    /** スクロール同期用のコンテナ参照 */
    const containerRef = useRef<HTMLDivElement>(null);
    /** ショップ開設フォームの表示状態 */
    const [isShopOpenDialogOpen, setIsShopOpenDialogOpen] = useState(false);
    /** ショップ開設フォーム送信中状態 */
    const [isSubmittingShopOpen, setIsSubmittingShopOpen] = useState(false);
    /** ショップ開設フォーム: ショップ名 */
    const [shopOpenShopName, setShopOpenShopName] = useState('');
    /** ショップ開設フォーム: 申請者名 */
    const [shopOpenOwnerName, setShopOpenOwnerName] = useState('');
    /** ショップ開設フォーム: 備考 */
    const [shopOpenNotes, setShopOpenNotes] = useState('');
    /** ショップ開設フォーム: エラー表示 */
    const [shopOpenError, setShopOpenError] = useState('');
    /** ショップ開設フォーム: 完了表示 */
    const [shopOpenSuccess, setShopOpenSuccess] = useState('');

    /**
     * IDをクリップボードにコピーし、一時的に成功表示を出します。
     * @param id コピー対象のID文字列
     */
    const handleCopy = (id: string) => {
        navigator.clipboard.writeText(id).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    /**
     * 初期化時にAmplifyからユーザー属性を取得します。
     */
    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const [attributes, user] = await Promise.all([
                    fetchUserAttributes(),
                    getCurrentUser()
                ]);

                if (attributes.email) {
                    setUserEmail(attributes.email);
                }
                if (user.userId) {
                    setUserId(user.userId);
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
            }
        };
        fetchUserData();
    }, []);

    /**
     * ページ背景色とbody/htmlの背景色を同期させます。
     * モバイルブラウザでのオーバースクロール時に白い隙間が見えるのを防ぐためのユーティリティ。
     */
    useEffect(() => {
        const body = document.body;
        const html = document.documentElement;

        const updateStyles = () => {
            if (!containerRef.current) return;
            const style = window.getComputedStyle(containerRef.current);
            body.style.backgroundColor = style.backgroundColor;
            html.style.backgroundColor = style.backgroundColor;
        };

        updateStyles();
        const timer = setTimeout(updateStyles, 100);

        return () => {
            clearTimeout(timer);
            body.style.backgroundColor = "";
            html.style.backgroundColor = "";
        };
    }, []);

    /**
     * サインアウト処理を実行し、トップページへ遷移します。
     */
    const handleLogout = async () => {
        try {
            await signOut();
            router.push('/');
        } catch (error) {
            console.error('Error signing out: ', error);
        }
    };

    /**
     * 「ショップを開設する」ボタン押下時の初期化処理。
     * 直前のエラー/成功メッセージをクリアして申請ダイアログを開きます。
     */
    const handleCreatesop = async () => {
        setShopOpenError('');
        setShopOpenSuccess('');
        setIsShopOpenDialogOpen(true);
    };

    /**
     * 「ショップを開設する」フォームを送信し、Unified Chat の SHOP_OPENING 申請を作成します。
     */
    const handleSubmitShopOpening = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!userId) {
            setShopOpenError(t('shopOpenForm.errors.noUserId'));
            return;
        }

        if (!shopOpenShopName.trim() || !shopOpenOwnerName.trim()) {
            setShopOpenError(t('shopOpenForm.errors.required'));
            return;
        }
        if (!userEmail.trim()) {
            setShopOpenError(t('shopOpenForm.errors.noUserEmail'));
            return;
        }

        setIsSubmittingShopOpen(true);
        setShopOpenError('');
        setShopOpenSuccess('');

        try {
            const participantId = `USER#${userId}`;
            // FORM_SUBMITTED は unified-chat-workflows.ts で型検証される payload です。
            // ここでは DB に保存する最小スナップショットだけを送信します。
            const payload = {
                form_snapshot: {
                    shop_name: shopOpenShopName.trim(),
                    owner_name: shopOpenOwnerName.trim(),
                    contact_email: userEmail.trim(),
                    notes: shopOpenNotes.trim() || undefined,
                },
                submitted_at: new Date().toISOString(),
            };

            // フロント側でも事前検証し、明らかな不整合 payload を API に送らないようにします。
            if (!isValidWorkflowPayload('SHOP_OPENING', 'FORM_SUBMITTED', payload)) {
                setShopOpenError(t('shopOpenForm.errors.invalidPayload'));
                setIsSubmittingShopOpen(false);
                return;
            }

            await userApi.fetch_post('/unified/chat/create', {
                chat_type: 'SHOP_OPENING',
                participants: [participantId, 'ADMIN'],
                initiator_id: participantId,
                title: 'Shop Opening Request',
                initial_message: {
                    type: 'WORKFLOW',
                    payload_type: 'FORM_SUBMITTED',
                    payload
                }
            });

            setShopOpenSuccess(t('shopOpenForm.success'));
            setShopOpenShopName('');
            setShopOpenOwnerName('');
            setShopOpenNotes('');
        } catch (error: any) {
            const message = error?.message || t('shopOpenForm.errors.submitFailed');
            setShopOpenError(message);
        } finally {
            setIsSubmittingShopOpen(false);
        }
    };

    /**
     * ダッシュボードに表示する各機能カードの定義。
     */
    const navItems = [
        {
            title: t('editProfile'),
            desc: t('editProfileDesc'),
            icon: UserPen,
            href: `/user/editprofile`,
            color: "text-blue-600",
            bg: "bg-blue-50",
            border: "border-blue-100 hover:border-blue-300 hover:bg-blue-50/50"
        },
        {
            title: t('sendGift'),
            desc: t('sendGiftDesc'),
            icon: QrCode,
            href: `/user/sendgift`,
            color: "text-orange-600",
            bg: "bg-orange-50",
            border: "border-orange-100 hover:border-orange-300 hover:bg-orange-50/50"
        },
        {
            title: t('sendList'),
            desc: t('sendListDesc'),
            icon: Send,
            href: `/user/sentmemory`,
            color: "text-green-600",
            bg: "bg-green-50",
            border: "border-green-100 hover:border-green-300 hover:bg-green-50/50"
        },
        {
            title: t('receiveList'),
            desc: t('receiveListDesc'),
            icon: Inbox,
            href: `/user/receivedmemory`,
            color: "text-purple-600",
            bg: "bg-purple-50",
            border: "border-purple-100 hover:border-purple-300 hover:bg-purple-50/50"
        },
        {
            title: t('deliverySettings'),
            desc: t('deliverySettingsDesc'),
            icon: Truck,
            href: `/user/editdelivery`,
            color: "text-rose-600",
            bg: "bg-rose-50",
            border: "border-rose-100 hover:border-rose-300 hover:bg-rose-50/50"
        }
    ];

    return (
        <div ref={containerRef} className="flex flex-col min-h-screen bg-slate-50 font-sans">
            <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-8 lg:p-12 space-y-12 pb-16 pt-16">
                {/* ヘッダーエリア: プロフィール情報の要約 */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12">
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tighter mb-2">{t('title')}</h1>
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-2h-2 rounded-full bg-blue-500 animate-pulse" />
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{t('userId')} : {userId ? userId : "..."}</p>
                                {userId && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 text-gray-300 hover:text-blue-600 transition-colors"
                                        onClick={() => handleCopy(userId)}
                                    >
                                        {copiedId === userId ? (
                                            <Check className="h-3 w-3 text-green-500" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </Button>
                                )}
                            </div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-2">{t('userEmail')} : {userEmail ? userEmail : "..."}</p>
                        </div>
                    </div>
                    {/* 操作ボタン（戻る/ログアウト） */}
                    <div className="flex items-center gap-2">
                        {/*
                         * ─── ユーザー向け通知ベルボタン ─────────────────────────────────────────
                         * UnifiedChatNotifications はショップとユーザー双方で使い回せる共用コンポーネントです。
                         * ユーザーとして呼び出す際は以下の Props を設定します:
                         *
                         *   participantId:
                         *     "USER#" + userId の形式にします（userId は Cognito の sub 値）。
                         *     バックエンドはこのIDでDynamoDB GSI2 (CHAT_INBOX#USER#xxx) を検索します。
                         *
                         *   apiFetchPost:
                         *     userApi.fetch_post.bind(userApi) を渡します。
                         *     ショップAPIではなくユーザーAPIを使うことで、ユーザー認証トークンが
                         *     リクエストに付与されます。
                         *
                         *   translationNamespace:
                         *     "UserProfilePage" を指定することで、ja.json / en.json の
                         *     UserProfilePage.notifications.* 以下のテキストが使用されます。
                         *
                         *   disabled:
                         *     userId の取得が完了するまで（空文字の間）ボタンを無効化します。
                         *     ユーザーIDなしでAPIを呼ぶと 403 エラーになるため、取得完了を待ちます。
                         * ─────────────────────────────────────────────────────────────────────────
                         */}
                        <UnifiedChatNotifications
                            participantId={`USER#${userId}`}
                            apiFetchPost={userApi.fetch_post.bind(userApi)}
                            translationNamespace="UserProfilePage"
                            buttonVariant="outline"
                            buttonClassName="rounded-full bg-white/50 backdrop-blur-sm border-gray-200 text-gray-600 hover:text-gray-900 shadow-sm"
                            disabled={!userId}
                        />
                        <Button variant="outline" className="rounded-full bg-white/50 backdrop-blur-sm border-gray-200 text-gray-600 hover:text-gray-900 shadow-sm" onClick={() => router.push('/login')}>
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('back')}
                        </Button>
                        <Button variant="outline" className="rounded-full bg-white/50 backdrop-blur-sm border-gray-200 text-gray-600 hover:text-red-600 shadow-sm" onClick={handleLogout}>
                            <LogOut className="w-4 h-4 mr-2" />
                            {t('logout')}
                        </Button>
                    </div>
                </div>

                {/* ナビゲーションカードグリッド */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8">
                    {navItems.map((item, idx) => (
                        <Card
                            key={idx}
                            onClick={() => router.push(item.href)}
                            className={`group cursor-pointer transition-all hover:-translate-y-2 active:scale-95 shadow-xl hover:shadow-2xl border-none bg-white/80 backdrop-blur-xl rounded-[2rem] overflow-hidden`}
                        >
                            <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-6 h-full relative overflow-hidden">
                                {/* インタラクティブな背景装飾 */}
                                <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full ${item.bg} opacity-20 blur-2xl group-hover:scale-150 transition-transform`} />

                                <div className={`p-5 rounded-2xl ${item.bg} shadow-inner transition-transform group-hover:scale-110`}>
                                    <item.icon className={`w-10 h-10 ${item.color}`} />
                                </div>
                                <div className="space-y-2 relative z-10">
                                    <h3 className="text-2xl font-black text-gray-900">{item.title}</h3>
                                    <p className="text-sm text-gray-500 font-medium leading-relaxed max-w-[200px] mx-auto">{item.desc}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </main>
            {/* フッター誘導：ショップ管理機能への切り替え */}
            <div className="flex justify-center p-8 pb-12">
                <Button
                    className="rounded-full px-8 h-12 bg-white/50 backdrop-blur-sm border border-gray-200 text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all font-bold"
                    variant="outline"
                    onClick={handleCreatesop}
                >
                    {t("createMyShop")}
                </Button>
            </div>

            <Dialog open={isShopOpenDialogOpen} onOpenChange={setIsShopOpenDialogOpen}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>{t('shopOpenForm.title')}</DialogTitle>
                        <DialogDescription>
                            {t('shopOpenForm.description')}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmitShopOpening} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="shop-open-name">{t('shopOpenForm.shopNameLabel')}</Label>
                            <Input
                                id="shop-open-name"
                                value={shopOpenShopName}
                                onChange={(e) => setShopOpenShopName(e.target.value)}
                                placeholder={t('shopOpenForm.shopNamePlaceholder')}
                                disabled={isSubmittingShopOpen}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="shop-open-owner">{t('shopOpenForm.ownerNameLabel')}</Label>
                            <Input
                                id="shop-open-owner"
                                value={shopOpenOwnerName}
                                onChange={(e) => setShopOpenOwnerName(e.target.value)}
                                placeholder={t('shopOpenForm.ownerNamePlaceholder')}
                                disabled={isSubmittingShopOpen}
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
                            <p className="text-xs text-gray-500">{t('shopOpenForm.contactEmailFixed')}</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="shop-open-notes">{t('shopOpenForm.notesLabel')}</Label>
                            <Textarea
                                id="shop-open-notes"
                                value={shopOpenNotes}
                                onChange={(e) => setShopOpenNotes(e.target.value)}
                                placeholder={t('shopOpenForm.notesPlaceholder')}
                                disabled={isSubmittingShopOpen}
                            />
                        </div>

                        {shopOpenError && (
                            <p className="text-sm text-red-600 font-medium">{shopOpenError}</p>
                        )}
                        {shopOpenSuccess && (
                            <p className="text-sm text-green-700 font-medium">{shopOpenSuccess}</p>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsShopOpenDialogOpen(false)}
                                disabled={isSubmittingShopOpen}
                            >
                                {t('shopOpenForm.cancel')}
                            </Button>
                            <Button type="submit" disabled={isSubmittingShopOpen}>
                                {isSubmittingShopOpen ? t('shopOpenForm.submitting') : t('shopOpenForm.submit')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
