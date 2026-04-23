/**
 * ファイル概要: ショップ一覧・選択ハブページ (Shop List Hub)
 * 
 * 役割:
 * ログインユーザーに関連付けられた（管理権限を持つ）ショップの一覧を表示します。
 * ショップオーナーや店長が各店舗の管理画面へアクセスするための「玄関口」として機能します。
 * 
 * 仕様:
 * 1. 権限検知: Cognito グループおよびバックエンドの `roles` 配列に基づき、
 *    ユーザーが対象ショップに対して「所有者 (Owner)」か「店長 (GM)」かを判定。
 * 2. UX最適化 (オートリダイレクト): 管理対象ショップが1つのみで、かつシステム管理者
 *    ではない場合、一覧ページをスキップして直接ショップ管理画面へ遷移します。
 * 3. 管理者機能: システム管理者 (Administrators) のみ、新規ショップの作成および
 *    初期所有者/店長の設定が可能なダイアログを表示します。
 * 4. 認証保護: `AuthGuard` (ShopLayout経由) によるセッション確認を必須とし、未ログイン時はログイン画面へ戻します。
 */

'use client';

import { useState, useEffect } from 'react';
import { Link, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useBackendError } from '@/hooks/useBackendError';
import { fetchAuthSession, getCurrentUser, signOut } from 'aws-amplify/auth';
import { RefreshCw, ArrowRight, HelpCircle, Camera, Settings, ShoppingBasket, Eye, Plus, Trash2, Copy, ImageIcon, Save, Loader2, Pencil, ChevronDown, Download, Check, QrCode, Package, Truck, CreditCard, Gift, LogOut } from 'lucide-react';
import { shopApi } from '@/lib/api/shop';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * ショップ一覧ページコンポーネント
 */
