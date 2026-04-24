'use client';

/**
 * カード一覧セクション（ショップ画面）のメインコンポーネント。
 *
 * 役割:
 * - 受注データを多条件で絞り込み、任意列で表示
 * - 列ソート、メタ情報更新、CSV出力を提供
 * - サブコンポーネント（OrderFilter / OrderRow）へ Context で操作関数を供給
 */

import React, { createContext, useContext, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { generateAddressPDF } from '../../lib/generateAddressPDF';
import { DEFAULT_POST_CONFIG, DEFAULT_EXPRESS_CONFIG } from './ShippingLabelSettings';

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
    handleExportCSV: () => void;
    handleExportShippinglabelPDF: (type: 'yubin' | 'takkyubin') => void;
    isExporting: boolean;
    filteredOrdersCount: number;
    usedOrdersCount: number;
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
    const tt = useTranslations('Time');
    const { translateError } = useBackendError();

    const { shop, products, orders, ordersLoading, refreshOrders, refreshProducts, refreshShopDetails } = useShop();
    const {
        orderStatusFilter, orderProductFilter,
        orderUpdatedFilter, orderExpirationFilter,
        orderSubmissionFilter, orderPreferredDateFilter,
        searchQrId, visibleOrderColumns,
        orderSortConfig, subRefreshing,
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
    const [isExporting, setIsExporting] = useState(false);
    const [fontCache, setFontCache] = useState<{ [key: string]: string }>({});
    const orderColOptions = useMemo(() => orderColGroups.flatMap(g => g.columns), [orderColGroups]);

    /**
     * フィルタリング + ソート済みの表示対象受注一覧。
     *
     * ポイント:
     * - status/product は「複数選択配列」方式（空配列は ALL 扱い）
     * - 日付系フィルターはローカル日付基準で判定
     * - ソート未指定時は業務優先（status優先 + 更新日時降順）
     */
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
            .filter(o => orderStatusFilter.length === 0 || orderStatusFilter.includes(o.status))
            .filter(o => orderProductFilter.length === 0 || orderProductFilter.includes(o.product_id))
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

    /**
     * ヘッダークリック時のソート切替。
     * 同じキーを連続クリックした場合は asc -> desc をトグルします。
     */
    const handleOrderSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (orderSortConfig && orderSortConfig.key === key && orderSortConfig.direction === 'asc') direction = 'desc';
        setList({ orderSortConfig: { key, direction } });
    };

    /**
     * 列キーに応じてセル描画内容を返します。
     * 日付列・ステータス列・配送情報列で表示形式を個別最適化しています。
     */
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
            case 'preferred_time':
                const timeKey = order[colKey];
                return <span className="text-xs">{timeKey ? (tt.has(timeKey) ? tt(timeKey) : timeKey) : "-"}</span>;
            default: return <span className="truncate max-w-[150px] inline-block text-xs">{order[colKey] || "-"}</span>;
        }
    };

    /**
     * 現在の絞り込み結果を CSV で出力します。
     *
     * 仕様:
     * - 「現在表示中の列」だけをヘッダー/行に出力
     * - Excel 文字化け対策として UTF-8 BOM を付与
     * - ファイル名に shop 名 + タイムスタンプを含める
     */
    const handleExportCSV = () => {
        if (!shop || filteredOrders.length === 0) return;

        // 1. Prepare Headers (only visible columns)
        const visibleCols = orderColOptions.filter(col => visibleOrderColumns.includes(col.key));
        const headers = visibleCols.map(col => `"${col.label.replace(/"/g, '""')}"`).join(',');

        // 2. Prepare Rows
        const rows = filteredOrders.map(order => {
            return visibleCols.map(col => {
                let value = "";
                const product = products.find(p => p.product_id === order.product_id);

                switch (col.key) {
                    case 'ts_updated_at':
                    case 'ts_created_at':
                    case 'ts_submitted_at':
                    case 'ts_shipped_at':
                    case 'ts_completed_at':
                    case 'ts_linked_at':
                    case 'ts_activated_at':
                    case 'ts_expired_at':
                    case 'ts_banned_at':
                        const dateVal = order[col.key];
                        value = dateVal ? new Date(dateVal).toLocaleString() : "-";
                        break;
                    case 'qr_id':
                        value = order.id || order.qr_id?.replace('QR#', '');
                        break;
                    case 'product_id':
                        value = product?.name || order.product_id;
                        break;
                    case 'status':
                        value = st(order.status.toLowerCase());
                        break;
                    case 'email':
                        value = order.shipping_info?.email || "-";
                        break;
                    case 'phone':
                        value = order.shipping_info?.phone || "-";
                        break;
                    case 'preferred_time':
                        const tKey = order[col.key];
                        value = tKey ? (tt.has(tKey) ? tt(tKey) : tKey) : "-";
                        break;
                    default:
                        value = order[col.key] || "-";
                        break;
                }
                return `"${String(value).replace(/"/g, '""')}"`;
            }).join(',');
        });

        const csvContent = [headers, ...rows].join('\n');
        // BOM を付与して日本語環境の表計算ソフトでの文字化けを防止します。
        const bom = '\uFEFF';
        const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });

        // 3. Filename
        const now = new Date();
        const timestamp = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');

        const filename = `cards_${shop.name}_${timestamp}.csv`;

        // 4. Trigger Download
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    /**
     * 送り状 PDF を生成してダウンロードします。
     */
    const handleExportShippinglabelPDF = async (type: 'yubin' | 'takkyubin') => {
        const ordersToExport = filteredOrders.filter(o => o.status === 'USED');
        if (!shop || ordersToExport.length === 0 || isExporting) return;

        setIsExporting(true);
        try {
            // 設定が保存されていない場合はデフォルト値を使用する
            const defaultConfig = type === 'yubin' ? DEFAULT_POST_CONFIG : DEFAULT_EXPRESS_CONFIG;
            const savedConfig = shop.shipping_label_settings?.[type];

            // 既存設定がある場合も、デフォルト設定とマージして新しいプロパティ（maxWidth等）が欠落しないようにする
            const config = savedConfig ? {
                ...defaultConfig,
                ...savedConfig,
                paper: {
                    ...defaultConfig.paper,
                    ...(savedConfig.paper || {})
                },
                layout: Object.keys(defaultConfig.layout).reduce((acc, key) => {
                    const k = key as keyof typeof defaultConfig.layout;
                    acc[k] = {
                        ...defaultConfig.layout[k],
                        ...(savedConfig.layout?.[k] || {})
                    };
                    return acc;
                }, {} as any)
            } : defaultConfig;

            const now = new Date();
            const timestamp = now.getFullYear() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + '_' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0');

            const filename = `shippinglabel_${type}_${shop.name}_${timestamp}.pdf`;

            // フォントの取得 (Blob -> Base64)
            const fetchFontAsBase64 = async (url: string): Promise<string | undefined> => {
                if (fontCache[url]) return fontCache[url];
                try {
                    const resp = await fetch(url);
                    if (!resp.ok) return undefined;
                    const blob = await resp.blob();
                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                    if (base64) setFontCache(prev => ({ ...prev, [url]: base64 }));
                    return base64;
                } catch (e) {
                    console.error(`Font fetch failed: ${url}`, e);
                    return undefined;
                }
            };

            const fontUrl = '/NotoSansJP-Regular.ttf';
            const [normalFont, boldFont] = await Promise.all([
                fetchFontAsBase64(fontUrl),
                fetchFontAsBase64('/NotoSansJP-Bold.ttf')
            ]);

            const enrichedOrders = ordersToExport.map(order => ({
                ...order,
                product_name: products.find(p => p.product_id === order.product_id)?.name
            }));

            await generateAddressPDF(enrichedOrders, shop, config, filename, {
                normal: normalFont || '',
                bold: boldFont || ''
            });
        } finally {
            setIsExporting(false);
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
        getDesignImages,
        handleExportCSV,
        handleExportShippinglabelPDF,
        isExporting,
        filteredOrdersCount: filteredOrders.length,
        usedOrdersCount: filteredOrders.filter(o => o.status === 'USED').length
    };

    return (
        <CardListContext.Provider value={value}>
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('incomingOrders')}</CardTitle>
                        <CardDescription>{t('ordersDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 w-full">
                        <OrderFilter />

                        {/* 絞り込み件数表示 (目立つようにテーブルの上に配置) */}
                        <div className="flex items-baseline gap-2 px-1 mb-3 mt-1">
                            <span className="text-sm font-medium text-gray-500">
                                {(orderStatusFilter.length > 0 || orderProductFilter.length > 0 || searchQrId.trim() !== "" || orderUpdatedFilter !== "ALL" || orderExpirationFilter !== "ALL" || orderSubmissionFilter !== "ALL" || orderPreferredDateFilter !== "ALL")
                                    ? "絞り込み結果"
                                    : "全件"
                                }:
                            </span>
                            <span className="text-2xl font-black text-primary">
                                {filteredOrders.length}
                            </span>
                            <span className="text-sm font-medium text-gray-500">件</span>
                        </div>

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
