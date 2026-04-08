'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RefreshCw, ArrowUp, ArrowDown, QrCode, Package, SlidersHorizontal, Plus as PlusIcon, User, Truck, Clock, Pencil, MessageCircleWarning, Mail, Phone, Hash, Calendar, CheckCircle2, XCircle, Link2, Zap, AlertCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslations } from 'next-intl';
import { shopApi } from '@/lib/api/shop';
import { cardStatusCss } from '@/components/share/statusCss';
import { getDesignAspectRatio, getDesignImages } from '@/lib/utils/design';
import { useShop } from '@/context/ShopContext';
import { useCardListUI } from '@/store/useShopStore';
import { cn } from '@/lib/utils';
import { useBackendError } from '@/hooks/useBackendError';

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
        title: t('orders.columnGroups.basic'),
        columns: [
            { key: 'ts_updated_at', label: t('orders.date'), icon: <RefreshCw className="w-3.5 h-3.5" /> },
            { key: 'qr_id', label: t('orders.qrId'), icon: <QrCode className="w-3.5 h-3.5" /> },
            { key: 'product_id', label: t('orders.productName'), icon: <Package className="w-3.5 h-3.5" /> },
            { key: 'status', label: t('orders.status'), icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
            { key: 'ts_expired_at', label: t('orders.filterExpiration'), icon: <XCircle className="w-3.5 h-3.5" /> },
        ]
    },
    {
        title: t('orders.columnGroups.shipping'),
        columns: [
            { key: 'recipient_name', label: t('orders.recipient'), icon: <User className="w-3.5 h-3.5" /> },
            { key: 'postal_code', label: t('orders.postalCode'), icon: <Hash className="w-3.5 h-3.5" /> },
            { key: 'address', label: t('orders.address'), icon: <Truck className="w-3.5 h-3.5" /> },
            { key: 'phone', label: t('orders.phone'), icon: <Phone className="w-3.5 h-3.5" /> },
            { key: 'email', label: t('orders.email'), icon: <Mail className="w-3.5 h-3.5" /> },
            { key: 'preferred_date', label: t('orders.preferredDate'), icon: <Calendar className="w-3.5 h-3.5" /> },
            { key: 'preferred_time', label: t('orders.preferredTime'), icon: <Clock className="w-3.5 h-3.5" /> },
        ]
    },
    {
        title: t('orders.columnGroups.history'),
        columns: [
            { key: 'delivery_company', label: t('orders.deliveryCompany'), icon: <Truck className="w-3.5 h-3.5" /> },
            { key: 'tracking_number', label: t('orders.trackingNumber'), icon: <Hash className="w-3.5 h-3.5" /> },
        ]
    },
    {
        title: t('orders.columnGroups.messages'),
        columns: [
            { key: 'memo_for_shop', label: t('orders.shopMemo'), icon: <Pencil className="w-3.5 h-3.5" /> },
            { key: 'memo_for_users', label: t('orders.userMessage'), icon: <MessageCircleWarning className="w-3.5 h-3.5" /> },
        ]
    },
    {
        title: t('orders.columnGroups.timestamps'),
        columns: [
            { key: 'ts_created_at', label: ts('ts_created_at'), icon: <PlusIcon className="w-3.5 h-3.5" /> },
            { key: 'ts_submitted_at', label: t('orders.filterSubmission'), icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
            { key: 'ts_shipped_at', label: ts('ts_shipped_at'), icon: <Truck className="w-3.5 h-3.5" /> },
            { key: 'ts_completed_at', label: ts('ts_completed_at'), icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
            { key: 'ts_linked_at', label: ts('ts_linked_at'), icon: <Link2 className="w-3.5 h-3.5" /> },
            { key: 'ts_activated_at', label: ts('ts_activated_at'), icon: <Zap className="w-3.5 h-3.5" /> },
            { key: 'ts_banned_at', label: ts('ts_banned_at'), icon: <AlertCircle className="w-3.5 h-3.5" /> },
        ]
    }
];

// --- Main Component ---

export function CardListSection({ shopId }: { shopId: string }) {
    const t = useTranslations('ShopPage');
    const ts = useTranslations('Timestamp');
    const st = useTranslations('Status');
    const { translateError } = useBackendError();

    const { products, orders, ordersLoading, refreshOrders, refreshProducts, refreshShopDetails } = useShop();
    const {
        orderStatusFilter, orderProductFilter,
        orderUpdatedFilter, orderExpirationFilter,
        orderSubmissionFilter, orderPreferredDateFilter,
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
            alert(t('orders.updateError') + ': ' + (translateError(e.message, e.detail) || e.message || String(e)));
        } finally {
            setList({ shippingOrderId: null });
        }
    };

    const orderColGroups = useMemo(() => getOrderColGroups(t, ts), [t, ts]);
    const orderColOptions = useMemo(() => orderColGroups.flatMap(g => g.columns), [orderColGroups]);

    const filteredOrders = useMemo(() => {
        const now = new Date();
        const getLocalYYYYMMDD = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        const todayStr = getLocalYYYYMMDD(now);
        
        const isToday = (d?: string) => {
            if (!d) return false;
            const date = new Date(d);
            return date.toDateString() === now.toDateString();
        };
        const isYesterday = (d?: string) => {
            if (!d) return false;
            const date = new Date(d);
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            return date.toDateString() === yesterday.toDateString();
        };
        const isWithinDays = (d: string | undefined, days: number) => {
            if (!d) return false;
            const date = new Date(d);
            const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
            const dayDiff = Math.floor((startOfNow - startOfTarget) / (24 * 60 * 60 * 1000));
            return dayDiff >= 0 && dayDiff < days;
        };
        const isThisMonth = (d?: string) => {
            if (!d) return false;
            const date = new Date(d);
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        };

        return orders
            .filter(o => orderStatusFilter === 'ALL' || o.status === orderStatusFilter)
            .filter(o => !orderProductFilter || o.product_id === orderProductFilter)
            .filter(o => !searchQrId || (o.id || o.qr_id)?.includes(searchQrId))
            .filter(o => {
                if (orderUpdatedFilter === 'ALL') return true;
                const d = o.ts_updated_at;
                if (orderUpdatedFilter === 'TODAY') return isToday(d);
                if (orderUpdatedFilter === 'YESTERDAY') return isYesterday(d);
                if (orderUpdatedFilter === 'THIS_WEEK') return isWithinDays(d, 7);
                if (orderUpdatedFilter === 'THIS_MONTH') return isThisMonth(d);
                if (orderUpdatedFilter === 'LAST_30_DAYS') return isWithinDays(d, 30);
                return true;
            })
            .filter(o => {
                if (orderExpirationFilter === 'ALL') return true;
                const d = o.ts_expired_at;
                if (!d) return orderExpirationFilter === 'VALID'; // No expiration means valid
                const expDate = new Date(d);
                const expired = expDate.getTime() < now.getTime();
                if (orderExpirationFilter === 'VALID') return !expired;
                if (orderExpirationFilter === 'EXPIRED') return expired;
                if (orderExpirationFilter === 'EXPIRING_SOON') {
                    const diff = expDate.getTime() - now.getTime();
                    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
                }
                return true;
            })
            .filter(o => {
                if (orderSubmissionFilter === 'ALL') return true;
                const d = o.ts_submitted_at;
                if (orderSubmissionFilter === 'TODAY') return isToday(d);
                if (orderSubmissionFilter === 'YESTERDAY') return isYesterday(d);
                if (orderSubmissionFilter === 'THIS_WEEK') return isWithinDays(d, 7);
                return true;
            })
            .filter(o => {
                if (orderPreferredDateFilter === 'ALL') return true;
                const d = o.preferred_date;
                if (!d || d === '-') return false;
                if (orderPreferredDateFilter === 'TODAY') return d === todayStr;
                if (orderPreferredDateFilter === 'TOMORROW') {
                    const tom = new Date(now);
                    tom.setDate(now.getDate() + 1);
                    return d === getLocalYYYYMMDD(tom);
                }
                if (orderPreferredDateFilter === 'UPCOMING') return d > todayStr;
                return true;
            })
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
    }, [orders, orderStatusFilter, orderProductFilter, searchQrId, orderSortConfig, orderUpdatedFilter, orderExpirationFilter, orderSubmissionFilter, orderPreferredDateFilter]);

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
            case 'ts_submitted_at':
            case 'ts_shipped_at':
            case 'ts_completed_at':
            case 'ts_linked_at':
            case 'ts_activated_at':
            case 'ts_expired_at':
            case 'ts_banned_at':
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
            case 'email': return <span className="text-xs truncate max-w-[120px] inline-block">{order.shipping_info?.email || "-"}</span>;
            case 'phone': return <span className="text-xs">{order.shipping_info?.phone || "-"}</span>;
            default: return <span className="truncate max-w-[150px] inline-block text-xs">{order[colKey] || "-"}</span>;
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
