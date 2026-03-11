/**
 * ファイル概要: 個別ショップ管理のダッシュボード
 * 目的: 指定されたショップのQRコードリンク、商品作成・管理、受注一覧、および発送処理などの機能を提供します。
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, ArrowRight, HelpCircle, Camera, Settings, ShoppingBasket, Eye } from 'lucide-react';
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
import SandboxedHtml from '@/components/SandboxedHtml';
import { APP_CONFIG } from '@/lib/config';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// --- Effects ---
export default function ShopPage() {
    const t = useTranslations('ShopPage');
    const tr = useTranslations('ReceivePage');
    const ts = useTranslations('Timestamp');
    const st = useTranslations('Status');
    const tb = useTranslations('BackendError');
    const params = useParams();
    const router = useRouter();
    const shopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId;

    const [shop, setShop] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [qrCodes, setQrCodes] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [shopLoading, setShopLoading] = useState(true);
    const [productsLoading, setProductsLoading] = useState(true);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [debouncedPreviewHtml, setDebouncedPreviewHtml] = useState<string>('');
    const shopDetailRef = useRef<HTMLTextAreaElement>(null);
    const [isLinking, setIsLinking] = useState(false);

    const [searchUuid, setSearchUuid] = useState('');
    const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);
    const [isCreatingProduct, setIsCreatingProduct] = useState(false);
    const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
    const [togglingProductId, setTogglingProductId] = useState<string | null>(null);

    // Import Product State
    const [isImporting, setIsImporting] = useState(false);
    const [importShops, setImportShops] = useState<any[]>([]);
    const [selectedImportShopId, setSelectedImportShopId] = useState('');
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);


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
        if (!refresh) {
            setShopLoading(true);
            setProductsLoading(true);
            setOrdersLoading(true);
        }

        const fetchShop = async () => {
            try {
                const res = await fetchWithAuth(`/shop/${shopId}`);
                if (!res.ok) throw new Error('Failed to fetch shop');
                const data = await res.json();
                setShop(data);
                if (data.detail_html) {
                    setDebouncedPreviewHtml(data.detail_html);
                }
            } catch (err: any) {
                if (err.statusCode === 401) {
                    router.push('/login');
                    throw err;
                }
                setError(err.message);
                throw err;
            } finally {
                setShopLoading(false);
            }
        };

        const fetchProducts = async () => {
            try {
                const res = await fetchWithAuth(`/shop/${shopId}/products`);
                if (res.ok) {
                    const data = await res.json();
                    setProducts(data.products || data.items || []);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setProductsLoading(false);
            }
        };

        const fetchQRCodes = async () => {
            try {
                const res = await fetchWithAuth(`/shop/${shopId}/qrcodes`);
                if (res.ok) {
                    const data = await res.json();
                    setQrCodes(data.items || []);
                }
            } catch (e) {
                console.error(e);
            }
        };

        const fetchOrders = async () => {
            try {
                const res = await fetchWithAuth(`/shop/${shopId}/orders`);
                if (res.ok) {
                    const data = await res.json();
                    setOrders(data.orders || data.items || []); // robust check
                }
            } catch (e) {
                console.error(e);
            } finally {
                setOrdersLoading(false);
            }
        };

        try {
            await Promise.allSettled([
                fetchShop(),
                fetchProducts(),
                fetchQRCodes(),
                fetchOrders()
            ]);
        } finally {
            if (refresh) setIsRefreshing(false);
        }
    };

    const fetchImportShops = async () => {
        try {
            const res = await fetchWithAuth(`/shop/${shopId}/products/import`);
            if (res.ok) {
                const data = await res.json();
                // Filter out the current shop
                setImportShops((data.shops || []).filter((s: any) => s.PK !== `SHOP#${shopId}`));
            }
        } catch (error) {
            console.error('Failed to fetch import shops', error);
        }
    };

    useEffect(() => {
        if (isImportDialogOpen) {
            fetchImportShops();
        }
    }, [isImportDialogOpen, shopId]);

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
        if (isCreatingProduct) return;
        setIsCreatingProduct(true);
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const file = formData.get('image') as File;

        try {
            let imageUrl = 'https://placehold.co/1280x720?text=No+Image';

            // 1. Upload Image if exists
            if (file && file.size > 0) {
                // Resize Image
                const resizedBlob = await resizeImage(file);

                // 2. Rename (use random UUID for image)
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
                    // detail_html: formData.get('detail_html'),
                    price: Number(formData.get('price')),
                    valid_days: formData.get('valid_days'),
                    image_url: imageUrl,
                    status: 'ACTIVE'
                })
            });

            if (res.ok) {
                alert(t('addProduct.success'));
                form.reset();
                fetchShopData(); // Refresh
            } else {
                alert(t('addProduct.failed'));
            }
        } catch (err) {
            console.error(err);
            alert(t('addProduct.error'));
        } finally {
            setIsCreatingProduct(false);
        }
    };

    const handleLinkQr = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLinking) return;
        setIsLinking(true);
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        // const uuid = formData.get('uuid') as string;
        const uuid = scannedUuid;
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

            console.debug(body)

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
            setQrStatusDetails(null);
            setShowOptions(false);
            fetchShopData();
        } catch (err: any) {
            alert("Error: " + err.message);
        } finally {
            setIsLinking(false);
        }
    };

    const handleDeleteProduct = async (productId: string, productName: string) => {
        if (!confirm(t('product.deleteConfirm', { name: productName }))) return;
        setDeletingProductId(productId);

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
        } finally {
            setDeletingProductId(null);
        }
    };

    const handleToggleStatus = async (productId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'ACTIVE' ? 'STOPPED' : 'ACTIVE';
        setTogglingProductId(productId);
        try {
            const res = await fetchWithAuth(`/shop/${shopId}/products/${productId}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) fetchShopData();
        } catch (e) { console.error(e); } finally {
            setTogglingProductId(null);
        }
    };

    const handleShipOrder = async (qrId: string, deliveryCompany: string, trackingNumber: string, memoForUsers?: string, memoForShop?: string) => {
        setShippingOrderId(qrId);
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
        } finally {
            setShippingOrderId(null);
        }
    };

    const handleImportProducts = async () => {
        if (!selectedImportShopId) {
            alert(t('importProduct.selectShop'));
            return;
        }

        setIsImporting(true);
        try {
            const res = await fetchWithAuth(`/shop/${shopId}/products/import`, {
                method: 'POST',
                body: JSON.stringify({ importShopId: selectedImportShopId.replace('SHOP#', '') })
            });

            const data = await res.json();

            if (res.ok) {
                alert(`${data.message} (${data.imported} items)`);
                setIsImportDialogOpen(false);
                setSelectedImportShopId('');
                fetchShopData(); // Refresh product list
            } else {
                alert(`Error: ${data.message}`);
            }
        } catch (error: any) {
            console.error('Import failed', error);
            alert('Failed to import products: ' + error.message);
        } finally {
            setIsImporting(false);
        }
    };

    const handleUpdateShop = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        try {
            const res = await fetchWithAuth(`/shop/${shopId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name: formData.get('shop_name'),
                    detail_html: formData.get('shop_detail_html')
                })
            });
            if (res.ok) {
                alert(t('shopSettings.success', { defaultValue: 'ショップ設定を更新しました。' }));
                fetchShopData();
                setIsSettingsOpen(false);
            } else {
                alert(t('shopSettings.failed', { defaultValue: '更新に失敗しました。' }));
            }
        } catch (err) {
            console.error(err);
            alert(t('shopSettings.error', { defaultValue: 'エラーが発生しました。' }));
        }
    };

    const handleUpdatePreview = () => {
        if (shopDetailRef.current) {
            setDebouncedPreviewHtml(shopDetailRef.current.value);
        }
    };

    const [isScanning, setIsScanning] = useState(false);
    const [scannedUuid, setScannedUuid] = useState('');
    const [qrStatusDetails, setQrStatusDetails] = useState<any>(null);
    const [showOptions, setShowOptions] = useState(false);
    const [shipOptionOpenId, setShipOptionOpenId] = useState<string | null>(null);
    const [isManualInput, setisManualInput] = useState(false);
    const [manualInput, setManualInput] = useState('');

    const handleScanSuccess = async (decodedText: string) => {
        let uuid = decodedText;
        if (decodedText.includes('/')) {
            uuid = decodedText.split('/').pop() || decodedText;
        }
        setScannedUuid('');
        setQrStatusDetails(null);
        try {
            const res = await fetchWithAuth(`/shop/${shopId}/qrcodecheck`, {
                method: 'POST',
                body: JSON.stringify({ qr_id: uuid })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                alert(t('linkQr.foreignQrError', { defaultValue: 'このカードは使えません。' }) + (errData.message ? ` (${tb(errData.message)})` : '') + (errData.detail ? ` (${errData.detail})` : ''));
                return;
            }
            const data = await res.json();
            setScannedUuid(uuid);
            setQrStatusDetails(data);
        } catch (error: any) {
            console.error('Failed to get QR status', error);
            alert(t('linkQr.foreignQrError', { defaultValue: 'このカードは使えません。' }) + (error.message ? ` (${tb(error.message)})` : '') + (error.detail ? ` (${error.detail})` : ''));
        } finally {
            setIsScanning(false);
        }
    };

    if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            {/* Header */}
            <div className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            {shopLoading ? <RefreshCw className="h-5 w-5 animate-spin text-gray-400 inline-block" /> : (shop?.name || t('title'))}
                        </h1>
                        <p className="text-sm text-gray-500">{t('shopId', { id: String(shopId || '') })}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-gray-500 hover:text-gray-900">
                                    <Settings className="h-5 w-5" />
                                    <span className="sr-only">{t('shopSettings.title')}</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-full max-h-[95vh] h-[95vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>{t('shopSettings.title', { defaultValue: 'ショップ設定' })}</DialogTitle>
                                    <DialogDescription>{t('shopSettings.description', { defaultValue: 'ショップの名前や紹介文を設定します。' })}</DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleUpdateShop} className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="shop_name">{t('shopSettings.name')}</Label>
                                        <Input id="shop_name" name="shop_name" defaultValue={shop?.name} required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="shop_detail_html">{t('shopSettings.detailHtml')}</Label>
                                        <div className="border rounded-md overflow-hidden bg-gray-50/30 min-h-[400px] h-[calc(95vh-300px)] flex flex-col lg:flex-row">
                                            <div className="flex-1 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r bg-white">
                                                <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center shrink-0">
                                                    <Label htmlFor="shop_detail_html" className="text-xs font-bold text-gray-600 uppercase tracking-wider">{t('shopSettings.sourcecode')}</Label>
                                                </div>
                                                <textarea
                                                    ref={shopDetailRef}
                                                    id="shop_detail_html"
                                                    name="shop_detail_html"
                                                    defaultValue={shop?.detail_html}
                                                    className="flex-1 w-full p-4 text-sm font-mono focus-visible:outline-none resize-none overflow-y-auto min-h-0"
                                                    placeholder={t('shopSettings.detailHtmlPlaceholder')}
                                                />
                                            </div>
                                            <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50">
                                                <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center shrink-0">
                                                    <Label className="text-xs font-bold text-gray-600 uppercase tracking-wider">{t('shopSettings.preview')}</Label>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={handleUpdatePreview}
                                                        className="h-7 px-2 text-[10px] gap-1 bg-white border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                                                    >
                                                        <Eye className="w-3 h-3" />
                                                        {t('shopSettings.updatePreview')}
                                                    </Button>
                                                </div>
                                                <div className="flex-1 overflow-y-auto w-full min-h-0 p-4 flex flex-col items-center">
                                                    <Card className="w-full mt-20 flex flex-col items-center max-w-xl bg-white ">
                                                        <CardTitle className="w-full flex flex-col items-center justify-center gap-2">
                                                            <div className="w-full flex items-center justify-center text-xl text-center gap-2">
                                                                <ShoppingBasket className="w-5 h-5 text-gray-600" />
                                                                {tr('shopinfo')}
                                                            </div>
                                                            <div className="w-full flex items-center justify-center text-xs text-center text-gray-500">
                                                                {tr('shopinfo_description')}
                                                            </div>
                                                        </CardTitle>
                                                        {/* </CardHeader> */}
                                                        <CardContent className="min-h-0 flex flex-1 p-0">
                                                            <SandboxedHtml html={debouncedPreviewHtml} />
                                                        </CardContent>
                                                    </Card>
                                                    {/* <div className="max-w-xl mx-auto lg:mx-0 bg-white shadow-sm border rounded-lg p-6 min-h-full">
                                                        <SandboxedHtml html={previewDetailHtml} />
                                                    </div> */}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button type="submit" className="w-full">
                                            {t('shopSettings.submit', { defaultValue: 'ショップ設定を保存' })}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                        <Button variant="outline" className="text-xs md:text-sm" onClick={handleShops}>{t('movetoshops')}</Button>
                    </div>
                </div>

            </div>



            <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">


                {/* Link QR */}
                <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('linkQr.title')}</CardTitle>
                            <CardDescription>{t('linkQr.description')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleLinkQr} className="space-y-4">
                                {!scannedUuid ? (
                                    <div className="flex flex-col gap-4">
                                        <Dialog open={isScanning} onOpenChange={(open) => { setIsScanning(open); if (open) setManualInput(''); }}>
                                            <DialogTrigger asChild>
                                                <Button type="button" variant="outline" className="w-full h-auto flex flex-col justify-center items-center gap-4 text-xl py-16 bg-gray-300">
                                                    <div style={{ width: '100px', aspectRatio: '1' }}>
                                                        <Camera style={{ width: '100%', height: '100%', display: 'block' }} />
                                                    </div>
                                                    <span>{t('linkQr.scan')}</span>
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent >
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
                                                    {isManualInput ? (
                                                        <div className="flex w-full flex-col sm:flex-row gap-3">
                                                            <Input
                                                                id="uuid_manual"
                                                                name="uuid_manual"
                                                                placeholder={t('linkQr.placeholder')}
                                                                value={manualInput}
                                                                onChange={(e) => setManualInput(e.target.value)}
                                                                className="bg-gray-100"
                                                            />
                                                            <Button type="button" variant="default" disabled={!manualInput} onClick={() => handleScanSuccess(manualInput)} className="shrink-0">
                                                                {t('linkQr.scanDialog.apply')}
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-start">
                                                            <Button type="button" variant="ghost" size="sm" onClick={() => setisManualInput(true)} className="h-8 text-xs text-gray-500 hover:text-gray-900 px-2 -ml-2 right">
                                                                {t('linkQr.manualinput')}
                                                            </Button>
                                                        </div>
                                                    )}

                                                    {/* <Button type="button" variant="ghost" onClick={() => setIsScanning(false)}>
                                                        {t('linkQr.scanDialog.cancel')}
                                                    </Button> */}
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 px-3 py-2 rounded-md border gap-2">
                                            <div className="truncate">
                                                <span className="text-xs text-gray-500 mr-2">{t('linkQr.uuidLabel')}:</span>
                                                <span className="font-mono text-sm font-medium">{scannedUuid}</span>
                                            </div>
                                            <Button type="button" variant="ghost" size="sm" onClick={() => { setScannedUuid(''); setQrStatusDetails(null); setShowOptions(false); }} className="h-8 px-2 text-gray-500 hover:text-gray-900 w-full sm:w-auto shrink-0">
                                                {t('linkQr.clear')}
                                            </Button>
                                        </div>

                                        {(!qrStatusDetails || !qrStatusDetails.product_linked) ? (
                                            <select
                                                id="product_id"
                                                name="product_id"
                                                className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                required
                                                defaultValue=""
                                            >
                                                <option value="" disabled>{t('linkQr.selectPlaceholder')}</option>
                                                {products.filter(p => p.status === 'ACTIVE').map(p => (
                                                    <option key={p.product_id} value={p.product_id}>{p.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div className="flex items-center justify-center h-12 border border-emerald-200 rounded-md bg-emerald-50 text-emerald-900 font-bold">
                                                {qrStatusDetails.product_name}
                                            </div>
                                        )}

                                        {showOptions ? (
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <Input
                                                    id="memo_for_users"
                                                    name="memo_for_users"
                                                    placeholder={t('linkQr.memoForUsersPlaceholder')}
                                                    className="h-10 border-gray-300"
                                                />
                                                <Input
                                                    id="memo_for_shop"
                                                    name="memo_for_shop"
                                                    placeholder={t('linkQr.memoForShopPlaceholder')}
                                                    className="h-10 border-gray-300"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex justify-start">
                                                <Button type="button" variant="ghost" size="sm" onClick={() => setShowOptions(true)} className="h-8 text-xs text-gray-500 hover:text-gray-900 px-2 -ml-2">
                                                    + {t('linkQr.option')}
                                                </Button>
                                            </div>
                                        )}

                                        <Button type="submit" className="w-full font-bold text-lg h-30" disabled={isLinking}>
                                            {isLinking ? t('linkQr.processing') : t('linkQr.submit')}
                                        </Button>
                                    </div>
                                )}
                            </form>
                        </CardContent>
                    </Card>
                </div>

                {/* Incoming Orders */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
                            <div>
                                <CardTitle>{t('incomingOrders')}</CardTitle>
                                <CardDescription>{t('ordersDesc')}</CardDescription>
                            </div>
                            <div className="flex flex-col w-full space-y-2 md:flex-row md:items-center md:space-x-2 md:space-y-0 md:w-auto">
                                <div className="flex w-full items-center space-x-2 md:max-w-sm">
                                    <Input
                                        placeholder={t('search.placeholder')}
                                        value={searchUuid}
                                        onChange={(e) => setSearchUuid(e.target.value)}
                                        className="w-full"
                                    />
                                    {searchUuid && (
                                        <Button variant="ghost" onClick={() => setSearchUuid('')} className="shrink-0">
                                            {t('search.clear')}
                                        </Button>
                                    )}
                                </div>
                                <Button variant="outline" size="sm" className="w-full shrink-0 md:w-auto" onClick={() => fetchShopData(true)} disabled={isRefreshing}>
                                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                    {t('refresh')}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 w-full">
                        <Table wrapperStyle={{ maxHeight: 'calc(100vh - 200px)' }}>
                            <TableHeader className="sticky top-0 bg-white z-10 drop-shadow-sm">
                                <TableRow>
                                    <TableHead className="text-xs md:text-sm">{t('orders.date')}</TableHead>
                                    <TableHead className="text-xs md:text-sm hidden sm:table-cell">{t('orders.productName')}</TableHead>
                                    <TableHead className="text-xs md:text-sm">{t('orders.status')}</TableHead>
                                    <TableHead className="text-xs md:text-sm hidden md:table-cell">{t('orders.shopMemo')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ordersLoading ? (
                                    <TableRow><TableCell colSpan={4} className="text-center py-4"><RefreshCw className="animate-spin h-5 w-5 mx-auto text-gray-400" /></TableCell></TableRow>
                                ) : orders
                                    .filter(o => ['USED'].includes(o.status))
                                    .filter(o => !searchUuid || (o.id || o.qr_id).includes(searchUuid))
                                    .length === 0 ? (
                                    <TableRow><TableCell colSpan={3} className="text-center">{t('orders.noOrders')}</TableCell></TableRow>
                                ) : (
                                    orders
                                        .filter(o => ['USED'].includes(o.status))
                                        .filter(o => !searchUuid || (o.id || o.qr_id).includes(searchUuid))
                                        .sort((a, b) => {
                                            const sortorder: { [name: string]: number } = { 'LINKED': 0, 'ACTIVE': 1, 'USED': 3, 'SHIPPED': 2 };
                                            // 1. Status: compare
                                            if (a.status !== b.status) return sortorder[b.status] - sortorder[a.status];
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
                                                            {/* <TableCell className="text-xs md:text-sm">{order.ts_updated_at ? new Date(order.ts_updated_at).toLocaleString() : "-"}</TableCell> */}
                                                            <TableCell className="text-xs md:text-sm">
                                                                {order.ts_updated_at ? (
                                                                    <div className="flex flex-col">
                                                                        <span className="whitespace-nowrap">{new Date(order.ts_updated_at).toLocaleDateString()}</span>
                                                                        <span className="text-[10px] text-gray-500 whitespace-nowrap">{new Date(order.ts_updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                    </div>
                                                                ) : "-"}
                                                            </TableCell>
                                                            <TableCell className="text-xs md:text-sm font-bold hidden sm:table-cell">{product?.name || order.product_id}</TableCell>
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
                                                            <TableCell className="text-xs md:text-sm hidden md:table-cell">{order.memo_for_shop}</TableCell>
                                                        </TableRow>
                                                    </DialogTrigger>
                                                    <DialogContent className="max-w-md">
                                                        <DialogHeader>
                                                            <DialogTitle>{t('orders.details')}</DialogTitle>
                                                            <DialogDescription className="font-mono text-xs text-gray-500">
                                                                ID: {uuid}
                                                            </DialogDescription>
                                                        </DialogHeader>

                                                        <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto p-2">
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
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.recipient')}</h4>
                                                                <p>{order.recipient_name}</p>
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.contact')}</h4>
                                                                <p className="break-all">{order.shipping_info?.email || '-'}</p>
                                                                <p className="text-sm mt-1">{order.shipping_info?.phone || '-'}</p>
                                                            </div>

                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.address')}</h4>
                                                                {order.postal_code && <p className="text-sm">〒{order.postal_code}</p>}
                                                                <p className="whitespace-pre-wrap text-sm">{order.address}</p>
                                                            </div>

                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.preferredDateTime')}</h4>
                                                                <p className="text-sm">{order.preferred_date}  /  {order.preferred_time}</p>
                                                            </div>

                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.userMessage')}</h4>
                                                                <p className="text-sm bg-blue-50 p-2 rounded">{order.memo_for_users || '-'}</p>
                                                            </div>
                                                            {/* )}
                                                                    {order.memo_for_shop && ( */}
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.shopMemo')}</h4>
                                                                <p className="text-sm bg-gray-50 p-2 rounded">{order.memo_for_shop || '-'}</p>
                                                            </div>

                                                            {/* Memos (if available) - Assuming these fields might exist on order object or shipping_info */}
                                                            {/* These are now handled within the shipping form for 'USED' status and read-only for 'SHIPPED' */}
                                                            {order.status === 'USED' && (
                                                                <div className="mt-4 p-4 border-2 border-orange-200 rounded-lg bg-orange-50/50">
                                                                    <div className="flex items-center gap-2 mb-4">
                                                                        <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                                                        <h4 className="text-sm font-bold text-orange-900">{t('orders.action')}</h4>
                                                                    </div>
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
                                                                            <Label htmlFor={`delivery_company-${uuid}`}>{t('orders.shipDialog.deliveryCompany')}</Label>
                                                                            <Input id={`delivery_company-${uuid}`} name="delivery_company" placeholder="〇〇運輸" required />
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <Label htmlFor={`tracking-${uuid}`}>{t('orders.shipDialog.label')}</Label>
                                                                            <Input id={`tracking-${uuid}`} name="tracking" placeholder="1234-5678..." required />
                                                                        </div>
                                                                        {shipOptionOpenId === uuid ? (
                                                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                                                <div className="space-y-2">
                                                                                    <Label htmlFor={`memo_users-${uuid}`}>{t('orders.userMessage')}</Label>
                                                                                    <Input id={`memo_users-${uuid}`} name="memo_for_users" defaultValue={order.memo_for_users} placeholder={t('linkQr.memoForUsersPlaceholder')} />
                                                                                </div>
                                                                                <div className="space-y-2">
                                                                                    <Label htmlFor={`memo_shop-${uuid}`}>{t('orders.shopMemo')}</Label>
                                                                                    <Input id={`memo_shop-${uuid}`} name="memo_for_shop" defaultValue={order.memo_for_shop} placeholder={t('linkQr.memoForShopPlaceholder')} />
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex justify-start">
                                                                                <Button type="button" variant="ghost" size="sm" onClick={() => setShipOptionOpenId(uuid)} className="h-8 text-xs text-gray-500 hover:text-gray-900 px-2 -ml-2">
                                                                                    + {t('linkQr.option')}
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                        <Button type="submit" className="w-full" disabled={shippingOrderId === uuid}>
                                                                            {shippingOrderId === uuid ? t('linkQr.processing') : t('orders.shipDialog.submit')}
                                                                        </Button>
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
                                                            <div className="">
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
                <Card style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <CardHeader className="flex flex-row items-center justify-between shrink-0">
                        <CardTitle>{t('products')}</CardTitle>
                    </CardHeader>
                    <div style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0 }} className="p-4 w-full">
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {productsLoading ? (
                                <div className="col-span-full py-8 flex justify-center"><RefreshCw className="animate-spin h-6 w-6 text-gray-400" /></div>
                            ) : products.map((product) => (
                                <Dialog key={product.product_id}>
                                    <DialogTrigger asChild>
                                        <Card className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
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
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {t('addProduct.validDays')}: {product.valid_days ? product.valid_days : APP_CONFIG.DEFAULT_VALID_DAYS}日
                                                </p>
                                                <p className="text-[10px] text-gray-400 font-mono mt-1 truncate" title={product.product_id}>
                                                    ID: {product.product_id}
                                                </p>
                                            </CardHeader>
                                            <CardContent className="px-3 pb-2 pt-0 flex justify-between items-center">
                                                <span className="font-bold text-sm">¥{product.price ? Number(product.price).toLocaleString("ja-JP") : "0"}</span>
                                                <div className="flex gap-2">
                                                    <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={(e) => { e.stopPropagation(); handleToggleStatus(product.product_id, product.status); }} disabled={togglingProductId === product.product_id}>
                                                        {togglingProductId === product.product_id ? t('linkQr.processing') : (product.status === 'ACTIVE' ? t('product.stop') : t('product.activate'))}
                                                    </Button>
                                                    {product.status !== 'ACTIVE' && (
                                                        <Button variant="destructive" size="sm" className="h-7 text-xs px-2" onClick={(e) => { e.stopPropagation(); handleDeleteProduct(product.product_id, product.name); }} disabled={deletingProductId === product.product_id}>
                                                            {deletingProductId === product.product_id ? t('linkQr.processing') : t('product.delete')}
                                                        </Button>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                        <DialogHeader>
                                            <DialogTitle>{t('productDetails.title')}</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-6 py-4">
                                            <div className="aspect-[16/9] w-full relative rounded-lg overflow-hidden border">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <p className="text-xs text-gray-500 font-medium">{t('productDetails.name')}</p>
                                                    <p className="font-bold text-lg">{product.name}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-xs text-gray-500 font-medium">{t('productDetails.price')}</p>
                                                    <p className="font-bold text-lg text-emerald-600">¥{Number(product.price || 0).toLocaleString()}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-xs text-gray-500 font-medium">{t('productDetails.validDays')}</p>
                                                    <p className="font-medium">{product.valid_days || APP_CONFIG.DEFAULT_VALID_DAYS} {t('productDetails.validDaysSuffix')}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-xs text-gray-500 font-medium">ID</p>
                                                    <p className="font-mono text-xs text-gray-400 break-all">{product.product_id}</p>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <p className="text-xs text-gray-500 font-medium">{t('productDetails.description')}</p>
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{product.description || '-'}</p>
                                            </div>

                                            {product.detail_html && (
                                                <div className="space-y-4 pt-4 border-t">
                                                    <div className="space-y-2">
                                                        <p className="text-xs text-gray-500 font-medium">{t('productDetails.detailHtml')}</p>
                                                        <div className="border rounded-md p-4 bg-white shadow-sm overflow-hidden">
                                                            <SandboxedHtml html={product.detail_html} />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <p className="text-xs text-gray-500 font-medium">{t('productDetails.rawDetailHtml')}</p>
                                                        <textarea
                                                            readOnly
                                                            value={product.detail_html}
                                                            className="w-full h-32 p-3 text-xs font-mono bg-gray-50 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/20"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <DialogFooter>
                                            <DialogTrigger asChild>
                                                <Button variant="outline">{t('productDetails.close')}</Button>
                                            </DialogTrigger>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            ))}
                            {/* フォーム部分の幅を制限し、中央寄せにするために max-w-md と mx-auto を追加 */}
                            <Card className="col-span-2 sm:col-span-2 md:col-span-3 lg:col-span-4 max-w-lg mx-auto mt-8 mb-8 w-full">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>{t('addProduct.title')}</CardTitle>


                                    <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm">{t('importProduct.button')}</Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>{t('importProduct.dialogTitle')}</DialogTitle>
                                                <DialogDescription>{t('importProduct.dialogDesc')}</DialogDescription>
                                            </DialogHeader>
                                            <div className="space-y-4 py-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="importShop">{t('importProduct.selectShop')}</Label>
                                                    <select
                                                        id="importShop"
                                                        className="w-full p-2 border rounded-md"
                                                        value={selectedImportShopId}
                                                        onChange={(e) => setSelectedImportShopId(e.target.value)}
                                                    >
                                                        <option value="">{t('importProduct.placeholder')}</option>
                                                        {importShops.map(s => (
                                                            <option key={s.PK} value={s.PK}>{s.name || s.PK}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button variant="ghost" onClick={() => setIsImportDialogOpen(false)} disabled={isImporting}>
                                                    {t('importProduct.cancel')}
                                                </Button>
                                                <Button onClick={handleImportProducts} disabled={isImporting || !selectedImportShopId}>
                                                    {isImporting ? t('linkQr.processing') : t('importProduct.submit')}
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>

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
                                        {/* 
                                         <div className="space-y-2">
                                             <Label htmlFor="detail_html">{t('addProduct.detailHtml')}</Label>
                                             <textarea
                                                 id="detail_html"
                                                 name="detail_html"
                                                 className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                 placeholder={t('addProduct.detailHtmlPlaceholder')}
                                             />
                                         </div>
                                         */}
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
                                            <Input id="image" name="image" type="file" accept="image/png, image/jpeg, image/gif, image/webp" />
                                            <p className="text-xs text-gray-500">{t('addProduct.imagePlaceholder')}</p>
                                        </div>
                                        <Button type="submit" className="w-full" disabled={isCreatingProduct}>
                                            {isCreatingProduct ? t('linkQr.processing') : t('addProduct.submit')}
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </Card>



                {/* Order History */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
                            <div>
                                <CardTitle>{t('history.title')}</CardTitle>
                            </div>
                            <div className="flex flex-col w-full space-y-2 md:flex-row md:items-center md:space-x-2 md:space-y-0 md:w-auto">
                                <div className="flex w-full items-center space-x-2 md:max-w-sm">
                                    <Input
                                        placeholder={t('search.placeholder')}
                                        value={searchUuid}
                                        onChange={(e) => setSearchUuid(e.target.value)}
                                        className="w-full"
                                    />
                                    {searchUuid && (
                                        <Button variant="ghost" onClick={() => setSearchUuid('')} className="shrink-0">
                                            {t('search.clear')}
                                        </Button>
                                    )}
                                </div>
                                <Button variant="outline" size="sm" className="w-full shrink-0 md:w-auto" onClick={() => fetchShopData(true)} disabled={isRefreshing}>
                                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                    {t('refresh')}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 w-full">
                        <Table wrapperStyle={{ maxHeight: 'calc(100vh - 200px)' }}>
                            <TableHeader className="sticky top-0 bg-white z-10 drop-shadow-sm">
                                <TableRow>
                                    <TableHead className="text-xs md:text-sm">{t('orders.date')}</TableHead>
                                    <TableHead className="text-xs md:text-sm hidden sm:table-cell">{t('orders.productName')}</TableHead>
                                    <TableHead className="text-xs md:text-sm">{t('orders.status')}</TableHead>
                                    <TableHead className="text-xs md:text-sm hidden md:table-cell">{t('orders.shopMemo')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ordersLoading ? (
                                    <TableRow><TableCell colSpan={4} className="text-center py-4"><RefreshCw className="animate-spin h-5 w-5 mx-auto text-gray-400" /></TableCell></TableRow>
                                ) : orders
                                    .filter(o => ['LINKED', 'ACTIVE', 'SHIPPED', 'COMPLETED', 'EXPIRED', 'BANNED'].includes(o.status))
                                    .filter(o => !searchUuid || (o.id || o.qr_id).includes(searchUuid))
                                    .length === 0 ? (
                                    <TableRow><TableCell colSpan={3} className="text-center">{t('orders.noOrders')}</TableCell></TableRow>
                                ) : (
                                    orders
                                        .filter(o => ['LINKED', 'ACTIVE', 'SHIPPED', 'COMPLETED', 'EXPIRED', 'BANNED'].includes(o.status))
                                        .filter(o => !searchUuid || (o.id || o.qr_id).includes(searchUuid))
                                        .sort((a, b) => {
                                            const sortorder: { [name: string]: number } = { 'LINKED': 3, 'ACTIVE': 2, 'SHIPPED': 0, 'COMPLETED': 1, 'EXPIRED': 4, 'BANNED': 5 };
                                            // 1. Status: compare
                                            if (a.status !== b.status) return sortorder[a.status] - sortorder[b.status];
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
                                                            <TableCell className="text-xs md:text-sm">
                                                                {order.ts_updated_at ? (
                                                                    <div className="flex flex-col">
                                                                        <span className="whitespace-nowrap">{new Date(order.ts_updated_at).toLocaleDateString()}</span>
                                                                        <span className="text-[10px] text-gray-500 whitespace-nowrap">{new Date(order.ts_updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                    </div>
                                                                ) : "-"}
                                                            </TableCell>
                                                            <TableCell className="text-xs md:text-sm font-bold hidden md:table-cell">{product?.name || order.product_id}</TableCell>
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
                                                            <TableCell className="font-medium hidden md:table-cell">{order.memo_for_shop}</TableCell>
                                                        </TableRow>
                                                    </DialogTrigger>
                                                    <DialogContent className="max-w-md">
                                                        <DialogHeader>
                                                            <DialogTitle>{t('orders.details')}</DialogTitle>
                                                            <DialogDescription className="font-mono text-xs text-gray-500">
                                                                ID: {uuid}
                                                            </DialogDescription>
                                                        </DialogHeader>

                                                        <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
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
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.recipient')}</h4>
                                                                <p>{order.recipient_name}</p>
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.contact')}</h4>
                                                                <p className="break-all">{order.shipping_info?.email || '-'}</p>
                                                                <p className="text-sm mt-1">{order.shipping_info?.phone || '-'}</p>
                                                            </div>

                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.address')}</h4>
                                                                {order.postal_code && <p className="text-sm">〒{order.postal_code}</p>}
                                                                <p className="whitespace-pre-wrap text-sm">{order.address}</p>
                                                            </div>

                                                            <div>
                                                                <h4 className="text-sm font-semibold text-gray-500">{t('orders.preferredDateTime')}</h4>
                                                                <p className="text-sm">{order.preferred_date}  /  {order.preferred_time}</p>
                                                            </div>

                                                            {/* Order Info */}
                                                            <div className="pt-2 space-y-4">
                                                                {/* Read-only view for SHIPPED, or we could allow edit. For now keeping read-only as per previous pattern but showing memos */}
                                                                {order.memo_for_users && (
                                                                    <div>
                                                                        <h4 className="text-sm font-semibold text-gray-500">{t('orders.userMessage')}</h4>
                                                                        <p className="text-sm bg-blue-50 p-2 rounded">{order.memo_for_users}</p>
                                                                    </div>
                                                                )}
                                                                {order.memo_for_shop && (
                                                                    <div>
                                                                        <h4 className="text-sm font-semibold text-gray-500">{t('orders.shopMemo')}</h4>
                                                                        <p className="text-sm bg-gray-50 p-2 rounded">{order.memo_for_shop}</p>
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

                                                            <div className="">
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
