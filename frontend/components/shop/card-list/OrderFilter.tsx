'use client';

/**
 * 受注一覧の絞り込みUIコンポーネント。
 *
 * 仕様上の重要点:
 * - 商品フィルター / ステータスフィルターは複数選択可能
 * - 選択配列が空の場合は「ALL」と同義
 * - CSV出力は親コンテキストの filteredOrders を対象に実行
 */

import React from 'react';
import { Filter, Plus, Check, Search, Loader2, Table2, RefreshCw, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { cardStatusList, cardStatusCss } from '@/components/share/statusCss';
import { useShop } from '@/context/ShopContext';
import { useTranslations } from 'next-intl';
import { useCardListUI } from '@/store/useShopStore';
import { useCardListContext } from '../CardListSection';

export function OrderFilter() {
    const t = useTranslations('ShopPage');
    const tc = useTranslations('Common');
    const st = useTranslations('Status');

    const { shop, products, ordersLoading } = useShop();
    const {
        fetchSectionData,
        orderColOptions,
        getDesignAspectRatio,
        getDesignImages,
        handleExportCSV,
        handleExportShippinglabelPDF,
        isExporting,
        filteredOrdersCount,
        usedOrdersCount,
    } = useCardListContext();

    const {
        isDetailFiltering, orderStatusFilter, orderProductFilter,
        orderUpdatedFilter, orderExpirationFilter,
        orderSubmissionFilter, orderPreferredDateFilter,
        searchQrId, visibleOrderColumns, subRefreshing,
        set: setList
    } = useCardListUI();

    const allowedDesigns = shop?.allowed_designs || [];

    return (
        <div className="mb-2">
            <div className={cn("flex gap-2 flex", isDetailFiltering ? "flex-col" : "")}>

                {/* 絞り込み */}
                <div className={cn("relative", isDetailFiltering ? "rounded-xl border-dashed border-gray-300 p-2 mb-4 flex justify-start flex-col mt-1 w-full bg-gray-100" : "")}>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            if (isDetailFiltering) {
                                // 詳細フィルターを閉じる時は状態を初期化し、次回開いた時に
                                // 以前の条件が残って混乱しないようにします。
                                setList({
                                    orderProductFilter: [],
                                    orderStatusFilter: [],
                                    orderUpdatedFilter: 'ALL',
                                    orderExpirationFilter: 'ALL',
                                    orderSubmissionFilter: 'ALL',
                                    orderPreferredDateFilter: 'ALL',
                                    searchQrId: ''
                                });
                            }
                            setList({ isDetailFiltering: !isDetailFiltering });
                        }}
                        className={cn(`justify-start gap-0 text-xs border-gray-200 rounded-lg shadow-sm hover:ring-2 hover:ring-primary/10 transition-all text-primary border-primary/20 bg-primary/5 `, isDetailFiltering ? "absolute -top-1 -left-0 bg-gray-100 max-w-10" : "max-w-25")}
                    >
                        {isDetailFiltering ? (
                            <Plus className={`w-3.5 h-3.5 mr-2 rotate-45`} />
                        ) : (
                            <>
                                <Filter className={`w-3.5 h-3.5 mr-2`} />{t('filter')}
                            </>
                        )}
                    </Button>

                    {isDetailFiltering && (
                        <div className="mt-7">
                            {/* 商品/カードフィルター */}
                            <div className="relative left-3 text-[15px] text-gray-800 flex flex-row gap-2 items-center mt-0">
                                {t('orders.design')}
                            </div>
                            <div className="flex flex-wrap items-start gap-3 border-gray-200 p-2 bg-gray-300 rounded-xl max-h-100 overflow-y-auto w-full">
                                <Card
                                    key="filter-all-products"
                                    className={`overflow-hidden cursor-pointer transition-all relative flex items-center justify-center bg-gray-50 border-2 h-20 ${orderProductFilter.length === 0 ? 'ring-2 ring-primary border-primary' : 'border-dashed border-gray-200 hover:bg-gray-100'}`}
                                    style={{ aspectRatio: '84/52' }}
                                    onClick={() => setList({ orderProductFilter: [] })}
                                >
                                    <span className={`font-bold text-sm ${orderProductFilter.length === 0 ? 'text-primary' : 'text-gray-500'}`}>{tc('all')}</span>
                                </Card>
                                {products.map((product, idx) => (
                                    <Card
                                        key={product.product_id || `filter-product-${idx}`}
                                        className={`overflow-hidden cursor-pointer transition-all relative h-20 ${orderProductFilter.includes(product.product_id) ? 'ring-2 ring-offset-2 ring-primary' : 'hover:ring-2 hover:ring-primary/50'}`}
                                        style={{ aspectRatio: getDesignAspectRatio(product.design_id, allowedDesigns, product.design) }}
                                        onClick={() => {
                                            // 既に選択済みなら除外、未選択なら追加するトグル方式。
                                            // 単一値ではなく配列で保持することで複数選択を実現します。
                                            const newFilters = orderProductFilter.includes(product.product_id)
                                                ? orderProductFilter.filter(id => id !== product.product_id)
                                                : [...orderProductFilter, product.product_id];
                                            setList({ orderProductFilter: newFilters });
                                        }}
                                    >
                                        {getDesignImages(product.design_id, allowedDesigns, product.design).front && (
                                            <img
                                                src={getDesignImages(product.design_id, allowedDesigns, product.design).front}
                                                alt={product.design?.name || product.name}
                                                className="absolute inset-0 w-full h-full object-fill select-none"
                                                draggable={false}
                                                crossOrigin="anonymous"
                                            />
                                        )}
                                        {/* オーバーレイ */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                        {/* 商品画像 (小) */}
                                        {product.image_url && (
                                            <div className="absolute bottom-2 right-2 w-8 h-8 rounded-md overflow-hidden border border-white/50 shadow-md bg-white">
                                                <img
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    className="w-full h-full object-contain p-0.5"
                                                />
                                            </div>
                                        )}

                                        {/* 商品名 */}
                                        <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
                                            <h3 className="font-bold text-[10px] truncate drop-shadow-lg">{product.name}</h3>
                                        </div>

                                        {/* 選択済みバッジ */}
                                        {orderProductFilter.includes(product.product_id) && (
                                            <div className="absolute top-2 right-2 flex gap-1">
                                                <span className="bg-primary text-white rounded-full px-1.5 py-0.5 shadow-md flex items-center justify-center">
                                                    <Check className="w-3 h-3" />
                                                </span>
                                            </div>
                                        )}
                                    </Card>
                                ))}
                            </div>

                            {/* ステータスフィルター */}
                            <div className="relative left-3 text-[15px] text-gray-800 flex flex-row gap-2 items-center mt-4">
                                {t('orders.status')}
                            </div>
                            <div className="border-gray-200 flex flex-wrap gap-2 rounded-md p-2 bg-gray-300 justify-center">
                                {['ALL'].concat(cardStatusList).map((s) => {
                                    const isSelected = s === 'ALL' ? orderStatusFilter.length === 0 : orderStatusFilter.includes(s.toUpperCase());
                                    return (
                                        <Button
                                            key={s.toUpperCase()}
                                            variant={isSelected ? "default" : "secondary"}
                                            size="sm"
                                            onClick={() => {
                                                if (s === 'ALL') {
                                                    // 空配列 = ALL 扱い
                                                    setList({ orderStatusFilter: [] });
                                                } else {
                                                    const statusVal = s.toUpperCase();
                                                    const newFilters = orderStatusFilter.includes(statusVal)
                                                        ? orderStatusFilter.filter(v => v !== statusVal)
                                                        : [...orderStatusFilter, statusVal];
                                                    setList({ orderStatusFilter: newFilters });
                                                }
                                            }}
                                            className={cn("text-xs border border-3 min-w-25 max-w-30 flex-1", cardStatusCss(s, true, true, true), isSelected ? "border-black hover:text-white font-bold" : "hover:" + cardStatusCss(s, true, false, false) + " hover:font-bold")}
                                        >
                                            {s === 'ALL' ? tc('all') : st(s)}
                                        </Button>
                                    );
                                })}
                            </div>

                            {/* 更新日時フィルター */}
                            <div className="relative left-3 text-[15px] text-gray-800 flex flex-row gap-2 items-center mt-4">
                                {t('orders.filterUpdated')}
                            </div>
                            <div className="border-gray-200 flex flex-wrap gap-2 rounded-md p-2 bg-gray-300 justify-center">
                                {['ALL', 'TODAY', 'YESTERDAY', 'THIS_WEEK', 'THIS_MONTH', 'LAST_30_DAYS'].map((f) => (
                                    <Button
                                        key={f}
                                        variant={orderUpdatedFilter === f ? "default" : "secondary"}
                                        size="sm"
                                        onClick={() => setList({ orderUpdatedFilter: f === orderUpdatedFilter ? "ALL" : f })}
                                        className={cn("text-[10px] border min-w-20 flex-1", orderUpdatedFilter === f ? "border-black font-bold" : "hover:font-bold")}
                                    >
                                        {f === 'ALL' ? tc('all') : t(`orders.filterItems.${f.toLowerCase().replace(/_([a-z0-9])/g, (g) => g[1].toUpperCase())}`)}
                                    </Button>
                                ))}
                            </div>

                            {/* 有効期限フィルター */}
                            {/* <div className="relative left-3 text-[15px] text-gray-800 flex flex-row gap-2 items-center mt-4">
                                {t('orders.filterExpiration')}
                            </div>
                            <div className="border-gray-200 flex flex-wrap gap-2 rounded-md p-2 bg-gray-300 justify-center">
                                {['ALL', 'VALID', 'EXPIRING_SOON', 'EXPIRED'].map((f) => (
                                    <Button
                                        key={f}
                                        variant={orderExpirationFilter === f ? "default" : "secondary"}
                                        size="sm"
                                        onClick={() => setList({ orderExpirationFilter: f === orderExpirationFilter ? "ALL" : f })}
                                        className={cn("text-[10px] border min-w-20 flex-1", orderExpirationFilter === f ? "border-black font-bold" : "hover:font-bold")}
                                    >
                                        {f === 'ALL' ? tc('all') : t(`orders.filterItems.${f.toLowerCase().replace(/_([a-z0-9])/g, (g) => g[1].toUpperCase())}`)}
                                    </Button>
                                ))}
                            </div> */}

                            {/* 受注日フィルター */}
                            {/* <div className="relative left-3 text-[15px] text-gray-800 flex flex-row gap-2 items-center mt-4">
                                {t('orders.filterSubmission')}
                            </div>
                            <div className="border-gray-200 flex flex-wrap gap-2 rounded-md p-2 bg-gray-300 justify-center">
                                {['ALL', 'TODAY', 'YESTERDAY', 'THIS_WEEK'].map((f) => (
                                    <Button
                                        key={f}
                                        variant={orderSubmissionFilter === f ? "default" : "secondary"}
                                        size="sm"
                                        onClick={() => setList({ orderSubmissionFilter: f === orderSubmissionFilter ? "ALL" : f })}
                                        className={cn("text-[10px] border min-w-20 flex-1", orderSubmissionFilter === f ? "border-black font-bold" : "hover:font-bold")}
                                    >
                                        {f === 'ALL' ? tc('all') : t(`orders.filterItems.${f.toLowerCase().replace(/_([a-z0-9])/g, (g) => g[1].toUpperCase())}`)}
                                    </Button>
                                ))}
                            </div> */}

                            {/* お届け希望日フィルター */}
                            {/* <div className="relative left-3 text-[15px] text-gray-800 flex flex-row gap-2 items-center mt-4">
                                {t('orders.filterPreferred')}
                            </div>
                            <div className="border-gray-200 flex flex-wrap gap-2 rounded-md p-2 bg-gray-300 justify-center">
                                {['ALL', 'TODAY', 'TOMORROW', 'UPCOMING'].map((f) => (
                                    <Button
                                        key={f}
                                        variant={orderPreferredDateFilter === f ? "default" : "secondary"}
                                        size="sm"
                                        onClick={() => setList({ orderPreferredDateFilter: f === orderPreferredDateFilter ? "ALL" : f })}
                                        className={cn("text-[10px] border min-w-20 flex-1", orderPreferredDateFilter === f ? "border-black font-bold" : "hover:font-bold")}
                                    >
                                        {f === 'ALL' ? tc('all') : t(`orders.filterItems.${f.toLowerCase().replace(/_([a-z0-9])/g, (g) => g[1].toUpperCase())}`)}
                                    </Button>
                                ))}
                            </div> */}

                            {/* Search and Column Settings Row */}
                            <div className="relative left-3 text-[15px] text-gray-800 flex flex-row gap-2 items-center mt-4">
                                {t('orders.qrId')}
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 border-gray-300 flex flex-wrap gap-2 rounded-md p-2 mb-4 bg-gray-300">
                                <div className="relative flex-1 group">
                                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                        <Search className={`w-3.5 h-3.5 text-gray-400 group-focus-within:text-primary transition-colors`} />
                                    </div>
                                    <Input
                                        placeholder={t('search.placeholder')}
                                        value={searchQrId}
                                        onChange={(e) => setList({ searchQrId: e.target.value })}
                                        className={cn("pl-9 h-9 border-gray-200 bg-white hover:border-gray-300 focus:border-primary/50 focus:ring-primary/10 transition-all rounded-lg text-sm", searchQrId ? "border-black border-3" : "")}
                                    />
                                    <div className="absolute inset-y-0 right-3 flex items-center gap-1.5">
                                        {ordersLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />}
                                        {searchQrId && (
                                            <button
                                                onClick={() => setList({ searchQrId: '' })}
                                                className="text-gray-400 hover:text-gray-600 p-1"
                                                title={t('search.clear')}
                                            >
                                                <Plus className="w-3.5 h-3.5 rotate-45" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-full flex gap-2 justify-between">
                    {/* カラム設定ボタン */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setList({ isColumnSettingsOpen: true })}
                        className={`flex justify-end gap-2 text-xs border-gray-200 rounded-lg shadow-sm hover:ring-2 hover:ring-primary/10 transition-all ${visibleOrderColumns.length < orderColOptions.length ? 'text-primary border-primary/20 bg-primary/5' : 'text-gray-600'}`}
                    >
                        <Table2 className="w-3.5 h-3.5" />
                        {t('orders.columnSettings')}
                        {visibleOrderColumns.length < orderColOptions.length && (
                            <span className="flex items-center justify-center w-4 h-4 text-[10px] bg-primary text-white rounded-full font-bold">
                                {visibleOrderColumns.length}
                            </span>
                        )}
                    </Button>

                    <div className="flex items-center gap-2">
                        {/* CSV出力ボタン */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleExportCSV}
                            disabled={subRefreshing || ordersLoading || filteredOrdersCount === 0 || isExporting}
                            className="text-primary hover:text-primary/80 hover:bg-primary/5"
                        >
                            {/* 0件時は無効化して空CSVダウンロードを防止 */}
                            <Download className="mr-2 h-4 w-4" />
                            CSV出力
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExportShippinglabelPDF('yubin')}
                            disabled={subRefreshing || ordersLoading || usedOrdersCount === 0 || isExporting}
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-2"
                        >
                            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                            郵便 ({usedOrdersCount})
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExportShippinglabelPDF('takkyubin')}
                            disabled={subRefreshing || ordersLoading || usedOrdersCount === 0 || isExporting}
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-2"
                        >
                            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                            宅急便 ({usedOrdersCount})
                        </Button>

                        {/* 更新ボタン */}
                        <Button variant="ghost" size="sm" onClick={() => fetchSectionData(true)} disabled={subRefreshing}>
                            <RefreshCw className={`mr-2 h-4 w-4 ${subRefreshing ? 'animate-spin' : ''}`} />
                            {t('refresh')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