export default function ShopListPage() {
    /** 翻訳用フック (ShopListPage namespace) */
    const t = useTranslations('ShopListPage');
    /** エラー翻訳用フック */
    const { translateError } = useBackendError();
    /** ルーターフック (i18n対応版) */
    const router = useRouter();

    // ─── 状態管理 ───
    const [shops, setShops] = useState<any[]>([]);
    const [roles, setRoles] = useState<string[]>([]);
    const [ownerShopIds, setOwnerShopIds] = useState<string[]>([]);
    const [gmShopIds, setGmShopIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [createName, setCreateName] = useState('');
    const [createOwnerId, setCreateOwnerId] = useState('');
    const [createGmId, setCreateGmId] = useState('');
    const [creating, setCreating] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [userId, setUserId] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    /**
     * ユーザーの認証状態と管理者権限を確認します。
     * Cognito グループから 'Administrators' または 'GlobalAdmins' を探します。
     */
    const checkAuth = async () => {
        try {
            const session = await fetchAuthSession();
            if (session.tokens) {
                const groups = (session.tokens.idToken?.payload['cognito:groups'] as string[]) || [];
                const adminStatus = groups.includes('Administrators') || groups.includes('GlobalAdmins');
                setIsAdmin(adminStatus);
                return adminStatus;
            }
        } catch (e) {
            // セッション取得失敗時は権限なしとみなす
        }
        return false;
    };

    /**
     * マウント時にユーザー情報とショップ一覧を取得します。
     */
    useEffect(() => {
        const init = async () => {
            try {
                // セッション確認とユーザーIDの保持 (認証自体は Layout の AuthGuard が保証)
                const user = await getCurrentUser();
                setUserId(user.userId);
                const adminStatus = await checkAuth();
                await fetchShops(adminStatus);
            } catch (e) {
                console.error("Failed to initialize shop hub data:", e);
            }
        };
        init();
    }, []);

    /**
     * ショップ一覧をサーバーから取得します。
     * 1つしかショップがない場合は、UX向上のためそのショップの管理画面へ自動遷移します。
     */
    const fetchShops = async (currentIsAdmin?: boolean) => {
        setLoading(true);
        try {
            const data = await shopApi.shop_list({});
            const shopList = data.shops || [];
            const roles = data.roles || [];
            const owner_shop_ids = data.owner_shop_ids || [];
            const gm_shop_ids = data.gm_shop_ids || [];

            setShops(shopList);
            setRoles(roles);
            setOwnerShopIds(owner_shop_ids);
            setGmShopIds(gm_shop_ids);

            // 初期ロード時は引数、それ以外はステートを参照
            const checkAdmin = currentIsAdmin !== undefined ? currentIsAdmin : isAdmin;

            // ショップ店長（管理者以外）かつ、管理ショップが1つのみの場合、自動リダイレクト
            if (shopList.length === 1 && !checkAdmin) {
                const shopId = shopList[0].id;
                router.replace(`/shop/${shopId}`);
            } else if (shopList.length === 0 && !checkAdmin) {
                router.replace('/login');
            }
        } catch (e) {
            // 取得失敗時の処理（必要に応じてアラート等を追加可）
        } finally {
            setLoading(false);
        }
    };

    /**
     * 新規ショップを作成します (システム管理者のみ)。
     */
    const handleCreateShop = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const data = await adminApi.admin_shop_create({
                name: createName.trim(),
                owner_id: createOwnerId.trim(),
                gm_ids: createGmId ? createGmId.split(';').map(id => id.trim()).filter(Boolean) : undefined
            });

            // 作成完了後は一覧を再取得し、対象ショップへ遷移
            await fetchShops();
            setCreateName('');
            setCreateOpen(false);
            router.push(`/shop/${data.shop_id}`);
        } catch (e: any) {
            console.error(e);
            const errorMessage = (e.message && translateError(e.message, e.detail)) || e.message || 'Error creating shop';
            alert(errorMessage);
        } finally {
            setCreating(false);
        }
    };

    /**
     * サインアウト処理を行います。
     */
    const handleLogout = async () => {
        try {
            await signOut();
            router.push('/');
        } catch (error) {
            // サインアウトエラー時のサイレントキャッチ
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8">
                {/* ヘッダーセクション */}
                <div className="flex justify-between items-center flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:space-x-4">
                    <div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
                            <p className="text-gray-500">{t('subtitle')}</p>
                        </div>
                        {userId && <p className="text-xs text-gray-400 mt-1">{t('userId', { id: userId })}</p>}
                    </div>
                    {/* 操作ボタン群 */}
                    <div className="flex flex-row flex-wrap items-center justify-center mr-0 gap-2">
                        <Button variant="outline" className="text-mist-500 hover:text-mist-800 rounded-full" onClick={() => router.push('/login')}>
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('movetologin')}
                        </Button>
                        <Button variant="ghost" className="text-mist-500 hover:text-mist-800" onClick={handleLogout}>
                            <LogOut className="w-5 h-5 mr-2" />
                            {t('logout')}
                        </Button>
                    </div>
                </div>

                {/* ショップカードグリッド */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-lg border border-dashed">
                            {t('loading')}
                        </div>
                    ) : shops.length === 0 ? (
                        <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-lg border border-dashed">
                            {t('noShops')}
                        </div>
                    ) : (
                        shops.map((shop) => (
                            <Card
                                key={shop.id}
                                className={cn("hover:shadow-lg transition-shadow cursor-pointer border", gmShopIds.includes(shop.id) ? "bg-mist-300/20" : "bg-orange-300/20")}
                                onClick={() => router.push(`/shop/${shop.id}`)}
                            >
                                <CardHeader>
                                    <CardTitle>{shop.name}</CardTitle>
                                    <CardDescription>{t('created', { date: new Date(shop.ts_created_at).toLocaleString() })}</CardDescription>
                                    {/* 権限バッジのテキスト表示 */}
                                    <div className="text-xs font-semibold mt-1">
                                        {gmShopIds.includes(shop.id) ? t('gm') : t('owner')}
                                    </div>
                                </CardHeader>
                                {/* <CardFooter>
                                    <Button className="w-full" variant="secondary" asChild>
                                        <div>{t('manageShop')}</div>
                                    </Button>
                                </CardFooter> */}
                            </Card>
                        ))
                    )}

                    {/* 新規ショップ作成ボタン (システム管理者のみ表示) */}
                    {isAdmin && (
                        <div className="flex w-full h-full flex-col sm:flex-row sm:items-center sm:justify-between sm:space-y-0 min-h-30">
                            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                                <DialogTrigger asChild className="flex w-full h-full">
                                    <Button size="lg" className="text-xs md:text-sm rounded-xl" >{t('createShop')}</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>{t('createDialog.title')}</DialogTitle>
                                        <DialogDescription>{t('createDialog.description')}</DialogDescription>
                                    </DialogHeader>
                                    {/* 作成フォーム */}
                                    <form onSubmit={handleCreateShop}>
                                        <div className="grid gap-4 py-4">
                                            <Label htmlFor="name">{t('createDialog.label')}</Label>
                                            <Input
                                                id="name"
                                                value={createName}
                                                onChange={(e) => setCreateName(e.target.value)}
                                                placeholder={t('createDialog.placeholder')}
                                                required
                                            />

                                            <Label htmlFor="ownerId">{t('createDialog.label-owner')}</Label>
                                            <div className="flex flex-wrap items-center space-x-2">
                                                <Switch
                                                    id="ownerId_isMe"
                                                    checked={createOwnerId === userId}
                                                    onCheckedChange={(checked) => setCreateOwnerId(checked ? userId : '')}
                                                />
                                                <Label htmlFor="ownerId_isMe" className="text-xs">{t('createDialog.label-owner-isMe')}</Label>
                                            </div>
                                            <Input
                                                id="ownerId"
                                                value={createOwnerId}
                                                onChange={(e) => setCreateOwnerId(e.target.value)}
                                                placeholder={t('createDialog.placeholder-owner')}
                                                required
                                            />

                                            <Label htmlFor="gmId">{t('createDialog.label-gm')}</Label>
                                            <div className="flex flex-wrap items-center space-x-2">
                                                <Switch
                                                    id="gmId_isMe"
                                                    disabled={createOwnerId === userId}
                                                    checked={createGmId === userId}
                                                    onCheckedChange={(checked) => setCreateGmId(checked && createOwnerId !== userId ? userId : '')}
                                                />
                                                <Label htmlFor="gmId_isMe" className="text-xs">{t('createDialog.label-gm-isMe')}</Label>
                                            </div>
                                            <Input
                                                id="gmId"
                                                value={createOwnerId === userId ? '' : createGmId}
                                                onChange={(e) => setCreateGmId(e.target.value)}
                                                placeholder={t('createDialog.placeholder-gm')}
                                            />
                                        </div>
                                        <DialogFooter>
                                            <Button type="submit" disabled={creating}>
                                                {creating ? t('createDialog.submitting') : t('createDialog.submit')}
                                            </Button>
                                        </DialogFooter>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
