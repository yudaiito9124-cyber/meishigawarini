"use client";

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { getDesignAspectRatio } from '@/lib/utils/design';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "../../ui/badge";
import { cn } from "@/lib/utils";
import {
    Clock,
    Calendar,
    User,
    ShoppingBag,
    Hash,
    Info,
    Zap,
    History,
    Package,
    Copy,
    Check,
    Printer
} from 'lucide-react';

interface OrderDetailsDialogProps {
    order: any;
    product?: any;
    isOpen: boolean;
    onClose: () => void;
}

export default function OrderDetailsDialog({
    order,
    product,
    isOpen,
    onClose,
}: OrderDetailsDialogProps) {
    const t = useTranslations('ShopPage.cardOrder.details');
    const st = useTranslations('Status');

    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (id: string) => {
        if (!id) return;
        navigator.clipboard.writeText(id).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    if (!order) return null;

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'ORDERED': return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'PRINTING': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
            case 'SHIPPED': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
            case 'COMPLETED': return 'bg-green-50 text-green-700 border-green-200';
            case 'REJECTED': return 'bg-red-50 text-red-700 border-red-200';
            case 'CANCELLED': return 'bg-gray-50 text-gray-700 border-gray-200';
            default: return 'bg-gray-50 text-gray-700 border-gray-200';
        }
    };

    const InfoRow = ({
        label,
        value,
        icon: Icon,
        copyValue,
    }: {
        label: string,
        value: React.ReactNode,
        icon?: any,
        copyValue?: string,
    }) => (
        <div className="flex flex-col py-3 border-b border-gray-100 last:border-0 group">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1 flex items-center gap-1.5 font-sans">
                {Icon && <Icon className="w-3 h-3 text-gray-400" />}
                {label}
            </span>
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-900 break-all font-medium font-sans flex-1">{value || '-'}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {copyValue && value && value !== '-' && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-gray-100 rounded-md"
                            onClick={() => handleCopy(copyValue)}
                        >
                            {copiedId === copyValue ? (
                                <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                                <Copy className="h-3.5 w-3.5 text-gray-400" />
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );

    // Shops don't have dbCardDesigns, they use product info or design info from order
    // Shops don't have dbCardDesigns, they use product info or design info from order
    const rawRatio = getDesignAspectRatio(order.design_id, [], product?.design || order.design || product || order);
    const aspectRatio = rawRatio.replace(/\s+/g, ''); // Ensure no spaces like "84/52"

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-white">
                {/* Header */}
                <DialogHeader className="p-6 bg-white border-b border-gray-100 shrink-0">
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between gap-2">
                            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-gray-900">
                                <ShoppingBag className="w-5 h-5 text-primary" />
                                {t('title')}
                            </DialogTitle>
                            <Badge variant="outline" className={cn("px-3 py-1 text-xs font-semibold rounded-full", getStatusStyle(order.status))}>
                                {st(order.status.toLowerCase())}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <DialogDescription className="text-gray-500 font-mono text-xs text-left">
                                ID: {order.order_id}
                            </DialogDescription>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 hover:bg-gray-100 rounded-md"
                                onClick={() => handleCopy(order.order_id)}
                            >
                                {copiedId === order.order_id ? (
                                    <Check className="h-3 w-3 text-green-600" />
                                ) : (
                                    <Copy className="h-3 w-3 text-gray-400" />
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                {/* Main Content Area (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-0">
                    <div className="flex flex-col divide-y divide-gray-100">
                        {/* Basic Info & Design */}
                        <div className="p-6 bg-gray-50/40 space-y-8">

                            {/* Product Info (If exists) */}
                            {product && (
                                <div>
                                    <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-4 flex items-center gap-2">
                                        <Package className="w-3.5 h-3.5" />
                                        {t('orderInfo')} (PRODUCT)
                                    </h3>
                                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex gap-4 items-start">
                                        {product.image_url && (
                                            <div className="w-24 shrink-0">
                                                <img 
                                                    src={product.image_url} 
                                                    alt={product.name} 
                                                    className="w-full h-auto rounded-lg border border-gray-100 bg-white p-0.5 shadow-sm" 
                                                />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-bold text-gray-900 truncate">{product.name}</h4>
                                            <p className="text-xs text-gray-500 mt-1 line-clamp-3 leading-relaxed">{product.description || '-'}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Design Preview */}
                            <div>
                                <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-4 flex items-center gap-2">
                                    <Printer className="w-3.5 h-3.5" />
                                    {t('designPreview')}
                                </h3>
                                <div className="bg-white rounded-xl border border-gray-100 px-4 shadow-sm p-4 flex flex-col mb-6 space-y-6">
                                    <div className="space-y-4">
                                        <div
                                            className="w-full relative rounded-lg shadow-md overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center"
                                            style={{ aspectRatio: aspectRatio }}
                                        >
                                            <img
                                                src={order.thumbf}
                                                alt="Front"
                                                className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
                                                crossOrigin="anonymous"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400 text-center font-bold uppercase tracking-widest mt-1">{t('front')}</p>
                                    </div>
                                    <div className="space-y-4">
                                        <div
                                            className="w-full relative rounded-lg shadow-md overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center"
                                            style={{ aspectRatio: aspectRatio }}
                                        >
                                            <img
                                                src={order.thumbb}
                                                alt="Back"
                                                className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
                                                crossOrigin="anonymous"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400 text-center font-bold uppercase tracking-widest mt-1">{t('back')}</p>
                                    </div>
                                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
                                        <p className="text-[10px] text-gray-400 text-left font-mono truncate">{t('designId')}: {order.design_id}</p>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 hover:bg-gray-100 rounded-md shrink-0"
                                            onClick={() => handleCopy(order.design_id)}
                                        >
                                            {copiedId === order.design_id ? (
                                                <Check className="h-3 w-3 text-green-600" />
                                            ) : (
                                                <Copy className="h-3 w-3 text-gray-400" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-4 flex items-center gap-2">
                                <Info className="w-3.5 h-3.5" />
                                {t('orderInfo')}
                            </h3>
                            <div className="bg-white rounded-xl border border-gray-100 px-4 shadow-sm mb-6">
                                <InfoRow label={t('quantity')} value={`${order.quantity} 枚`} icon={Hash} />
                                <InfoRow label={t('createdAt')} value={new Date(order.ts_created_at).toLocaleString()} icon={Calendar} />
                                <InfoRow label={t('updatedAt')} value={new Date(order.ts_updated_at).toLocaleString()} icon={History} />
                            </div>
                        </div>

                        {/* Metadata */}
                        <div className="p-6 bg-white">
                            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-4 flex items-center gap-2">
                                <Zap className="w-3.5 h-3.5" />
                                {t('orderMetadata')}
                            </h3>
                            <div className="bg-white rounded-xl border border-gray-100 px-4 shadow-sm">
                                <InfoRow label={t('productId')} value={order.product_id} icon={Package} copyValue={order.product_id} />
                                <InfoRow label={t('shopUserId')} value={order.shop_user_id} icon={User} copyValue={order.shop_user_id} />
                                <InfoRow label={t('senderId')} value={order.sender_user_id} icon={User} copyValue={order.sender_user_id} />
                                <InfoRow label={t('expiration')} value={order.expiration_date ? new Date(order.expiration_date).toLocaleString() : t('systemDefault')} icon={Clock} />
                                <InfoRow label={t('activateNow')} value={order.activate_now ? t('yes') : t('no')} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <DialogFooter className="p-4 bg-gray-50/80 border-t border-gray-100 shrink-0 sm:justify-center">
                    <Button variant="outline" onClick={onClose} className="rounded-xl px-8 font-bold border-gray-200 hover:bg-gray-100 transition-all">
                        {t('close')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
