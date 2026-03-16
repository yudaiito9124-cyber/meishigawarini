/**
 * ファイル概要: ショップ一覧・選択ページ
 * 目的: ログインユーザーが管理するショップの一覧を表示し、新規ショップの作成や各ショップの管理画面への遷移を提供します。
 */
'use client';

import { useState, useEffect } from 'react';
import { Link, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { fetchAuthSession, getCurrentUser, signOut } from 'aws-amplify/auth';
import { fetchWithAuth } from '@/app/utils/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export default function ShopListPage() {
    const t = useTranslations('ShopListPage');
    const tb = useTranslations('Backend');
    const router = useRouter();
    const [shops, setShops] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [createName, setCreateName] = useState('');
    const [createOwnerId, setCreateOwnerId] = useState('');
    const [createGmId, setCreateGmId] = useState('');
    const [creating, setCreating] = useState(false);
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
            const res = await fetchWithAuth('/shop');
            if (res.ok) {
                const data = await res.json();
                const shopList = data.shops || [];
                setShops(shopList);

                // Use currentIsAdmin if passed (for initial load), otherwise use state
                const checkAdmin = currentIsAdmin !== undefined ? currentIsAdmin : isAdmin;

                // Auto-redirect if SHOP_MANAGER and has exactly one shop
                if (shopList.length === 1 && !checkAdmin) {
                    const shopId = shopList[0].id;
                    router.replace(`/shop/${shopId}`);
                }
            } else {
                // console.error('Failed to fetch shop');
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
            const res = await fetchWithAuth('/shop', {
                method: 'POST',
                body: JSON.stringify({ name: createName.trim(), owner_id: createOwnerId.trim(), gm_ids: createGmId.split(';').map(id => id.trim()) })
            });

            if (res.ok) {
                const data = await res.json();
                // Redirect to the new shop
                router.push(`/shop/${data.shop_id}`);
            } else {
                const errData = await res.json().catch(() => null);
                const errorMessage = (errData?.message && tb(errData.message)) || errData?.message || 'Failed to create shop';
                console.error('Create Shop Failed:', errData);
                alert(errorMessage);
            }
        } catch (e) {
            console.error(e);
            alert('Error creating shop');
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
                        {isAdmin && (
                            <Link href="/login">
                                <Button variant="destructive" className="shadow-md cursor-pointer border border-red-900">
                                    {t('qrAdminLoginPage')}
                                </Button>
                            </Link>
                        )}
                        <Button variant="ghost" size="lg" className="hover:bg-red-50 hover:text-red-600 cursor-pointer" onClick={handleLogout}>{t('logout')}</Button>
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
                            <Card key={shop.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push(`/shop/${shop.id}`)}>
                                <CardHeader>
                                    <CardTitle>{shop.name}</CardTitle>
                                    <CardDescription>{t('created', { date: new Date(shop.ts_created_at).toLocaleString() })}</CardDescription>
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
                            <Dialog>
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
                                                required
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
