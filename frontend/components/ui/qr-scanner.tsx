/**
 * ファイル概要: QRコードリーダーコンポーネント (強化版)
 * 目的: html5-qrcodeを利用し、デバイスのカメラからQRコードをスキャンして結果をコールバックで返す機能を提供します。
 * 改善点: カメラの列挙、切り替え機能、高コントラストなUIオーバーレイ、連続スキャン対応。
 */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useTranslations } from 'next-intl';
import { Camera, RefreshCcw, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QRScannerProps {
    fps?: number;
    qrbox?: number | ((viewfinderWidth: number, viewfinderHeight: number) => { width: number; height: number } | number);
    aspectRatio?: number;
    disableFlip?: boolean;
    verbose?: boolean;
    qrCodeSuccessCallback: (decodedText: string, decodedResult: any) => void;
    qrCodeErrorCallback?: (errorMessage: string) => void;
    onFatalError?: (error: any) => void;
    // 追加プロパティ
    isContinuous?: boolean;
}

const QRScanner = (props: QRScannerProps) => {
    const t = useTranslations('UI');
    // Unique ID for this instance to prevent collisions in Strict Mode
    const scannerRegionId = useRef(`html5qr-code-${Math.random().toString(36).substring(7)}`).current;
    const scannerRef = useRef<Html5Qrcode | null>(null);
    
    // States
    const [permissionError, setPermissionError] = useState(false);
    const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string>("");
    const [isStarting, setIsStarting] = useState(true);

    // Store latest callbacks in refs to avoid stale closures
    const successCallbackRef = useRef(props.qrCodeSuccessCallback);
    const errorCallbackRef = useRef(props.qrCodeErrorCallback);
    const isContinuousRef = useRef(props.isContinuous || false);

    useEffect(() => {
        successCallbackRef.current = props.qrCodeSuccessCallback;
        errorCallbackRef.current = props.qrCodeErrorCallback;
        isContinuousRef.current = props.isContinuous || false;
    }, [props.qrCodeSuccessCallback, props.qrCodeErrorCallback, props.isContinuous]);

    const stopScanner = useCallback(async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
                // We don't necessarily want to clear() here if we're just switching cameras, 
                // but Html5Qrcode requires stop() before start() again on the same ID.
            } catch (e) {
                console.error("Failed to stop scanner", e);
            }
        }
    }, []);

    const startScanner = useCallback(async (cameraId?: string) => {
        if (!scannerRef.current) return;
        setIsStarting(true);
        setPermissionError(false);

        const config = {
            fps: props.fps || 10,
            qrbox: (props.qrbox || ((viewfinderWidth: number, viewfinderHeight: number) => {
                const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7);
                return { width: size, height: size };
            })) as any,
            aspectRatio: props.aspectRatio || 1.0,
            disableFlip: props.disableFlip !== undefined ? props.disableFlip : false,
        };

        try {
            // If no cameraId provided, use environment facing mode as default
            const cameraConfig = cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "environment" };
            
            await scannerRef.current.start(
                cameraConfig as any,
                config as any,
                (decodedText: string, decodedResult: any) => {
                    successCallbackRef.current(decodedText, decodedResult);
                    // Continuousでない場合はスキャン成功時に停止
                    if (!isContinuousRef.current) {
                        stopScanner();
                    }
                },
                (errorMessage: any) => {
                    if (errorCallbackRef.current) {
                        errorCallbackRef.current(errorMessage);
                    }
                }
            );
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error(t("Error starting scanner"), err);
                setPermissionError(true);
                if (props.onFatalError) {
                    props.onFatalError(err);
                }
            }
        } finally {
            setIsStarting(false);
        }
    }, [props, stopScanner, t]);

    useEffect(() => {
        // Initialize scanner instance
        const html5QrCode = new Html5Qrcode(scannerRegionId);
        scannerRef.current = html5QrCode;

        // Get available cameras
        Html5Qrcode.getCameras().then(devices => {
            if (devices && devices.length > 0) {
                setCameras(devices.map(d => ({ id: d.id, label: d.label })));
                // We don't set selectedCameraId yet to allow facingMode: environment fallback
            }
        }).catch(err => {
            console.error("Failed to get cameras", err);
        });

        const timerId = setTimeout(() => {
            startScanner();
        }, 150);

        return () => {
            clearTimeout(timerId);
            stopScanner().then(() => {
                try {
                    scannerRef.current?.clear();
                } catch (e) { /* ignore */ }
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSwitchCamera = async () => {
        if (cameras.length <= 1) return;
        
        // Rotate through cameras
        let nextIndex = 0;
        if (selectedCameraId) {
            const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
            nextIndex = (currentIndex + 1) % cameras.length;
        } else {
            // If we started with facingMode, just pick the first one which is usually not the one we're using if we want to switch
            nextIndex = 0;
        }
        
        const nextCamera = cameras[nextIndex];
        setSelectedCameraId(nextCamera.id);
        
        await stopScanner();
        await startScanner(nextCamera.id);
    };

    if (permissionError) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-2xl h-full text-center gap-4">
                <AlertCircle className="w-12 h-12 text-red-500" />
                <p className="text-sm font-medium text-gray-700 leading-relaxed max-w-[240px]">
                    {t("Camera permission denied or error starting scanner")}
                </p>
                <Button variant="outline" size="sm" className="rounded-full shadow-sm" onClick={() => startScanner(selectedCameraId)}>
                    {t("Switch Camera")} / 再試行
                </Button>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full group overflow-hidden rounded-2xl bg-black">
            <div id={scannerRegionId} className="w-full h-full" />
            
            {/* Overlay UI */}
            <div className="absolute inset-0 flex flex-col pointer-events-none">
                {/* Center Loading */}
                <div className="flex-grow flex items-center justify-center">
                    {isStarting && (
                        <div className="bg-black/40 backdrop-blur-sm p-4 rounded-full">
                            <Loader2 className="w-8 h-8 text-white animate-spin" />
                        </div>
                    )}
                </div>
                
                {/* Bottom Control Bar */}
                <div className="p-5 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-auto">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10 shadow-lg">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                                <span className="text-[10px] font-black text-white uppercase tracking-[0.1em]">
                                    {t("Scanning")}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {cameras.length > 1 && (
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-10 w-10 p-0 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md transition-all active:scale-90"
                                    onClick={handleSwitchCamera}
                                    title={t("Switch Camera")}
                                >
                                    <RefreshCcw className="w-5 h-5 transition-transform group-active:rotate-180" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Corner Decorators */}
            <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-white/30 rounded-tl-lg pointer-events-none" />
            <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-white/30 rounded-tr-lg pointer-events-none" />
            <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-white/30 rounded-bl-lg pointer-events-none" />
            <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-white/30 rounded-br-lg pointer-events-none" />
        </div>
    );
};

export default QRScanner;
