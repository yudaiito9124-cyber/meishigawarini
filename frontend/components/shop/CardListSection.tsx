'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RefreshCw, ArrowUp, ArrowDown, QrCode, Package, SlidersHorizontal, Plus as PlusIcon, User, Truck, Clock, Pencil, MessageCircleWarning } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslations } from 'next-intl';
import { shopApi } from '@/lib/api/shop';
import { cardStatusCss } from '@/components/share/statusCss';
import { getDesignAspectRatio, getDesignImages } from '@/lib/utils/design';
import { useShop } from '@/context/ShopContext';
import { useCardListUI } from '@/store/useShopStore';
import { cn } from '@/lib/utils';

// Sub-components
import { OrderFilter } from './card-list/OrderFilter';
import { OrderRow } from './card-list/OrderRow';
import { ColumnSettingsDialog } from './card-list/ColumnSettingsDialog';
import { StatusGuide } from './card-list/StatusGuide';
import { Order, ColumnOption, ColumnGroup } from './card-list/types';

// --- Context ---

interface CardListContextType {
    fetchSectionData: (refresh?: boolean) => Promise<void>;
    orderColGroups: ColumnGroup[];
    orderColOptions: ColumnOption[];
    getOrderCellContent: (order: Order, colKey: string) => React.ReactNode;
    handleUpdateOrderMeta: (qr_id: string, deliveryCompany?: string, trackingNumber?: string, memoForUsers?: string, memoForShop?: string) => Promise<void>;
    statusCss: (status: string) => string;
    getDesignAspectRatio: typeof getDesignAspectRatio;
    getDesignImages: typeof getDesignImages;
}

const CardListContext = createContext<CardListContextType | null>(null);

export const useCardListContext = () => {
    const context = useContext(CardListContext);
    if (!context) throw new Error('useCardListContext must be used within CardListSection');
    return context;
};

// --- Constants ---

const STATUS_SORT_ORDER: Record<string, number> = {
    'LINKED': 3,
    'ACTIVE': 2,
    'USED': 4,
    'SHIPPED': 1,
    'COMPLETED': 0,
    'EXPIRED': -1,
    'BANNED': -2
};

