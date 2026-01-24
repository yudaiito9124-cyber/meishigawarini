'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchAuthSession } from 'aws-amplify/auth';
import { fetchWithAuth } from '@/app/utils/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function ShopPage() {
    const params = useParams();
    const router = useRouter();
    const shopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId;

    const [shop, setShop] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [qrCodes, setQrCodes] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Protect Route
    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            await fetchAuthSession();
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

    const fetchShopData = async () => {
        // setLoading(true); // Don't block UI on refresh
        try {
            // 1. Get Shop Details
            const shopRes = await fetchWithAuth(`/shops/${shopId}`);
            if (!shopRes.ok) throw new Error('Failed to fetch shop');
            const shopData = await shopRes.json();
            setShop(shopData);

            // 2. Get Products
            const prodRes = await fetchWithAuth(`/shops/${shopId}/products`);
            if (prodRes.ok) {
                const prodData = await prodRes.json();
                setProducts(prodData.products || prodData.items || []);
            }

            // 3. Get QR Codes
            const qrRes = await fetchWithAuth(`/shops/${shopId}/qrcodes`);
            if (qrRes.ok) {
                const qrData = await qrRes.json();
                setQrCodes(qrData.items || []);
            }

            // 4. Get Orders
            const orderRes = await fetchWithAuth(`/shops/${shopId}/orders`);
            if (orderRes.ok) {
                const orderData = await orderRes.json();
                setOrders(orderData.orders || orderData.items || []); // robust check
            }

        } catch (err: any) {
            console.error(err);
            if (err.message === 'Unauthorized') {
                router.push('/login');
                return;
            }
            setError(err.message);
        } finally {
            setLoading(false);
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

                // Target dimensions: HD (1280x720)
                const MAX_WIDTH = 1280;
                const MAX_HEIGHT = 720;
                let width = img.width;
                let height = img.height;

                // Scale Logic: Contain (Fit within box, maintaining aspect ratio, no crop)
                if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                    const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject('Canvas to Blob failed');
                }, file.type);
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
            let imageUrl = 'https://placehold.co/600x400?text=No+Image';

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
                const uploadRes = await fetchWithAuth(`/shops/${shopId}/products/upload-url`, {
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
            const res = await fetchWithAuth(`/shops/${shopId}/products`, {
                method: 'POST',
                body: JSON.stringify({
                    name: formData.get('name'),
                    description: formData.get('description'),
                    price: Number(formData.get('price')),
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

        try {
            // 1. Link
            const linkRes = await fetchWithAuth(`/shops/${shopId}/link`, {
                method: 'POST',
                body: JSON.stringify({ qr_id: uuid, product_id: productId })
            });
            if (!linkRes.ok) throw new Error('Failed to link');

            // 2. Activate
            const actRes = await fetchWithAuth(`/shops/${shopId}/activate`, {
                method: 'POST',
                body: JSON.stringify({ qr_id: uuid })
            });
            if (!actRes.ok) throw new Error('Failed to activate');

            alert('QR Code Linked and Activated!');
            form.reset();
            fetchShopData();
        } catch (err: any) {
            alert("Error: " + err.message);
        }
    };

    const handleDeleteProduct = async (productId: string, productName: string) => {
        if (!confirm(`Are you sure you want to delete "${productName}"?`)) return;

        try {
            const res = await fetchWithAuth(`/shops/${shopId}/products/${productId}`, {
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
            const res = await fetchWithAuth(`/shops/${shopId}/products/${productId}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) fetchShopData();
        } catch (e) { console.error(e); }
    };

    const handleShipOrder = async (qrId: string, trackingNumber: string) => {
        try {
            const res = await fetchWithAuth(`/shops/${shopId}/orders/${qrId}`, {
                method: 'PATCH',
                body: JSON.stringify({ tracking_number: trackingNumber })
            });
            if (res.ok) {
                fetchShopData();
            } else {
                alert('Failed to ship order');
            }
        } catch (e) {
            console.error(e);
            alert('Error shipping order');
        }
    };

    if (loading) return <div className="p-8">Loading Dashboard...</div>;
    if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            {/* Header */}
            <div className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{shop?.name || 'Shop Dashboard'}</h1>
                        <p className="text-sm text-gray-500">ID: {shopId}</p>
                    </div>
                    {/* <Button variant="outline" onClick={() => router.push('/shop/select')}>Back to Shops</Button> */}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

                {/* Incoming Orders */}
                <Card>
                    <CardHeader>
                        <CardTitle>Incoming Orders</CardTitle>
                        <CardDescription>Manage your orders and shipments.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Recipient</TableHead>
                                    <TableHead>Address</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center">No active orders</TableCell></TableRow> : (
                                    orders.map((order: any) => (
                                        <TableRow key={order.qr_id}>
                                            <TableCell>{new Date(order.shipping_info?.submitted_at || order.created_at).toLocaleDateString()}</TableCell>
                                            <TableCell>
                                                <div className="font-medium">{order.recipient_name}</div>
                                                <div className="text-xs text-gray-500">{order.shipping_info?.phone}</div>
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate" title={order.address}>
                                                {order.address}
                                            </TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-1 rounded text-xs ${order.status === 'SHIPPED' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                                                    }`}>
                                                    {order.status}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                {order.status === 'USED' && (
                                                    <Dialog>
                                                        <DialogTrigger asChild>
                                                            <Button size="sm">Ship</Button>
                                                        </DialogTrigger>
                                                        <DialogContent>
                                                            <DialogHeader>
                                                                <DialogTitle>Mark as Shipped</DialogTitle>
                                                                <DialogDescription>Enter tracking number for {order.recipient_name}</DialogDescription>
                                                            </DialogHeader>
                                                            <form onSubmit={(e) => {
                                                                e.preventDefault();
                                                                const fd = new FormData(e.target as HTMLFormElement);
                                                                handleShipOrder(order.id || order.qr_id.replace('QR#', ''), fd.get('tracking') as string);
                                                            }}>
                                                                <div className="grid gap-4 py-4">
                                                                    <Label htmlFor="tracking">Tracking Number</Label>
                                                                    <Input id="tracking" name="tracking" placeholder="1234-5678" required />
                                                                </div>
                                                                <DialogFooter>
                                                                    <Button type="submit">Confirm Shipment</Button>
                                                                </DialogFooter>
                                                            </form>
                                                        </DialogContent>
                                                    </Dialog>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Existing Products */}
                <Card>
                    <CardHeader>
                        <CardTitle>Products</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {products.map((product) => (
                                <Card key={product.product_id} className="overflow-hidden">
                                    <div className="h-32 bg-gray-200 relative">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                        <div className="absolute top-2 right-2 flex gap-2">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${product.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {product.status}
                                            </span>
                                        </div>
                                    </div>
                                    <CardHeader className="p-4">
                                        <CardTitle className="text-lg">{product.name}</CardTitle>
                                        <CardDescription className="line-clamp-2">{product.description}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0 flex justify-between items-center">
                                        <span className="font-bold">¥{product.price ? Number(product.price).toLocaleString("ja-JP") : "0"}</span>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => handleToggleStatus(product.product_id, product.status)}>
                                                {product.status === 'ACTIVE' ? 'Stop' : 'Activate'}
                                            </Button>
                                            {product.status !== 'ACTIVE' && (
                                                <Button variant="destructive" size="sm" onClick={() => handleDeleteProduct(product.product_id, product.name)}>
                                                    Delete
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Create Product */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Add New Product</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleCreateProduct} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Product Name</Label>
                                    <Input id="name" name="name" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">Description</Label>
                                    <Input id="description" name="description" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="price">Price (¥)</Label>
                                    <Input id="price" name="price" type="number" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="image">Product Image</Label>
                                    <Input id="image" name="image" type="file" accept="image/*" />
                                </div>
                                <Button type="submit" className="w-full">Create Product</Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Link QR */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Link QR Code</CardTitle>
                            <CardDescription>Connect a physical QR card to a product.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleLinkQr} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="uuid">QR UUID (Scan or Type)</Label>
                                    <Input id="uuid" name="uuid" placeholder="e.g. 123e4567-..." required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="product_id">Select Product</Label>
                                    <select id="product_id" name="product_id" className="w-full p-2 border rounded-md" required>
                                        <option value="">Select a product...</option>
                                        {products.filter(p => p.status === 'ACTIVE').map(p => (
                                            <option key={p.product_id} value={p.product_id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <Button type="submit" variant="secondary" className="w-full">Link & Activate</Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>

                {/* Linked QR Codes Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Linked QR Codes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>QR ID</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Activated At</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {qrCodes.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center">No linked QR codes</TableCell></TableRow> : (
                                    qrCodes.map((qr) => {
                                        const prod = products.find(p => p.product_id === qr.product_id);
                                        return (
                                            <TableRow key={qr.id}>
                                                <TableCell className="font-mono text-xs">{qr.id}</TableCell>
                                                <TableCell>{prod?.name || qr.product_id}</TableCell>
                                                <TableCell>
                                                    <span className={`px-2 py-1 rounded text-xs ${qr.status === 'USED' ? 'bg-yellow-100 text-yellow-800' :
                                                        qr.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                                                            'bg-gray-100'
                                                        }`}>
                                                        {qr.status}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-xs text-gray-500">
                                                    {qr.activated_at ? new Date(qr.activated_at).toLocaleDateString() : '-'}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}
