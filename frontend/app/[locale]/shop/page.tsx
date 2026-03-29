/**
 * ファイル概要: ショップ一覧・選択ページ
 * 目的: ログインユーザーが管理するショップの一覧を表示し、新規ショップの作成や各ショップの管理画面への遷移を提供します。
 */
'use client';

import { useState, useEffect } from 'react';
import { Link, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { fetchAuthSession, getCurrentUser, signOut } from 'aws-amplify/auth';
import { RefreshCw, ArrowRight, HelpCircle, Camera, Settings, ShoppingBasket, Eye, Plus, Trash2, Copy, ImageIcon, Save, Loader2, Pencil, ChevronDown, Download, Check, QrCode, Package, Truck, CreditCard, Gift, LogOut } from 'lucide-react';
import { Badge } from "lucide-react";
import { shopApi } from '@/lib/api/shop';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export default function ShopListPage() {
    const t = useTranslations('ShopListPage');
    const tb = useTranslations('Backend');
    const router = useRouter();
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
        }
        return false;
    };

    useEffect(() => {
        const init = async () => {
            try {
                // Check session
                const user = await getCurrentUser();
                setUserId(user.userId);
                const adminStatus = await checkAuth();
                await fetchShops(adminStatus);
            } catch (e) {
                router.push('/login');
            }
        };
        init();
    }, []);

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

            // Use currentIsAdmin if passed (for initial load), otherwise use state
            const checkAdmin = currentIsAdmin !== undefined ? currentIsAdmin : isAdmin;

            // Auto-redirect if SHOP_MANAGER and has exactly one shop
            if (shopList.length === 1 && !checkAdmin) {
                const shopId = shopList[0].id;
                router.replace(`/shop/${shopId}`);
            }
        } catch (e) {
            // console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateShop = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const data = await adminApi.admin_shop_create({
                name: createName.trim(),
                owner_id: createOwnerId.trim(),
                gm_ids: createGmId ? createGmId.split(';').map(id => id.trim()).filter(Boolean) : undefined
            });
            // Refresh the list instead of immediate redirect to avoid eventual consistency issues
            await fetchShops();
            setCreateName('');
            setCreateOpen(false);
            router.push(`/shop/${data.shop_id}`);
        } catch (e: any) {
            console.error(e);
            const errorMessage = (e.message && tb(e.message)) || e.message || 'Error creating shop';
            alert(errorMessage);
        } finally {
            setCreating(false);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut();
            router.push('/');
        } catch (error) {
            // console.error('Error signing out: ', error);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8">
                <div className="flex justify-between items-center flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:space-x-4">
                    <div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
                            <p className="text-gray-500">{t('subtitle')}</p>
                        </div>
                        {userId && <p className="text-xs text-gray-400 mt-1">{t('userId', { id: userId })}</p>}
                    </div>
                    <div className="flex flex-row flex-wrap items-center justify-center mr-0">
                        <Button variant="ghost" className="text-mist-500 hover:text-mist-800" onClick={() => router.push('/login')}>
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('movetologin')}
                        </Button>
                        <Button variant="ghost" className="text-mist-500 hover:text-mist-800" onClick={handleLogout}>
                            <LogOut className="w-5 h-5 mr-2" />
                            {t('logout')}
                        </Button>
                    </div>
                </div>

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
                            <Card key={shop.id} className={cn("hover:shadow-lg transition-shadow cursor-pointer border", gmShopIds.includes(shop.id) && "bg-orange-500/20")} onClick={() => router.push(`/shop/${shop.id}`)}>
                                <CardHeader>
                                    <CardTitle>{shop.name}</CardTitle>
                                    <CardDescription>{t('created', { date: new Date(shop.ts_created_at).toLocaleString() })}</CardDescription>
                                    {gmShopIds.includes(shop.id) ? t('gm') : t('owner')}
                                </CardHeader>
                                <CardFooter>
                                    <Button className="w-full" variant="secondary" asChild>
                                        <div>{t('manageShop')}</div>
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))
                    )}
                    {isAdmin && (

                        <div className="flex w-full h-full flex-col sm:flex-row sm:items-center sm:justify-between sm:space-y-0 min-h-40">
                            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                                <DialogTrigger asChild className="flex w-full h-full">
                                    <Button size="lg" className="text-xs md:text-sm" >{t('createShop')}</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>{t('createDialog.title')}</DialogTitle>
                                        <DialogDescription>{t('createDialog.description')}</DialogDescription>
                                    </DialogHeader>
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