const getOrderColGroups = (t: any, ts: any): ColumnGroup[] => [
    {
        title: '基本情報',
        columns: [
            { key: 'ts_updated_at', label: t('orders.date'), icon: <RefreshCw className="w-3.5 h-3.5" /> },
            { key: 'ts_created_at', label: ts('ts_created_at'), icon: <PlusIcon className="w-3.5 h-3.5" /> },
            { key: 'qr_id', label: t('orders.qrId'), icon: <QrCode className="w-3.5 h-3.5" /> },
            { key: 'product_id', label: t('orders.productName'), icon: <Package className="w-3.5 h-3.5" /> },
            { key: 'status', label: t('orders.status'), icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
        ]
    },
    {
        title: 'お届け先情報',
        columns: [
            { key: 'recipient_name', label: t('orders.recipient'), icon: <User className="w-3.5 h-3.5" /> },
            { key: 'address', label: t('orders.address'), icon: <Truck className="w-3.5 h-3.5" /> },
            { key: 'preferred_date', label: t('orders.preferredDateTime'), icon: <Clock className="w-3.5 h-3.5" /> },
        ]
    },
    {
        title: 'メモ・メッセージ',
        columns: [
            { key: 'memo_for_shop', label: t('orders.shopMemo'), icon: <Pencil className="w-3.5 h-3.5" /> },
            { key: 'memo_for_users', label: t('orders.userMessage'), icon: <MessageCircleWarning className="w-3.5 h-3.5" /> },
        ]
    }
];

// --- Main Component ---

export function CardListSection({ shopId }: { shopId: string }) {
    const t = useTranslations('ShopPage');
    const ts = useTranslations('Timestamp');
    const st = useTranslations('Status');
    const tb = useTranslations('Backend');

    const { products, orders, ordersLoading, refreshOrders, refreshProducts, refreshShopDetails } = useShop();
    const { 
        orderStatusFilter, orderProductFilter, 
        searchQrId, visibleOrderColumns, 
        orderSortConfig, 
        set: setList 
    } = useCardListUI();

    const fetchSectionData = async (refresh = false) => {
        if (refresh) setList({ subRefreshing: true });
        await Promise.all([refreshOrders(), refreshProducts(), refreshShopDetails()]);
        setList({ subRefreshing: false });
    };

    const handleUpdateOrderMeta = async (qr_id: string, deliveryCompany?: string, trackingNumber?: string, memoForUsers?: string, memoForShop?: string) => {
        setList({ shippingOrderId: qr_id });
        try {
            await shopApi.shop_orders_update({
                shop_id: shopId,
                qr_id: qr_id,
                delivery_company: deliveryCompany,
                tracking_number: trackingNumber,
                memo_for_users: memoForUsers,
                memo_for_shop: memoForShop
            });
            await fetchSectionData(true);
        } catch (e: any) {
            alert(t('orders.updateError') + ': ' + (tb(e.message?.replace(/\./g, '_')) || e.message || String(e)));
        } finally {
            setList({ shippingOrderId: null });
        }
    };

    const orderColGroups = useMemo(() => getOrderColGroups(t, ts), [t, ts]);
    const orderColOptions = useMemo(() => orderColGroups.flatMap(g => g.columns), [orderColGroups]);

    const filteredOrders = useMemo(() => {
        return orders
            .filter(o => orderStatusFilter === 'ALL' || o.status === orderStatusFilter)
            .filter(o => !orderProductFilter || o.product_id === orderProductFilter)
            .filter(o => !searchQrId || (o.id || o.qr_id)?.includes(searchQrId))
            .sort((a, b) => {
                if (!orderSortConfig) {
                    if (a.status !== b.status) {
                        return (STATUS_SORT_ORDER[b.status] || 0) - (STATUS_SORT_ORDER[a.status] || 0);
                    }
                    return new Date(b.ts_updated_at || b.ts_created_at).getTime() - new Date(a.ts_updated_at || a.ts_created_at).getTime();
                }
                const { key, direction } = orderSortConfig;
                let valA: any = a[key] || "", valB: any = b[key] || "";
                if (key === 'status') {
                    valA = STATUS_SORT_ORDER[a.status] || 0;
                    valB = STATUS_SORT_ORDER[b.status] || 0;
                } else if (key.startsWith('ts_')) {
                    valA = new Date(a[key] || 0).getTime();
                    valB = new Date(b[key] || 0).getTime();
                }
                if (valA < valB) return direction === 'asc' ? -1 : 1;
                if (valA > valB) return direction === 'asc' ? 1 : -1;
                return 0;
            });
    }, [orders, orderStatusFilter, orderProductFilter, searchQrId, orderSortConfig]);

    const handleOrderSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (orderSortConfig && orderSortConfig.key === key && orderSortConfig.direction === 'asc') direction = 'desc';
        setList({ orderSortConfig: { key, direction } });
    };

    const getOrderCellContent = (order: Order, colKey: string) => {
        const product = products.find(p => p.product_id === order.product_id);
        const qrId = order.id || order.qr_id?.replace('QR#', '');

        switch (colKey) {
            case 'ts_updated_at':
            case 'ts_created_at':
                const dateVal = order[colKey];
                return dateVal ? (
                    <div className="flex flex-col">
                        <span className="whitespace-nowrap">{new Date(dateVal).toLocaleDateString()}</span>
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">{new Date(dateVal).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                ) : "-";
            case 'qr_id': return <span className="font-mono text-xs">{qrId}</span>;
            case 'product_id': return <span className="font-bold">{product?.name || order.product_id}</span>;
            case 'status':
                return (
                    <span className={cn("px-2 py-1 rounded text-xs border", cardStatusCss(order.status))}>{st(order.status.toLowerCase())}</span>
                );
            default: return <span className="truncate max-w-[150px] inline-block">{order[colKey] || "-"}</span>;
        }
    };

    const value = {
        fetchSectionData,
        orderColGroups,
        orderColOptions,
        getOrderCellContent,
        handleUpdateOrderMeta,
        statusCss: cardStatusCss,
        getDesignAspectRatio,
        getDesignImages
    };

    return (
        <CardListContext.Provider value={value}>
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('incomingOrders')}</CardTitle>
                        <CardDescription>{t('ordersDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 w-full">
                        <OrderFilter />
                        <Table wrapperStyle={{ maxHeight: 'calc(100vh - 200px)', minHeight: '300px' }}>
                            <TableHeader className="sticky top-0 bg-white z-10 drop-shadow-sm">
                                <TableRow>
                                    {orderColOptions.filter(col => visibleOrderColumns.includes(col.key)).map(col => (
                                        <TableHead
                                            key={col.key}
                                            className="text-xs md:text-sm cursor-pointer select-none hover:bg-gray-50 transition-colors"
                                            onClick={() => handleOrderSort(col.key)}
                                        >
                                            <div className="flex items-center gap-2">
                                                {col.label}
                                                {orderSortConfig?.key === col.key ? (
                                                    orderSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                                                ) : (
                                                    <ArrowDown className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100" />
                                                )}
                                            </div>
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ordersLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={orderColOptions.filter(col => visibleOrderColumns.includes(col.key)).length} className="text-center py-4">
                                            <RefreshCw className="animate-spin h-5 w-5 mx-auto text-gray-400" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOrders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={orderColOptions.filter(col => visibleOrderColumns.includes(col.key)).length} className="text-center">
                                            {t('orders.noOrders')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOrders.map((order) => (
                                        <OrderRow 
                                            key={order.qr_id} 
                                            order={order} 
                                        />
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <ColumnSettingsDialog />
                <StatusGuide />
            </div>
        </CardListContext.Provider>
    );
}
