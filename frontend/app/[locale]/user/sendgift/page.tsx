"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, QrCode, ScanLine, X, ChevronDown, CheckCircle2 } from "lucide-react";
import QRScanner from "@/components/ui/qr-scanner";
import { userApi } from "@/lib/api/user";

export default function SendGiftPage() {
    const t = useTranslations('UserProfilePage');
    const tb = useTranslations('Backend');
    const router = useRouter();

    const [isScanning, setIsScanning] = useState(false);
    const [scannedUuids, setScannedUuids] = useState<string[]>([]);
    const [scannedUrl, setScannedUrl] = useState("");
    const [showManualInput, setShowManualInput] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [bulkResults, setBulkResults] = useState<Array<{ uuid: string, status: 'success' | 'error', message?: string }>>([]);
    const [isConfirming, setIsConfirming] = useState(false);
    const [completedCount, setCompletedCount] = useState(0);

    const handleUrl = (urlToProcess: string) => {
        setErrorMsg("");
        setSuccessMsg("");

        try {
            const trimmedInput = urlToProcess.trim();
            if (!trimmedInput) return;

            // 1. URL解析
            let extractedUuid = "";
            try {
                if (trimmedInput.includes('://') || trimmedInput.startsWith('/') || trimmedInput.startsWith('receive/')) {
                    const url = trimmedInput.includes('://') ? new URL(trimmedInput) : new URL(trimmedInput.startsWith('/') ? trimmedInput : `/${trimmedInput}`, window.location.origin);
                    const pathParts = url.pathname.split('/');
                    const uuidIndex = pathParts.findIndex(p => p === 'receive');
                    if (uuidIndex !== -1 && pathParts[uuidIndex + 1]) {
                        extractedUuid = pathParts[uuidIndex + 1];
                    }
                }
            } catch (e) {
                // Ignore
            }

            // 2. UUID形式チェック (URLでなかったら生のID)
            if (!extractedUuid) {
                const idRegex = /^[a-zA-Z0-9\-_]+$/;
                if (idRegex.test(trimmedInput) && trimmedInput.length >= 8) {
                    extractedUuid = trimmedInput;
                }
            }

            if (extractedUuid) {
                if (!scannedUuids.includes(extractedUuid)) {
                    setScannedUuids(prev => [...prev, extractedUuid]);
                }
                setScannedUrl(""); // 手動入力欄をクリア
            } else {
                throw new Error(t('bulkScan.invalidFormat'));
            }

        } catch (e: any) {
            setErrorMsg(e.message);
        }
    };

    const handleBulkLink = async () => {
        if (scannedUuids.length === 0) return;

        setIsConfirming(false);
        setProcessing(true);
        setCompletedCount(0);
        const results: Array<{ uuid: string, status: 'success' | 'error', message?: string }> = [];

        for (let i = 0; i < scannedUuids.length; i++) {
            const uuid = scannedUuids[i];
            try {
                // PINは一旦無効化
                await userApi.user_history_sendgift({ uuid, pin: "" });
                results.push({ uuid, status: 'success' });
            } catch (e: any) {
                results.push({
                    uuid,
                    status: 'error',
                    message: e.message
                });
            }
            setCompletedCount(i + 1);
        }

        setBulkResults(results);
        setProcessing(false);
        const successCount = results.filter(r => r.status === 'success').length;
        if (successCount > 0) {
            setSuccessMsg(t('bulkScan.successReport', { count: successCount }));
        }
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleUrl(scannedUrl);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 font-sans">
            <div className="w-full max-w-lg flex justify-start mb-6">
                <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full bg-white/50 backdrop-blur-sm border-gray-200 text-gray-500 hover:text-gray-900 shadow-sm h-9 px-4"
                    onClick={() => router.push('/user')}
                >
                    <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('back')}
                </Button>
            </div>

            <Card className="w-full max-w-lg shadow-2xl border-none bg-white/80 backdrop-blur-xl rounded-[2rem] overflow-hidden animate-in fade-in zoom-in-95 duration-500">
                <CardHeader className="bg-gradient-to-r from-orange-500 to-red-500 p-10 text-white flex flex-col gap-4">
                    <div className="flex flex-row items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-2xl shadow-inner">
                            <QrCode className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-3xl font-black tracking-tight">{t('sendGift')}</CardTitle>
                            <p className="text-orange-100/80 text-sm font-bold uppercase tracking-widest mt-1">{t("sendGiftDesc")}</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-8 space-y-8">
                    {successMsg || bulkResults.length > 0 ? (
                        <div className="space-y-6 animate-in zoom-in-95 duration-500">
                            <div className="flex flex-col items-center justify-center text-center">
                                <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
                                <h3 className="text-xl font-bold text-gray-800 mb-2">{t('bulkScan.completeTitle')}</h3>
                                <p className="text-gray-500 mb-6">{successMsg}</p>
                            </div>

                            <div className="space-y-3">
                                <p className="text-sm font-bold text-gray-700 border-b pb-2">{t('bulkScan.resultsDetail')}</p>
                                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                    {bulkResults.map((res, idx) => (
                                        <div key={idx} className={`p-3 rounded-xl border flex justify-between items-center ${res.status === 'success' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="text-[10px] font-mono text-gray-400 truncate">{res.uuid}</span>
                                                {res.message && <span className="text-xs text-red-600 font-medium mt-1">{tb(res.message) || res.message}</span>}
                                            </div>
                                            {res.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> : <X className="w-4 h-4 text-red-600 shrink-0" />}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                <Button
                                    onClick={() => {
                                        setSuccessMsg("");
                                        setScannedUuids([]);
                                        setBulkResults([]);
                                        setIsConfirming(false);
                                    }}
                                    className="w-full rounded-2xl h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold"
                                >
                                    {t('bulkScan.continueButton')}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => router.push('/user/sentmemory')}
                                    className="w-full rounded-2xl h-12 font-bold"
                                >
                                    {t('bulkScan.checkSentButton')}
                                </Button>
                            </div>
                        </div>
                    ) : isConfirming ? (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center space-y-3">
                                <QrCode className="w-12 h-12 text-orange-600 mx-auto" />
                                <h3 className="text-xl font-black text-gray-900">{t('bulkScan.confirmTitle')}</h3>
                                <p className="text-sm text-gray-500">
                                    {t('bulkScan.confirmDesc', { count: scannedUuids.length })}
                                </p>
                                <div className="text-[10px] text-gray-400 space-y-1">
                                    <p>{t('bulkScan.undoNotice')}</p>
                                    <p className="underline cursor-pointer" onClick={() => router.push('/user/profile')}>{t('bulkScan.checkProfileLink')}</p>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-2xl p-4 max-h-40 overflow-y-auto border border-gray-100">
                                <ul className="space-y-2">
                                    {scannedUuids.map((uuid, idx) => (
                                        <li key={idx} className="text-[10px] font-mono text-gray-500 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-orange-300 rounded-full" />
                                            {uuid}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsConfirming(false)}
                                    className="rounded-2xl h-12 font-bold"
                                    disabled={processing}
                                >
                                    {t('back')}
                                </Button>
                                <Button
                                    onClick={handleBulkLink}
                                    className="rounded-2xl h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold"
                                    disabled={processing}
                                >
                                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : t('bulkScan.executeButton')}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-4">
                                {isScanning ? (
                                    <div className="space-y-4">
                                        <div className="w-full aspect-square overflow-hidden rounded-2xl shadow-lg relative bg-black border-4 border-orange-500">
                                            <QRScanner
                                                qrCodeSuccessCallback={(decodedText) => {
                                                    handleUrl(decodedText);
                                                }}
                                                qrCodeErrorCallback={() => { }}
                                                isContinuous={true}
                                            />
                                            <div className="absolute top-0 left-0 right-0 p-5 z-20 flex justify-between items-center pointer-events-none">
                                                <div className="text-[10px] bg-black/40 backdrop-blur-sm text-white font-bold px-3 py-1 rounded-full flex items-center gap-1.5 border border-white/20">
                                                    <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                                    {t('bulkScan.scanningNotice')}
                                                </div>
                                                <div className="text-[12px] bg-black/60 text-white font-bold px-3 py-1 rounded-full border border-white/20">
                                                    {t('bulkScan.scannedCount', { count: scannedUuids.length })}
                                                </div>
                                            </div>
                                        </div>

                                        <Button
                                            onClick={() => setIsScanning(false)}
                                            className="w-full h-14 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold shadow-xl"
                                        >
                                            {t('bulkScan.finishScanButton')}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-8">
                                        <Button
                                            onClick={() => setIsScanning(true)}
                                            className="w-full h-56 rounded-[2.5rem] bg-white/50 hover:bg-white backdrop-blur-sm text-gray-700 hover:text-orange-600 border-2 border-dashed border-slate-200 hover:border-orange-400 flex flex-col gap-6 font-black text-2xl shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all group duration-500"
                                        >
                                            <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                                                <ScanLine className="w-12 h-12 text-orange-500" />
                                            </div>
                                            <div className="space-y-1">
                                                <span>{t('bulkScan.startScanButton')}</span>
                                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{t('bulkScan.scanningNotice')}</p>
                                            </div>
                                        </Button>

                                        {scannedUuids.length > 0 && (
                                            <div className="bg-orange-50/50 rounded-[2rem] p-6 border border-orange-100/50 space-y-6 animate-in fade-in zoom-in-95 duration-500">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                                        <h4 className="text-sm font-black text-orange-800 uppercase tracking-widest">{t('bulkScan.scannedListTitle', { count: scannedUuids.length })}</h4>
                                                    </div>
                                                    <Button variant="ghost" size="sm" onClick={() => setScannedUuids([])} className="h-8 rounded-full text-[10px] font-black text-orange-600 hover:bg-orange-100">
                                                        {t('bulkScan.clearAll')}
                                                    </Button>
                                                </div>
                                                <div className="max-h-44 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                                    {scannedUuids.map((uuid, idx) => (
                                                        <div key={idx} className="text-[10px] font-mono font-bold text-orange-600 bg-white px-4 py-3 rounded-2xl flex justify-between items-center group shadow-sm border border-orange-50">
                                                            <span className="truncate mr-4">{uuid}</span>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="w-6 h-6 rounded-full hover:bg-red-50 hover:text-red-500 text-gray-300 transition-colors"
                                                                onClick={() => setScannedUuids(prev => prev.filter(u => u !== uuid))}
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <Button
                                                    onClick={() => setIsConfirming(true)}
                                                    className="w-full rounded-full bg-orange-600 hover:bg-orange-700 text-white font-black h-14 shadow-xl hover:shadow-orange-200 transition-all active:scale-95 text-lg"
                                                >
                                                    {t('bulkScan.confirmButton')}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {!isScanning && (
                                <div className="space-y-4 pt-4 border-t border-gray-100 mt-4">
                                    {!showManualInput ? (
                                        <div className="flex justify-center">
                                            <Button variant="ghost" size="sm" onClick={() => setShowManualInput(true)} className="text-gray-400 text-xs font-bold">
                                                {t('bulkScan.manualInputButton')}
                                            </Button>
                                        </div>
                                    ) : (
                                        <form onSubmit={handleManualSubmit} className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <label className="text-sm font-bold text-gray-700">{t('bulkScan.manualInputLabel')}</label>
                                                    <X className="w-4 h-4 cursor-pointer text-gray-400" onClick={() => setShowManualInput(false)} />
                                                </div>
                                                <div className="flex gap-2">
                                                    <Input
                                                        value={scannedUrl}
                                                        onChange={(e) => setScannedUrl(e.target.value)}
                                                        placeholder={t('bulkScan.manualInputPlaceholder')}
                                                        className="rounded-xl bg-gray-50 border-gray-200"
                                                        autoFocus
                                                    />
                                                    <Button type="submit" disabled={!scannedUrl} className="rounded-xl bg-gray-800 text-white px-6 font-bold">
                                                        {t('bulkScan.addButton')}
                                                    </Button>
                                                </div>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {errorMsg && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-xs font-medium border border-red-100 animate-in fade-in slide-in-from-top-1">
                            {tb(errorMsg) || errorMsg}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Processing Overlay */}
            {processing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-6 border border-orange-100 max-w-sm w-full mx-4">
                        <div className="relative">
                            <Loader2 className="w-16 h-16 text-orange-500 animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[10px] font-bold text-orange-600">
                                    {Math.round((completedCount / scannedUuids.length) * 100)}%
                                </span>
                            </div>
                        </div>
                        <div className="space-y-2 text-center">
                            <h3 className="font-black text-xl text-gray-900">{t('bulkScan.processingTitle')}</h3>
                            <div className="flex flex-col items-center gap-1">
                                <p className="text-gray-500 font-bold">
                                    {completedCount} / {scannedUuids.length}
                                </p>
                                <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-300 ease-out"
                                        style={{ width: `${(completedCount / scannedUuids.length) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
