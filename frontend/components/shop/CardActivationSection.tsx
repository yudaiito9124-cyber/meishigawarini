'use client';

import React, { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, Check, Copy, ArrowRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import QRScanner from '@/components/ui/qr-scanner';
import { shopApi } from '@/lib/api/shop';
import { useShop } from '@/context/ShopContext';
import { useActivationUI, ScannedId } from '@/store/useShopStore';

interface CardActivationProps {
    shopId: string;
}

export function CardActivationSection({ shopId }: CardActivationProps) {
    const t = useTranslations('ShopPage');
    const tb = useTranslations('Backend');
    const st = useTranslations('Status');

    const { products, refreshProducts } = useShop();
    const { 
        isLinking, isScanning, scannedQrId, isContinuousScan, 
        scannedQrIds, manualInput, copiedId, showOptions,
        isManualInput, set: setActivation 
    } = useActivationUI();
    
    const lastScannedTimeRef = useRef<Record<string, number>>({});

    const handleCopy = (id: string) => {
        navigator.clipboard.writeText(id).then(() => {
            setActivation({ copiedId: id });
            setTimeout(() => setActivation({ copiedId: null }), 2000);
        });
    };

    const handleScanSuccess = async (decodedText: string) => {
        let qr_id = decodedText;
        if (decodedText.includes('/')) {
            qr_id = decodedText.split('/').pop() || decodedText;
        }

        const now = Date.now();
        const lastScanTime = lastScannedTimeRef.current[qr_id] || 0;
        if (now - lastScanTime < 2000) return;
        lastScannedTimeRef.current[qr_id] = now;

        if (scannedQrIds.some(item => item.qr_id === qr_id)) return;

        if (isContinuousScan) {
            setActivation((prev) => ({ 
                scannedQrIds: [...prev.scannedQrIds, { qr_id, ts: Date.now() }] 
            }));
            try {
                const data = await shopApi.shop_qrcodecheck({ shop_id: shopId, qr_id: qr_id });
                setActivation((prev) => ({
                    scannedQrIds: prev.scannedQrIds.map((item) =>
                        item.qr_id === qr_id ? { ...item, status: data } : item
                    )
                }));
            } catch (err: any) {
                const translatedError = err.message ? tb(err.message.replace(/\./g, '_')) : t('linkQr.foreignQrError');
                setActivation((prev) => ({
                    scannedQrIds: prev.scannedQrIds.map((item) =>
                        item.qr_id === qr_id ? { ...item, error: translatedError + (err.detail ? ` (${err.detail})` : '') } : item
                    )
                }));
            }
            return;
        }

        setActivation({ scannedQrIds: [{ qr_id, ts: Date.now() }], scannedQrId: qr_id, isScanning: false });
        
        try {
            const data = await shopApi.shop_qrcodecheck({ shop_id: shopId, qr_id: qr_id });
            setActivation({ scannedQrIds: [{ qr_id, ts: Date.now(), status: data }] });
        } catch (error: any) {
            const translatedError = error.message ? tb(error.message.replace(/\./g, '_')) : t('linkQr.foreignQrError');
            setActivation({ scannedQrIds: [{ qr_id, ts: Date.now(), error: translatedError }], scannedQrId: '' });
            alert(translatedError + (error.detail ? ` (${error.detail})` : ''));
        }
    };

    const handleScannerError = (err: any) => {
        setActivation({ isScanning: false });
        const translatedError = err.message ? tb(err.message.replace(/\./g, '_')) : t('UI.Camera permission denied or error starting scanner');
        alert(translatedError);
    };

    const handleLinkQr = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLinking) return;

        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const productId = formData.get('product_id') as string;
        const memoForUsers = formData.get('memo_for_users') as string;
        const memoForShop = formData.get('memo_for_shop') as string;

        const idsToLink = scannedQrIds
            .filter(item => item.status && !item.status.product_linked)
            .map(item => item.qr_id);

        if (idsToLink.length === 0) {
            alert(t('linkQr.noAvailableQrs'));
            return;
        }

        setActivation({ isLinking: true });
        const errors: string[] = [];
        let successCount = 0;

        try {
            for (const qr_id of idsToLink) {
                try {
                    await shopApi.shop_qr_link({
                        shop_id: shopId,
                        qr_id: qr_id,
                        product_id: productId,
                        activate_now: true,
                        memo_for_users: memoForUsers,
                        memo_for_shop: memoForShop
                    });
                    successCount++;
                } catch (err: any) {
                    errors.push(`${qr_id}: ${err.message || 'Failed to link'}`);
                }
            }

            if (successCount > 0) {
                alert(t('linkQr.success', { count: successCount }));
                setActivation({ scannedQrId: '', scannedQrIds: [], showOptions: false });
                lastScannedTimeRef.current = {};
                refreshProducts();
            }

            if (errors.length > 0) {
                alert(t('linkQr.someErrors') + '\n' + errors.join('\n'));
            }
        } catch (error: any) {
            alert(error.message ? tb(error.message.replace(/\./g, '_')) : error.message);
        } finally {
            setActivation({ isLinking: false });
        }
    };

    const clearScannedIds = () => {
        setActivation({ scannedQrId: '', scannedQrIds: [], showOptions: false });
        lastScannedTimeRef.current = {};
    };

    const finishScan = (validIds: string[]) => {
        setActivation({ scannedQrId: validIds.join('\n'), isScanning: false });
    };

    // Sub-components as local functions to keep them together
    const ActivationScanner = () => (
        <Dialog open={isScanning} onOpenChange={(open) => setActivation({ isScanning: open })}>
            <DialogTrigger asChild>
                <Button type="button" variant="outline" className="w-full h-auto flex flex-col justify-center items-center gap-4 text-xl py-16 bg-gray-300">
                    <div style={{ width: '100px', aspectRatio: '1' }}>
                        <Camera style={{ width: '100%', height: '100%', display: 'block' }} />
                    </div>
                    <span>{t('linkQr.scan')}</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] w-[98vw] max-w-[98vw] sm:max-w-[90vw] md:max-w-3xl lg:max-w-3xl h-full overflow-y-auto p-2 sm:p-6">
                <DialogHeader>
                    <DialogTitle>{t('linkQr.scanDialog.title')}</DialogTitle>
                    <DialogDescription>{t('linkQr.scanDialog.description')}</DialogDescription>
                </DialogHeader>
                <div className="p-1 sm:p-4 min-h-[300px] flex flex-col gap-y-4">
                    <div className="flex items-center justify-center h-[20px] gap-x-2">
                        <Switch
                            id="continuous-scan"
                            checked={isContinuousScan}
                            onCheckedChange={(checked) => setActivation({ isContinuousScan: checked })}
                        />
                        <div className="flex flex-col">
                            <Label htmlFor="continuous-scan" className="text-sm font-bold">{t('linkQr.continuousScan')}</Label>
                            {isContinuousScan && (
                                <span className="text-[10px] text-blue-600 font-bold">{t('linkQr.scannedCount', { count: scannedQrIds.length })}</span>
                            )}
                        </div>
                    </div>

                    <div
                        className="w-full aspect-square mx-auto flex items-center justify-center overflow-hidden rounded-lg bg-gray-100"
                        style={{ maxWidth: 'min(400px, 50vh)', maxHeight: '50vh' }}
                    >
                        <QRScanner
                            qrCodeSuccessCallback={handleScanSuccess}
                            disableFlip={false}
                            onFatalError={handleScannerError}
                            isContinuous={isContinuousScan}
                        />
                    </div>
                    <div className="flex flex-col gap-4">
                        {isContinuousScan && scannedQrIds.length > 0 && (
                            <Button
                                type="button"
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                onClick={() => {
                                    const validItems = scannedQrIds.filter(item => !item.error);
                                    if (validItems.length > 0) {
                                        finishScan(validItems.map(item => item.qr_id));
                                    }
                                }}
                            >
                                {t('linkQr.finishScan')} ({scannedQrIds.length})
                            </Button>
                        )}
                        {isContinuousScan && scannedQrIds.length > 0 && (
                            <div className="mt-2 border rounded-md bg-gray-50 max-h-[80vh] overflow-y-auto w-full overflow-x-hidden">
                                <ul className="text-[10px] font-mono p-1 sm:p-2 space-y-1">
                                    {scannedQrIds.map((item, i) => (
                                        <li key={item.qr_id} className="border-b last:border-0 pb-1 last:pb-0 flex flex-col">
                                            <div className="flex flex-col gap-1 py-1 w-full overflow-hidden">
                                                <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                                                    <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
                                                        <span className="truncate opacity-70 text-[10px] leading-tight block w-0 flex-1">{i + 1}. {item.qr_id}</span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-3.5 w-3.5 shrink-0 opacity-50 hover:opacity-100"
                                                            onClick={() => handleCopy(item.qr_id)}
                                                        >
                                                            {copiedId === item.qr_id ? (
                                                                <Check className="h-2.5 w-2.5 text-green-500" />
                                                            ) : (
                                                                <Copy className="h-2.5 w-2.5" />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                                {(item.status || item.error) && (
                                                    <div className="flex justify-end w-full overflow-hidden">
                                                        {item.status ? (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold block text-left break-all sm:break-words max-w-full ${item.status.status === 'EXPIRED' ? 'bg-red-100 text-red-700' : (item.status.product_linked ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}`}>
                                                                {item.status.status === 'EXPIRED' ? st('expired') : (item.status.product_linked ? item.status.product_name : 'OK')}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-red-100 text-red-700 font-medium text-left leading-tight break-all sm:break-words max-w-full" title={item.error}>{item.error}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {isManualInput && !(isContinuousScan && scannedQrIds.length > 0) && (
                            <div className="flex w-full flex-col sm:flex-row gap-3">
                                <Input
                                    id="qr_id_manual"
                                    name="qr_id_manual"
                                    placeholder={t('linkQr.placeholder')}
                                    value={manualInput}
                                    onChange={(e) => setActivation({ manualInput: e.target.value })}
                                    className="bg-gray-100"
                                />
                                <Button type="button" variant="default" disabled={!manualInput} onClick={() => handleScanSuccess(manualInput)} className="shrink-0">
                                    {t('linkQr.scanDialog.apply')}
                                </Button>
                            </div>
                        )}
                        {!isManualInput && !isContinuousScan && (
                            <div className="flex justify-center">
                                <Button type="button" variant="ghost" size="sm" onClick={() => setActivation({ isManualInput: true })} className="h-8 text-xs text-gray-500 hover:text-gray-900 px-2 -ml-2 right">
                                    {t('linkQr.manualinput')}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );

    const ScannedIdsList = () => {
        const linkedIds = scannedQrIds.filter(item => item.status?.product_linked);
        const availableIds = scannedQrIds.filter(item => item.status && !item.status.product_linked);
        return (
            <div className="space-y-4">
                {linkedIds.length > 0 && (
                    <div className="space-y-2">
                        <Label className="text-sm font-bold text-gray-500 flex items-center gap-2">
                            <div className="w-1 h-4 bg-amber-400 rounded-full" />
                            {t('linkQr.linkedTitle')}
                        </Label>
                        <div className="bg-amber-50/50 rounded-lg border border-amber-100 divide-y divide-amber-100 max-h-[150px] overflow-y-auto">
                            {linkedIds.map((item) => (
                                <div key={item.qr_id} className="p-3 flex justify-between items-center bg-white/40">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs">{item.qr_id}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-4 w-4"
                                            onClick={(e) => { e.stopPropagation(); handleCopy(item.qr_id); }}
                                        >
                                            {copiedId === item.qr_id ? (
                                                <Check className="h-3 w-3 text-green-500" />
                                            ) : (
                                                <Copy className="h-3 w-3" />
                                            )}
                                        </Button>
                                    </div>
                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                                        {item.status?.product_name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {availableIds.length > 0 && (
                    <div className="space-y-2">
                        <Label className="text-sm font-bold text-blue-600 flex items-center gap-2">
                            <div className="w-1 h-4 bg-blue-500 rounded-full" />
                            {t('linkQr.availableTitle')}
                        </Label>
                        <div className="bg-blue-50/30 rounded-lg border border-blue-100 divide-y divide-blue-100 max-h-[150px] overflow-y-auto">
                            {availableIds.map((item) => (
                                <div key={item.qr_id} className="p-3 bg-white/40 flex items-center gap-2">
                                    <span className="font-mono text-xs">{item.qr_id}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4"
                                        onClick={(e) => { e.stopPropagation(); handleCopy(item.qr_id); }}
                                    >
                                        {copiedId === item.qr_id ? (
                                            <Check className="h-3 w-3 text-green-500" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const ActivationForm = () => {
        const hasAvailableIds = scannedQrIds.some(item => item.status && !item.status.product_linked);
        return (
            <div className="space-y-4 pt-4 border-t border-gray-100">
                <div className="space-y-4 bg-gray-50 p-4 rounded-xl border-dashed border-2">
                    {hasAvailableIds && (
                        <select
                            id="product_id"
                            name="product_id"
                            className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            required={hasAvailableIds}
                            defaultValue=""
                        >
                            <option value="" disabled>{t('linkQr.selectPlaceholder')}</option>
                            {products.filter(p => p.status === 'ACTIVE').map(p => (
                                <option key={p.product_id} value={p.product_id}>{p.name}</option>
                            ))}
                        </select>
                    )}

                    {showOptions ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Input
                                id="memo_for_users"
                                name="memo_for_users"
                                placeholder={t('linkQr.memoForUsersPlaceholder')}
                                className="h-10 border-gray-300"
                            />
                            <Input
                                id="memo_for_shop"
                                name="memo_for_shop"
                                placeholder={t('linkQr.memoForShopPlaceholder')}
                                className="h-10 border-gray-300"
                            />
                        </div>
                    ) : (
                        <div className="flex justify-start">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setActivation({ showOptions: true })} className="h-8 text-xs text-gray-500 hover:text-gray-900 px-2 -ml-2">
                                + {t('linkQr.option')}
                            </Button>
                        </div>
                    )}

                    <Button type="submit" className="w-full font-bold text-lg h-16 shadow-lg shadow-blue-100" disabled={isLinking}>
                        {isLinking ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                        {isLinking ? t('linkQr.processing') : t('linkQr.submit')}
                        <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                </div>
                <div className="flex justify-center">
                    <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        onClick={clearScannedIds} 
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                        {t('linkQr.clear')}
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>{t('linkQr.title')}</CardTitle>
                    <CardDescription>{t('linkQr.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLinkQr} className="space-y-4">
                        {!scannedQrId ? (
                            <div className="flex flex-col gap-4">
                                <ActivationScanner />
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <ScannedIdsList />
                                <ActivationForm />
                            </div>
                        )}
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}