"use client";

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
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
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";
import {
    FileText,
    Download,
    X,
    Printer,
    CheckCircle2,
    Clock,
    Calendar,
    User,
    Store,
    ShoppingBag,
    Loader2,
    Hash,
    Info,
    Mail,
    Zap,
    History,
    Package,
    Copy,
    Check,
    ExternalLink,
    Truck
} from 'lucide-react';

interface OrderDetailsDialogProps {
    order: any;
    isOpen: boolean;
    onClose: () => void;
    onUpdateStatus: (shopId: string, orderId: string, status: string, batchId?: string) => Promise<void>;
    onExport: (order: any, type: 'pdf' | 'csv') => Promise<void>;
    isExporting: string | null;
    dbCardDesigns: any[];
    paperFormat: string;
}

export default function OrderDetailsDialog({
    order,
    isOpen,
    onClose,
    onUpdateStatus,
    onExport,
    isExporting,
    dbCardDesigns,
    paperFormat
}: OrderDetailsDialogProps) {
    const t = useTranslations('AdminPage');
    const tc = useTranslations('AdminPage.cardOrders');
    const td = useTranslations('AdminPage.cardOrders.details');
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
            default: return 'bg-gray-50 text-gray-700 border-gray-200';
        }
    };

    const InfoRow = ({
        label,
        value,
        icon: Icon,
        copyValue,
        shopIdToLink
    }: {
        label: string,
        value: React.ReactNode,
        icon?: any,
        copyValue?: string,
        shopIdToLink?: string
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
                    {shopIdToLink && (
                        <Link href={`/shop/${shopIdToLink}`}>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 hover:bg-primary/5 hover:text-primary rounded-md"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );

    const aspectRatio = getDesignAspectRatio(order.design_id, dbCardDesigns, order);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-white">
                {/* Header */}
                <DialogHeader className="p-6 bg-white border-b border-gray-100 shrink-0">
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between gap-2">
                            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-gray-900">
                                <ShoppingBag className="w-5 h-5 text-primary" />
                                {td('title')}
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
                    <div className="grid grid-cols-1 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
                        {/* Left Column: Basic Info */}
                        <div className="p-6 bg-gray-50/40">

                            {/* Design Preview */}
                            <div>
                                <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-4 flex items-center gap-2">
                                    <Printer className="w-3.5 h-3.5" />
                                    {td('designPreview')}
                                </h3>
                                <div className="bg-white rounded-xl border border-gray-100 px-4 shadow-sm p-2 flex flex-col mb-6">
                                    <div className="grid grid-cols-2 gap-4 p-2">

                                        <div className="space-y-2">
                                            <div
                                                className="w-full relative rounded-lg shadow-md overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center"
                                                style={{ aspectRatio }}
                                            >
                                                <img
                                                    src={order.thumbf}
                                                    alt="Front"
                                                    className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
                                                    crossOrigin="anonymous"
                                                />
                                            </div>
                                            <p className="text-[10px] text-gray-500 text-center font-bold uppercase tracking-widest">{td('front')}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <div
                                                className="w-full relative rounded-lg shadow-md overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center"
                                                style={{ aspectRatio }}
                                            >
                                                <img
                                                    src={order.thumbb}
                                                    alt="Back"
                                                    className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
                                                    crossOrigin="anonymous"
                                                />
                                            </div>
                                            <p className="text-[10px] text-gray-500 text-center font-bold uppercase tracking-widest">{td('back')}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-3 overflow-hidden">
                                        <p className="text-[10px] text-gray-400 text-left font-mono truncate">{td('designId')}: {order.design_id}</p>
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
                                {td('orderInfo')}
                            </h3>
                            <div className="bg-white rounded-xl border border-gray-100 px-4 shadow-sm">
                                <InfoRow label={td('shopName')} value={order.shop_name} icon={Store} />
                                <InfoRow label={td('shopId')} value={order.shop_id} icon={Hash} copyValue={order.shop_id} shopIdToLink={order.shop_id} />
                                <InfoRow label={td('ownerEmail')} value={order.shop_owner_email} icon={Mail} copyValue={order.shop_owner_email} />
                                <InfoRow label={td('quantity')} value={`${order.quantity} 枚`} icon={CheckCircle2} />
                                <InfoRow label={td('createdAt')} value={new Date(order.ts_created_at).toLocaleString()} icon={Calendar} />
                                <InfoRow label={td('updatedAt')} value={new Date(order.ts_updated_at).toLocaleString()} icon={History} />
                            </div>

                            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] mt-8 mb-4 flex items-center gap-2">
                                <Zap className="w-3.5 h-3.5" />
                                {td('orderMetadata')}
                            </h3>
                            <div className="bg-white rounded-xl border border-gray-100 px-4 shadow-sm">
                                <InfoRow label={td('productId')} value={order.product_id} icon={Package} copyValue={order.product_id} />
                                <InfoRow label={td('shopUserId')} value={order.shop_user_id} icon={User} copyValue={order.shop_user_id} />
                                <InfoRow label={td('senderId')} value={order.sender_user_id} copyValue={order.sender_user_id} />
                                <InfoRow label={td('expiration')} value={order.expiration_date ? new Date(order.expiration_date).toLocaleString() : td('systemDefault')} icon={Clock} />
                                <InfoRow label={td('activateNow')} value={order.activate_now ? td('yes') : td('no')} />
                            </div>

                            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] mt-8 mb-4 flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5" />
                                {td('adminDetails')}
                            </h3>
                            <div className="bg-white rounded-xl border border-gray-100 px-4 shadow-sm mb-6">
                                <InfoRow label={td('orderedByAdmin')} value={order.user_id_order} icon={User} copyValue={order.user_id_order} />
                                <InfoRow label={td('createdByAdmin')} value={order.user_id_create} icon={User} copyValue={order.user_id_create} />
                                <InfoRow label={td('batchId')} value={order.batch_id} icon={Hash} copyValue={order.batch_id} />
                                <InfoRow label={td('qrGeneratedAt')} value={order.ts_qr_generated_at ? new Date(order.ts_qr_generated_at).toLocaleString() : '-'} icon={Clock} />
                            </div>

                        </div>

                        {/* Right Column: Preview & Actions */}
                        <div className="p-6 flex flex-col gap-8 bg-white">

                        </div>
                    </div>
                </div>

                {/* Fixed Action Bar at Bottom */}
                <div className="p-4 px-8 border-t bg-white shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] z-10">
                    <div className="max-w-2xl mx-auto">
                        <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" />
                            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                                {td('availableActions')}
                            </h3>
                        </div>

                        {/* ORDERED state: Accept and Reject buttons */}
                        {order.status === 'ORDERED' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Button
                                    className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all active:scale-95"
                                    onClick={async () => {
                                        await onExport(order, 'pdf');
                                        onClose();
                                    }}
                                    disabled={!!isExporting}
                                >
                                    {isExporting === order.order_id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
                                    {tc('acceptAndGenerate')}
                                </Button>
                                <Button
                                    variant="destructive"
                                    className="h-12 border-red-100 hover:bg-red-600 transition-colors font-bold"
                                    onClick={() => {
                                        if (window.confirm(tc('rejectConfirm'))) {
                                            onUpdateStatus(order.shop_id, order.order_id, 'REJECTED');
                                            onClose();
                                        }
                                    }}
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    {tc('rejectOrder')}
                                </Button>
                            </div>
                        )}

                        {/* PRINTING or SHIPPED state: PDF and CSV buttons */}
                        {(order.status === 'PRINTING' || order.status === 'SHIPPED') && (
                            <div className="flex flex-col gap-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <Button
                                        className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all active:scale-95"
                                        onClick={() => onExport(order, 'pdf')}
                                        disabled={!!isExporting}
                                    >
                                        {isExporting === order.order_id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                                        {td('exportPdf')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="h-12 border-emerald-600 text-emerald-600 hover:bg-emerald-50 font-bold transition-all active:scale-95"
                                        onClick={() => onExport(order, 'csv')}
                                        disabled={!!isExporting}
                                    >
                                        {isExporting === order.order_id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                                        {td('exportCsv')}
                                    </Button>
                                </div>

                                {/* PRINTING state: Mark as Shipped button */}
                                {order.status === 'PRINTING' && (
                                    <Button
                                        variant="outline"
                                        className="h-12 border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold transition-all active:scale-95"
                                        onClick={async () => {
                                            await onUpdateStatus(order.shop_id, order.order_id, 'SHIPPED');
                                            onClose();
                                        }}
                                    >
                                        <Truck className="w-4 h-4 mr-2" />
                                        {tc('markAsShipped')}
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* CANCELLED or REJECTED: Show status label only */}
                        {(order.status === 'CANCELLED' || order.status === 'REJECTED') && (
                            <div className="py-2 text-center">
                                <Badge variant="outline" className={cn("px-6 py-2 text-sm font-semibold rounded-lg", getStatusStyle(order.status))}>
                                    {st(order.status.toLowerCase())}
                                </Badge>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <DialogFooter className="p-4 bg-gray-50/80 border-t border-gray-100 shrink-0 sm:justify-center">
                    <Button variant="ghost" onClick={onClose} className="text-gray-500 hover:text-gray-900 font-medium">
                        {t('back')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
