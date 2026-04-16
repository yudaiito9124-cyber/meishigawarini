'use client';

import React, { createContext, useContext, useState } from 'react';
import { ShoppingBasket, RefreshCw, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { shopApi } from '@/lib/api/shop';
import { getDesignAspectRatio, getDesignImages } from '@/lib/utils/design';
import { useShop } from '@/context/ShopContext';
import { useOrderCardUI } from '@/store/useShopStore';
import { useBackendError } from '@/hooks/useBackendError';

// Sub-components
import { ConfirmOrderDialog } from './order-card/ConfirmOrderDialog';
import OrderDetailsDialog from './order-card/OrderDetailsDialog';

// --- Context ---

interface OrderCardContextType {
    getDesignAspectRatio: typeof getDesignAspectRatio;
    getDesignImages: typeof getDesignImages;
    handleCreateCardOrder: () => Promise<void>;
}

const OrderCardContext = createContext<OrderCardContextType | null>(null);

export const useOrderCardContext = () => {
    const context = useContext(OrderCardContext);
    if (!context) throw new Error('useOrderCardContext must be used within OrderCardSection');
    return context;
};

// --- Main Component ---

export function OrderCardSection({ shopId }: { shopId: string }) {
    const t = useTranslations('ShopPage');
    const tc = useTranslations('Common');
    const { translateError } = useBackendError();

    const {
        refreshCardOrders,
        refreshProducts,
        cardOrders,
        cardOrdersLoading,
        products
    } = useShop();

    const {
        selectedOrderProduct, orderQuantity, isCreatingCardOrder, isConfirmOrderDialogOpen,
        set: setOrderCard
    } = useOrderCardUI();

    const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);

    const handleOpenDetails = (order: any) => {
        const product = products.find((p: any) => p.product_id === order.product_id);
        setSelectedProduct(product);
        setSelectedOrder(order);
        setIsDetailsDialogOpen(true);
    };

    const fetchCardOrders = async () => {
        await Promise.all([refreshCardOrders(), refreshProducts()]);
    };

    const handleCreateCardOrder = async () => {
        if (!selectedOrderProduct || isCreatingCardOrder) return;
        if (orderQuantity > 100) {
            alert(t('cardOrder.errors.tooManyCards') || 'Quantity must be 100 or less');
            return;
        }
        setOrderCard({ isCreatingCardOrder: true });
        try {
            await shopApi.shop_card_orders_create({
                shop_id: shopId,
                quantity: orderQuantity,
                design_id: selectedOrderProduct.design_id || selectedOrderProduct.design?.design_id,
                product_id: selectedOrderProduct.product_id,
                activate_now: false
            });
            setOrderCard({ isConfirmOrderDialogOpen: false, selectedOrderProduct: null });
            fetchCardOrders();
        } catch (e: any) {
            alert(translateError(e.message, e.detail) || e.message);
        } finally {
            setOrderCard({ isCreatingCardOrder: false });
        }
    };

    const handleCancelCardOrder = async (orderId: string) => {
        if (!confirm(t('cardOrder.cancel') + '?')) return;
        try {
            await shopApi.shop_card_orders_cancel({ shop_id: shopId, order_id: orderId });
            fetchCardOrders();
        } catch (e: any) {
            alert(translateError(e.message, e.detail) || e.message);
        }
    };

    const handleCompleteCardOrder = async (orderId: string) => {
        try {
            await shopApi.shop_card_orders_complete({ shop_id: shopId, order_id: orderId });
            fetchCardOrders();
        } catch (e: any) {
            alert(translateError(e.message, e.detail) || e.message);
        }
    };

    const contextValue = {
        getDesignAspectRatio,
        getDesignImages,
        handleCreateCardOrder
    };

    return (
        <OrderCardContext.Provider value={contextValue}>
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('cardOrder.title')}</CardTitle>
                        <CardDescription>{t('cardOrder.subtitle')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <Label className="text-sm font-bold flex items-center gap-2">
                                <div className="w-1 h-4 bg-primary rounded-full" />
                                {t('cardOrder.selectProduct')}
                            </Label>
                            <ProductSelection
                                products={products}
                                selectedOrderProduct={selectedOrderProduct}
                                setOrderCard={setOrderCard}
                                t={t}
                            />
                        </div>

                        {selectedOrderProduct && (
                            <div className="space-y-8 pt-6 border-t animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100 shadow-inner">
                                    <div className="flex flex-col md:flex-row gap-8">
                                        <div className="flex-1 space-y-6">
                                            <div className="space-y-2">
                                                <h3 className="text-3xl font-black text-gray-900 tracking-tight">{selectedOrderProduct.name}</h3>
                                                <p className="text-sm text-gray-500 leading-relaxed max-w-md">
                                                    {selectedOrderProduct.description || "No description provided."}
                                                </p>
                                            </div>
                                            {selectedOrderProduct.image_url && (
                                                <div className="flex justify-center animate-in zoom-in fade-in duration-700">
                                                    <div className="inline-flex items-center justify-center rounded-2xl border-2 border-white shadow-lg bg-white overflow-hidden">
                                                        <img
                                                            src={selectedOrderProduct.image_url}
                                                            alt={selectedOrderProduct.name}
                                                            className="block max-h-48 sm:max-h-64 max-w-full w-auto h-auto object-contain"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-[3] space-y-4">
                                            <Label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-1">{t('linkQr.cardDesign')}</Label>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <div className="relative rounded-2xl border-4 border-white shadow-2xl overflow-hidden group ring-1 ring-gray-200/50"
                                                        style={{ aspectRatio: getDesignAspectRatio(selectedOrderProduct.design_id, [], selectedOrderProduct.design) }}>
                                                        <img src={getDesignImages(selectedOrderProduct.design_id, [], selectedOrderProduct.design).front}
                                                            className="w-full h-full object-fill select-none" draggable={false} crossOrigin="anonymous" />
                                                        <div className="absolute top-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md text-[10px] font-black text-white rounded-full uppercase tracking-widest shadow-lg">{t('frontView')}</div>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="relative rounded-2xl border-4 border-white shadow-2xl overflow-hidden group ring-1 ring-gray-200/50"
                                                        style={{ aspectRatio: getDesignAspectRatio(selectedOrderProduct.design_id, [], selectedOrderProduct.design) }}>
                                                        <img src={getDesignImages(selectedOrderProduct.design_id, [], selectedOrderProduct.design).back}
                                                            className="w-full h-full object-fill select-none" draggable={false} crossOrigin="anonymous" />
                                                        <div className="absolute top-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md text-[10px] font-black text-white rounded-full uppercase tracking-widest shadow-lg">{t('backView')}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-8 items-end">
                                    <div className="space-y-4">
                                        <Label className="text-sm font-bold flex items-center gap-2">
                                            <div className="w-1 h-4 bg-primary rounded-full" />
                                            {t('cardOrder.quantity')}
                                        </Label>
                                        <div className="text-[10px] font-bold block text-gray-500">{t('cardOrder.quantitydescription')}</div>
                                        <div className="flex items-center gap-4">
                                            <Input
                                                id="order-quantity"
                                                type="number"
                                                min={10} max={100} step={10}
                                                value={orderQuantity}
                                                onChange={(e) => setOrderCard({ orderQuantity: Number(e.target.value) })}
                                                onBlur={(e) => {
                                                    let val = Math.ceil(Number(e.target.value) / 10) * 10;
                                                    if (val > 100) val = 100; if (val < 10) val = 10;
                                                    setOrderCard({ orderQuantity: val });
                                                }}
                                                onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                                                className="max-w-[200px] h-12 text-lg font-bold"
                                            />
                                            <span className="text-gray-500 font-medium">{tc('unitCard')}</span>
                                        </div>
                                        <Dialog open={isConfirmOrderDialogOpen} onOpenChange={(open) => setOrderCard({ isConfirmOrderDialogOpen: open })}>
                                            <DialogTrigger asChild>
                                                <Button className="h-12 px-8 text-lg font-bold shadow-xl hover:shadow-2xl transition-all active:scale-[0.98] w-full mt-4">
                                                    <ShoppingBasket className="w-5 h-5 mr-3" />
                                                    {t('cardOrder.placeOrder')}
                                                </Button>
                                            </DialogTrigger>
                                            <ConfirmOrderDialog />
                                        </Dialog>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

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
                        <OrderHistoryTable
                            cardOrders={cardOrders}
                            cardOrdersLoading={cardOrdersLoading}
                            products={products}
                            onCancel={handleCancelCardOrder}
                            onComplete={handleCompleteCardOrder}
                            onDetails={handleOpenDetails}
                            t={t}
                        />
                    </CardContent>
                </Card>

                <OrderDetailsDialog
                    order={selectedOrder}
                    product={selectedProduct}
                    isOpen={isDetailsDialogOpen}
                    onClose={() => setIsDetailsDialogOpen(false)}
                />
            </div>
        </OrderCardContext.Provider>
    );
}

interface ProductSelectionProps {
    products: any[];
    selectedOrderProduct: any | null;
    setOrderCard: (patch: any) => void;
    t: (key: string) => string;
}

function ProductSelection({ products, selectedOrderProduct, setOrderCard, t }: ProductSelectionProps) {
    const selectedProductId = selectedOrderProduct?.product_id || null;
    const activeProducts = products.filter((p: any) => p.status === 'ACTIVE');

    return (
        <div className="flex flex-wrap items-start gap-4">
            {activeProducts.map((product: any) => (
                <div
                    key={product.product_id}
                    onClick={() => setOrderCard({ selectedOrderProduct: product })}
                    className={`group relative h-24 rounded-xl border-2 overflow-hidden cursor-pointer transition-all hover:shadow-lg ${selectedProductId === product.product_id
                        ? 'border-primary ring-4 ring-primary/10 shadow-xl scale-[1.02]'
                        : 'border-gray-100 hover:border-primary/30'
                        }`}
                    style={{ aspectRatio: getDesignAspectRatio(product.design_id, [], product.design) }}
                >
                    {(product.design || product.design_id) && (
                        <img
                            src={getDesignImages(product.design_id, [], product.design).front}
                            alt={product.name}
                            className="absolute inset-0 w-full h-full object-fill"
                            crossOrigin="anonymous"
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80" />

                    {product.image_url && (
                        <div className="absolute bottom-2 right-2 w-8 h-8 rounded-md overflow-hidden border border-white/50 shadow-md bg-white p-0.5">
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
                        </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                        <p className="font-bold text-xs truncate drop-shadow-md">{product.name}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

function OrderHistoryTable({ cardOrders, cardOrdersLoading, products, onCancel, onComplete, onDetails, t }: any) {
    return (
        <div className="border rounded-xl bg-white overflow-hidden shadow-sm">
            <Table>
                <TableHeader className="bg-gray-50/50">
                    <TableRow>
                        <TableHead className="w-[120px] font-bold">{t('cardOrder.table.date')}</TableHead>
                        <TableHead className="font-bold">{t('cardOrder.table.product')}</TableHead>
                        <TableHead className="w-[80px] font-bold text-right">{t('cardOrder.table.quantity')}</TableHead>
                        <TableHead className="w-[120px] font-bold text-center">{t('cardOrder.table.status')}</TableHead>
                        <TableHead className="w-[150px] font-bold text-center">{t(`cardOrder.table.actions`)}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {cardOrdersLoading && cardOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="h-32 text-center">Loading...</TableCell></TableRow>
                    ) : cardOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="h-32 text-center text-gray-400 font-medium">{t('cardOrder.noOrders')}</TableCell></TableRow>
                    ) : cardOrders.map((order: any) => (
                        <TableRow
                            key={order.order_id}
                            className="group hover:bg-gray-50/50 transition-colors cursor-pointer"
                            onClick={() => onDetails(order)}
                        >
                            <TableCell className="text-xs font-medium text-gray-500">{new Date(order.ts_created_at).toLocaleDateString()}</TableCell>
                            <TableCell className="font-semibold">{products.find((p: any) => p.product_id === order.product_id)?.name || order.product_id}</TableCell>
                            <TableCell className="text-right font-mono font-bold">{(order.quantity || 0).toLocaleString()}</TableCell>
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
                                <div className="flex justify-end gap-2 opacity-100 group-hover:opacity-100 transition-opacity">
                                    {order.status === 'ORDERED' && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 font-bold"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onCancel(order.order_id);
                                            }}
                                        >
                                            {t('cardOrder.cancel')}
                                        </Button>
                                    )}
                                    {order.status === 'SHIPPED' && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-8 font-bold"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onComplete(order.order_id);
                                            }}
                                        >
                                            <Check className="w-3 h-3 mr-1" />{t('cardOrder.received')}
                                        </Button>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
