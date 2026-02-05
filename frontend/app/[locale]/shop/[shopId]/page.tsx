'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, ArrowRight, HelpCircle } from 'lucide-react';
import { notFound, useParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { getCurrentUser } from 'aws-amplify/auth';
import { fetchWithAuth } from '@/app/utils/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import QRScanner from '@/components/ui/qr-scanner';
import { APP_CONFIG } from '@/lib/config';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// --- Effects ---
export default function ShopPage() {
    const t = useTranslations('ShopPage');
    const ts = useTranslations('Timestamp');
    const st = useTranslations('Status');
    const params = useParams();
    const router = useRouter();
    const shopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId;

    const [shop, setShop] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [qrCodes, setQrCodes] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

    // Protect Route
    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            await getCurrentUser();
            // If successful, proceed to load data
        } catch (e) {
            router.push('/login');
        }
    };

    useEffect(() => {
        if (shopId) {
            fetchShopData();
        }
    }, [shopId]);

    const fetchShopData = async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        // setLoading(true); // Don't block UI on refresh
        try {
            // 1. Get Shop Details
            const shopRes = await fetchWithAuth(`/shop/${shopId}`);
            if (!shopRes.ok) throw new Error('Failed to fetch shop');
            const shopData = await shopRes.json();
            setShop(shopData);

            // 2. Get Products
            const prodRes = await fetchWithAuth(`/shop/${shopId}/products`);
            if (prodRes.ok) {
                const prodData = await prodRes.json();
                setProducts(prodData.products || prodData.items || []);
            }

            // 3. Get QR Codes
            const qrRes = await fetchWithAuth(`/shop/${shopId}/qrcodes`);
            if (qrRes.ok) {
                const qrData = await qrRes.json();
                setQrCodes(qrData.items || []);
            }

            // 4. Get Orders
            const orderRes = await fetchWithAuth(`/shop/${shopId}/orders`);
            if (orderRes.ok) {
                const orderData = await orderRes.json();
                setOrders(orderData.orders || orderData.items || []); // robust check
            }

        } catch (err: any) {
            // console.error(err);
            if (err.message === 'Unauthorized') {
                router.push('/login');
                return;
            }
            if (err.message === 'Failed to fetch shop') {
                router.push('/login');
                return;
            }
            setError(err.message);
        } finally {
            setLoading(false);
            if (refresh) setIsRefreshing(false);
            // router.push('/login')
        }
    };

    const handleShops = async () => {
        try {
            router.push('/shop');
        } catch (error) {
            console.error('Error move to shops: ', error);
        }
    };

    const resizeImage = (file: File): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject('No context');

                // Target dimensions: 16:9 (1280x720)
                const TARGET_WIDTH = 1280;
                const TARGET_HEIGHT = 720;

                canvas.width = TARGET_WIDTH;
                canvas.height = TARGET_HEIGHT;

                // Fill white background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

                // Calculate Scale for Contain (Fit within box, maintaining aspect ratio)
                const scale = Math.min(TARGET_WIDTH / img.width, TARGET_HEIGHT / img.height);
                const dWidth = img.width * scale;
                const dHeight = img.height * scale;

                const dx = (TARGET_WIDTH - dWidth) / 2;
                const dy = (TARGET_HEIGHT - dHeight) / 2;

                // Draw
                ctx.drawImage(img, dx, dy, dWidth, dHeight);

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject('Canvas to Blob failed');
                }, file.type, 0.9);
            };
            img.onerror = reject;
        });
    };

    const handleCreateProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const file = formData.get('image') as File;

        try {
            let imageUrl = 'https://placehold.co/1280x720?text=No+Image';

            // 1. Upload Image if exists
            if (file && file.size > 0) {
                // Resize Image
                const resizedBlob = await resizeImage(file);

                // 2. Rename (simple random string)
                const ext = file.name.split('.').pop();
                const randomName = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7);
                const filename = `${randomName}.${ext}`;

                // Cast Blob back to File-like object if necessary, or just use blob body
                const resizedFile = new File([resizedBlob], filename, { type: file.type });

                // Get Presigned URL
                const uploadRes = await fetchWithAuth(`/shop/${shopId}/products/upload-url`, {
                    method: 'POST',
                    body: JSON.stringify({
                        filename: resizedFile.name,
                        contentType: resizedFile.type
                    })
                });
                if (!uploadRes.ok) throw new Error('Failed to get upload URL');
                const { uploadUrl, publicUrl } = await uploadRes.json();

                // Upload to S3 (No Auth Header for S3 direct upload)
                const s3Res = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': resizedFile.type
                    },
                    body: resizedFile
                });
                if (!s3Res.ok) throw new Error('Failed to upload image to S3');

                imageUrl = publicUrl;
            }

            // 2. Create Product
            const res = await fetchWithAuth(`/shop/${shopId}/products`, {
                method: 'POST',
                body: JSON.stringify({
                    name: formData.get('name'),
                    description: formData.get('description'),
                    price: Number(formData.get('price')),
                    valid_days: formData.get('valid_days'),
                    image_url: imageUrl,
                    status: 'ACTIVE'
                })
            });

            if (res.ok) {
                alert("Product created!");
                form.reset();
                fetchShopData(); // Refresh
            } else {
                alert('Failed to create product');
            }
        } catch (err) {
            console.error(err);
            alert('Error creating product');
        }
    };

    const handleLinkQr = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const uuid = formData.get('uuid') as string;
        const productId = formData.get('product_id') as string;
        const memo_for_users = formData.get('memo_for_users') as string;
        const memo_for_shop = formData.get('memo_for_shop') as string;

        try {
            // Atomic Link & Activate
            const body: any = {
                qr_id: uuid,
                product_id: productId,
                activate_now: true,
            };
            if (memo_for_users) body.memo_for_users = memo_for_users;
            if (memo_for_shop) body.memo_for_shop = memo_for_shop;

            const res = await fetchWithAuth(`/shop/${shopId}/link`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to link and activate');
            }

            alert(t('linkQr.success'));
            form.reset();
            setScannedUuid(''); // Reset state driven input
            fetchShopData();
        } catch (err: any) {
            alert("Error: " + err.message);
        }
    };

    const handleDeleteProduct = async (productId: string, productName: string) => {
        if (!confirm(t('product.deleteConfirm', { name: productName }))) return;

        try {
            const res = await fetchWithAuth(`/shop/${shopId}/products/${productId}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Failed to delete');
            }
            fetchShopData();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleToggleStatus = async (productId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'ACTIVE' ? 'STOPPED' : 'ACTIVE';
        try {
            const res = await fetchWithAuth(`/shop/${shopId}/products/${productId}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) fetchShopData();
        } catch (e) { console.error(e); }
    };

    const handleShipOrder = async (qrId: string, deliveryCompany: string, trackingNumber: string, memoForUsers?: string, memoForShop?: string) => {
        try {
            const body: any = { delivery_company: deliveryCompany, tracking_number: trackingNumber, memo_for_users: "", memo_for_shop: "" };
            if (memoForUsers !== undefined) body.memo_for_users = memoForUsers;
            if (memoForShop !== undefined) body.memo_for_shop = memoForShop;

            const res = await fetchWithAuth(`/shop/${shopId}/orders/${qrId}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });
            if (res.ok) {
                fetchShopData();
            } else {
                const errData = await res.json().catch(() => ({}));
                alert('Failed to ship order: ' + (errData.message || errData.error || 'Unknown error'));
            }
        } catch (e: any) {
            console.error(e);
            alert('Error shipping order: ' + (e.message || String(e)));
        }
    };

    const [isScanning, setIsScanning] = useState(false);
    const [scannedUuid, setScannedUuid] = useState('');

    const handleScanSuccess = (decodedText: string) => {
        // Assuming decodedText is the UUID or a URL containing the UUID
        // If it's a URL like https://.../r/UUID, extract UUID.
        // For now assume raw UUID or simple parsing.
        let uuid = decodedText;
        if (decodedText.includes('/')) {
            uuid = decodedText.split('/').pop() || decodedText;
        }
        setScannedUuid(uuid);
        setIsScanning(false);
    };

    if (loading) return <div className="p-8">{t('loading')}</div>;
    if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            {/* Header */}
            <div className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{shop?.name || t('title')}</h1>
                        <p className="text-sm text-gray-500">{t('shopId', { id: String(shopId || '') })}</p>
                    </div>
                    <Button variant="outline" size="lg" onClick={handleShops}>{t('movetoshops')}</Button>
                </div>

            </div>



            <div className="max-w-7xl mx-auto px-4 py-10 space-y-10">

                <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
                    {/* Create Product
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('addProduct.title')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleCreateProduct} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">{t('addProduct.name')}</Label>
                                    <Input id="name" name="name" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">{t('addProduct.description')}</Label>
                                    <Input id="description" name="description" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="price">{t('addProduct.price')}</Label>
                                    <Input id="price" name="price" type="number" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="image">{t('addProduct.image')}</Label>
                                    <Input id="image" name="image" type="file" accept="image/*" />
                                </div>
                                <Button type="submit" className="w-full">{t('addProduct.submit')}</Button>
                            </form>
                        </CardContent>
                    </Card> */}

                    {/* Link QR */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('linkQr.title')}</CardTitle>
                            <CardDescription>{t('linkQr.description')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleLinkQr} className="space-y-4">
                                <div className="flex gap-4">
                                    <div className="flex-[7] space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="uuid">{t('linkQr.uuidLabel')}</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    id="uuid"
                                                    name="uuid"
                                                    placeholder={t('linkQr.placeholder')}
                                                    required
                                                    value={scannedUuid}
                                                    onChange={(e) => setScannedUuid(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="product_id">{t('linkQr.selectProduct')}</Label>
                                            <select id="product_id" name="product_id" className="w-full p-2 border rounded-md" required>
                                                <option value="">{t('linkQr.selectPlaceholder')}</option>
                                                {products.filter(p => p.status === 'ACTIVE').map(p => (
                                                    <option key={p.product_id} value={p.product_id}>{p.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="memo_for_users">{t('linkQr.memoForUsersLabel')}</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    id="memo_for_users"
                                                    name="memo_for_users"
                                                    placeholder={t('linkQr.memoForUsersPlaceholder')}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="memo_for_shop">{t('linkQr.memoForShopLabel')}</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    id="memo_for_shop"
                                                    name="memo_for_shop"
                                                    placeholder={t('linkQr.memoForShopPlaceholder')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-[3] flex mt-5">
                                        <Dialog open={isScanning} onOpenChange={setIsScanning}>
                                            <DialogTrigger asChild>
                                                <Button type="button" variant="secondary" className="flex-[3] h-auto flex flex-col gap-2 text-xl">
                                                    <span>📷</span>
                                                    <span>{t('linkQr.scan')}</span>
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>{t('linkQr.scanDialog.title')}</DialogTitle>
                                                    <DialogDescription>{t('linkQr.scanDialog.description')}</DialogDescription>
                                                </DialogHeader>
                                                <div className="p-4 min-h-[300px]">
                                                    <QRScanner
                                                        qrCodeSuccessCallback={handleScanSuccess}
                                                        qrbox={250}
                                                        disableFlip={false}
                                                    />
                                                </div>
                                                <DialogFooter>
                                                    <Button type="button" variant="ghost" onClick={() => setIsScanning(false)}>{t('linkQr.scanDialog.cancel')}</Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </div>
                                <Button type="submit" className="w-full h-12 space-y-3">{t('linkQr.submit')}</Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>

                {/* Incoming Orders */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>{t('incomingOrders')}</CardTitle>
                                <CardDescription>{t('ordersDesc')}</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => fetchShopData(true)} disabled={isRefreshing}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                {t('refresh')}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('orders.date')}</TableHead>
                                    <TableHead>{t('orders.productName')}</TableHead>
                                    <TableHead>{t('orders.status')}</TableHead>
                                    <TableHead>{t('orders.shopMemo')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.filter(o => ['LINKED', 'ACTIVE', 'USED', 'SHIPPED'].includes(o.status)).length === 0 ? (
                                    <TableRow><TableCell colSpan={3} className="text-center">{t('orders.noOrders')}</TableCell></TableRow>
                                ) : (
                                    orders
                                        .filter(o => ['LINKED', 'ACTIVE', 'USED', 'SHIPPED'].includes(o.status))
                                        .sort((a, b) => {
                                            const sortorder: { [name: string]: number } = { 'LINKED': 0, 'ACTIVE': 1, 'USED': 2, 'SHIPPED': 3 };
                                            // 1. Status: compare
                                            if (a.status !== b.status) return sortorder[a.status] - sortorder[b.status];
                                            // 2. Date: Newest first
                                            const dateA = new Date(a.ts_updated_at || a.ts_created_at).getTime();
                                            const dateB = new Date(b.ts_updated_at || b.ts_created_at).getTime();
                                            return dateB - dateA;
                                        })
                                        .map((order: any) => {
                                            const product = products.find(p => p.product_id === order.product_id);
                                            const uuid = order.id || order.qr_id.replace('QR#', '');

                                            return (
                                                <Dialog key={order.qr_id}>
                                                    <DialogTrigger asChild>
                                                        <TableRow className="cursor-pointer hover:bg-gray-100">
                                                            <TableCell>{order.ts_updated_at ? new Date(order.ts_updated_at).toLocaleString() : "-"}</TableCell>
                                                            <TableCell className="font-medium">{product?.name || order.product_id}</TableCell>
                                                            <TableCell>
                                                                <span className={`px-2 py-1 rounded text-xs ${order.status === 'UNASSIGNED' ? 'bg-gray-100' :
                                                                    order.status === 'LINKED' ? 'bg-emerald-100 text-emerald-800' :
                                                                        order.status === 'ACTIVE' ? 'bg-yellow-100 text-yellow-800' :
                                                                            order.status === 'USED' ? 'bg-orange-100 text-orange-800' :
                                                                                order.status === 'SHIPPED' ? 'bg-indigo-100 text-indigo-800' :
                                                                                    order.status === 'COMPLETED' ? 'bg-purple-100 text-purple-800' :
                                                                                        order.status === 'EXPIRED' ? 'bg-gray-100 text-gray-800' :
                                                                                            order.status === 'BANNED' ? 'bg-red-100 text-red-800' :
                                                                                                'bg-green-100 text-green-800'
                                                                    }`}>{st(order.status.toLowerCase())}</span>
                                                            </TableCell>
                                                            <TableCell className="font-medium">{order.memo_for_shop}</TableCell>
                                                        </TableRow>
                                                    </DialogTrigger>
                                                    <DialogContent className="max-w-md">
                                                        <DialogHeader>
                                                            <DialogTitle>{t('orders.details')}</DialogTitle>
                                                            <DialogDescription className="font-mono text-xs text-gray-500">
                                                                ID: {uuid}
                                                            </DialogDescription>
                                                        </DialogHeader>

                                                        <div className="space-y-4 py-4">
                                                            {/* Product Info */}
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.productName')}</h4>
                                                                <p className="font-medium">{product?.name || order.product_id}</p>
                                                            </div>

                                                            {/* Status */}
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.status')}</h4>

                                                                <span className={`px-2 py-1 rounded text-xs ${order.status === 'UNASSIGNED' ? 'bg-gray-100' :
                                                                    order.status === 'LINKED' ? 'bg-emerald-100 text-emerald-800' :
                                                                        order.status === 'ACTIVE' ? 'bg-yellow-100 text-yellow-800' :
                                                                            order.status === 'USED' ? 'bg-orange-100 text-orange-800' :
                                                                                order.status === 'SHIPPED' ? 'bg-indigo-100 text-indigo-800' :
                                                                                    order.status === 'COMPLETED' ? 'bg-purple-100 text-purple-800' :
                                                                                        order.status === 'EXPIRED' ? 'bg-gray-100 text-gray-800' :
                                                                                            order.status === 'BANNED' ? 'bg-red-100 text-red-800' :
                                                                                                'bg-green-100 text-green-800'
                                                                    }`}>{st(order.status.toLowerCase())}</span>
                                                            </div>

                                                            {/* Recipient Info */}
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <h4 className="text-sm font-semibold text-gray-500">{t('orders.recipient')}</h4>
                                                                    <p>{order.recipient_name}</p>
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.address')}</h4>
                                                                {order.postal_code && <p className="text-sm">〒{order.postal_code}</p>}
                                                                <p className="whitespace-pre-wrap text-sm">{order.address}</p>
                                                                {order.shipping_info?.phone && <p className="text-sm mt-1">{order.shipping_info.phone}</p>}
                                                            </div>

                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.userMessage')}</h4>
                                                                <p className="text-sm bg-gray-50 p-2 rounded">{order.memo_for_users || '-'}</p>
                                                            </div>
                                                            {/* )}
                                                                    {order.memo_for_shop && ( */}
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.shopMemo')}</h4>
                                                                <p className="text-sm bg-orange-50 p-2 rounded">{order.memo_for_shop || '-'}</p>
                                                            </div>

                                                            {/* Memos (if available) - Assuming these fields might exist on order object or shipping_info */}
                                                            {/* These are now handled within the shipping form for 'USED' status and read-only for 'SHIPPED' */}
                                                            {order.status === 'USED' && (
                                                                <div className="pt-4 border-t">
                                                                    <h4 className="text-sm font-bold mb-2">{t('orders.action')}</h4>
                                                                    <form onSubmit={(e) => {
                                                                        e.preventDefault();
                                                                        const fd = new FormData(e.target as HTMLFormElement);
                                                                        handleShipOrder(
                                                                            uuid,
                                                                            fd.get('delivery_company') as string,
                                                                            fd.get('tracking') as string,
                                                                            fd.get('memo_for_users') as string,
                                                                            fd.get('memo_for_shop') as string
                                                                        );
                                                                    }} className="space-y-4">
                                                                        <div className="space-y-2">
                                                                            <Label htmlFor={`memo_users-${uuid}`}>{t('orders.userMessage')}</Label>
                                                                            <Input id={`memo_users-${uuid}`} name="memo_for_users" defaultValue={order.memo_for_users} placeholder={t('linkQr.memoForUsersPlaceholder')} />
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <Label htmlFor={`memo_shop-${uuid}`}>{t('orders.shopMemo')}</Label>
                                                                            <Input id={`memo_shop-${uuid}`} name="memo_for_shop" defaultValue={order.memo_for_shop} placeholder={t('linkQr.memoForShopPlaceholder')} />
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <Label htmlFor={`delivery_company-${uuid}`}>{t('orders.shipDialog.deliveryCompany')}</Label>
                                                                            <Input id={`delivery_company-${uuid}`} name="delivery_company" placeholder="〇〇運輸" required />
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <Label htmlFor={`tracking-${uuid}`}>{t('orders.shipDialog.label')}</Label>
                                                                            <Input id={`tracking-${uuid}`} name="tracking" placeholder="1234-5678..." required />
                                                                        </div>
                                                                        <Button type="submit" className="w-full">{t('orders.shipDialog.submit')}</Button>
                                                                    </form>
                                                                </div>
                                                            )}
                                                            {order.status !== 'USED' && (
                                                                <div className="pt-2 space-y-4">
                                                                    <div>
                                                                        <h4 className="text-sm font-semibold text-gray-500">{t('orders.shipDialog.deliveryCompany')}</h4>
                                                                        <p className="font-mono">{order.delivery_company || '-'}</p>
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="text-sm font-semibold text-gray-500">{t('orders.shipDialog.label')}</h4>
                                                                        <p className="font-mono">{order.tracking_number || '-'}</p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <h4 className="text-sm font-semibold text-gray-500">{t('orders.timestamps')}</h4>
                                                                    <p className="text-sm">{ts('ts_updated_at') + ": " + (order.ts_updated_at ? new Date(order.ts_updated_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_linked_at') + ": " + (order.ts_linked_at ? new Date(order.ts_linked_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_activated_at') + ": " + (order.ts_activated_at ? new Date(order.ts_activated_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_submitted_at') + ": " + (order.ts_submitted_at ? new Date(order.ts_submitted_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_shipped_at') + ": " + (order.ts_shipped_at ? new Date(order.ts_shipped_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_completed_at') + ": " + (order.ts_completed_at ? new Date(order.ts_completed_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_expired_at') + ": " + (order.ts_expired_at ? new Date(order.ts_expired_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_banned_at') + ": " + (order.ts_banned_at ? new Date(order.ts_banned_at).toLocaleString() : "-")}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </DialogContent>
                                                </Dialog>
                                            );
                                        })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Existing Products */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('products')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {products.map((product) => (
                                <Card key={product.product_id} className="overflow-hidden">
                                    <div className="w-full relative aspect-[16/9]">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                        <div className="absolute top-2 right-2 flex gap-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${product.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {product.status}
                                            </span>
                                        </div>
                                    </div>
                                    <CardHeader className="px-3 pt-2 pb-1">
                                        <CardTitle className="text-base truncate" title={product.name}>{product.name}</CardTitle>
                                        <CardDescription className="line-clamp-1 text-xs">{product.description}</CardDescription>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {t('addProduct.validDays')}: {product.valid_days ? product.valid_days : APP_CONFIG.DEFAULT_VALID_DAYS}日
                                        </p>
                                    </CardHeader>
                                    <CardContent className="px-3 pb-2 pt-0 flex justify-between items-center">
                                        <span className="font-bold text-sm">¥{product.price ? Number(product.price).toLocaleString("ja-JP") : "0"}</span>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => handleToggleStatus(product.product_id, product.status)}>
                                                {product.status === 'ACTIVE' ? t('product.stop') : t('product.activate')}
                                            </Button>
                                            {product.status !== 'ACTIVE' && (
                                                <Button variant="destructive" size="sm" className="h-7 text-xs px-2" onClick={() => handleDeleteProduct(product.product_id, product.name)}>
                                                    {t('product.delete')}
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            <Card className="col-span-2 sm:col-span-2 md:col-span-3 lg:col-span-4 ml-16 mr-16 mt-24 mb-8">
                                <CardHeader>
                                    <CardTitle>{t('addProduct.title')}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={handleCreateProduct} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">{t('addProduct.name')}</Label>
                                            <Input id="name" name="name" required />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="description">{t('addProduct.description')}</Label>
                                            <Input id="description" name="description" required />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="price">{t('addProduct.price')}</Label>
                                                <Input id="price" name="price" type="number" required />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="valid_days">{t('addProduct.validDays')}</Label>
                                                <Input id="valid_days" name="valid_days" type="number" defaultValue={APP_CONFIG.DEFAULT_VALID_DAYS} min={1} required />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="image">{t('addProduct.image')}</Label>
                                            <Input id="image" name="image" type="file" accept="image/*" />
                                        </div>
                                        <Button type="submit" className="w-full">{t('addProduct.submit')}</Button>
                                    </form>
                                </CardContent>
                            </Card>
                        </div>
                    </CardContent>
                </Card>



                {/* Order History */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>{t('history.title')}</CardTitle>
                            <Button variant="outline" size="sm" onClick={() => fetchShopData(true)} disabled={isRefreshing}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                {t('refresh')}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('orders.date')}</TableHead>
                                    <TableHead>{t('orders.productName')}</TableHead>
                                    <TableHead>{t('orders.status')}</TableHead>
                                    <TableHead>{t('orders.shopMemo')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.filter(o => ['COMPLETED', 'EXPIRED', 'BANNED'].includes(o.status)).length === 0 ? (
                                    <TableRow><TableCell colSpan={3} className="text-center">{t('orders.noOrders')}</TableCell></TableRow>
                                ) : (
                                    orders
                                        .filter(o => ['COMPLETED', 'EXPIRED', 'BANNED'].includes(o.status))
                                        .sort((a, b) => {
                                            // Date: Newest first
                                            const dateA = new Date(a.ts_updated_at || a.ts_created_at).getTime();
                                            const dateB = new Date(b.ts_updated_at || b.ts_created_at).getTime();
                                            return dateB - dateA;
                                        })
                                        .map((order: any) => {
                                            const product = products.find(p => p.product_id === order.product_id);
                                            const uuid = order.id || order.qr_id.replace('QR#', '');

                                            return (
                                                <Dialog key={order.qr_id}>
                                                    <DialogTrigger asChild>
                                                        <TableRow className="cursor-pointer hover:bg-gray-100">
                                                            <TableCell>{order.ts_updated_at ? new Date(order.ts_updated_at).toLocaleString() : "-"}</TableCell>
                                                            <TableCell className="font-medium">{product?.name || order.product_id}</TableCell>
                                                            <TableCell>
                                                                <span className={`px-2 py-1 rounded text-xs ${order.status === 'UNASSIGNED' ? 'bg-gray-100' :
                                                                    order.status === 'LINKED' ? 'bg-emerald-100 text-emerald-800' :
                                                                        order.status === 'ACTIVE' ? 'bg-yellow-100 text-yellow-800' :
                                                                            order.status === 'USED' ? 'bg-orange-100 text-orange-800' :
                                                                                order.status === 'SHIPPED' ? 'bg-indigo-100 text-indigo-800' :
                                                                                    order.status === 'COMPLETED' ? 'bg-purple-100 text-purple-800' :
                                                                                        order.status === 'EXPIRED' ? 'bg-gray-100 text-gray-800' :
                                                                                            order.status === 'BANNED' ? 'bg-red-100 text-red-800' :
                                                                                                'bg-green-100 text-green-800'
                                                                    }`}>{st(order.status.toLowerCase())}</span>
                                                            </TableCell>
                                                            <TableCell className="font-medium">{order.memo_for_shop}</TableCell>
                                                        </TableRow>
                                                    </DialogTrigger>
                                                    <DialogContent className="max-w-md">
                                                        <DialogHeader>
                                                            <DialogTitle>{t('orders.details')}</DialogTitle>
                                                            <DialogDescription className="font-mono text-xs text-gray-500">
                                                                ID: {uuid}
                                                            </DialogDescription>
                                                        </DialogHeader>

                                                        <div className="space-y-4 py-4">
                                                            {/* Product Info */}
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.productName')}</h4>
                                                                <p className="font-medium">{product?.name || order.product_id}</p>
                                                            </div>


                                                            {/* Status */}
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.status')}</h4>

                                                                <span className={`px-2 py-1 rounded text-xs ${order.status === 'UNASSIGNED' ? 'bg-gray-100' :
                                                                    order.status === 'LINKED' ? 'bg-emerald-100 text-emerald-800' :
                                                                        order.status === 'ACTIVE' ? 'bg-yellow-100 text-yellow-800' :
                                                                            order.status === 'USED' ? 'bg-orange-100 text-orange-800' :
                                                                                order.status === 'SHIPPED' ? 'bg-indigo-100 text-indigo-800' :
                                                                                    order.status === 'COMPLETED' ? 'bg-purple-100 text-purple-800' :
                                                                                        order.status === 'EXPIRED' ? 'bg-gray-100 text-gray-800' :
                                                                                            order.status === 'BANNED' ? 'bg-red-100 text-red-800' :
                                                                                                'bg-green-100 text-green-800'
                                                                    }`}>{st(order.status.toLowerCase())}</span>
                                                            </div>

                                                            {/* Recipient Info */}
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <h4 className="text-sm font-semibold text-gray-500">{t('orders.recipient')}</h4>
                                                                    <p>{order.recipient_name}</p>
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.address')}</h4>
                                                                {order.postal_code && <p className="text-sm">〒{order.postal_code}</p>}
                                                                <p className="whitespace-pre-wrap text-sm">{order.address}</p>
                                                                {order.shipping_info?.phone && <p className="text-sm mt-1">{order.shipping_info.phone}</p>}
                                                            </div>

                                                            {/* Order Info */}
                                                            <div className="pt-2 space-y-4">
                                                                {/* Read-only view for SHIPPED, or we could allow edit. For now keeping read-only as per previous pattern but showing memos */}
                                                                {order.memo_for_users && (
                                                                    <div>
                                                                        <h4 className="text-sm font-semibold text-gray-500">{t('orders.userMessage')}</h4>
                                                                        <p className="text-sm bg-gray-50 p-2 rounded">{order.memo_for_users}</p>
                                                                    </div>
                                                                )}
                                                                {order.memo_for_shop && (
                                                                    <div>
                                                                        <h4 className="text-sm font-semibold text-gray-500">{t('orders.shopMemo')}</h4>
                                                                        <p className="text-sm bg-orange-50 p-2 rounded">{order.memo_for_shop}</p>
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <h4 className="text-sm font-semibold text-gray-500">{t('orders.shipDialog.deliveryCompany')}</h4>
                                                                    <p className="font-mono">{order.delivery_company || '-'}</p>
                                                                </div>
                                                                <div>
                                                                    <h4 className="text-sm font-semibold text-gray-500">{t('orders.shipDialog.label')}</h4>
                                                                    <p className="font-mono">{order.tracking_number || '-'}</p>
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <h4 className="text-sm font-semibold text-gray-500">{t('orders.timestamps')}</h4>
                                                                    <p className="text-sm">{ts('ts_updated_at') + ": " + (order.ts_updated_at ? new Date(order.ts_updated_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_linked_at') + ": " + (order.ts_linked_at ? new Date(order.ts_linked_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_activated_at') + ": " + (order.ts_activated_at ? new Date(order.ts_activated_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_submitted_at') + ": " + (order.ts_submitted_at ? new Date(order.ts_submitted_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_shipped_at') + ": " + (order.ts_shipped_at ? new Date(order.ts_shipped_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_completed_at') + ": " + (order.ts_completed_at ? new Date(order.ts_completed_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_expired_at') + ": " + (order.ts_expired_at ? new Date(order.ts_expired_at).toLocaleString() : "-")}</p>
                                                                    <p className="text-sm">{ts('ts_banned_at') + ": " + (order.ts_banned_at ? new Date(order.ts_banned_at).toLocaleString() : "-")}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </DialogContent>
                                                </Dialog>
                                            );
                                        })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Status Guide */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <HelpCircle className="w-5 h-5" />
                            {t('statusGuide.title')}
                        </CardTitle>
                        <CardDescription>{t('statusGuide.description')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        {/* Flow */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-700">{t('statusGuide.flow')}</h3>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="px-3 py-1 bg-gray-100 text-gray-700">    {st('unassigned')}</span>                                <ArrowRight className="w-4 h-4 text-gray-400" />
                                <span className="px-3 py-1 bg-emerald-100 text-emerald-800">  {st('linked')}    </span>                                <ArrowRight className="w-4 h-4 text-gray-400" />
                                <span className="px-3 py-1 bg-yellow-100 text-yellow-800">{st('active')}    </span>                                <ArrowRight className="w-4 h-4 text-gray-400" />
                                <span className="px-3 py-1 bg-orange-100 text-orange-800">{st('used')}      </span>                                <ArrowRight className="w-4 h-4 text-gray-400" />
                                <span className="px-3 py-1 bg-indigo-100 text-indigo-800">  {st('shipped')}   </span>                                <ArrowRight className="w-4 h-4 text-gray-400" />
                                <span className="px-3 py-1 bg-purple-100 text-purple-800">{st('completed')} </span>
                            </div>
                        </div>

                        {/* <span className={`px-2 py-1 rounded text-xs ${order.status === 'UNASSIGNED' ? 'bg-gray-100' :
                            order.status === 'LINKED' ? 'bg-emerald-100 text-emerald-800' :
                                order.status === 'ACTIVE' ? 'bg-yellow-100 text-yellow-800' :
                                    order.status === 'USED' ? 'bg-orange-100 text-orange-800' :
                                        order.status === 'SHIPPED' ? 'bg-indigo-100 text-indigo-800' :
                                            order.status === 'COMPLETED' ? 'bg-purple-100 text-purple-800' :
                                                order.status === 'EXPIRED' ? 'bg-gray-100 text-gray-800' :
                                                    order.status === 'BANNED' ? 'bg-red-100 text-red-800' :
                                                        'bg-green-100 text-green-800' */}
                        {/* List */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-700">{t('statusGuide.list')}</h3>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">{st('unassigned')}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 pl-2 border-l-2 border-gray-200">{t('statusGuide.statuses.unassigned')}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs">{st('linked')}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 pl-2 border-l-2 border-emerald-200">{t('statusGuide.statuses.linked')}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">{st('active')}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 pl-2 border-l-2 border-yellow-200">{t('statusGuide.statuses.active')}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs">{st('used')}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 pl-2 border-l-2 border-orange-200">{t('statusGuide.statuses.used')}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs">{st('shipped')}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 pl-2 border-l-2 border-indigo-200">{t('statusGuide.statuses.shipped')}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">{st('completed')}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 pl-2 border-l-2 border-purple-200">{t('statusGuide.statuses.completed')}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded text-xs">{st('expired')}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 pl-2 border-l-2 border-gray-300">{t('statusGuide.statuses.expired')}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">{st('banned')}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 pl-2 border-l-2 border-red-200">{t('statusGuide.statuses.banned')}</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>


            </div>
        </div >
    );
}
