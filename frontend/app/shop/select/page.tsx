'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAuthSession } from 'aws-amplify/auth';
import { fetchWithAuth } from '@/app/utils/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function ShopSelectPage() {
    const router = useRouter();
    const [shops, setShops] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [createName, setCreateName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        const init = async () => {
            try {
                // Check session
                await fetchAuthSession();
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
            const res = await fetchWithAuth('/shops');
            if (res.ok) {
                const data = await res.json();
                setShops(data.shops || []);
            } else {
                console.error('Failed to fetch shops');
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
            const res = await fetchWithAuth('/shops', {
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

    if (loading) return <div className="p-8 flex justify-center">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">My Shops</h1>
                        <p className="text-gray-500">Select a shop to manage or create a new one.</p>
                    </div>
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button size="lg">Create New Shop</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create Shop</DialogTitle>
                                <DialogDescription>Enter the name of your new shop.</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateShop}>
                                <div className="grid gap-4 py-4">
                                    <Label htmlFor="name">Shop Name</Label>
                                    <Input
                                        id="name"
                                        value={createName}
                                        onChange={(e) => setCreateName(e.target.value)}
                                        placeholder="My Awesome Shop"
                                        required
                                    />
                                </div>
                                <DialogFooter>
                                    <Button type="submit" disabled={creating}>
                                        {creating ? 'Creating...' : 'Create'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {shops.length === 0 ? (
                        <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-lg border border-dashed">
                            No shops found. Create one to get started!
                        </div>
                    ) : (
                        shops.map((shop) => (
                            <Card key={shop.PK} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push(`/shop/${shop.PK.replace('SHOP#', '')}`)}>
                                <CardHeader>
                                    <CardTitle>{shop.name}</CardTitle>
                                    <CardDescription>Created: {new Date(shop.created_at).toLocaleDateString()}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-24 bg-gray-100 rounded flex items-center justify-center text-gray-400">
                                        Shop Logo / Image
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button className="w-full" variant="secondary">Manage Shop</Button>
                                </CardFooter>
                            </Card>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
