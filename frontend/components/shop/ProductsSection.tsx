'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Plus, Check, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { shopApi } from '@/lib/api/shop';
import { useShop } from '@/context/ShopContext';
import { APP_CONFIG } from '@/lib/config';
import { generateId } from '@/lib/id';
import { resizeImage } from "@/lib/image-utils";
import SandboxedHtml from '@/components/SandboxedHtml';
import { ProductCard } from '@/components/shop/ProductCard';

interface ProductsSectionProps {
    shopId: string;
}

export function ProductsSection({
    shopId,
}: ProductsSectionProps) {
    const t = useTranslations('ShopPage');
    const tr = useTranslations('ReceivePage');
    const tc = useTranslations('Common');
    const st = useTranslations('Status');
    const tb = useTranslations('Backend');

    const { 
        shop, 
        products, 
        productsLoading, 
        refreshProducts, 
        refreshShopDetails 
    } = useShop();

    const allowedDesigns = shop?.allowed_designs || [];

    const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<any | null>(null);
    const [isDuplicateMode, setIsDuplicateMode] = useState(false);
    const [selectedDesignId, setSelectedDesignId] = useState<string>('');
    const [selectedImportShopId, setSelectedImportShopId] = useState('');
    const [importShops, setImportShops] = useState<any[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [isCreatingProduct, setIsCreatingProduct] = useState(false);
    const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
    const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [debouncedPreviewHtml, setDebouncedPreviewHtml] = useState<string>('');

    const fetchProducts = refreshProducts;
    const setProductsLoading = (loading: boolean) => {};

    // --- Handlers Internalized from ShopPage ---

    const handleCopy = (id: string) => {
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };


    const fetchImportShops = async () => {
        try {
            const data = await shopApi.shop_products_import_list({ shop_id: shopId });
            setImportShops((data.shops || []).filter((s: any) => s.id !== shopId));
        } catch (error) {
            // Error handling consistent with page.tsx
        }
    };


    useEffect(() => {
        if (isImportDialogOpen) {
            fetchImportShops();
        }
    }, [isImportDialogOpen, shopId]);

    const handleOpenEditDialog = (product: any) => {
        setEditingProduct(product);
        setIsDuplicateMode(false);
        setSelectedDesignId(product.design_id || (product.design?.design_id) || '');
        setIsAddProductDialogOpen(true);
    };

    const handleOpenDuplicateDialog = (product: any) => {
        setEditingProduct(product);
        setIsDuplicateMode(true);
        setSelectedDesignId(product.design_id || (product.design?.design_id) || '');
        setIsAddProductDialogOpen(true);
    };

    const handleToggleStatus = async (productId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'ACTIVE' ? 'STOPPED' : 'ACTIVE';
        setTogglingProductId(productId);
        try {
            await shopApi.shop_products_update({
                shop_id: shopId,
                product_id: productId,
                status: newStatus
            });
            fetchProducts();
        } catch (e) {
            // Error handling consistent with page.tsx
        } finally {
            setTogglingProductId(null);
        }
    };

    const handleDeleteProduct = async (productId: string, productName: string) => {
        if (!confirm(t('product.deleteConfirm', { name: productName }))) return;
        setDeletingProductId(productId);

        try {
            await shopApi.shop_products_delete({
                shop_id: shopId,
                product_id: productId
            });
            fetchProducts();
        } catch (err: any) {
            alert((tb(err.message.replace(/\./g, '_')) || err.message) + (err.relatedQRs ? "\n" + err.relatedQRs.join(", ") : ""));
        } finally {
            setDeletingProductId(null);
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
                shop_id: shopId,
                source_shop_id: selectedImportShopId.replace('SHOP#', '')
            });

            alert(`${tb(data.message.replace(/\./g, '_')) || data.message} (${data.imported} items)`);
            setIsImportDialogOpen(false);
            setSelectedImportShopId('');
            fetchProducts();
        } catch (error: any) {
            alert(t('importProduct.failed') + ': ' + (tb(error.message.replace(/\./g, '_')) || error.message));
        } finally {
            setIsImporting(false);
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

            if (file && file.size > 0) {
                const resizedBlob = await resizeImage(file);
                const resData = await shopApi.shop_products_uploadurl({
                    shop_id: shopId,
                    filename: `${generateId()}.webp`,
                    content_type: 'image/webp'
                });

                const uploadUrl = resData.uploadUrl;
                const publicUrl = resData.publicUrl || resData.fileUrl;
                const viewUrl = resData.viewUrl || publicUrl;

                const s3Res = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: { 'content-type': 'image/webp' },
                    body: resizedBlob
                });
                if (!s3Res.ok) throw new Error('Failed to upload image to S3');
                imageUrl = viewUrl;
            }

            if (editingProduct && !isDuplicateMode) {
                await shopApi.shop_products_update({
                    shop_id: shopId,
                    product_id: editingProduct.product_id,
                    name: formData.get('name') as string,
                    description: formData.get('description') as string,
                    price: Number(formData.get('price')),
                    valid_days: Number(formData.get('valid_days')),
                    image_url: imageUrl,
                    design_id: selectedDesignId,
                });
                alert(t('editProduct.success'));
            } else {
                await shopApi.shop_products_create({
                    shop_id: shopId,
                    name: formData.get('name') as string,
                    description: formData.get('description') as string,
                    price: Number(formData.get('price')),
                    valid_days: Number(formData.get('valid_days')),
                    image_url: imageUrl || 'https://placehold.co/1280x720?text=No+Image',
                    design_id: selectedDesignId,
                });
                alert(t('addProduct.success'));
            }

            form.reset();
            setSelectedDesignId('');
            setEditingProduct(null);
            setIsDuplicateMode(false);
            setIsAddProductDialogOpen(false);
            fetchProducts();
        } catch (err) {
            alert(editingProduct ? t('editProduct.error') : t('addProduct.error'));
        } finally {
            setIsCreatingProduct(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card style={{ maxHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <CardHeader>
                    <CardTitle>{t('products')}</CardTitle>
                    <CardDescription>{t('productsDescription')}</CardDescription>
                </CardHeader>
                <div style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0 }} className="p-4 w-full">
                    <div className="flex flex-wrap items-start gap-4">
                        {productsLoading ? (
                            <div className="col-span-full py-8 flex justify-center">
                                <RefreshCw className="animate-spin h-6 w-6 text-gray-400" />
                            </div>
                        ) : (
                            <>
                                {products.map((product) => (
                                    <ProductCard
                                        key={product.product_id}
                                        product={product}
                                        allowedDesigns={allowedDesigns}
                                        t={t}
                                        tc={tc}
                                        st={st}
                                        tr={tr}
                                        debouncedPreviewHtml={debouncedPreviewHtml}
                                        copiedId={copiedId}
                                        handleCopy={handleCopy}
                                        handleToggleStatus={handleToggleStatus}
                                        togglingProductId={togglingProductId}
                                        handleOpenDuplicateDialog={handleOpenDuplicateDialog}
                                        handleOpenEditDialog={handleOpenEditDialog}
                                        handleDeleteProduct={handleDeleteProduct}
                                        deletingProductId={deletingProductId}
                                        APP_CONFIG={APP_CONFIG}
                                        SandboxedHtml={SandboxedHtml}
                                    />
                                ))}

                                {/* 商品追加 */}
                                <Dialog open={isAddProductDialogOpen} onOpenChange={(open) => {
                                    setIsAddProductDialogOpen(open);
                                    if (!open) {
                                        setEditingProduct(null);
                                        setIsDuplicateMode(false);
                                        setSelectedDesignId('');
                                    }
                                }}>
                                    <DialogTrigger asChild>
                                        <Card
                                            className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all border-dashed border-2 flex flex-col items-center justify-center h-24 bg-gray-50/50 hover:bg-gray-50"
                                            style={{ aspectRatio: '84/52' }}
                                            onClick={() => {
                                                setEditingProduct(null);
                                                setIsDuplicateMode(false);
                                                setSelectedDesignId('');
                                            }}
                                        >
                                            <div className="flex flex-col items-center gap-1 text-gray-400 group-hover:text-primary">
                                                <Plus className="w-8 h-8" />
                                                <span className="text-xs font-bold">{t('addProduct.title')}</span>
                                            </div>
                                        </Card>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                        {isAddProductDialogOpen && (
                                            <>
                                                <DialogHeader>
                                                    <div className="flex items-center justify-between pr-8">
                                                        <div>
                                                            <DialogTitle>{editingProduct ? t('editProduct.title') : t('addProduct.title')}</DialogTitle>
                                                            <DialogDescription>{editingProduct ? t('editProduct.dialogDesc') : t('addProduct.dialogDesc')}</DialogDescription>
                                                        </div>

                                                        {!editingProduct && (
                                                            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                                                                <DialogTrigger asChild>
                                                                    <Button variant="outline" size="sm">{t('importProduct.button')}</Button>
                                                                </DialogTrigger>
                                                                <DialogContent>
                                                                    {isImportDialogOpen && (
                                                                        <>
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
                                                                        </>
                                                                    )}
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
                                                        {editingProduct?.image_url && (
                                                            <div className="space-y-2">
                                                                <p className="text-xs text-gray-500">{t('editProduct.beforeImage')}</p>
                                                                <img src={editingProduct.image_url} className="w-full h-auto rounded-md border shadow-sm max-h-32 object-contain bg-gray-50" />
                                                            </div>
                                                        )}
                                                        <Input id="image" name="image" type="file" accept="image/png, image/jpeg, image/gif, image/webp" required={!editingProduct} />
                                                        <p className="text-xs text-gray-500">{t('addProduct.imagePlaceholder')}</p>
                                                    </div>

                                                    <div className="space-y-4 pt-4 border-t">
                                                        <div className="flex items-center justify-between">
                                                            <Label className="text-sm font-bold flex items-center gap-2">
                                                                <div className="w-1 h-4 bg-primary rounded-full" />
                                                                {t('addProduct.cardDesign')}
                                                            </Label>
                                                            {(!allowedDesigns || allowedDesigns.length === 0) && (
                                                                <span className="text-[10px] text-red-500 font-medium">
                                                                    {t('addProduct.noDesignsLinked')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-wrap items-start gap-3 max-h-[300px] overflow-y-auto p-1">
                                                            {allowedDesigns?.map((design: any) => (
                                                                <div
                                                                    key={`${design.design_id}`}
                                                                    onClick={() => setSelectedDesignId(design.design_id)}
                                                                    className={`group relative h-24 rounded-lg border-2 overflow-hidden cursor-pointer transition-all hover:shadow-md ${selectedDesignId === design.design_id
                                                                        ? 'border-green-500 ring-2 ring-green-500/20 shadow-lg'
                                                                        : 'border-gray-100 hover:border-primary/30'
                                                                        }`}
                                                                    style={{ aspectRatio: `${design.width || 84} / ${design.height || 52}` }}
                                                                >
                                                                    <img
                                                                        src={design.thumbf || design.bgimgf}
                                                                        alt={design.name || ''}
                                                                        className="w-full h-full object-fill"
                                                                        crossOrigin="anonymous"
                                                                    />
                                                                    <div className={`absolute bottom-0 left-0 right-0 bg-black/60 p-1.5 transition-all duration-300 ${selectedDesignId === design.design_id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                                        <p className="text-[10px] text-white truncate text-center font-bold">
                                                                            {design.name || '-'}
                                                                        </p>
                                                                        {design.description && (
                                                                            <p className="text-[8px] text-gray-200 line-clamp-2 text-center mt-0.5 leading-tight opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                                                                {design.description}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    {selectedDesignId === design.design_id && (
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

                                                    <Button type="submit" className="w-full" disabled={isCreatingProduct || !selectedDesignId}>
                                                        {isCreatingProduct ? <Loader2 className="w-4 h-4 animate-spin mr-2 inline-block" /> : null}
                                                        {isCreatingProduct ? t('linkQr.processing') : (editingProduct ? t('shopSettings.submit') : t('addProduct.submit'))}
                                                    </Button>
                                                </form>
                                            </>
                                        )}
                                    </DialogContent>
                                </Dialog>
                            </>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}
