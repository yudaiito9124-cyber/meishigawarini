'use client';

import React, { useState } from 'react';
import { Package, Copy, Check, User, Truck, Clock, RefreshCw, Plus, ArrowRight, HelpCircle, Pencil, Loader2, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useCardListContext } from '../CardListSection';
import { useCardListUI } from '@/store/useShopStore';
import { Order } from './types';
import { useShop } from '@/context/ShopContext';

interface OrderRowProps {
    order: Order;
}

export function OrderRow({
    order
}: OrderRowProps) {
    const t = useTranslations('ShopPage');
    const st = useTranslations('Status');
    const ts = useTranslations('Timestamp');
    const tt = useTranslations('Time');

    const { shop, products } = useShop();
    const {
        orderColOptions,
        getOrderCellContent,
        statusCss,
        handleUpdateOrderMeta,
        getDesignAspectRatio,
        getDesignImages,
    } = useCardListContext();

    const { 
        visibleOrderColumns, shippingOrderId, copiedId, 
        set: setList 
    } = useCardListUI();

    const allowedDesigns = shop?.allowed_designs || [];

    const handleCopy = (id: string) => {
        navigator.clipboard.writeText(id).then(() => {
            setList({ copiedId: id });
            setTimeout(() => setList({ copiedId: null }), 2000);
        });
    };

    const [open, setOpen] = useState(false);
    const product = products.find((p: any) => p.product_id === order.product_id);
    const qrId = order.id || order.qr_id?.replace('QR#', '');

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <TableRow className="cursor-pointer hover:bg-gray-100 transition-colors">
                    {orderColOptions.filter((col: any) => visibleOrderColumns.includes(col.key)).map((col: any) => (
                        <TableCell key={col.key} className="py-3 text-xs md:text-sm">
                            {getOrderCellContent(order, col.key)}
                        </TableCell>
                    ))}
                </TableRow>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
                {open && order && (
                    <div className="flex flex-col max-h-[90vh]">
                        <DialogHeader className="p-6 bg-gradient-to-br from-white to-gray-50 border-b relative">
                            <div className="space-y-1">
                                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                    <Package className="w-5 h-5 text-primary" />
                                    {t('orders.details')}
                                </DialogTitle>
                                <DialogDescription className="font-mono text-xs text-gray-400 flex items-center gap-2">
                                    ID: {qrId}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 hover:bg-primary/5 hover:text-primary rounded-full transition-colors"
                                        onClick={(e) => { e.stopPropagation(); handleCopy(qrId); }}
                                    >
                                        {copiedId === qrId ? (
                                            <Check className="h-3.5 w-3.5 text-green-500" />
                                        ) : (
                                            <Copy className="h-3.5 w-3.5" />
                                        )}
                                    </Button>
                                </DialogDescription>
                            </div>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Card Preview & Product Section */}
                            <div className="space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('orders.productName')}</h4>
                                        <p className="text-lg font-bold text-gray-900 leading-tight">
                                            {product?.name || order.product_id || '-'}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('orders.status')}</h4>
                                        <span className={cn(
                                            "px-3 py-1 rounded-full text-xs font-bold border shadow-sm",
                                            statusCss(order.status)
                                        )}>
                                            {st(order.status.toLowerCase())}
                                        </span>
                                    </div>
                                </div>

                                {/* Card Preview Grid */}
                                {order.design_id && (
                                    <div className="grid grid-cols-2 gap-3 mt-4">
                                        {(() => {
                                            const aspectRatio = getDesignAspectRatio(order.design_id, allowedDesigns, product?.design);
                                            const images = getDesignImages(order.design_id, allowedDesigns, product?.design);
                                            return (
                                                <>
                                                    <div className="group relative">
                                                        <div className="text-[9px] font-bold text-gray-400 mb-1 ml-1 uppercase">Front</div>
                                                        <div
                                                            className="relative rounded-lg shadow-md overflow-hidden border border-gray-100 bg-white ring-1 ring-black/5 group-hover:shadow-lg transition-shadow"
                                                            style={{ aspectRatio }}
                                                        >
                                                            <img
                                                                src={order.thumbf || images.front}
                                                                alt="Front"
                                                                className="w-full h-full object-fill select-none"
                                                                draggable={false}
                                                                crossOrigin="anonymous"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="group relative">
                                                        <div className="text-[9px] font-bold text-gray-400 mb-1 ml-1 uppercase">Back</div>
                                                        <div
                                                            className="relative rounded-lg shadow-md overflow-hidden border border-gray-100 bg-white ring-1 ring-black/5 group-hover:shadow-lg transition-shadow"
                                                            style={{ aspectRatio }}
                                                        >
                                                            <img
                                                                src={order.thumbb || images.back}
                                                                alt="Back"
                                                                className="w-full h-full object-fill select-none"
                                                                draggable={false}
                                                                crossOrigin="anonymous"
                                                            />
                                                        </div>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>

                            {/* Delivery Information */}
                            <div className="grid grid-cols-1 gap-6 bg-gray-50 rounded-2xl p-5 border border-gray-100">
                                <div className="space-y-1">
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                                        <User className="w-3 h-3" />
                                        {t('orders.recipient')}
                                    </h4>
                                    <p className="text-sm font-bold text-gray-900">{order.recipient_name || '-'}</p>
                                    <p className="text-[11px] text-gray-500 font-medium font-mono">{order.shipping_info?.phone || '-'}</p>
                                    <p className="text-[11px] text-gray-500 font-medium">{order.shipping_info?.email || '-'}</p>
                                </div>
                                <div className="col-span-2 space-y-1 pt-2 border-t border-gray-200/50">
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                                        <Truck className="w-3 h-3" />
                                        {t('orders.address')}
                                    </h4>
                                    {order.postal_code && <p className="text-[11px] font-mono text-gray-500">〒{order.postal_code}</p>}
                                    <p className="text-sm text-gray-900 leading-relaxed">{order.address || '-'}</p>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                                        <Clock className="w-3 h-3" />
                                        {t('orders.preferredDateTime')}
                                    </h4>
                                    <p className="text-sm text-gray-900">
                                        {order.preferred_date ? order.preferred_date : '-'} / {order.preferred_time ? tt(order.preferred_time) : '-'}
                                    </p>
                                </div>
                            </div>

                            {/* Shipping Action Section */}
                            {order.status === 'USED' && (
                                <div className="p-5 border-2 border-orange-200 rounded-2xl bg-gradient-to-br from-orange-50 to-white shadow-sm ring-4 ring-orange-50/50">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                                        <h4 className="text-xs font-black text-orange-900 uppercase tracking-widest">{t('orders.action')}</h4>
                                    </div>
                                    <form onSubmit={(e) => {
                                        e.preventDefault();
                                        const fd = new FormData(e.target as HTMLFormElement);
                                        handleUpdateOrderMeta(
                                            qrId,
                                            fd.get('delivery_company') as string,
                                            fd.get('tracking') as string
                                        );
                                    }} className="space-y-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor={`delivery_company-${qrId}`} className="text-[11px] font-bold text-orange-900/60 ml-1">{t('orders.shipDialog.deliveryCompany')}</Label>
                                            <Input id={`delivery_company-${qrId}`} name="delivery_company" placeholder={t('orders.shipDialog.deliveryCompanyPlaceholder')} required className="h-10 bg-white border-orange-200 focus:border-orange-500 focus:ring-orange-500 rounded-xl" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor={`tracking-${qrId}`} className="text-[11px] font-bold text-orange-900/60 ml-1">{t('orders.shipDialog.label')}</Label>
                                            <Input id={`tracking-${qrId}`} name="tracking" placeholder="1234-5678..." required className="h-10 bg-white border-orange-200 focus:border-orange-500 focus:ring-orange-500 rounded-xl" />
                                        </div>

                                        <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-11 rounded-xl shadow-lg shadow-orange-200 transition-all active:scale-[0.98] mt-2" disabled={shippingOrderId === qrId}>
                                            {shippingOrderId === qrId ? (
                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('linkQr.processing')}</>
                                            ) : (
                                                <span className="flex items-center gap-2"><Truck className="w-4 h-4" /> {t('orders.shipDialog.submit')}</span>
                                            )}
                                        </Button>
                                    </form>
                                </div>
                            )}

                            {/* Admin Meta Edit Section */}
                            <div className="pt-2 border-t border-dashed space-y-4">
                                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-2 mb-1">
                                    <div className="p-1 rounded-md bg-gray-100 text-gray-500"><Pencil className="w-3.5 h-3.5" /></div>
                                    {t('orders.updateMeta')}
                                </h4>
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    const fd = new FormData(e.currentTarget);
                                    await handleUpdateOrderMeta(
                                        qrId,
                                        undefined,
                                        undefined,
                                        fd.get('memo_for_users') as string,
                                        fd.get('memo_for_shop') as string
                                    );
                                }} className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor={`m_u-${qrId}`} className="text-[11px] font-bold text-gray-400 ml-1">{t('orders.userMessage')}</Label>
                                        <Textarea
                                            id={`m_u-${qrId}`}
                                            name="memo_for_users"
                                            defaultValue={order.memo_for_users || ""}
                                            disabled={['COMPLETED', 'EXPIRED', 'BANNED'].includes(order.status)}
                                            placeholder={['COMPLETED', 'EXPIRED', 'BANNED'].includes(order.status) ? t('orders.shipDialog.Completed-state messages cannot be updated') : ""}
                                            className="text-sm min-h-[80px] rounded-xl border-gray-200 focus:ring-primary/20 resize-none"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor={`m_s-${qrId}`} className="text-[11px] font-bold text-gray-400 ml-1">{t('orders.shopMemo')}</Label>
                                        <Textarea
                                            id={`m_s-${qrId}`}
                                            name="memo_for_shop"
                                            defaultValue={order.memo_for_shop || ""}
                                            className="text-sm min-h-[80px] rounded-xl border-gray-200 focus:ring-primary/20 resize-none"
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        className="w-full h-11 rounded-xl shadow-sm font-bold"
                                        disabled={shippingOrderId === qrId}
                                    >
                                        {shippingOrderId === qrId ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                        {shippingOrderId === qrId ? t('orders.processing') : t('shopSettings.submit')}
                                    </Button>
                                </form>
                            </div>

                            {/* Timestamps */}
                            <div className="bg-gray-50/50 rounded-2xl p-5 border border-gray-100 flex flex-col gap-2.5">
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{t('orders.timestamps')}</h4>
                                {[
                                    { key: 'ts_updated_at', icon: <RefreshCw className="w-3 h-3" /> },
                                    { key: 'ts_linked_at', icon: <Plus className="w-3 h-3" /> },
                                    { key: 'ts_activated_at', icon: <Check className="w-3 h-3" /> },
                                    { key: 'ts_submitted_at', icon: <ArrowRight className="w-3 h-3" /> },
                                    { key: 'ts_shipped_at', icon: <Truck className="w-3 h-3" /> },
                                    { key: 'ts_completed_at', icon: <Check className="w-3 h-3" /> },
                                    { key: 'ts_expired_at', icon: <Clock className="w-3 h-3" /> },
                                    { key: 'ts_banned_at', icon: <HelpCircle className="w-3 h-3" /> }
                                ].map((ts_item) => order[ts_item.key] ? (
                                    <div key={ts_item.key} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-2 text-gray-500 text-[11px] font-medium">
                                            <span className="p-1 rounded bg-white border border-gray-100 group-hover:text-primary transition-colors">{ts_item.icon}</span>
                                            {ts(ts_item.key)}
                                        </div>
                                        <div className="text-[11px] font-mono text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-100">
                                            {new Date(order[ts_item.key]).toLocaleString()}
                                        </div>
                                    </div>
                                ) : null)}
                            </div>
                        </div>

                        <div className="p-4 border-t bg-gray-50/50 flex justify-end">
                            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full px-6 shadow-sm">
                                閉じる
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
