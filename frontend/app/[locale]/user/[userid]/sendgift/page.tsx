"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, QrCode, ScanLine, X, ChevronDown, CheckCircle2 } from "lucide-react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { userApi } from "@/lib/api/user";

export default function SendGiftPage() {
    const t = useTranslations('UserProfilePage');
    const params = useParams();
    const router = useRouter();
    const userId = params?.userid as string;

    const [isScanning, setIsScanning] = useState(false);
    const [scannedUrl, setScannedUrl] = useState("");
    const [processing, setProcessing] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    const NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');

    useEffect(() => {
        if (!isScanning) return;

        const scanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            false
        );

        scanner.render(
            (decodedText) => {
                scanner.clear();
                setIsScanning(false);
                setScannedUrl(decodedText);
                handleUrl(decodedText);
            },
            (error) => {
                // Ignore frequent errors
            }
        );

        return () => {
            scanner.clear().catch(e => console.error("Failed to clear scanner", e));
        };
    }, [isScanning]);

    const handleUrl = async (urlToProcess: string) => {
        setProcessing(true);
        setErrorMsg("");
        setSuccessMsg("");
        
        try {
            // パターン: /receive/UUID?pin=PIN
            let urlObj;
            try {
                urlObj = new URL(urlToProcess);
            } catch (e) {
                // もしURLでなければ手動入力か？
                // 簡易的に補完
                if (urlToProcess.startsWith("/receive")) {
                    urlObj = new URL(urlToProcess, window.location.origin);
                } else {
                    throw new Error("Invalid QR Code Format");
                }
            }

            const pathParts = urlObj.pathname.split('/');
            const uuidIndex = pathParts.findIndex(p => p === 'receive');
            if (uuidIndex === -1 || !pathParts[uuidIndex + 1]) {
                throw new Error("Invalid QR Code (No UUID found)");
            }
            
            const uuid = pathParts[uuidIndex + 1];
            const pin = urlObj.searchParams.get('pin');

            if (!pin) {
                throw new Error("Invalid QR Code (No PIN found)");
            }

            // バックエンドAPIコール
            await userApi.user_history_sendgift({ uuid, pin });
            setSuccessMsg("ギフトの送信者として正常に登録されました。");
            
            // 少し待ってからプロフィール編集画面(または送信履歴画面)へ？
            setTimeout(() => {
                window.location.href = urlToProcess; // スキャンしたQRの本来のURLへ遷移させる (オプション)
            }, 3000);

        } catch (e: any) {
            setErrorMsg(e.message || "Failed to link gift to your profile");
        } finally {
            setProcessing(false);
        }
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (scannedUrl) {
            handleUrl(scannedUrl);
        }
    };

    return (
        <div className="min-h-screen bg-mist-50 flex flex-col items-center py-12 px-4">
            <Card className="w-full max-w-lg shadow-xl border-none bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-orange-500 to-red-500 p-8 text-white flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-white hover:bg-white/20 -ml-2 h-8"
                            onClick={() => window.location.href = `/user/${userId}`}
                        >
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('back')}
                        </Button>
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-black tracking-tight">{t('sendGift')}</CardTitle>
                        <p className="text-orange-100/80 text-sm mt-1">{t('sendGiftDesc')}</p>
                    </div>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                    {successMsg ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center animate-in zoom-in-95 duration-500">
                            <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
                            <h3 className="text-xl font-bold text-gray-800 mb-2">登録完了！</h3>
                            <p className="text-gray-500 mb-6">{successMsg}</p>
                            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                            <p className="text-sm text-gray-400 mt-2">ギフトページへ移動しています...</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-center">
                                {!isScanning ? (
                                    <Button 
                                        onClick={() => setIsScanning(true)}
                                        className="w-full h-32 rounded-3xl bg-gray-50 hover:bg-orange-50 text-gray-700 hover:text-orange-600 border-2 border-dashed border-gray-300 hover:border-orange-400 flex flex-col gap-3 font-bold text-lg shadow-sm transition-all"
                                    >
                                        <ScanLine className="w-10 h-10" />
                                        カメラを起動してスキャン
                                    </Button>
                                ) : (
                                    <div className="w-full max-w-sm overflow-hidden rounded-2xl shadow-lg relative bg-black">
                                        <div id="reader" className="w-full" />
                                        <Button 
                                            variant="destructive"
                                            size="sm"
                                            className="absolute top-2 right-2 rounded-full z-10"
                                            onClick={() => setIsScanning(false)}
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-gray-200"></div>
                                <span className="flex-shrink-0 mx-4 text-gray-400 text-xs uppercase font-bold tracking-widest">or</span>
                                <div className="flex-grow border-t border-gray-200"></div>
                            </div>

                            <form onSubmit={handleManualSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-700">QRコードのURLを手動入力</label>
                                    <div className="flex gap-2">
                                        <Input 
                                            value={scannedUrl}
                                            onChange={(e) => setScannedUrl(e.target.value)}
                                            placeholder="https://.../receive/..."
                                            className="rounded-xl bg-gray-50 border-gray-200 focus:border-orange-500"
                                            disabled={processing}
                                        />
                                        <Button 
                                            type="submit" 
                                            disabled={!scannedUrl || processing}
                                            className="rounded-xl bg-gray-800 hover:bg-black text-white px-6 font-bold"
                                        >
                                            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : "送信"}
                                        </Button>
                                    </div>
                                </div>
                            </form>

                            {errorMsg && (
                                <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
                                    {errorMsg}
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
