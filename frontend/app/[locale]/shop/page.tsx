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
                setShops(data.shops || []);
            } else {
                console.error('Failed to fetch shop');
            }
        } catch (e) {
            console.error(e);
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
                body: JSON.stringify({ name: createName })
            });

            if (res.ok) {
                const data = await res.json();
                // Redirect to the new shop
                router.push(`/shop/${data.shop_id}`);
            } else {
                const text = await res.text();
                console.error('Create Shop Failed:', text);
                alert(`Failed to create shop: ${text}`);
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
            console.error('Error signing out: ', error);
        }
    };

    if (loading) return <div className="p-8">{t('loading')}</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
                        <p className="text-gray-500">{t('subtitle')}</p>
                        {userId && <p className="text-xs text-gray-400 mt-1">{t('userId', { id: userId })}</p>}
                    </div>
                    <div className="flex gap-4">
                        <Button variant="outline" size="lg" onClick={handleLogout}>{t('logout')}</Button>
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button size="lg">{t('createShop')}</Button>
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {shops.length === 0 ? (
                        <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-lg border border-dashed">
                            {t('noShops')}
                        </div>
                    ) : (
                        shops.map((shop) => (
                            <Card key={shop.PK} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push(`/shop/${shop.PK.replace('SHOP#', '')}`)}>
                                <CardHeader>
                                    <CardTitle>{shop.name}</CardTitle>
                                    <CardDescription>{t('created', { date: new Date(shop.ts_created_at).toLocaleString() })}</CardDescription>
                                </CardHeader>
                                {/* <CardContent>
                                    <div className="h-24 bg-gray-100 rounded flex items-center justify-center text-gray-400">
                                        Shop Logo / Image
                                    </div>
                                </CardContent> */}
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
