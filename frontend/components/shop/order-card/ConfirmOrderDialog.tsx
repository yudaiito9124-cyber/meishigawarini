'use client';

import React from 'react';
import { ShoppingBasket, ArrowBigDownDash, ImageIcon, Loader2 } from 'lucide-react';
import { DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Product } from './types';

import { useOrderCardContext } from '../OrderCardSection';
import { useOrderCardUI } from '@/store/useShopStore';

import { useTranslations } from 'next-intl';

export function ConfirmOrderDialog() {
    const t = useTranslations('ShopPage');
    const tc = useTranslations('Common');
    const {
        getDesignAspectRatio,
        getDesignImages,
        handleCreateCardOrder,
    } = useOrderCardContext();

    const { 
        selectedOrderProduct, orderQuantity, isCreatingCardOrder, 
        set: setOrderCard 
    } = useOrderCardUI();

    const setIsConfirmOrderDialogOpen = (open: boolean) => 
        setOrderCard({ isConfirmOrderDialogOpen: open });
    if (!selectedOrderProduct) return null;

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{t('cardOrder.confirmTitle')}</DialogTitle>
                <DialogDescription>
                    {t('cardOrder.confirmDesc', {
                        product: selectedOrderProduct.name,
                        quantity: orderQuantity.toLocaleString()
                    })}
                </DialogDescription>
            </DialogHeader>
            <div className="py-6 flex flex-col items-center">
                {selectedOrderProduct.image_url && (
                    <div className="w-full flex flex-col items-center justify-center mb-4 relative">
                        <div className="text-xs text-gray-500">{t('cardOrder.product')}:{selectedOrderProduct.name}</div>
                        <div className="h-20 rounded-lg items-center justify-center overflow-hidden border-2 border-white shadow-xl bg-white animate-in zoom-in fade-in duration-500 delay-200 ">
                            <img
                                src={selectedOrderProduct.image_url}
                                alt={selectedOrderProduct.name}
                                className="w-full h-full object-contain p-1"
                            />
                        </div>
                        <div className="relative top-[5] text-[10px] font-bold text-gray-400 uppercase tracking-tight">{t('cardOrder.link')}</div>
                        <ArrowBigDownDash className="w-12 h-12 text-gray-500" />
                    </div>
                )}
                <div className="flex flex-col items-center p-4 border rounded-xl border-dashed border-gray-300 border-2 mb-2">
                    <div
                        className="w-full max-w-[300px] relative rounded-xl border shadow-2xl overflow-hidden ring-4 ring-primary/5"
                        style={{ aspectRatio: getDesignAspectRatio(selectedOrderProduct.design_id, [], selectedOrderProduct.design) }}
                    >
                        {getDesignImages(selectedOrderProduct.design_id, [], selectedOrderProduct.design).front ? (
                            <img
                                src={getDesignImages(selectedOrderProduct.design_id, [], selectedOrderProduct.design).front}
                                alt="Confirm Preview"
                                className="w-full h-full object-fill select-none"
                                draggable={false}
                                crossOrigin="anonymous"
                            />
                        ) : (
                            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                <ImageIcon className="w-12 h-12 text-gray-400" />
                            </div>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 mb-4">{t('cardOrder.card front')}</div>
                    <div
                        className="w-full max-w-[300px] relative rounded-xl border shadow-2xl overflow-hidden ring-4 ring-primary/5"
                        style={{ aspectRatio: getDesignAspectRatio(selectedOrderProduct.design_id, [], selectedOrderProduct.design) }}
                    >
                        {getDesignImages(selectedOrderProduct.design_id, [], selectedOrderProduct.design).back ? (
                            <img
                                src={getDesignImages(selectedOrderProduct.design_id, [], selectedOrderProduct.design).back}
                                alt="Confirm Preview"
                                className="w-full h-full object-fill select-none"
                                draggable={false}
                                crossOrigin="anonymous"
                            />
                        ) : (
                            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                <ImageIcon className="w-12 h-12 text-gray-400" />
                            </div>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{t('cardOrder.card back')}</div>
                </div>

                <div className="text-center mt-4">
                    <p className="text-2xl font-black text-primary">{orderQuantity.toLocaleString()} <span className="text-sm">{tc('unitCard')}</span></p>
                </div>
            </div>
            <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setIsConfirmOrderDialogOpen(false)} disabled={isCreatingCardOrder}>
                    {tc('cancel')}
                </Button>
                <Button onClick={handleCreateCardOrder} disabled={isCreatingCardOrder} className="bg-primary hover:bg-primary/90 min-w-[120px]">
                    {isCreatingCardOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : t('cardOrder.placeOrder')}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
