/**
 * ファイル概要: QRコードリーダーコンポーネント (Nimiq qr-scanner版)
 * 目的: WebWorker + WebAssembly で高速スキャンを実現する qr-scanner を用いて、
 *       デバイスのカメラからQRコードをスキャンして結果をコールバックで返します。
 * 改善点: メインスレッドをブロックしない60fpsのプレビュー、高い認識率、自動フォーカス、スキャンボックス可視化。
 *         小さいQRコード対応として、1080p HD解像度指定、スキャン領域のピクセル保存量拡大、ズーム切り替えボタンを追加。
 */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import QrScanner from 'qr-scanner';
import { useTranslations } from 'next-intl';
import { RefreshCcw, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QRScannerProps {
    fps?: number; // qr-scanner では maxScansPerSecond として扱われます
    qrbox?: any;
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
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const scannerRef = useRef<QrScanner | null>(null);
    
    // States
    const [permissionError, setPermissionError] = useState(false);
    const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string>("");
    const [isStarting, setIsStarting] = useState(true);
    const [zoomSupported, setZoomSupported] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(1);

    const isMounted = useRef(true);

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
        if (scannerRef.current) {
            try {
                scannerRef.current.stop();
            } catch (e) {
                console.error("Failed to stop scanner", e);
            }
        }
    }, []);

    const startScanner = useCallback(async (cameraId?: string) => {
        if (!videoRef.current) return;
        setIsStarting(true);
        setPermissionError(false);

        // 既存のスキャナーインスタンスがあれば破棄する
        if (scannerRef.current) {
            try {
                scannerRef.current.destroy();
            } catch (e) { /* ignore */ }
            scannerRef.current = null;
        }

        try {
            const scanner = new QrScanner(
                videoRef.current,
                (result) => {
                    successCallbackRef.current(result.data, result);
                    if (!isContinuousRef.current) {
                        stopScanner();
                    }
                },
                {
                    preferredCamera: cameraId || 'environment',
                    highlightScanRegion: true,
                    highlightCodeOutline: true,
                    maxScansPerSecond: props.fps || 25,
                    calculateScanRegion: (video) => {
                        const videoWidth = video.videoWidth;
                        const videoHeight = video.videoHeight;
                        const minDimension = Math.min(videoWidth, videoHeight);
                        // スキャン領域を全体の60%に絞り、ピントが合う距離を保ちやすくします
                        const scanRegionSize = Math.round(minDimension * 0.6);
                        
                        return {
                            x: Math.round((videoWidth - scanRegionSize) / 2),
                            y: Math.round((videoHeight - scanRegionSize) / 2),
                            width: scanRegionSize,
                            height: scanRegionSize,
                            // 小さいQRコードの解像度を保つため、デフォルト(400px)より大きい600pxでスレッドに送ります
                            downScaledWidth: 600,
                            downScaledHeight: 600,
                        };
                    },
                    onDecodeError: (err) => {
                        if (errorCallbackRef.current && typeof err === 'string') {
                            errorCallbackRef.current(err);
                        }
                    }
                }
            );

            scannerRef.current = scanner;
            await scanner.start();

            // 起動に成功したら、カメラトラックの詳細な高画質化・フォーカス設定を適用
            const stream = videoRef.current.srcObject as MediaStream;
            if (stream) {
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack) {
                    try {
                        // 1080p Full HD、30-60FPS、および連続オートフォーカスを適用
                        await videoTrack.applyConstraints({
                            width: { ideal: 1920 },
                            height: { ideal: 1080 },
                            frameRate: { ideal: 30, max: 60 },
                            advanced: [{ focusMode: "continuous" }]
                        } as any);

                        // デバイスがズームに対応しているか判定
                        const capabilities = videoTrack.getCapabilities() as any;
                        if (capabilities && capabilities.zoom) {
                            setZoomSupported(true);
                            setCurrentZoom(capabilities.zoom.min || 1);
                        } else {
                            setZoomSupported(false);
                        }
                    } catch (e) {
                        console.warn("Failed to apply optimal video constraints", e);
                    }
                }
            }

            // カメラリストを再取得（ラベル取得のため）
            if (isMounted.current && scannerRef.current) {
                const activeCameraList = await QrScanner.listCameras(true);
                setCameras(activeCameraList.map(c => ({ id: c.id, label: c.label })));
                
                if (cameraId) {
                    setSelectedCameraId(cameraId);
                } else {
                    // 現在のアクティブカメラを推測してセット
                    const environmentCam = activeCameraList.find(c => 
                        c.label.toLowerCase().includes('back') || 
                        c.label.toLowerCase().includes('environment') || 
                        c.label.toLowerCase().includes('背面')
                    );
                    if (environmentCam) {
                        setSelectedCameraId(environmentCam.id);
                    } else if (activeCameraList.length > 0) {
                        setSelectedCameraId(activeCameraList[0].id);
                    }
                }
            }
        } catch (err: any) {
            console.error("Error starting QrScanner", err);
            if (isMounted.current) {
                setPermissionError(true);
                if (props.onFatalError) {
                    props.onFatalError(err);
                }
            }
        } finally {
            if (isMounted.current) {
                setIsStarting(false);
            }
        }
    }, [props, stopScanner]);

    useEffect(() => {
        isMounted.current = true;

        // 利用可能なカメラ一覧の初期取得
        QrScanner.listCameras(true)
            .then(devices => {
                if (devices && devices.length > 0 && isMounted.current) {
                    setCameras(devices.map(d => ({ id: d.id, label: d.label })));
                }
            })
            .catch(err => {
                console.error("Failed to list cameras", err);
            });

        const timerId = setTimeout(() => {
            if (isMounted.current) {
                startScanner();
            }
        }, 150);

        return () => {
            isMounted.current = false;
            clearTimeout(timerId);
            if (scannerRef.current) {
                try {
                    scannerRef.current.destroy();
                } catch (e) { /* ignore */ }
                scannerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSwitchCamera = async () => {
        if (cameras.length <= 1 || !scannerRef.current) return;
        
        let nextIndex = 0;
        if (selectedCameraId) {
            const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
            nextIndex = (currentIndex + 1) % cameras.length;
        } else {
            nextIndex = 0;
        }
        
        const nextCamera = cameras[nextIndex];
        setSelectedCameraId(nextCamera.id);
        
        await startScanner(nextCamera.id);
    };

    const handleToggleZoom = async () => {
        if (!videoRef.current || !zoomSupported) return;
        const stream = videoRef.current.srcObject as MediaStream;
        if (!stream) return;
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return;

        try {
            const capabilities = videoTrack.getCapabilities() as any;
            const min = capabilities.zoom.min || 1;
            const max = capabilities.zoom.max || 3;
            // ズーム倍率は 1倍 と 2倍 (または最大倍率) で切り替え
            const nextZoom = currentZoom === min ? Math.min(2, max) : min;
            
            await videoTrack.applyConstraints({
                advanced: [{ zoom: nextZoom }]
            } as any);
            setCurrentZoom(nextZoom);
        } catch (e) {
            console.error("Failed to apply zoom", e);
        }
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
            <video 
                ref={videoRef} 
                className="w-full h-full object-cover" 
                playsInline 
                muted 
            />
            
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
                            {zoomSupported && (
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-10 px-3 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md transition-all active:scale-90 text-xs font-bold mr-1"
                                    onClick={handleToggleZoom}
                                    title="ズーム切り替え"
                                >
                                    {currentZoom.toFixed(1)}x
                                </Button>
                            )}
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
