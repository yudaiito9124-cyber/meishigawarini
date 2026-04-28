'use client';

import React, { useRef, useState, useCallback, ReactNode } from 'react';
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
import { useBackendError } from '@/hooks/useBackendError';

interface CardActivationProps {
    shopId: string;
}

// --- Sub-components moved outside to prevent unmount/remount flashing ---

interface ActivationScannerProps {
    isScanning: boolean;
    setActivation: (patch: any) => void;
    isContinuousScan: boolean;
    scannedQrIds: ScannedId[];
    handleScanSuccess: (decodedText: string) => Promise<void>;
    handleScannerError: (err: any) => void;
    finishScan: (validIds: string[]) => void;
    copiedId: string | null;
    handleCopy: (id: string) => void;
    isManualInput: boolean;
    manualInput: string;
    t: any;
    st: any;
}

const ActivationScanner = ({
    isScanning, setActivation, isContinuousScan, scannedQrIds,
    handleScanSuccess, handleScannerError, finishScan,
    copiedId, handleCopy, isManualInput, manualInput, t, st
}: ActivationScannerProps) => (
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
            <div className="p-1 sm:p-4 h-[calc(100%-0px)] flex flex-col gap-y-4 overflow-hidden">
                <div className="flex items-center justify-center shrink-0 h-[24px] gap-x-4 mb-2">
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
                    className="w-full aspect-square mx-auto flex items-center justify-center overflow-hidden rounded-lg bg-gray-100 shrink-0 relative"
                    style={{ maxWidth: 'min(400px, 45vh)', maxHeight: '45vh' }}
                >
                    <QRScanner
                        qrCodeSuccessCallback={handleScanSuccess}
                        disableFlip={false}
                        onFatalError={handleScannerError}
                        isContinuous={isContinuousScan}
                    />
                </div>
                <div className="flex flex-col gap-4 overflow-hidden flex-1 border-t pt-2">
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
                        <div className="mt-2 border rounded-md bg-gray-50 flex-1 overflow-y-auto w-full overflow-x-hidden min-h-0">
                            <ul className="text-[10px] font-mono p-1 sm:p-2 space-y-1 min-h-[100px]">
                                {scannedQrIds.map((item, i) => (
                                    <li key={`${item.qr_id}-${i}`} className="border-b last:border-0 pb-1 last:pb-0 flex flex-col">
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
                                            <div className="flex justify-end w-full overflow-hidden">
                                                {item.status ? (
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-bold block text-left break-all sm:break-words max-w-full ${item.status.status === 'EXPIRED' ? 'bg-red-100 text-red-700' : (item.status.product_linked ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}`}>
                                                        {item.status.status === 'EXPIRED' ? st('expired') : (item.status.product_linked ? item.status.product_name : 'OK')}
                                                    </span>
                                                ) : item.error ? (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-red-100 text-red-700 font-medium text-left leading-tight break-all sm:break-words max-w-full" title={item.error}>{item.error}</span>
                                                ) : (
                                                    <div className="flex items-center gap-1 text-[10px] text-blue-600 animate-pulse px-1.5 py-0.5">
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                        <span>Checking...</span>
                                                    </div>
                                                )}
                                            </div>
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

interface ScannedIdsListProps {
    scannedQrIds: ScannedId[];
    t: any;
    copiedId: string | null;
    handleCopy: (id: string) => void;
}

const ScannedIdsList = ({ scannedQrIds, t, copiedId, handleCopy }: ScannedIdsListProps) => {
    const linkedIds = scannedQrIds.filter(item => item.status?.product_linked);
    const availableIds = scannedQrIds.filter(item => item.status && !item.status.product_linked);
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-xs sm:text-sm font-bold bg-gray-50 border p-3 rounded-lg shadow-sm">
                <div className="text-gray-700 py-1">{t('linkQr.summaryTotal', { count: scannedQrIds.length })}</div>
                <div className="text-blue-600 py-1 bg-blue-50/50 rounded-md border border-blue-100">{t('linkQr.summaryAvailable', { count: availableIds.length })}</div>
                <div className="text-amber-600 py-1 bg-amber-50/50 rounded-md border border-amber-100">{t('linkQr.summaryLinked', { count: linkedIds.length })}</div>
            </div>
            {linkedIds.length > 0 && (
                <div className="space-y-2">
                    <Label className="text-sm font-bold text-gray-500 flex items-center gap-2">
                        <div className="w-1 h-4 bg-amber-400 rounded-full" />
                        {t('linkQr.linkedTitle')}
                    </Label>
                    <div className="bg-amber-50/50 rounded-lg border border-amber-100 divide-y divide-amber-100 min-h-[150px] max-h-[50vh] overflow-y-auto">
                        {linkedIds.map((item, i) => (
                            <div key={`${item.qr_id}-${i}`} className="p-3 flex justify-between items-center bg-white/40">
                                <div className="flex flex-col">
                                    <span className="font-mono text-xs">{item.qr_id}</span>
                                    <span className="text-[10px] text-amber-600/70 font-medium">→ {t('linkQr.useExistingLink')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                                        {item.status?.product_name}
                                    </span>
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
                    <div className="bg-blue-50/30 rounded-lg border border-blue-100 divide-y divide-blue-100 min-h-[150px] max-h-[50vh] overflow-y-auto">
                        {availableIds.map((item, i) => (
                            <div key={`${item.qr_id}-${i}`} className="p-3 bg-white/40 flex justify-between items-center">
                                <div className="flex flex-col">
                                    <span className="font-mono text-xs">{item.qr_id}</span>
                                    <span className="text-[10px] text-blue-600/70 font-medium">→ {t('linkQr.willBeLinked')}</span>
                                </div>
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

interface ActivationFormProps {
    scannedQrIds: ScannedId[];
    products: any[];
    isLinking: boolean;
    showOptions: boolean;
    setActivation: (patch: any) => void;
    clearScannedIds: () => void;
    t: any;
}

const ActivationForm = ({
    scannedQrIds, products, isLinking, showOptions,
    setActivation, clearScannedIds, t
}: ActivationFormProps) => {
    const hasAvailableIds = scannedQrIds.some(item => item.status && !item.status.product_linked);
    const isStillChecking = scannedQrIds.some(item => !item.status && !item.error);

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
                        {products.filter(p => p.status === 'ACTIVE').map((p, i) => (
                            <option key={`${p.product_id}-${i}`} value={p.product_id}>{p.name}</option>
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

                <Button type="submit" className="w-full font-bold text-lg h-16 shadow-lg shadow-blue-100" disabled={isLinking || isStillChecking}>
                    {isLinking ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                    {isLinking ? t('linkQr.processing') : (isStillChecking ? t('linkQr.checkingStatus') : t('linkQr.submit'))}
                    {!isLinking && !isStillChecking && <ArrowRight className="ml-2 h-5 w-5" />}
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

export function CardActivationSection({ shopId }: CardActivationProps) {
    const t = useTranslations('ShopPage');
    const st = useTranslations('Status');
    const { translateError } = useBackendError();

    const { products, refreshProducts } = useShop();
    const {
        isLinking, isScanning, scannedQrId, isContinuousScan,
        scannedQrIds, manualInput, copiedId, showOptions,
        isManualInput, set: setActivation
    } = useActivationUI();
    const [isChecking, setIsChecking] = useState(false);

    const lastScannedTimeRef = useRef<Record<string, number>>({});

    const handleCopy = useCallback((id: string) => {
        navigator.clipboard.writeText(id).then(() => {
            setActivation({ copiedId: id });
            setTimeout(() => setActivation({ copiedId: null }), 2000);
        });
    }, [setActivation]);

    const handleScanSuccess = useCallback(async (decodedText: string) => {
        const cleanText = decodedText.replace(/\/+$/, '');
        let qr_id = cleanText;
        if (cleanText.includes('/')) {
            qr_id = cleanText.split('/').pop() || cleanText;
        }

        const now = Date.now();
        const lastScanTime = lastScannedTimeRef.current[qr_id] || 0;
        if (now - lastScanTime < 2000) return;
        lastScannedTimeRef.current[qr_id] = now;

        if (scannedQrIds.some(item => item.qr_id === qr_id)) return;

        if (isContinuousScan) {
            setActivation((prev: any) => ({
                scannedQrIds: [...prev.scannedQrIds, { qr_id, ts: Date.now() }]
            }));
            try {
                const data = await shopApi.shop_qrcodecheck({ shop_id: shopId, qr_id: qr_id });
                setActivation((prev: any) => ({
                    scannedQrIds: prev.scannedQrIds.map((item: any) =>
                        item.qr_id === qr_id ? { ...item, status: data } : item
                    )
                }));
            } catch (err: any) {
                const translatedError = translateError(err.message, err.detail) || t('linkQr.foreignQrError');
                setActivation((prev: any) => ({
                    scannedQrIds: prev.scannedQrIds.map((item: any) =>
                        item.qr_id === qr_id ? { ...item, error: translatedError + (err.detail ? ` (${err.detail})` : '') } : item
                    )
                }));
            }
            return;
        }

        setActivation({ scannedQrIds: [{ qr_id, ts: Date.now() }], scannedQrId: qr_id, isScanning: false });
        setIsChecking(true);

        try {
            const data = await shopApi.shop_qrcodecheck({ shop_id: shopId, qr_id: qr_id });
            setActivation({ scannedQrIds: [{ qr_id, ts: Date.now(), status: data }] });
        } catch (error: any) {
            const translatedError = translateError(error.message, error.detail) || t('linkQr.foreignQrError');
            setActivation({ scannedQrIds: [{ qr_id, ts: Date.now(), error: translatedError }], scannedQrId: '' });
            alert(translatedError + (error.detail ? ` (${error.detail})` : ''));
        } finally {
            setIsChecking(false);
        }
    }, [isContinuousScan, scannedQrIds, setActivation, shopId, t, translateError]);

    const handleScannerError = useCallback((err: any) => {
        setActivation({ isScanning: false });
        const translatedError = translateError(err.message) || t('UI.Camera permission denied or error starting scanner');
        alert(translatedError);
    }, [setActivation, t, translateError]);

    const handleLinkQr = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLinking) return;

        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const productId = formData.get('product_id') as string;
        const memoForUsers = formData.get('memo_for_users') as string;
        const memoForShop = formData.get('memo_for_shop') as string;

        const idsToLink = scannedQrIds
            .filter(item => item.status && !item.error);

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
                        qr_id: qr_id.qr_id,
                        product_id: qr_id.status?.product_id || productId || "",
                        activate_now: true,
                        memo_for_users: memoForUsers,
                        memo_for_shop: memoForShop
                    });
                    successCount++;
                } catch (err: any) {
                    const errorMsg = translateError(err.message, err.detail) || 'Failed to link';
                    errors.push(`${qr_id.qr_id}: ${errorMsg}`);
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
            alert(translateError(error.message, error.detail) || error.message);
        } finally {
            setActivation({ isLinking: false });
        }
    };

    const clearScannedIds = useCallback(() => {
        setActivation({ scannedQrId: '', scannedQrIds: [], showOptions: false });
        lastScannedTimeRef.current = {};
    }, [setActivation]);

    const finishScan = useCallback((validIds: string[]) => {
        setActivation({ scannedQrId: validIds.join('\n'), isScanning: false });
    }, [setActivation]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>{t('linkQr.title')}</CardTitle>
                    <CardDescription>{t('linkQr.description')}</CardDescription>
                </CardHeader>
                <CardContent className="relative">
                    {isChecking && (
                        <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                            <p className="text-sm font-medium text-blue-600">{t('linkQr.checkingStatus')}</p>
                        </div>
                    )}
                    <form onSubmit={handleLinkQr} className="space-y-4">
                        {!scannedQrId ? (
                            <div className="flex flex-col gap-4">
                                <ActivationScanner
                                    isScanning={isScanning}
                                    setActivation={setActivation}
                                    isContinuousScan={isContinuousScan}
                                    scannedQrIds={scannedQrIds}
                                    handleScanSuccess={handleScanSuccess}
                                    handleScannerError={handleScannerError}
                                    finishScan={finishScan}
                                    copiedId={copiedId}
                                    handleCopy={handleCopy}
                                    isManualInput={isManualInput}
                                    manualInput={manualInput}
                                    t={t}
                                    st={st}
                                />
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <ScannedIdsList
                                    scannedQrIds={scannedQrIds}
                                    t={t}
                                    copiedId={copiedId}
                                    handleCopy={handleCopy}
                                />
                                <ActivationForm
                                    scannedQrIds={scannedQrIds}
                                    products={products}
                                    isLinking={isLinking}
                                    showOptions={showOptions}
                                    setActivation={setActivation}
                                    clearScannedIds={clearScannedIds}
                                    t={t}
                                />
                            </div>
                        )}
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}