'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Copy, Pencil, Image as ImageIcon, Check } from 'lucide-react';
import { getDesignAspectRatio, getDesignImages } from '@/lib/utils/design';

interface ProductCardProps {
    product: any;
    allowedDesigns?: any[];
    t: any;
    tc: any;
    st: any;
    tr: any;
    debouncedPreviewHtml: string;
    copiedId: string | null;
    handleCopy: (id: string) => void;
    handleToggleStatus: (id: string, status: string) => Promise<void>;
    togglingProductId: string | null;
    handleOpenDuplicateDialog: (product: any) => void;
    handleOpenEditDialog: (product: any) => void;
    handleDeleteProduct: (id: string, name: string) => Promise<void>;
    deletingProductId: string | null;
    APP_CONFIG: any;
    SandboxedHtml: React.ComponentType<{ html: string }>;
}

export function ProductCard({
    product,
    allowedDesigns,
    t,
    tc,
    st,
    tr,
    debouncedPreviewHtml,
    copiedId,
    handleCopy,
    handleToggleStatus,
    togglingProductId,
    handleOpenDuplicateDialog,
    handleOpenEditDialog,
    handleDeleteProduct,
    deletingProductId,
    APP_CONFIG,
    SandboxedHtml
}: ProductCardProps) {
    const [open, setOpen] = useState(false);

    const aspectRatio = getDesignAspectRatio(product?.design_id, allowedDesigns, product?.design);
    const images = getDesignImages(product?.design_id, allowedDesigns, product?.design);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Card
                    className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all relative h-24"
                    style={{ aspectRatio }}
                >
                    <div className="absolute inset-0 w-full h-full">
                        {/* 背景: カードデザイン */}
                        {images.front && (
                            <img
                                src={images.front}
                                alt={product?.design?.name || product?.name || ''}
                                className="select-none pointer-events-none"
                                draggable={false}
                                crossOrigin="anonymous"
                            />
                        )}
                        {/* オーバーレイ */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                        {/* 商品画像 (小) */}
                        {product?.image_url && (
                            <div className="absolute bottom-2 right-2 w-10 h-10 rounded-md overflow-hidden border border-white/50 shadow-md bg-white">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={product.image_url}
                                    alt={product.name}
                                    className="w-full h-full object-contain p-1"
                                />
                            </div>
                        )}

                        {/* 商品名と価格 */}
                        <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white">
                            <h3 className="font-bold text-xs truncate drop-shadow-lg">{product?.name || <span className="opacity-50 italic">(No Name)</span>}</h3>
                        </div>

                        {/* ステータスバッジ */}
                        <div className="absolute top-2 left-2 flex gap-1">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold backdrop-blur-sm ${product?.status === 'ACTIVE' ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'
                                }`}>
                                {product?.status || 'UNKNOWN'}
                            </span>
                        </div>
                    </div>
                </Card>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
                {open && product && (
                    <>
                        <DialogHeader>
                            <DialogTitle>{t('productDetails.title')}</DialogTitle>
                            {/* <DialogDescription>
                                {product.description || "-"}
                            </DialogDescription> */}
                        </DialogHeader>
                        <div className="space-y-6 py-4">
                            {product.image_url && (
                                <div className="w-full h-64 sm:h-80 flex items-center justify-center relative rounded-lg overflow-hidden border bg-gray-50/50 p-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={product.image_url} alt={product.name} className="h-full w-auto object-contain" />
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs text-gray-500 font-medium">{t('productDetails.name')}</p>
                                    <p className="font-bold text-lg">{product.name || '-'}</p>
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
                                    <div className="flex-1 space-y-1 py-1">
                                        <p className="font-bold text-gray-900">{product.design.name || '-'}</p>
                                        <p className="text-xs text-gray-500">{product.design.description || ''}</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <div className="flex flex-wrap gap-4 w-full sm:w-auto shrink-0">
                                            <div className="flex flex-col gap-1">
                                                <p className="text-[10px] text-gray-400 font-bold">{t('productDetails.front')}</p>
                                                <div
                                                    className="w-full sm:w-48 rounded-md border-2 border-white shadow-sm overflow-hidden bg-white"
                                                    style={{ aspectRatio }}
                                                >
                                                    <img
                                                        src={images.front}
                                                        alt={product.design?.name || ''}
                                                        className="w-full h-full object-fill select-none"
                                                        draggable={false}
                                                        crossOrigin="anonymous"
                                                    />
                                                </div>
                                            </div>
                                            {images.back && (
                                                <div className="flex flex-col gap-1">
                                                    <p className="text-[10px] text-gray-400 font-bold">{t('productDetails.back')}</p>
                                                    <div
                                                        className="w-full sm:w-48 rounded-md border-2 border-white shadow-sm overflow-hidden bg-white"
                                                        style={{ aspectRatio }}
                                                    >
                                                        <img
                                                            src={images.back}
                                                            alt={product.design?.name || ''}
                                                            className="w-full h-full object-fill select-none"
                                                            draggable={false}
                                                            crossOrigin="anonymous"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {product.detail_html && (
                                <div className="w-full space-y-4 pt-4 border-t">
                                    <div className="w-full space-y-2">
                                        <p className="w-full text-xs text-gray-500 font-medium">{t('productDetails.detailHtml')}</p>
                                        <div className="w-full border rounded-md p-4 bg-white shadow-sm overflow-hidden">
                                            <CardContent className="min-h-0 flex flex-1 p-0 w-full">
                                                <div className="w-full mt-0 mr-0 ml-0 p-0 relative">
                                                    <SandboxedHtml html={product.detail_html} />
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
                            )}
                        </div>
                        <div className="pt-6 border-t border-dashed border-gray-100">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                    <p className="text-[9px] font-mono text-gray-400">Product ID: {product.product_id}</p>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-3 w-3 text-gray-400 hover:text-gray-600"
                                        onClick={() => handleCopy(product.product_id)}
                                    >
                                        {copiedId === product.product_id ? (
                                            <Check className="h-2 w-2 text-green-500" />
                                        ) : (
                                            <Copy className="h-2 w-2" />
                                        )}
                                    </Button>
                                </div>
                                <div className="flex items-center gap-1">
                                    <p className="text-[9px] font-mono text-gray-400">Design ID: {product.design?.design_id}</p>
                                    {product.design?.design_id && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-3 w-3 text-gray-400 hover:text-gray-600"
                                            onClick={() => handleCopy(product.design.design_id)}
                                        >
                                            {copiedId === product.design.design_id ? (
                                                <Check className="h-2 w-2 text-green-500" />
                                            ) : (
                                                <Copy className="h-2 w-2" />
                                            )}
                                        </Button>
                                    )}
                                </div>
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
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
