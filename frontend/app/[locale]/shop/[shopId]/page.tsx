/**
 * ファイル概要: 個別ショップ管理のダッシュボード
 * 目的: 指定されたショップのQRコードリンク、商品作成・管理、受注一覧、および発送処理などの機能を提供します。
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, ArrowRight, HelpCircle, Camera, Settings, ShoppingBasket, Eye, Plus, Trash2, Copy, ImageIcon, Save, Loader2, Pencil, ChevronDown, Download, Check, QrCode, Package, Truck, CreditCard, Gift } from 'lucide-react';
import { notFound, useParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { fetchAuthSession, getCurrentUser, signOut } from 'aws-amplify/auth';
import { shopApi } from '@/lib/api/shop';
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
    const [activeTab, setActiveTab] = useState("activation");

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
    const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
    const [orderProductFilter, setOrderProductFilter] = useState<string | null>(null);
    const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);
    const [isCreatingProduct, setIsCreatingProduct] = useState(false);
    const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
    const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
    const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
    const [singleShopOwner, setSingleShopOwner] = useState<boolean>(true);
    const [editingProduct, setEditingProduct] = useState<any | null>(null);
    const [isDuplicateMode, setIsDuplicateMode] = useState(false);

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
    const [cardOrders, setCardOrders] = useState<any[]>([]);
    const [cardOrdersLoading, setCardOrdersLoading] = useState(false);
    const [selectedOrderProduct, setSelectedOrderProduct] = useState<any | null>(null);
    const [orderQuantity, setOrderQuantity] = useState<number>(100);
    const [isCreatingCardOrder, setIsCreatingCardOrder] = useState(false);
    const [isConfirmOrderDialogOpen, setIsConfirmOrderDialogOpen] = useState(false);

    const [selectedCardDesignId, setSelectedCardDesignId] = useState<string>('');

    const checkAdminAuth = async () => {
        try {
            const session = await fetchAuthSession();
            if (session.tokens) {
                const groups = (session.tokens.idToken?.payload['cognito:groups'] as string[]) || [];
                const isadmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');
                setIsAdmin(isadmin);
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
            const data = await shopApi.shop_list({});
            const shopList = data.shops || [];

            // Auto-redirect if SHOP_MANAGER and has exactly one shop
            if (shopList.length > 1) {
                setSingleShopOwner(false);
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
                const data = await shopApi.shop_details_get({ shopId: shopId as string });
                setShop(data);
                if (data.detail_html) {
                    setDebouncedPreviewHtml(data.detail_html);
                }
                if (data.html_image_urls) {
                    setHtmlImageUrls(data.html_image_urls);
                }
            } catch (err: any) {
                if (err.status === 401 || err.status === 404) {
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
                const data = await shopApi.shop_products_list({ shopId: shopId as string });
                setProducts(data.products || data.items || []);
            } catch (e) {
                // console.error(e);
            } finally {
                setProductsLoading(false);
            }
        };

        const fetchQRCodes = async () => {
            try {
                const data = await shopApi.shop_qr_list({ shopId: shopId as string });
                setQrCodes(data.items || []);
            } catch (e) {
                // console.error(e);
            }
        };

        const fetchOrders = async () => {
            try {
                const data = await shopApi.shop_orders_list({ shopId: shopId as string });
                setOrders(data.orders || data.items || []); // robust check
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
            if (activeTab === 'orderCard') {
                fetchCardOrders();
            }
        } finally {
            if (refresh) setIsRefreshing(false);
        }
    };

    const fetchCardOrders = async () => {
        if (!shopId) return;
        setCardOrdersLoading(true);
        try {
            const data = await shopApi.shop_card_orders_list({ shopId: shopId as string });
            setCardOrders(data.items || []);
        } catch (e) {
            // console.error(e);
        } finally {
            setCardOrdersLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'orderCard') {
            fetchCardOrders();
        }
    }, [activeTab]);

    const fetchImportShops = async () => {
        try {
            const data = await shopApi.shop_products_import_list({ shopId: shopId as string });
            // Filter out the current shop
            setImportShops((data.shops || []).filter((s: any) => s.id !== shopId));
        } catch (error) {
            // console.error('Failed to fetch import shops', error);
        }
    };

    const fetchAdminEmails = async () => {
        try {
            const data = await shopApi.shop_admins({ shopId: shopId as string });
            setAdminEmails(data);
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
                await shopApi.shop_delete_images({ shopId: shopId!, urls: sessionUploadedUrls });
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
            const { uploadUrl, publicUrl } = await shopApi.shop_products_uploadurl({
                shopId: shopId!,
                filename: `${generateId()}.webp`,
                contentType: 'image/webp',
                folder: 'shopcontent'
            });

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
            let imageUrl = editingProduct?.image_url;

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
                const { uploadUrl, publicUrl } = await shopApi.shop_products_uploadurl({
                    shopId: shopId!,
                    filename: `${generateId()}.webp`,
                    contentType: 'image/webp'
                });

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

            if (editingProduct && !isDuplicateMode) {
                // Update Product
                await shopApi.shop_products_update({
                    shopId: shopId!,
                    product_id: editingProduct.product_id,
                    name: formData.get('name') as string,
                    description: formData.get('description') as string,
                    price: Number(formData.get('price')),
                    valid_days: Number(formData.get('valid_days')),
                    image_url: imageUrl,
                    card_design_id: selectedCardDesignId,
                });
                alert(t('editProduct.success'));
            } else {
                // Create Product (including Duplicate)
                await shopApi.shop_products_create({
                    shopId: shopId!,
                    name: formData.get('name') as string,
                    description: formData.get('description') as string,
                    price: Number(formData.get('price')),
                    valid_days: Number(formData.get('valid_days')),
                    image_url: imageUrl || 'https://placehold.co/1280x720?text=No+Image',
                    card_design_id: selectedCardDesignId,
                });
                alert(t('addProduct.success'));
            }

            form.reset();
            setSelectedCardDesignId('');
            setEditingProduct(null);
            setIsDuplicateMode(false);
            setIsAddProductDialogOpen(false);
            fetchShopData(); // Refresh
        } catch (err) {
            // console.error(err);
            if (editingProduct) {
                alert(t('editProduct.error'));
            } else {
                alert(t('addProduct.error'));
            }
        } finally {
            setIsCreatingProduct(false);
        }
    };

    const handleOpenEditDialog = (product: any) => {
        setEditingProduct(product);
        setIsDuplicateMode(false);
        setSelectedCardDesignId(product.card_design_id || (product.design?.design_id) || '');
        setIsAddProductDialogOpen(true);
    };

    const handleOpenDuplicateDialog = (product: any) => {
        setEditingProduct(product);
        setIsDuplicateMode(true);
        setSelectedCardDesignId(product.card_design_id || (product.design?.design_id) || '');
        setIsAddProductDialogOpen(true);
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

                try {
                    await shopApi.shop_qr_link({
                        shopId: shopId as string,
                        qr_id: uuid,
                        product_id: finalProductId,
                        activate_now: true,
                        memo_for_users,
                        memo_for_shop
                    });
                    successCount++;
                } catch (err: any) {
                    errors.push(`${uuid}: ${err.message || 'Failed to link'}`);
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
            setScannedUuid('');
            setScannedUuids([]);
        } finally {
            setIsLinking(false);
        }
    };

    const handleDeleteProduct = async (productId: string, productName: string) => {
        if (!confirm(t('product.deleteConfirm', { name: productName }))) return;
        setDeletingProductId(productId);

        try {
            await shopApi.shop_products_delete({
                shopId: shopId!,
                product_id: productId
            });
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
            await shopApi.shop_products_update({
                shopId: shopId!,
                product_id: productId,
                status: newStatus
            });
            if (true) fetchShopData();
        } catch (e) { // console.error(e); 
        } finally {
            setTogglingProductId(null);
        }
    };

    const handleUpdateOrderMeta = async (qrId: string, deliveryCompany?: string, trackingNumber?: string, memoForUsers?: string, memoForShop?: string) => {
        setShippingOrderId(qrId);
        try {
            await shopApi.shop_orders_update({
                shopId: shopId!,
                qr_id: qrId,
                delivery_company: deliveryCompany,
                tracking_number: trackingNumber,
                memo_for_users: memoForUsers,
                memo_for_shop: memoForShop
            });
            fetchShopData();
        } catch (e: any) {
            // console.error(e);
            alert(t('orders.updateError') + ': ' + (tb(e.message?.replace(/\./g, '_')) || e.message || String(e)));
        } finally {
            setShippingOrderId(null);
        }
    };

    const handleCreateCardOrder = async () => {
        if (!selectedOrderProduct || isCreatingCardOrder) return;
        setIsCreatingCardOrder(true);
        try {
            await shopApi.shop_card_orders_create({
                shopId: shopId as string,
                quantity: orderQuantity,
                design_id: selectedOrderProduct.card_design_id || selectedOrderProduct.design?.design_id,
                product_id: selectedOrderProduct.product_id,
                activate_now: true
            });
            setIsConfirmOrderDialogOpen(false);
            setSelectedOrderProduct(null);
            fetchCardOrders();
        } catch (e: any) {
            alert(tb(e.message?.replace(/\./g, '_')) || e.message);
        } finally {
            setIsCreatingCardOrder(false);
        }
    };

    const handleCancelCardOrder = async (orderId: string) => {
        if (!confirm(t('cardOrder.cancel') + '?')) return;
        try {
            await shopApi.shop_card_orders_cancel({ shopId: shopId as string, order_id: orderId });
            fetchCardOrders();
        } catch (e: any) {
            alert(tb(e.message?.replace(/\./g, '_')) || e.message);
        }
    };

    const handleCompleteCardOrder = async (orderId: string) => {
        try {
            await shopApi.shop_card_orders_complete({ shopId: shopId as string, order_id: orderId });
            fetchCardOrders();
        } catch (e: any) {
            alert(tb(e.message?.replace(/\./g, '_')) || e.message);
        }
    };

    const handleImportProducts = async () => {
        if (!selectedImportShopId) {
            alert(t('importProduct.selectShop'));
            return;
        }

        setIsImporting(true);
        try {
            const data = await shopApi.shop_products_import_execute({
                shopId: shopId!,
                importShopId: selectedImportShopId.replace('SHOP#', '')
            });

            if (true) {
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
            await shopApi.shop_details_update({
                shopId: shopId!,
                name: (formData.get('shop_name') as string),
                detail_html: (formData.get('shop_detail_html') as string),
                html_image_urls: htmlImageUrls,
                deleted_html_image_urls: htmlImageUrlsToDelete
            });

            alert(t('shopSettings.success'));
            setSessionUploadedUrls([]); // Clear tracking on success
            fetchShopData();
            setIsSettingsOpen(false);
        } catch (err: any) {
            // console.error(err);
            alert(t('shopSettings.error') + ': ' + (tb(err.message?.replace(/\./g, '_')) || err.message || String(err)));
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

    const checkQrStatus = async (uuid: string) => {
        setQrStatusDetails(null);
        try {
            const data = await shopApi.shop_qrcodecheck({
                shopId: shopId as string,
                qr_id: uuid
            });
            setScannedUuid(uuid);
            setQrStatusDetails(data);
            setScannedUuids([{ uuid, status: data }]);
        } catch (error: any) {
            const translatedError = error.message ? tb(error.message.replace(/\./g, '_')) : t('linkQr.foreignQrError');
            setScannedUuids([{ uuid, error: translatedError }]);
            alert(translatedError + (error.detail ? ` (${error.detail})` : ''));
            setScannedUuid('');
        } finally {
            setIsScanning(false);
        }
    };

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
                const data = await shopApi.shop_qrcodecheck({
                    shopId: shopId as string,
                    qr_id: uuid
                });
                setScannedUuids(prev => prev.map(item =>
                    item.uuid === uuid ? { ...item, status: data } : item
                ));
            } catch (err: any) {
                const translatedError = err.message ? tb(err.message.replace(/\./g, '_')) : t('linkQr.foreignQrError');
                // In continuous mode, don't stop scanning - just record error in the list
                setScannedUuids(prev => prev.map(item =>
                    item.uuid === uuid ? { ...item, error: translatedError + (err.detail ? ` (${err.detail})` : '') } : item
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

    const handleScannerError = (err: any) => {
        setIsScanning(false);
        const translatedError = err.message ? tb(err.message.replace(/\./g, '_')) : t('UI.Camera permission denied or error starting scanner');
        alert(translatedError);
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
                        {(!singleShopOwner || isAdmin) && <Button variant="secondary" className="shadow-md cursor-pointer border border-gray-200" onClick={handleShops}>{t('movetoshops')}</Button>}
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
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 sm:py-8 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <button
                        onClick={() => setActiveTab("activation")}
                        className={`flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md ${activeTab === "activation"
                            ? "bg-white border-white text-gray-900 ring-2 ring-gray-700 ring-offset-2"
                            : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                            }`}
                    >
                        <QrCode className={`w-8 h-8 sm:w-10 sm:h-10 mb-2 sm:mb-3 ${activeTab === "activation" ? "text-gray-900" : "text-gray-400"}`} />
                        <span className="text-sm sm:text-lg font-bold">{t('tabs.activation')}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("shipping")}
                        className={`flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md ${activeTab === "shipping"
                            ? "bg-white border-white text-gray-900 ring-2 ring-gray-700 ring-offset-2"
                            : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                            }`}
                    >
                        <Truck className={`w-8 h-8 sm:w-10 sm:h-10 mb-2 sm:mb-3 ${activeTab === "shipping" ? "text-gray-900" : "text-gray-400"}`} />
                        <span className="text-sm sm:text-lg font-bold">{t('tabs.shipping')}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("products")}
                        className={`flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md ${activeTab === "products"
                            ? "bg-white border-white text-gray-900 ring-2 ring-gray-700 ring-offset-2"
                            : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                            }`}
                    >
                        <Gift className={`w-8 h-8 sm:w-10 sm:h-10 mb-2 sm:mb-3 ${activeTab === "products" ? "text-gray-900" : "text-gray-400"}`} />
                        <span className="text-sm sm:text-lg font-bold">{t('tabs.products')}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("orderCard")}
                        className={`flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md ${activeTab === "orderCard"
                            ? "bg-white border-white text-gray-900 ring-2 ring-gray-700 ring-offset-2"
                            : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                            }`}
                    >
                        <CreditCard className={`w-8 h-8 sm:w-10 sm:h-10 mb-2 sm:mb-3 ${activeTab === "orderCard" ? "text-gray-900" : "text-gray-400"}`} />
                        <span className="text-sm sm:text-lg font-bold">{t('tabs.orderCard')}</span>
                    </button>
                </div>



                {/* --- Wrapper for Activation --- */}
                {activeTab === 'activation' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">






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
                                                    <DialogContent className="max-h-[90vh] w-[98vw] max-w-[98vw] sm:max-w-[90vw] md:max-w-3xl lg:max-w-3xl h-full overflow-y-auto p-2 sm:p-6">
                                                        <DialogHeader>
                                                            <DialogTitle>{t('linkQr.scanDialog.title')}</DialogTitle>
                                                            <DialogDescription>{t('linkQr.scanDialog.description')}</DialogDescription>
                                                        </DialogHeader>
                                                        <div className="p-1 sm:p-4 min-h-[300px] flex flex-col gap-y-4">
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

                                                            <div
                                                                className="w-full aspect-square mx-auto flex items-center justify-center overflow-hidden rounded-lg bg-gray-100"
                                                                style={{ maxWidth: 'min(400px, 50vh)', maxHeight: '50vh' }}
                                                            >

                                                                <QRScanner
                                                                    qrCodeSuccessCallback={handleScanSuccess}
                                                                    disableFlip={false}
                                                                    onFatalError={handleScannerError}
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
                                                                    <div className="mt-2 border rounded-md bg-gray-50 max-h-[80vh] overflow-y-auto w-full overflow-x-hidden">
                                                                        <ul className="text-[10px] font-mono p-1 sm:p-2 space-y-1">
                                                                            {scannedUuids.map((item, i) => (
                                                                                <li key={item.uuid} className="border-b last:border-0 pb-1 last:pb-0 flex flex-col">
                                                                                    <div className="flex flex-col gap-1 py-1 w-full overflow-hidden">
                                                                                        <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                                                                                            <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
                                                                                                <span className="truncate opacity-70 text-[10px] leading-tight block w-0 flex-1">{i + 1}. {item.uuid}</span>
                                                                                                <Button
                                                                                                    variant="ghost"
                                                                                                    size="icon"
                                                                                                    className="h-3.5 w-3.5 shrink-0 opacity-50 hover:opacity-100"
                                                                                                    onClick={() => handleCopy(item.uuid)}
                                                                                                >
                                                                                                    {copiedId === item.uuid ? (
                                                                                                        <Check className="h-2.5 w-2.5 text-green-500" />
                                                                                                    ) : (
                                                                                                        <Copy className="h-2.5 w-2.5" />
                                                                                                    )}
                                                                                                </Button>
                                                                                            </div>
                                                                                            {!item.status && !item.error && (
                                                                                                <span className="animate-pulse text-gray-400 shrink-0 text-[10px]">...</span>
                                                                                            )}
                                                                                        </div>

                                                                                        {(item.status || item.error) && (
                                                                                            <div className="flex justify-end w-full overflow-hidden">
                                                                                                {item.status ? (
                                                                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold block text-left break-all sm:break-words max-w-full ${item.status.status === 'EXPIRED' ? 'bg-red-100 text-red-700' : (item.status.product_linked ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}`}>
                                                                                                        {item.status.status === 'EXPIRED' ? st('expired') : (item.status.product_linked ? item.status.product_name : 'OK')}
                                                                                                    </span>
                                                                                                ) : (
                                                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-red-100 text-red-700 font-medium text-left leading-tight break-all sm:break-words max-w-full" title={item.error}>{item.error}</span>
                                                                                                )}
                                                                                            </div>
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





                    </div>
                )}

                {/* --- Wrapper for Shipping --- */}
                {activeTab === 'shipping' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">


                        {/* Incoming Orders */}
                        <Card>
                            <CardHeader>
                                <div className="flex flex-col space-y-4 ">
                                    <div>
                                        <CardTitle>{t('incomingOrders')}</CardTitle>
                                        <CardDescription>{t('ordersDesc')}</CardDescription>

                                    </div>
                                    <Button variant="outline" size="sm" className="w-full shrink-0 md:w-auto" onClick={() => fetchShopData(true)} disabled={isRefreshing}>
                                        <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                        {t('refresh')}
                                    </Button>




                                    {/* Product Filter Grid */}
                                    <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                        <Card
                                            className={`overflow-hidden cursor-pointer transition-all relative aspect-[84/52] flex items-center justify-center bg-gray-50 border-2 ${orderProductFilter === null ? 'ring-2 ring-primary border-primary' : 'border-dashed border-gray-200 hover:bg-gray-100'}`}
                                            onClick={() => setOrderProductFilter(null)}
                                        >
                                            <span className={`font-bold text-sm ${orderProductFilter === null ? 'text-primary' : 'text-gray-500'}`}>{tc('all')}</span>
                                        </Card>
                                        {products.map((product) => (
                                            <Card
                                                key={product.product_id}
                                                className={`overflow-hidden cursor-pointer transition-all relative aspect-[84/52] ${orderProductFilter === product.product_id ? 'ring-2 ring-offset-2 ring-primary' : 'hover:ring-2 hover:ring-primary/50'}`}
                                                onClick={() => setOrderProductFilter(orderProductFilter === product.product_id ? null : product.product_id)}
                                            >
                                                {/* 背景: カードデザイン */}
                                                {product.design && (
                                                    <img
                                                        src={product.design.thumbf || product.design.bgimgf}
                                                        alt={product.design.name}
                                                        className="absolute inset-0 w-full h-full object-cover"
                                                        crossOrigin="anonymous"
                                                    />
                                                )}
                                                {/* オーバーレイ */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                                {/* 商品画像 (小) */}
                                                {product.image_url && (
                                                    <div className="absolute bottom-2 right-2 w-8 h-8 rounded-md overflow-hidden border border-white/50 shadow-md bg-white">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={product.image_url}
                                                            alt={product.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>
                                                )}

                                                {/* 商品名 */}
                                                <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
                                                    <h3 className="font-bold text-[10px] truncate drop-shadow-lg">{product.name}</h3>
                                                </div>

                                                {/* 選択済みバッジ */}
                                                {orderProductFilter === product.product_id && (
                                                    <div className="absolute top-2 right-2 flex gap-1">
                                                        <span className="bg-primary text-white rounded-full px-1.5 py-0.5 shadow-md flex items-center justify-center">
                                                            <Check className="w-3 h-3" />
                                                        </span>
                                                    </div>
                                                )}
                                            </Card>
                                        ))}
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {["ALL", "UNASSIGNED", "LINKED", "ACTIVE", "USED", "SHIPPED", "COMPLETED", "EXPIRED", "BANNED", "PROMOTION"].map((s) => (
                                            <Button
                                                key={s}
                                                variant={orderStatusFilter === s ? "default" : "secondary"}
                                                size="sm"
                                                onClick={() => setOrderStatusFilter(s)}
                                                className="text-xs"
                                            >
                                                {s === 'ALL' ? tc('all') : st(s.toLowerCase())}
                                            </Button>
                                        ))}
                                    </div>


                                    {/* filter by uuid */}
                                    <div className="flex flex-col w-full space-y-2 md:flex-row md:items-center md:space-x-2 md:space-y-0 md:w-auto">
                                        <div className="flex w-full items-center space-x-2">
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
                                            .filter(o => orderStatusFilter === 'ALL' || o.status === orderStatusFilter)
                                            .filter(o => !orderProductFilter || o.product_id === orderProductFilter)
                                            .filter(o => !searchUuid || (o.id || o.qr_id).includes(searchUuid))
                                            .length === 0 ? (
                                            <TableRow><TableCell colSpan={4} className="text-center">{t('orders.noOrders')}</TableCell></TableRow>
                                        ) : (
                                            orders
                                                .filter(o => orderStatusFilter === 'ALL' || o.status === orderStatusFilter)
                                                .filter(o => !orderProductFilter || o.product_id === orderProductFilter)
                                                .filter(o => !searchUuid || (o.id || o.qr_id).includes(searchUuid))
                                                .sort((a, b) => {
                                                    const sortorder: { [name: string]: number } = { 'LINKED': 3, 'ACTIVE': 2, 'USED': 4, 'SHIPPED': 1, 'COMPLETED': 0, "EXPIRED": -1, "BANNED": -2 };
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
                )}

                {/* --- Wrapper for Products --- */}
                {activeTab === 'products' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                                                <Card className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all relative aspect-[84/52]">
                                                    {/* 背景: カードデザイン */}
                                                    {product.design && (
                                                        <img
                                                            src={product.design.thumbf || product.design.bgimgf}
                                                            alt={product.design.name}
                                                            className="absolute inset-0 w-full h-full object-cover"
                                                            crossOrigin="anonymous"
                                                        />
                                                    )}
                                                    {/* オーバーレイ */}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                                    {/* 商品画像 (小) */}
                                                    {product.image_url && (
                                                        <div className="absolute bottom-2 right-2 w-10 h-10 rounded-md overflow-hidden border border-white/50 shadow-md bg-white">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={product.image_url}
                                                                alt={product.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                    )}

                                                    {/* 商品名と価格 */}
                                                    <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white">
                                                        <h3 className="font-bold text-xs truncate drop-shadow-lg">{product.name}</h3>
                                                        {/* <p className="text-[10px] opacity-90 drop-shadow-md">¥{product.price ? Number(product.price).toLocaleString("ja-JP") : "0"}</p> */}
                                                    </div>

                                                    {/* ステータスバッジ */}
                                                    <div className="absolute top-2 left-2 flex gap-1">
                                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold backdrop-blur-sm ${product.status === 'ACTIVE' ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'
                                                            }`}>
                                                            {product.status}
                                                        </span>
                                                    </div>
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
                                                        <div className="space-y-1 col-span-2">
                                                            <p className="text-xs text-gray-500 font-medium">{t('productDetails.description')}</p>
                                                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{product.description || '-'}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-gray-500 font-medium">{t('productDetails.price')}</p>
                                                            <p className="font-bold text-lg text-emerald-600">¥{Number(product.price || 0).toLocaleString()}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-gray-500 font-medium">{t('productDetails.validDays')}</p>
                                                            <p className="font-medium">{product.valid_days || APP_CONFIG.DEFAULT_VALID_DAYS} {t('productDetails.validDaysSuffix')}</p>
                                                        </div>
                                                    </div>

                                                    {product.design && (
                                                        <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                                            <div className="text-xs text-gray-500 font-bold flex items-center gap-2">
                                                                <div className="w-1 h-3 bg-primary rounded-full" />
                                                                {t('addProduct.cardDesign')}
                                                            </div>
                                                            <div className="flex flex-col sm:flex-row gap-4">
                                                                <div className="flex flex-wrap gap-4 w-full sm:w-auto shrink-0">
                                                                    <div className="flex flex-col gap-1">
                                                                        <p className="text-[10px] text-gray-400 font-bold">{t('productDetails.front')}</p>
                                                                        <div className="w-full sm:w-48 aspect-[84/52] rounded-md border-2 border-white shadow-sm overflow-hidden bg-white">
                                                                            <img src={product.design.thumbf} alt={product.design.name} className="w-full h-full object-cover" crossOrigin="anonymous" />
                                                                        </div>
                                                                    </div>
                                                                    {product.design.thumbb && (
                                                                        <div className="flex flex-col gap-1">
                                                                            <p className="text-[10px] text-gray-400 font-bold">{t('productDetails.back')}</p>
                                                                            <div className="w-full sm:w-48 aspect-[84/52] rounded-md border-2 border-white shadow-sm overflow-hidden bg-white">
                                                                                <img src={product.design.thumbb} alt={product.design.name} className="w-full h-full object-cover" crossOrigin="anonymous" />
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex-1 space-y-1 py-1">
                                                                    <p className="font-bold text-gray-900">{product.design.name}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}


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
                                                <div className="mt-8 pt-6 border-t border-dashed border-gray-100">
                                                    <div className="flex flex-col gap-1">
                                                        <p className="text-[9px] font-mono text-gray-400">Product ID: {product.product_id}</p>
                                                        <p className="text-[9px] font-mono text-gray-400">Design ID: {product.design?.design_id}</p>
                                                    </div>
                                                </div>
                                                <DialogFooter className="mt-6">
                                                    <div className="flex w-full items-center justify-between">
                                                        <div className="flex gap-2">
                                                            <Button variant="outline" size="sm" onClick={() => handleToggleStatus(product.product_id, product.status)} disabled={togglingProductId === product.product_id}>
                                                                {togglingProductId === product.product_id ? t('linkQr.processing') : (product.status === 'ACTIVE' ? t('product.stop') : t('product.activate'))}
                                                            </Button>
                                                            <Button variant="outline" size="sm" onClick={() => handleOpenDuplicateDialog(product)}>
                                                                <Copy className="w-4 h-4 mr-1" />
                                                                {t('productDetails.duplicate')}
                                                            </Button>
                                                            <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(product)}>
                                                                <Pencil className="w-4 h-4 mr-1" />
                                                                {t('productDetails.edit')}
                                                            </Button>
                                                            {product.status !== 'ACTIVE' && (
                                                                <Button variant="destructive" size="sm" onClick={() => handleDeleteProduct(product.product_id, product.name)} disabled={deletingProductId === product.product_id}>
                                                                    {deletingProductId === product.product_id ? t('linkQr.processing') : t('product.delete')}
                                                                </Button>
                                                            )}
                                                        </div>
                                                        <DialogTrigger asChild>
                                                            <Button variant="outline" size="sm" className="px-4">{t('productDetails.close')}</Button>
                                                        </DialogTrigger>
                                                    </div>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    ))}
                                    {/* 商品追加 */}
                                    <Dialog open={isAddProductDialogOpen} onOpenChange={(open) => {
                                        setIsAddProductDialogOpen(open);
                                        if (!open) {
                                            setEditingProduct(null);
                                            setIsDuplicateMode(false);
                                            setSelectedCardDesignId('');
                                        }
                                    }}>
                                        <DialogTrigger asChild>
                                            <Card
                                                className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all border-dashed border-2 flex flex-col items-center justify-center min-h-[120px] bg-gray-50/50 hover:bg-gray-50 aspect-[84/52]"
                                                onClick={() => {
                                                    setEditingProduct(null);
                                                    setIsDuplicateMode(false);
                                                    setSelectedCardDesignId('');
                                                }}
                                            >
                                                <div className="flex flex-col items-center gap-1 text-gray-400 group-hover:text-primary">
                                                    <Plus className="w-8 h-8" />
                                                    <span className="text-xs font-bold">{t('addProduct.title')}</span>
                                                </div>
                                            </Card>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                            <DialogHeader>
                                                <div className="flex items-center justify-between pr-8">
                                                    <DialogTitle>{editingProduct ? t('editProduct.title') : t('addProduct.title')}</DialogTitle>

                                                    {/* インポート */}
                                                    {!editingProduct && (
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
                                                    )}
                                                </div>
                                            </DialogHeader>

                                            <form key={editingProduct?.product_id || 'new'} onSubmit={handleCreateProduct} className="space-y-4 pt-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="name">{t('addProduct.name')}</Label>
                                                    <Input id="name" name="name" defaultValue={editingProduct?.name} required />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="description">{t('addProduct.description')}</Label>
                                                    <Input id="description" name="description" defaultValue={editingProduct?.description} required />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="price">{t('addProduct.price')}</Label>
                                                        <Input id="price" name="price" type="number" min="0" defaultValue={editingProduct?.price} required />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="valid_days">{t('addProduct.validDays')}</Label>
                                                        <Input id="valid_days" name="valid_days" type="number" defaultValue={editingProduct?.valid_days || APP_CONFIG.DEFAULT_VALID_DAYS} min={1} required />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="image">{t('addProduct.image') + (editingProduct ? ' (' + t('editProduct.ifChange') + ')' : '')}</Label>
                                                    {editingProduct && <p className="text-xs text-gray-500">{t('editProduct.beforeImage')}</p>}
                                                    {editingProduct && <img src={editingProduct?.image_url} className="w-full h-auto rounded-md border shadow-sm" />}
                                                    <Input id="image" name="image" type="file" accept="image/png, image/jpeg, image/gif, image/webp" required={!editingProduct} />
                                                    <p className="text-xs text-gray-500">{t('addProduct.imagePlaceholder')}</p>
                                                </div>

                                                {/* Card Design Selection */}
                                                <div className="space-y-4 pt-4 border-t">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-sm font-bold flex items-center gap-2">
                                                            <div className="w-1 h-4 bg-primary rounded-full" />
                                                            {t('addProduct.cardDesign')}
                                                        </Label>
                                                        {(!shop?.allowed_designs || shop.allowed_designs.length === 0) && (
                                                            <span className="text-[10px] text-red-500 font-medium">
                                                                {t('addProduct.noDesignsLinked')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto p-1">
                                                        {shop?.allowed_designs?.map((design: any) => (
                                                            <div
                                                                key={`${design.design_id}`}
                                                                onClick={() => setSelectedCardDesignId(design.design_id)}
                                                                className={`group relative aspect-[84/52] rounded-lg border-2 overflow-hidden cursor-pointer transition-all hover:shadow-md ${selectedCardDesignId === design.design_id
                                                                    ? 'border-green-500 ring-2 ring-green-500/20 shadow-lg'
                                                                    : 'border-gray-100 hover:border-primary/30'
                                                                    }`}
                                                            >
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={design.thumbf || design.bgimgf}
                                                                    alt={design.name}
                                                                    className="w-full h-full object-cover"
                                                                    crossOrigin="anonymous"
                                                                />
                                                                <div className={`absolute bottom-0 left-0 right-0 bg-black/60 p-1.5 transition-all duration-300 ${selectedCardDesignId === design.design_id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                                                    }`}>
                                                                    <p className="text-[10px] text-white truncate text-center font-bold">
                                                                        {design.name}
                                                                    </p>
                                                                    {design.description && (
                                                                        <p className="text-[8px] text-gray-200 line-clamp-2 text-center mt-0.5 leading-tight opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                                                            {design.description}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                {selectedCardDesignId === design.design_id && (
                                                                    <div className="absolute top-0 right-0">
                                                                        <div className="bg-green-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl shadow-sm flex items-center gap-1">
                                                                            <Check className="w-2.5 h-2.5" />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <Button type="submit" className="w-full" disabled={isCreatingProduct || !selectedCardDesignId}>
                                                    {isCreatingProduct ? t('linkQr.processing') : (editingProduct ? t('shopSettings.submit') : t('addProduct.submit'))}
                                                </Button>
                                            </form>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>
                        </Card>









                    </div>
                )}



                {/* --- Wrapper for Card Ordering --- */}
                {activeTab === 'orderCard' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Product Selection */}
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('cardOrder.title')}</CardTitle>
                                <CardDescription>{t('cardOrder.subtitle')}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-bold flex items-center gap-2">
                                            <div className="w-1 h-4 bg-primary rounded-full" />
                                            {t('cardOrder.selectProduct')}
                                        </Label>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {products.filter(p => p.status === 'ACTIVE').map((product) => (
                                            <div
                                                key={product.product_id}
                                                onClick={() => setSelectedOrderProduct(product)}
                                                className={`group relative aspect-[84/52] rounded-xl border-2 overflow-hidden cursor-pointer transition-all hover:shadow-lg ${selectedOrderProduct?.product_id === product.product_id
                                                    ? 'border-primary ring-4 ring-primary/10 shadow-xl scale-[1.02]'
                                                    : 'border-gray-100 hover:border-primary/30'
                                                    }`}
                                            >
                                                {(product.design || cardformats[product.card_design_id]) && (
                                                    <img
                                                        src={product.design?.thumbf || product.design?.bgimgf || cardformats[product.card_design_id]?.bgimgf}
                                                        alt={product.name}
                                                        className="absolute inset-0 w-full h-full object-cover"
                                                        crossOrigin="anonymous"
                                                    />
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80" />

                                                {/* 商品画像 (小) */}
                                                {product.image_url && (
                                                    <div className="absolute bottom-2 right-2 w-8 h-8 rounded-md overflow-hidden border border-white/50 shadow-md bg-white">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={product.image_url}
                                                            alt={product.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>
                                                )}

                                                <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                                                    <p className="font-bold text-xs truncate drop-shadow-md">{product.name}</p>
                                                </div>
                                                {selectedOrderProduct?.product_id === product.product_id && (
                                                    <div className="absolute top-2 right-2 bg-primary text-white rounded-full p-1 shadow-lg">
                                                        <Check className="w-4 h-4" />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {selectedOrderProduct && (
                                    <div className="space-y-8 pt-6 border-t animate-in fade-in slide-in-from-top-2 duration-300">
                                        {/* Comprehensive Preview Section */}
                                        <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100 shadow-inner">
                                            <div className="flex flex-col md:flex-row gap-8">
                                                {/* Left side: Info & Balanced Thumbnail */}
                                                <div className="flex-1 space-y-6">
                                                    <div className="space-y-2">
                                                        <h3 className="text-3xl font-black text-gray-900 tracking-tight">{selectedOrderProduct.name}</h3>
                                                        <p className="text-sm text-gray-500 leading-relaxed max-w-md">
                                                            {selectedOrderProduct.description || "No description provided."}
                                                        </p>
                                                    </div>

                                                    {selectedOrderProduct.image_url && (
                                                        <div className="rounded-2xl overflow-hidden border-2 border-white shadow-lg bg-white max-w-[200px] animate-in zoom-in fade-in duration-700">
                                                            <img
                                                                src={selectedOrderProduct.image_url}
                                                                alt={selectedOrderProduct.name}
                                                                className="w-full h-auto object-contain"
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Right side: Much Larger Front/Back Preview */}
                                                <div className="flex-[3] space-y-4">
                                                    <Label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-1">{t('linkQr.cardDesign')}</Label>
                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                        {/* Front */}
                                                        <div className="space-y-2">
                                                            <div className="aspect-[84/52] relative rounded-2xl border-4 border-white shadow-2xl overflow-hidden group ring-1 ring-gray-200/50">
                                                                {(selectedOrderProduct.design || cardformats[selectedOrderProduct.card_design_id]) ? (
                                                                    <img
                                                                        src={selectedOrderProduct.design?.thumbf || selectedOrderProduct.design?.bgimgf || cardformats[selectedOrderProduct.card_design_id]?.bgimgf}
                                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                                        crossOrigin="anonymous"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full bg-gray-200 flex items-center justify-center"><ImageIcon className="w-12 h-12 text-gray-300" /></div>
                                                                )}
                                                                <div className="absolute top-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md text-[10px] font-black text-white rounded-full uppercase tracking-widest shadow-lg">Front View</div>
                                                            </div>
                                                        </div>
                                                        {/* Back */}
                                                        <div className="space-y-2">
                                                            <div className="aspect-[84/52] relative rounded-2xl border-4 border-white shadow-2xl overflow-hidden group ring-1 ring-gray-200/50">
                                                                {(selectedOrderProduct.design || cardformats[selectedOrderProduct.card_design_id]) ? (
                                                                    <img
                                                                        src={selectedOrderProduct.design?.thumbb || selectedOrderProduct.design?.bgimgb || cardformats[selectedOrderProduct.card_design_id]?.bgimgb}
                                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                                        crossOrigin="anonymous"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full bg-gray-200 flex items-center justify-center"><ImageIcon className="w-12 h-12 text-gray-300" /></div>
                                                                )}
                                                                <div className="absolute top-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md text-[10px] font-black text-white rounded-full uppercase tracking-widest shadow-lg">Back View</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                                            <div className="space-y-4">
                                                <Label htmlFor="order-quantity" className="text-sm font-bold block">{t('cardOrder.quantity')}</Label>
                                                <div className="flex items-center gap-4">
                                                    <Input
                                                        id="order-quantity"
                                                        type="number"
                                                        min={100}
                                                        step={100}
                                                        value={orderQuantity}
                                                        onChange={(e) => setOrderQuantity(Number(e.target.value))}
                                                        className="max-w-[200px] h-12 text-lg font-bold"
                                                    />
                                                    <span className="text-gray-500 font-medium">枚</span>
                                                </div>
                                            </div>
                                            <Dialog open={isConfirmOrderDialogOpen} onOpenChange={setIsConfirmOrderDialogOpen}>
                                                <DialogTrigger asChild>
                                                    <Button className="h-12 px-8 text-lg font-bold shadow-xl hover:shadow-2xl transition-all active:scale-[0.98]">
                                                        <ShoppingBasket className="w-5 h-5 mr-3" />
                                                        {t('cardOrder.placeOrder')}
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>{t('cardOrder.confirmTitle')}</DialogTitle>
                                                        <DialogDescription>
                                                            {t('cardOrder.confirmDesc', {
                                                                product: selectedOrderProduct.name,
                                                                quantity: orderQuantity.toLocaleString()
                                                            })}
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className="py-6 flex flex-col items-center gap-4">
                                                        <div className="w-full max-w-[300px] aspect-[84/52] relative rounded-xl border shadow-2xl overflow-hidden ring-4 ring-primary/5">
                                                            {(selectedOrderProduct.design || cardformats[selectedOrderProduct.card_design_id]) ? (
                                                                <img
                                                                    src={selectedOrderProduct.design?.thumbf || selectedOrderProduct.design?.bgimgf || cardformats[selectedOrderProduct.card_design_id]?.bgimgf}
                                                                    alt="Confirm Preview"
                                                                    className="w-full h-full object-cover"
                                                                    crossOrigin="anonymous"
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                                                    <ImageIcon className="w-12 h-12 text-gray-400" />
                                                                </div>
                                                            )}

                                                            {/* 商品画像 (小) */}
                                                            {selectedOrderProduct.image_url && (
                                                                <div className="absolute bottom-3 right-3 w-12 h-12 rounded-lg overflow-hidden border-2 border-white shadow-xl bg-white animate-in zoom-in fade-in duration-500 delay-200">
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img
                                                                        src={selectedOrderProduct.image_url}
                                                                        alt={selectedOrderProduct.name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-2xl font-black text-primary">{orderQuantity.toLocaleString()} <span className="text-sm">枚</span></p>
                                                        </div>
                                                    </div>
                                                    <DialogFooter className="gap-2 sm:gap-2">
                                                        <Button variant="outline" onClick={() => setIsConfirmOrderDialogOpen(false)} disabled={isCreatingCardOrder}>
                                                            {tc('cancel')}
                                                        </Button>
                                                        <Button onClick={handleCreateCardOrder} disabled={isCreatingCardOrder} className="bg-primary hover:bg-primary/90 min-w-[120px]">
                                                            {isCreatingCardOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : t('cardOrder.placeOrder')}
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Order History */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>{t('cardOrder.historyTitle')}</CardTitle>
                                </div>
                                <Button variant="ghost" size="sm" onClick={fetchCardOrders} disabled={cardOrdersLoading}>
                                    <RefreshCw className={`w-4 h-4 mr-2 ${cardOrdersLoading ? 'animate-spin' : ''}`} />
                                    {t('refresh')}
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-xl bg-white overflow-hidden shadow-sm">
                                    <Table>
                                        <TableHeader className="bg-gray-50/50">
                                            <TableRow>
                                                <TableHead className="w-[120px] font-bold">{t('cardOrder.table.date')}</TableHead>
                                                <TableHead className="font-bold">{t('cardOrder.table.product')}</TableHead>
                                                <TableHead className="w-[80px] font-bold text-right">{t('cardOrder.table.quantity')}</TableHead>
                                                <TableHead className="w-[120px] font-bold text-center">{t('cardOrder.table.status')}</TableHead>
                                                <TableHead className="w-[150px] font-bold text-right"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {cardOrdersLoading && cardOrders.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-32 text-center">
                                                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-300" />
                                                    </TableCell>
                                                </TableRow>
                                            ) : cardOrders.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-32 text-center text-gray-400 font-medium">
                                                        {t('cardOrder.noOrders')}
                                                    </TableCell>
                                                </TableRow>
                                            ) : cardOrders.map((order) => {
                                                const product = products.find(p => p.product_id === order.product_id);
                                                return (
                                                    <TableRow key={order.order_id} className="group hover:bg-gray-50/50 transition-colors">
                                                        <TableCell className="text-xs font-medium text-gray-500">
                                                            {new Date(order.ts_created_at).toLocaleDateString()}
                                                        </TableCell>
                                                        <TableCell className="font-semibold">
                                                            {product?.name || order.product_id || order.design_id}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono font-bold">
                                                            {(order.quantity || 0).toLocaleString()}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ring-1 ring-inset ${order.status === 'ORDERED' ? 'bg-blue-50 text-blue-700 ring-blue-700/10' :
                                                                order.status === 'PRINTING' ? 'bg-amber-50 text-amber-700 ring-amber-700/10' :
                                                                    order.status === 'SHIPPED' ? 'bg-indigo-50 text-indigo-700 ring-indigo-700/10' :
                                                                        order.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-700/10' :
                                                                            order.status === 'CANCELLED' ? 'bg-gray-50 text-gray-600 ring-gray-600/10' :
                                                                                'bg-red-50 text-red-700 ring-red-700/10'
                                                                }`}>
                                                                {t(`cardOrder.status.${order.status.toLowerCase()}`)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {order.status === 'ORDERED' && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 font-bold"
                                                                        onClick={() => handleCancelCardOrder(order.order_id)}
                                                                    >
                                                                        {t('cardOrder.cancel')}
                                                                    </Button>
                                                                )}
                                                                {order.status === 'SHIPPED' && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-8 font-bold"
                                                                        onClick={() => handleCompleteCardOrder(order.order_id)}
                                                                    >
                                                                        <Check className="w-3 h-3 mr-1" />
                                                                        {t('cardOrder.received')}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div >
    );
}
