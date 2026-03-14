/**
 * ファイル概要: ショップ一覧・選択ページ
 * 目的: ログインユーザーが管理するショップの一覧を表示し、新規ショップの作成や各ショップの管理画面への遷移を提供します。
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import { fetchWithAuth } from '@/app/utils/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function ShopListPage() {
    const t = useTranslations('ShopListPage');
    const router = useRouter();
    const [shops, setShops] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [createName, setCreateName] = useState('');
    const [creating, setCreating] = useState(false);
    const [userId, setUserId] = useState('');

    useEffect(() => {
        const init = async () => {
            try {
                // Check session
                const user = await getCurrentUser();
                setUserId(user.userId);
                fetchShops();
            } catch (e) {
                router.push('/login');
            }
        };
        init();
    }, []);

    const fetchShops = async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth('/shop');
            if (res.ok) {
                const data = await res.json();
                const shopList = data.shops || [];
                setShops(shopList);

                // Auto-redirect if SHOP_MANAGER and has exactly one shop
                if (shopList.length === 1) {
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
                <div className="flex justify-between items-center flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                    <div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
                            <p className="text-gray-500">{t('subtitle')}</p>
                        </div>
                        {userId && <p className="text-xs text-gray-400 mt-1">{t('userId', { id: userId })}</p>}
                    </div>
                    <Button variant="outline" size="lg" className="text-xs md:text-sm" onClick={handleLogout}>{t('logout')}</Button>
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
                </div>

            </div>
        </div>
    );
}
