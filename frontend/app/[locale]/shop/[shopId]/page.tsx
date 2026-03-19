/**
 * ファイル概要: 個別ショップ管理のダッシュボード
 * 目的: 指定されたショップのQRコードリンク、商品作成・管理、受注一覧、および発送処理などの機能を提供します。
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, ArrowRight, HelpCircle, Camera, Settings, ShoppingBasket, Eye, Plus, Trash2, Copy, ImageIcon, Save, Loader2, Pencil, ChevronDown, Download, Check } from 'lucide-react';
import { notFound, useParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { fetchAuthSession, getCurrentUser, signOut } from 'aws-amplify/auth';
import { fetchWithAuth } from '@/app/utils/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from '@/components/ui/switch';
import QRScanner from '@/components/ui/qr-scanner';
import SandboxedHtml from '@/components/SandboxedHtml';
import { APP_CONFIG } from '@/lib/config';
import { generateId } from '@/lib/id';
import { resizeImage } from "@/lib/image-utils";
import { generatePDF, cardformats } from '@/lib/generatePDF';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// --- Effects ---
export default function ShopPage() {
    const t = useTranslations('ShopPage');
    const tr = useTranslations('ReceivePage');
    const tt = useTranslations('Time');
    const ts = useTranslations('Timestamp');
    const st = useTranslations('Status');
    const tc = useTranslations('Common');
    const tb = useTranslations('Backend');
    const params = useParams();
    const router = useRouter();
    const shopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId;

    const [shop, setShop] = useState<any>(null);
    const [userId, setUserId] = useState<string>('');
    const [products, setProducts] = useState<any[]>([]);
    const [qrCodes, setQrCodes] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [shopLoading, setShopLoading] = useState(true);
    const [productsLoading, setProductsLoading] = useState(true);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSettingUploading, setIsSettingUploading] = useState(false);
    const [isSettingShowHTML, setIsSettingShowHTML] = useState(false);
    const [error, setError] = useState('');
    const [debouncedPreviewHtml, setDebouncedPreviewHtml] = useState<string>('');
    const shopDetailRef = useRef<HTMLTextAreaElement>(null);
    const [isLinking, setIsLinking] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [scannedUuid, setScannedUuid] = useState('');
    const [qrStatusDetails, setQrStatusDetails] = useState<any>(null);
    const [showOptions, setShowOptions] = useState(false);
    const [isContinuousScan, setIsContinuousScan] = useState(false);
    const [scannedUuids, setScannedUuids] = useState<{ uuid: string, status?: any, error?: string }[]>([]);
    const lastScannedTimeRef = useRef<Record<string, number>>({});

    const [searchUuid, setSearchUuid] = useState('');
    const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);
    const [isCreatingProduct, setIsCreatingProduct] = useState(false);
    const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
    const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
    const [singleShopOwner, setSingleShopOwner] = useState<boolean>(true);

    // Import Product State
    const [isImporting, setIsImporting] = useState(false);
    const [importShops, setImportShops] = useState<any[]>([]);
    const [selectedImportShopId, setSelectedImportShopId] = useState('');
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [htmlImageUrls, setHtmlImageUrls] = useState<string[]>([]);
    const [htmlImageUrlsToDelete, setHtmlImageUrlsToDelete] = useState<string[]>([]);
    const [isHtmlImageSectionOpen, setIsHtmlImageSectionOpen] = useState(false);
    const [isUploadingHtmlImage, setIsUploadingHtmlImage] = useState(false);
    const [sessionUploadedUrls, setSessionUploadedUrls] = useState<string[]>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminEmails, setAdminEmails] = useState<{ owner_email: string, manager_emails: string[] } | null>(null);

    const checkAdminAuth = async () => {
        try {
            const session = await fetchAuthSession();
            if (session.tokens) {
                const groups = (session.tokens.idToken?.payload['cognito:groups'] as string[]) || [];
                const isAdmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');
                setIsAdmin(isAdmin);
            }
        } catch (e) {
            // Not logged in
        }
    };

    const handleCopy = (id: string) => {
        navigator.clipboard.writeText(id).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };


    // Protect Route
    useEffect(() => {
        checkAuth();
        checkAdminAuth();
        fetchShops();
    }, []);

    const checkAuth = async () => {
        try {
            const userinfo = await getCurrentUser();
            setUserId(userinfo.userId)
            // If successful, proceed to load data
        } catch (e) {
            router.push('/login');
        }
    };

    const fetchShops = async () => {
        try {
            const res = await fetchWithAuth('/shop');
            if (res.ok) {
                const data = await res.json();
                const shopList = data.shops || [];

                // Auto-redirect if SHOP_MANAGER and has exactly one shop
                if (shopList.length > 1) {
                    setSingleShopOwner(false);
                }
            }
        } catch (e) {
            // console.error(e);
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
                if (data.html_image_urls) {
                    setHtmlImageUrls(data.html_image_urls);
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
                // console.error(e);
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
                // console.error(e);
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
                // console.error(e);
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
                setImportShops((data.shops || []).filter((s: any) => s.id !== shopId));
            }
        } catch (error) {
            // console.error('Failed to fetch import shops', error);
        }
    };

    const fetchAdminEmails = async () => {
        try {
            const res = await fetchWithAuth(`/shop/${shopId}/admins`, {
                method: 'POST'
            });
            if (res.ok) {
                const data = await res.json();
                setAdminEmails(data);
            }
        } catch (e) {
            // console.error('Failed to fetch admin emails', e);
        }
    };

    useEffect(() => {
        if (isImportDialogOpen) {
            fetchImportShops();
        }
    }, [isImportDialogOpen, shopId]);

    // Reset settings state when dialog opens or closes
    useEffect(() => {
        if (shop) {
            if (shop.html_image_urls) {
                setHtmlImageUrls(shop.html_image_urls);
            } else {
                setHtmlImageUrls([]);
            }
            if (shop.detail_html) {
                setDebouncedPreviewHtml(shop.detail_html);
            } else {
                setDebouncedPreviewHtml('');
            }
        }
        setIsHtmlImageSectionOpen(false);
        setIsUploadingHtmlImage(false);
        setHtmlImageUrlsToDelete([]);
        setSessionUploadedUrls([]);
    }, [isSettingsOpen, shop]);

    const handleSettingsOpenChange = async (open: boolean) => {
        if (!open && sessionUploadedUrls.length > 0) {
            // Closed without save - Cleanup temporary uploads
            try {
                await fetchWithAuth(`/shop/${shopId}/delete-images`, {
                    method: 'POST',
                    body: JSON.stringify({ urls: sessionUploadedUrls })
                });
            } catch (e) {
                // console.error('Failed to cleanup temporary images', e);
            }
            setSessionUploadedUrls([]);
        }
        if (open) {
            fetchAdminEmails();
        }
        setIsSettingsOpen(open);
        setIsSettingShowHTML(false)
    };

    const handleHtmlImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingHtmlImage(true);
        try {
            let uploadFile: File | Blob = file;
            if (file.type.startsWith("image/")) {
                try {
                    uploadFile = await resizeImage(file);
                } catch (err) {
                    // console.error("Resize failed", err);
                }
            }

            // 1. Get Presigned URL
            const res = await fetchWithAuth(`/shop/${shopId}/products/upload-url`, {
                method: 'POST',
                body: JSON.stringify({
                    filename: `${generateId()}.webp`,
                    contentType: 'image/webp',
                    folder: 'shopcontent'
                })
            });

            if (!res.ok) throw new Error('Failed to get upload URL');
            const { uploadUrl, publicUrl } = await res.json();

            // 2. Upload to S3
            const uploadRes = await fetch(uploadUrl, {
                method: 'PUT',
                body: uploadFile,
                headers: { 'Content-Type': uploadFile.type }
            });

            if (!uploadRes.ok) throw new Error('Failed to upload image');

            // 3. Update State
            setHtmlImageUrls(prev => [...prev, publicUrl]);
            setSessionUploadedUrls(prev => [...prev, publicUrl]);
        } catch (err: any) {
            // console.error('HTML Image upload failed:', err);
            alert(t('addProduct.imageUploadFailed') + ': ' + (tb(err.message.replace(/\./g, '_')) || err.message));
        } finally {
            setIsUploadingHtmlImage(false);
        }
    };

    const handleShops = async () => {
        try {
            router.push('/shop');
        } catch (error) {
            // console.error('Error move to shops: ', error);
        }
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
                const randomName = generateId();
                const filename = `${randomName}.${ext}`;

                // Cast Blob back to File-like object if necessary, or just use blob body
                const resizedFile = new File([resizedBlob], filename, { type: file.type });

                // Get Presigned URL
                const uploadRes = await fetchWithAuth(`/shop/${shopId}/products/upload-url`, {
                    method: 'POST',
                    body: JSON.stringify({
                        filename: `${generateId()}.webp`,
                        contentType: 'image/webp'
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
            // console.error(err);
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
        const productId = formData.get('product_id') as string;
        const memo_for_users = formData.get('memo_for_users') as string;
        const memo_for_shop = formData.get('memo_for_shop') as string;

        // Process all non-error UUIDs.
        const itemsToProcess = scannedUuids.filter(item => !item.error);

        let successCount = 0;
        let errors: string[] = [];

        try {
            for (const item of itemsToProcess) {
                const uuid = item.uuid;
                const finalProductId = (item.status?.product_linked)
                    ? item.status.product_id
                    : productId;

                if (!finalProductId) {
                    errors.push(`${uuid}: ${t('linkQr.selectPlaceholder')}`);
                    continue;
                }

                const body: any = {
                    qr_id: uuid,
                    product_id: finalProductId,
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
                    errors.push(`${uuid}: ${errorData.message || 'Failed to link'}`);
                } else {
                    successCount++;
                }
            }

            if (errors.length > 0) {
                alert(`${t('linkQr.success')} (${successCount})\n\n${tc('error')}:\n${errors.join('\n')}`);
            } else {
                alert(t('linkQr.success') + ` (${successCount})`);
            }

            if (successCount > 0) {
                form.reset();
                setScannedUuid('');
                setScannedUuids([]);
                setIsContinuousScan(false);
                setQrStatusDetails(null);
                setShowOptions(false);
                fetchShopData();
            }
        } catch (err: any) {
            alert(t('linkQr.error') + ": " + (tb(err.message.replace(/\./g, '_')) || err.message));
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
            alert((tb(err.message.replace(/\./g, '_')) || err.message) + (err.relatedQRs ? "\n" + err.relatedQRs.join(", ") : ""));
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
        } catch (e) { // console.error(e); 
        } finally {
            setTogglingProductId(null);
        }
    };

    const handleUpdateOrderMeta = async (qrId: string, deliveryCompany?: string, trackingNumber?: string, memoForUsers?: string, memoForShop?: string) => {
        setShippingOrderId(qrId);
        try {
            const body: any = {};
            if (deliveryCompany !== undefined) body.delivery_company = deliveryCompany;
            if (trackingNumber !== undefined) body.tracking_number = trackingNumber;
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
                alert(t('orders.updateFailed') + ': ' + (tb(errData.message.replace(/\./g, '_')) || errData.message || errData.error || tc('unknownError')));
            }
        } catch (e: any) {
            // console.error(e);
            alert(t('orders.updateError') + ': ' + (tb(e.message.replace(/\./g, '_')) || e.message || String(e)));
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
                alert(`${tb(data.message.replace(/\./g, '_')) || data.message} (${data.imported} items)`);
                setIsImportDialogOpen(false);
                setSelectedImportShopId('');
                fetchShopData(); // Refresh product list
            } else {
                alert(`${tc('error')}: ${tb(data.message.replace(/\./g, '_')) || data.message}`);
            }
        } catch (error: any) {
            // console.error('Import failed', error);
            alert(t('importProduct.failed') + ': ' + (tb(error.message.replace(/\./g, '_')) || error.message));
        } finally {
            setIsImporting(false);
        }
    };

    const handleUpdateShop = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        setIsSettingUploading(true);

        try {
            const res = await fetchWithAuth(`/shop/${shopId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name: formData.get('shop_name'),
                    detail_html: formData.get('shop_detail_html'),
                    html_image_urls: htmlImageUrls,
                    deleted_html_image_urls: htmlImageUrlsToDelete
                })
            });
            if (res.ok) {
                alert(t('shopSettings.success'));
                setSessionUploadedUrls([]); // Clear tracking on success
                fetchShopData();
                setIsSettingsOpen(false);
            } else {
                alert(t('shopSettings.failed'));
            }
        } catch (err) {
            // console.error(err);
            alert(t('shopSettings.error'));
        } finally {
            setIsSettingUploading(false);
        }
    };

    const handleUpdatePreview = () => {
        if (shopDetailRef.current) {
            setDebouncedPreviewHtml(shopDetailRef.current.value);
        }
    };

    const [shipOptionOpenId, setShipOptionOpenId] = useState<string | null>(null);
    const [isManualInput, setisManualInput] = useState(false);
    const [manualInput, setManualInput] = useState('');

    const handleScanSuccess = async (decodedText: string) => {
        let uuid = decodedText;
        if (decodedText.includes('/')) {
            uuid = decodedText.split('/').pop() || decodedText;
        }

        const now = Date.now();
        const lastScanTime = lastScannedTimeRef.current[uuid] || 0;
        if (now - lastScanTime < 2000) {
            return;
        }
        lastScannedTimeRef.current[uuid] = now;

        // Skip if already in list (for continuous scan)
        if (scannedUuids.some(item => item.uuid === uuid)) {
            return;
        }

        if (isContinuousScan) {
            setScannedUuids(prev => [...prev, { uuid }]);

            // Status check for sequential scan
            try {
                const res = await fetchWithAuth(`/shop/${shopId}/qrcodecheck`, {
                    method: 'POST',
                    body: JSON.stringify({ qr_id: uuid })
                });
                const data = await res.json();
                if (!res.ok) {
                    const translatedError = data.message ? tb(data.message.replace(/\./g, '_')) : t('linkQr.foreignQrError');
                    setScannedUuids(prev => prev.map(item =>
                        item.uuid === uuid ? { ...item, error: translatedError } : item
                    ));
                    return;
                }
                setScannedUuids(prev => prev.map(item =>
                    item.uuid === uuid ? { ...item, status: data } : item
                ));
            } catch (err: any) {
                setScannedUuids(prev => prev.map(item =>
                    item.uuid === uuid ? { ...item, error: err.message || 'Check failed' } : item
                ));
            }
            return;
        }

        // Single scan mode
        setScannedUuids([{ uuid }]);
        setScannedUuid(uuid);
        setIsScanning(false);
        checkQrStatus(uuid);
    };

    const checkQrStatus = async (uuid: string) => {
        setQrStatusDetails(null);
        try {
            const res = await fetchWithAuth(`/shop/${shopId}/qrcodecheck`, {
                method: 'POST',
                body: JSON.stringify({ qr_id: uuid })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const translatedError = errData.message ? tb(errData.message.replace(/\./g, '_')) : t('linkQr.foreignQrError');
                setScannedUuids([{ uuid, error: translatedError }]);
                alert(translatedError + (errData.detail ? ` (${errData.detail})` : ''));
                return;
            }
            const data = await res.json();
            setScannedUuid(uuid);
            setQrStatusDetails(data);
            setScannedUuids([{ uuid, status: data }]);
        } catch (error: any) {
            const translatedError = error.message ? tb(error.message.replace(/\./g, '_')) : t('linkQr.foreignQrError');
            setScannedUuids([{ uuid, error: translatedError }]);
            alert(translatedError + (error.detail ? ` (${error.detail})` : ''));
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
                        <p className="text-xs text-gray-500">{t('shopId')} :  {shopId}</p>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Dialog open={isSettingsOpen} onOpenChange={handleSettingsOpenChange}>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-gray-500 hover:text-gray-900 cursor-pointer">
                                    <Settings className="h-5 w-5" />
                                    <span className="sr-only">{t('shopSettings.title')}</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent key={isSettingsOpen ? 'open' : 'closed'} className="max-w-[95vw] sm:max-w-[95vw] w-full max-h-[95vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>{t('shopSettings.title')}</DialogTitle>
                                    <DialogDescription>{t('shopSettings.description')}</DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleUpdateShop} className="space-y-4 py-4">
                                    <div className="space-y-4 py-2 border-b pb-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">{t('shopSettings.ownerEmail')}</Label>
                                            <div className="text-sm font-medium">{adminEmails?.owner_email || '---'}</div>
                                        </div>
                                        {adminEmails?.manager_emails && adminEmails.manager_emails.length > 0 && (
                                            <div className="space-y-1">
                                                <Label className="text-xs text-gray-500">{t('shopSettings.managerEmails')}</Label>
                                                <div className="flex flex-wrap gap-2 text-sm font-medium">
                                                    {adminEmails.manager_emails.map((email, idx) => (
                                                        <div key={idx} className="bg-gray-100 px-2 py-0.5 rounded text-xs">{email}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="shop_name">{t('shopSettings.name')}</Label>
                                        <Input id="shop_name" name="shop_name" defaultValue={shop?.name} required />
                                    </div>

                                    {isSettingShowHTML && (
                                        <div className="space-y-2">
                                            <Label htmlFor="shop_detail_html">{t('shopSettings.detailHtml')}</Label>
                                            <div className="border rounded-md overflow-hidden bg-gray-50/30 min-h-[400px] h-[calc(95vh-500px)] flex flex-col lg:flex-row">
                                                <div className="flex-1 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r bg-white">
                                                    <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center shrink-0 min-h-[50px]">
                                                        <Label htmlFor="shop_detail_html" className="text-xs font-bold text-gray-600 uppercase tracking-wider">{t('shopSettings.sourcecode')}</Label>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => {
                                                                    const link = document.createElement('a');
                                                                    link.href = '/prompts/landing-page-prompt.md';
                                                                    link.download = 'landing-page-prompt.md';
                                                                    link.click();
                                                                }}
                                                                className="h-7 px-2 text-[10px] gap-1 bg-white border-green-200 text-green-600 hover:bg-green-50 hover:text-green-700 hover:border-green-300"
                                                            >
                                                                <Download className="w-3 h-3" />
                                                                {t('shopSettings.downloadPrompt')}
                                                            </Button>
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
                                                    <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center shrink-0 min-h-[50px]">
                                                        <Label className="text-xs font-bold text-gray-600 uppercase tracking-wider">{t('shopSettings.preview')}</Label>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => {
                                                                    const link = document.createElement('a');
                                                                    link.href = '/prompts/landing-page-prompt.md';
                                                                    link.download = 'landing-page-prompt.md';
                                                                    link.click();
                                                                }}
                                                                className="h-7 px-2 text-[10px] gap-1 bg-white border-green-200 text-green-600 hover:bg-green-50 hover:text-green-700 hover:border-green-300"
                                                            >
                                                                <Download className="w-3 h-3" />
                                                                {t('shopSettings.downloadPrompt')}
                                                            </Button>
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
                                                            <CardContent className="min-h-0 flex flex-1 p-0 w-full p-4"> {/* w-fullを追加 */}
                                                                <div className="w-full mt-0 mr-0 ml-0 p-0 relative rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
                                                                    {/* コンテンツ */}
                                                                    <SandboxedHtml html={debouncedPreviewHtml} />
                                                                    {/* Overly to "gather" the corners */}
                                                                    <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-black/5 ring-inset" />
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* HTML Images Section */}
                                            <div className="space-y-2 pt-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setIsHtmlImageSectionOpen(!isHtmlImageSectionOpen)}
                                                    className="w-full flex justify-between items-center text-gray-500 hover:text-gray-900 px-2"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <ImageIcon className="w-4 h-4" />
                                                        <span className="font-semibold">{tr('senderInfo.labels.detail_html-images')}</span>
                                                    </div>
                                                    <ChevronDown className={`w-4 h-4 transition-transform ${isHtmlImageSectionOpen ? 'rotate-180' : ''}`} />
                                                </Button>

                                                {isHtmlImageSectionOpen && (
                                                    <div className="space-y-4 p-4 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                                            {htmlImageUrls.map((url, index) => (
                                                                <div key={index} className="group relative aspect-square bg-white rounded-md border overflow-hidden shadow-sm hover:ring-2 hover:ring-primary/30 transition-all">
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img
                                                                        src={url}
                                                                        alt={`HTML content ${index}`}
                                                                        className="w-full h-full object-cover"
                                                                        onError={(e) => {
                                                                            (e.target as HTMLImageElement).src = 'https://placehold.co/200x200?text=Error';
                                                                        }}
                                                                    />
                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                                        <Button
                                                                            type="button"
                                                                            variant="secondary"
                                                                            size="icon"
                                                                            className="h-8 w-8 rounded-full bg-white/90 hover:bg-white"
                                                                            onClick={() => {
                                                                                navigator.clipboard.writeText(url);
                                                                                alert(t('shopSettings.copySuccess'));
                                                                            }}
                                                                            title={t('shopSettings.copyUrl')}
                                                                        >
                                                                            <Copy className="h-4 w-4 text-gray-700" />
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            variant="destructive"
                                                                            size="icon"
                                                                            className="h-8 w-8 rounded-full"
                                                                            onClick={() => {
                                                                                setHtmlImageUrlsToDelete(prev => [...prev, url]);
                                                                                setHtmlImageUrls(prev => prev.filter((_, i) => i !== index));
                                                                            }}
                                                                            title={t('product.delete')}
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            ))}

                                                            <label className="flex flex-col items-center justify-center aspect-square bg-white rounded-md border border-dashed border-gray-300 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all group">
                                                                <div className="flex flex-col items-center gap-1 text-gray-400 group-hover:text-primary transition-colors">
                                                                    {isUploadingHtmlImage ? (
                                                                        <RefreshCw className="w-6 h-6 animate-spin" />
                                                                    ) : (
                                                                        <>
                                                                            <Plus className="w-6 h-6" />
                                                                            <span className="text-[10px] font-medium">{tr('senderInfo.labels.detail_html-addimage')}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                                <input
                                                                    type="file"
                                                                    className="hidden"
                                                                    accept="image/*"
                                                                    onChange={handleHtmlImageUpload}
                                                                    disabled={isUploadingHtmlImage}
                                                                    onClick={(e) => (e.target as HTMLInputElement).value = ''}
                                                                />
                                                            </label>
                                                        </div>
                                                        <p className="text-[10px] text-gray-400 italic">
                                                            {t('shopSettings.imageHint')}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {!isSettingShowHTML && (
                                        <div className="flex w-full justify-center items-center">
                                            <Button variant="ghost" className="text-xs text-gray-500 text-center" onClick={() => setIsSettingShowHTML(!isSettingShowHTML)}>
                                                <ChevronDown className="w-4, h-4" />{t('shopSettings.detailHtml')}
                                            </Button>
                                        </div>
                                    )}

                                    <DialogFooter>
                                        <Button type="submit" className="w-full" disabled={isSettingUploading}>
                                            {isSettingUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('shopSettings.submit')}
                                        </Button>
                                    </DialogFooter>
                                </form>
                                <div className="y-gap-0 border-t">
                                    <p className="text-xs text-gray-500">{t('userId')} :  {userId}</p>
                                    <p className="text-xs text-gray-500">{t('ownerId')} :  {shop?.owner_id}</p>
                                    <p className="text-xs text-gray-500">{t('shopId')} :  {shopId}</p>
                                </div>
                            </DialogContent>
                            <DialogFooter>
                            </DialogFooter>
                        </Dialog>
                        {!singleShopOwner || isAdmin && <Button variant="secondary" className="shadow-md cursor-pointer border border-gray-200" onClick={handleShops}>{t('movetoshops')}</Button>}
                        <Button
                            variant="ghost"
                            className="hover:bg-red-50 hover:text-red-600 cursor-pointer"
                            onClick={async () => {
                                await signOut();
                                router.push('/login');
                            }}
                        >
                            {t('logout')}
                        </Button>
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
                                        <Dialog open={isScanning} onOpenChange={(open) => {
                                            setIsScanning(open);
                                            if (open) {
                                                setManualInput('');
                                                setQrStatusDetails(null);
                                                setScannedUuids([]);
                                            }
                                        }}
                                        >
                                            <DialogTrigger asChild>
                                                <Button type="button" variant="outline" className="w-full h-auto flex flex-col justify-center items-center gap-4 text-xl py-16 bg-gray-300">
                                                    <div style={{ width: '100px', aspectRatio: '1' }}>
                                                        <Camera style={{ width: '100%', height: '100%', display: 'block' }} />
                                                    </div>
                                                    <span>{t('linkQr.scan')}</span>
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-h-[94vh] max-w-[95vw] md:max-w-3xl lg:max-w-3xl w-full h-full overflow-y-auto">
                                                <DialogHeader>
                                                    <DialogTitle>{t('linkQr.scanDialog.title')}</DialogTitle>
                                                    <DialogDescription>{t('linkQr.scanDialog.description')}</DialogDescription>
                                                </DialogHeader>
                                                <div className="p-4 min-h-[300px] flex flex-col gap-y-4">
                                                    <div className="flex items-center justify-center h-[20px] gap-x-2">
                                                        <Switch
                                                            id="continuous-scan"
                                                            checked={isContinuousScan}
                                                            onCheckedChange={setIsContinuousScan}
                                                        />
                                                        <div className="flex flex-col">
                                                            <Label htmlFor="continuous-scan" className="text-sm font-bold">{t('linkQr.continuousScan')}</Label>
                                                            {isContinuousScan && (
                                                                <span className="text-[10px] text-blue-600 font-bold">{t('linkQr.scannedCount', { count: scannedUuids.length })}</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="w-full aspect-square items-center justify-center h-[400px]">

                                                        <QRScanner
                                                            qrCodeSuccessCallback={handleScanSuccess}
                                                            qrbox={250}
                                                            disableFlip={false}

                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-4">
                                                        {isContinuousScan && scannedUuids.length > 0 && (
                                                            <Button
                                                                type="button"
                                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                                                onClick={async () => {
                                                                    const validItems = scannedUuids.filter(item => !item.error);
                                                                    if (validItems.length > 0) {
                                                                        setScannedUuid(validItems.map(item => item.uuid).join('\n'));
                                                                        setIsScanning(false);
                                                                    }
                                                                }}
                                                            >
                                                                {t('linkQr.finishScan')} ({scannedUuids.length})
                                                            </Button>
                                                        )}
                                                        {isContinuousScan && scannedUuids.length > 0 && (
                                                            <div className="mt-2 border rounded-md bg-gray-50 max-h-[80vh] overflow-y-auto">
                                                                <ul className="text-[10px] font-mono p-2 space-y-1">
                                                                    {scannedUuids.map((item, i) => (
                                                                        <li key={item.uuid} className="border-b last:border-0 pb-1 last:pb-0 flex flex-col">
                                                                            <div className="flex justify-between items-center">
                                                                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                                    <span className="truncate">{i + 1}. {item.uuid}</span>
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="icon"
                                                                                        className="h-4 w-4 shrink-0"
                                                                                        onClick={() => handleCopy(item.uuid)}
                                                                                    >
                                                                                        {copiedId === item.uuid ? (
                                                                                            <Check className="h-3 w-3 text-green-500" />
                                                                                        ) : (
                                                                                            <Copy className="h-3 w-3" />
                                                                                        )}
                                                                                    </Button>
                                                                                </div>
                                                                                {item.status ? (
                                                                                    <span className={`text-[8px] px-1 rounded ${item.status.product_linked ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                                                        {item.status.product_linked ? item.status.product_name : 'OK'}
                                                                                    </span>
                                                                                ) : item.error ? (
                                                                                    <span className="text-[8px] px-1 rounded bg-red-100 text-red-700">{item.error}</span>
                                                                                ) : (
                                                                                    <span className="animate-pulse">...</span>
                                                                                )}
                                                                            </div>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {isManualInput && !(isContinuousScan && scannedUuids.length > 0) && (
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
                                                        )}
                                                        {!isManualInput && !isContinuousScan && (
                                                            <div className="flex justify-center">
                                                                <Button type="button" variant="ghost" size="sm" onClick={() => setisManualInput(true)} className="h-8 text-xs text-gray-500 hover:text-gray-900 px-2 -ml-2 right">
                                                                    {t('linkQr.manualinput')}
                                                                </Button>
                                                            </div>
                                                        )}

                                                        {/* <Button type="button" variant="ghost" onClick={() => setIsScanning(false)}>
                                                        {t('linkQr.scanDialog.cancel')}
                                                    </Button> */}
                                                    </div>
                                                </div>

                                                <DialogFooter className="">

                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="space-y-4">
                                            {/* Linked Section */}
                                            {scannedUuids.filter(item => item.status?.product_linked).length > 0 && (
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-bold text-gray-500 flex items-center gap-2">
                                                        <div className="w-1 h-4 bg-amber-400 rounded-full" />
                                                        {t('linkQr.linkedTitle')}
                                                    </Label>
                                                    <div className="bg-amber-50/50 rounded-lg border border-amber-100 divide-y divide-amber-100 max-h-[150px] overflow-y-auto">
                                                        {scannedUuids.filter(item => item.status?.product_linked).map((item) => (
                                                            <div key={item.uuid} className="p-3 flex justify-between items-center bg-white/40">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono text-xs">{item.uuid}</span>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-4 w-4"
                                                                        onClick={(e) => { e.stopPropagation(); handleCopy(item.uuid); }}
                                                                    >
                                                                        {copiedId === item.uuid ? (
                                                                            <Check className="h-3 w-3 text-green-500" />
                                                                        ) : (
                                                                            <Copy className="h-3 w-3" />
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                                                                    {item.status.product_name}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Available Section */}
                                            {scannedUuids.filter(item => item.status && !item.status.product_linked).length > 0 && (
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-bold text-blue-600 flex items-center gap-2">
                                                        <div className="w-1 h-4 bg-blue-500 rounded-full" />
                                                        {t('linkQr.availableTitle')}
                                                    </Label>
                                                    <div className="bg-blue-50/30 rounded-lg border border-blue-100 divide-y divide-blue-100 max-h-[150px] overflow-y-auto">
                                                        {scannedUuids.filter(item => item.status && !item.status.product_linked).map((item) => (
                                                            <div key={item.uuid} className="p-3 bg-white/40 flex items-center gap-2">
                                                                <span className="font-mono text-xs">{item.uuid}</span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-4 w-4"
                                                                    onClick={(e) => { e.stopPropagation(); handleCopy(item.uuid); }}
                                                                >
                                                                    {copiedId === item.uuid ? (
                                                                        <Check className="h-3 w-3 text-green-500" />
                                                                    ) : (
                                                                        <Copy className="h-3 w-3" />
                                                                    )}
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Unified Action Area */}
                                        <div className="space-y-4 pt-4 border-t border-gray-100">
                                            <div className="space-y-4 bg-gray-50 p-4 rounded-xl border-dashed border-2">
                                                <select
                                                    id="product_id"
                                                    name="product_id"
                                                    className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                    required={scannedUuids.some(item => item.status && !item.status.product_linked)}
                                                    defaultValue=""
                                                >
                                                    <option value="" disabled>{t('linkQr.selectPlaceholder')}</option>
                                                    {products.filter(p => p.status === 'ACTIVE').map(p => (
                                                        <option key={p.product_id} value={p.product_id}>{p.name}</option>
                                                    ))}
                                                </select>

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

                                                <Button type="submit" className="w-full font-bold text-lg h-16 shadow-lg shadow-blue-100" disabled={isLinking}>
                                                    {isLinking ? t('linkQr.processing') : t('linkQr.submit')}
                                                    <ArrowRight className="ml-2 h-5 w-5" />
                                                </Button>
                                            </div>

                                            <div className="flex justify-center">
                                                <Button type="button" variant="ghost" size="sm" onClick={() => { setScannedUuid(''); setScannedUuids([]); setQrStatusDetails(null); setShowOptions(false); lastScannedTimeRef.current = {}; }} className="text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                                    {t('linkQr.clear')}
                                                </Button>
                                            </div>
                                        </div>
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
                                    <TableRow><TableCell colSpan={4} className="text-center">{t('orders.noOrders')}</TableCell></TableRow>
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
                                                            <DialogDescription className="font-mono text-xs text-gray-500 flex items-center gap-2">
                                                                ID: {uuid}
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={(e) => { e.stopPropagation(); handleCopy(uuid); }}
                                                                >
                                                                    {copiedId === uuid ? (
                                                                        <Check className="h-3 w-3 text-green-500" />
                                                                    ) : (
                                                                        <Copy className="h-3 w-3" />
                                                                    )}
                                                                </Button>
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

                                                            {/* Card Preview */}
                                                            {order.card_design && (
                                                                <div className="space-y-2">
                                                                    <h4 className="text-sm font-semibold text-gray-500">{t('linkQr.cardDesign')}</h4>
                                                                    {(order.thumbf || order.thumbb || cardformats[order.card_design]) && (
                                                                        <div className="grid grid-cols-2 gap-2">
                                                                            <div className="space-y-1">
                                                                                <div className="aspect-[84/52] relative rounded shadow-sm overflow-hidden border border-gray-100 bg-white">
                                                                                    <img
                                                                                        src={order.thumbf || cardformats[order.card_design]?.bgimgf}
                                                                                        alt="Front"
                                                                                        className="w-full h-full object-cover"
                                                                                        crossOrigin="anonymous"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                <div className="aspect-[84/52] relative rounded shadow-sm overflow-hidden border border-gray-100 bg-white">
                                                                                    <img
                                                                                        src={order.thumbb || cardformats[order.card_design]?.bgimgb}
                                                                                        alt="Back"
                                                                                        className="w-full h-full object-cover"
                                                                                        crossOrigin="anonymous"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

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
                                                                <p className="text-sm">{order.preferred_date ? order.preferred_date : '-'}  /  {order.preferred_time ? tt(order.preferred_time) : '-'}</p>
                                                            </div>

                                                            {/* User Message & Shop Memo Section (Editable - Unified for all statuses) */}


                                                            {/* Shipping Action Section (Visible only when status is USED) */}
                                                            {order.status === 'USED' && (
                                                                <div className="mt-4 p-4 border-2 border-orange-200 rounded-xl bg-orange-50/50 shadow-sm">
                                                                    <div className="flex items-center gap-2 mb-4">
                                                                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                                                                        <h4 className="text-sm font-bold text-orange-900 uppercase tracking-wide">{t('orders.action')}</h4>
                                                                    </div>
                                                                    <form onSubmit={(e) => {
                                                                        e.preventDefault();
                                                                        const fd = new FormData(e.target as HTMLFormElement);
                                                                        handleUpdateOrderMeta(
                                                                            uuid,
                                                                            fd.get('delivery_company') as string,
                                                                            fd.get('tracking') as string
                                                                        );
                                                                    }} className="space-y-4">
                                                                        <div className="space-y-2">
                                                                            <Label htmlFor={`delivery_company-${uuid}`} className="text-orange-900/70">{t('orders.shipDialog.deliveryCompany')}</Label>
                                                                            <Input id={`delivery_company-${uuid}`} name="delivery_company" placeholder={t('orders.shipDialog.deliveryCompanyPlaceholder')} required className="bg-white border-orange-100 focus:border-orange-500 focus:ring-orange-500" />
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <Label htmlFor={`tracking-${uuid}`} className="text-orange-900/70">{t('orders.shipDialog.label')}</Label>
                                                                            <Input id={`tracking-${uuid}`} name="tracking" placeholder="1234-5678..." required className="bg-white border-orange-100 focus:border-orange-500 focus:ring-orange-500" />
                                                                        </div>

                                                                        <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-10 shadow-md transition-all active:scale-[0.98]" disabled={shippingOrderId === uuid}>
                                                                            {shippingOrderId === uuid ? (
                                                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('linkQr.processing')}</>
                                                                            ) : (
                                                                                t('orders.shipDialog.submit')
                                                                            )}
                                                                        </Button>
                                                                    </form>
                                                                </div>
                                                            )}


                                                            {/* Admin Meta Edit Section */}
                                                            <div className="pt-6 border-t border-dashed mt-6">
                                                                <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                                    <Pencil className="w-4 h-4 text-gray-400" />
                                                                    {t('orders.updateMeta')}
                                                                </h4>
                                                                <form onSubmit={async (e) => {
                                                                    e.preventDefault();
                                                                    const fd = new FormData(e.currentTarget);
                                                                    await handleUpdateOrderMeta(
                                                                        uuid,
                                                                        undefined,
                                                                        undefined,
                                                                        fd.get('memo_for_users') as string,
                                                                        fd.get('memo_for_shop') as string
                                                                    );
                                                                }} className="space-y-4">

                                                                    <div className="space-y-2">
                                                                        <Label htmlFor={`m_u-${uuid}`} className="text-xs text-gray-500">{t('orders.userMessage')}</Label>
                                                                        <Textarea
                                                                            id={`m_u-${uuid}`}
                                                                            name="memo_for_users"
                                                                            defaultValue={order.memo_for_users || ""}
                                                                            disabled={['COMPLETED', 'EXPIRED', 'BANNED'].includes(order.status)}
                                                                            placeholder={['COMPLETED', 'EXPIRED', 'BANNED'].includes(order.status) ? t('orders.shipDialog.Completed-state messages cannot be updated') : ""}
                                                                            className="text-sm min-h-[60px]"
                                                                        />
                                                                    </div>

                                                                    <div className="space-y-2">
                                                                        <Label htmlFor={`m_s-${uuid}`} className="text-xs text-gray-500">{t('orders.shopMemo')}</Label>
                                                                        <Textarea
                                                                            id={`m_s-${uuid}`}
                                                                            name="memo_for_shop"
                                                                            defaultValue={order.memo_for_shop || ""}
                                                                            className="text-sm min-h-[60px]"
                                                                        />
                                                                    </div>

                                                                    <Button
                                                                        type="submit"
                                                                        className="w-full"
                                                                        disabled={shippingOrderId === uuid}
                                                                    >
                                                                        {shippingOrderId === uuid ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                                                        {shippingOrderId === uuid ? t('orders.processing') : t('shopSettings.submit')}
                                                                    </Button>
                                                                </form>
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




                {/* Existing Products */}
                <Card style={{ maxHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                                                <img
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    className="w-full aspect-video object-contain bg-gray-100"
                                                />
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
                                                    {t('addProduct.validDays')}: {product.valid_days ? product.valid_days : APP_CONFIG.DEFAULT_VALID_DAYS}{t('productDetails.validDaysSuffix')}
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
                                                <>
                                                    <div className="w-full space-y-4 pt-4 border-t">
                                                        <div className="w-full space-y-2">
                                                            <p className="w-full text-xs text-gray-500 font-medium">{t('productDetails.detailHtml')}</p>
                                                            <div className="w-full border rounded-md p-4 bg-white shadow-sm overflow-hidden">
                                                                <CardContent className="min-h-0 flex flex-1 p-0 w-full"> {/* w-fullを追加 */}
                                                                    <div className="w-full mt-0 mr-0 ml-0 p-0 relative"> {/* w-fullを追加 */}
                                                                        {/* Top fade effect */}
                                                                        {/* <div className="absolute top-0 left-0 right-0 h-5 bg-gradient-to-b from-white to-transparent pointer-events-none z-10" /> */}

                                                                        {/* コンテンツ */}
                                                                        <SandboxedHtml html={debouncedPreviewHtml} />

                                                                        {/* Bottom fade effect */}
                                                                        {/* <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-white to-transparent pointer-events-none z-10" /> */}
                                                                    </div>
                                                                </CardContent>
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
                                                </>
                                                // <div className="w-full space-y-4 pt-4 border-t">
                                                //     <div className="w-full space-y-2">
                                                //         <p className="w-full text-xs text-gray-500 font-medium">{t('productDetails.detailHtml')}</p>
                                                //         <div className="w-full border rounded-md p-4 bg-white shadow-sm overflow-hidden">
                                                //             <SandboxedHtml html={product.detail_html} />
                                                //         </div>
                                                //     </div>
                                                //     <div className="space-y-2">
                                                //         <p className="text-xs text-gray-500 font-medium">{t('productDetails.rawDetailHtml')}</p>
                                                //         <textarea
                                                //             readOnly
                                                //             value={product.detail_html}
                                                //             className="w-full h-32 p-3 text-xs font-mono bg-gray-50 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/20"
                                                //         />
                                                //     </div>
                                                // </div>
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
                            {/* 商品追加 */}
                            <Card className="col-span-2 sm:col-span-2 md:col-span-2 lg:col-span-3 max-w-lg mx-auto mt-0 mb-0 w-full h-hul shadow-md">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>{t('addProduct.title')}</CardTitle>

                                    {/* インポート */}
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
                                                            <option key={s.id} value={s.id}>{s.name || s.id}</option>
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
                                                <Input id="price" name="price" type="number" min="0" required />
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
                                                            <DialogDescription className="font-mono text-xs text-gray-500 flex items-center gap-2">
                                                                ID: {uuid}
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={(e) => { e.stopPropagation(); handleCopy(uuid); }}
                                                                >
                                                                    {copiedId === uuid ? (
                                                                        <Check className="h-3 w-3 text-green-500" />
                                                                    ) : (
                                                                        <Copy className="h-3 w-3" />
                                                                    )}
                                                                </Button>
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

                                                            {/* Card Preview */}
                                                            {order.card_design && (
                                                                <div className="space-y-2">
                                                                    <h4 className="text-sm font-semibold text-gray-500">{t('linkQr.cardDesign')}</h4>
                                                                    {(order.thumbf || order.thumbb || cardformats[order.card_design]) && (
                                                                        <div className="grid grid-cols-2 gap-2">
                                                                            <div className="space-y-1">
                                                                                <div className="aspect-[84/52] relative rounded shadow-sm overflow-hidden border border-gray-100 bg-white">
                                                                                    <img
                                                                                        src={order.thumbf || cardformats[order.card_design]?.bgimgf}
                                                                                        alt="Front"
                                                                                        className="w-full h-full object-cover"
                                                                                        crossOrigin="anonymous"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                <div className="aspect-[84/52] relative rounded shadow-sm overflow-hidden border border-gray-100 bg-white">
                                                                                    <img
                                                                                        src={order.thumbb || cardformats[order.card_design]?.bgimgb}
                                                                                        alt="Back"
                                                                                        className="w-full h-full object-cover"
                                                                                        crossOrigin="anonymous"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

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
                                                                <p className="text-sm">{order.preferred_date ? order.preferred_date : '-'}  /  {order.preferred_time ? tt(order.preferred_time) : '-'}</p>
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
                                                                    {/* Admin Meta Edit Section */}
                                                                    <div className="pt-6 border-t border-dashed mt-6">
                                                                        <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                                            <Pencil className="w-4 h-4 text-gray-400" />
                                                                            {t('orders.updateMeta')}
                                                                        </h4>
                                                                        <form onSubmit={async (e) => {
                                                                            e.preventDefault();
                                                                            const fd = new FormData(e.currentTarget);
                                                                            await handleUpdateOrderMeta(
                                                                                uuid,
                                                                                undefined,
                                                                                undefined,
                                                                                fd.get('memo_for_users') as string,
                                                                                fd.get('memo_for_shop') as string
                                                                            );
                                                                        }} className="space-y-4">

                                                                            <div className="space-y-2">
                                                                                <Label htmlFor={`m_u-${uuid}`} className="text-xs text-gray-500">{t('orders.userMessage')}</Label>
                                                                                <Textarea
                                                                                    id={`m_u-${uuid}`}
                                                                                    name="memo_for_users"
                                                                                    defaultValue={order.memo_for_users || ""}
                                                                                    disabled={['COMPLETED', 'EXPIRED', 'BANNED'].includes(order.status)}
                                                                                    placeholder={['COMPLETED', 'EXPIRED', 'BANNED'].includes(order.status) ? t('orders.shipDialog.Completed-state messages cannot be updated') : ""}
                                                                                    className="text-sm min-h-[60px]"
                                                                                />
                                                                            </div>

                                                                            <div className="space-y-2">
                                                                                <Label htmlFor={`m_s-${uuid}`} className="text-xs text-gray-500">{t('orders.shopMemo')}</Label>
                                                                                <Textarea
                                                                                    id={`m_s-${uuid}`}
                                                                                    name="memo_for_shop"
                                                                                    defaultValue={order.memo_for_shop || ""}
                                                                                    className="text-sm min-h-[60px]"
                                                                                />
                                                                            </div>

                                                                            <Button
                                                                                type="submit"
                                                                                className="w-full"
                                                                                disabled={shippingOrderId === uuid}
                                                                            >
                                                                                {shippingOrderId === uuid ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                                                                {shippingOrderId === uuid ? t('orders.processing') : t('shopSettings.submit')}
                                                                            </Button>
                                                                        </form>
                                                                    </div>

                                                                    <div className="pt-6 border-t mt-6">
                                                                        <div>
                                                                            <h4 className="text-sm font-semibold text-gray-500 mb-2">{t('orders.timestamps')}</h4>
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
        </div>
    );
}
