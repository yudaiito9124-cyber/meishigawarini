/**
 * ファイル概要: QRコードリーダーコンポーネント (Nimiq qr-scanner版)
 * 目的: WebWorker + WebAssembly で高速スキャンを実現する qr-scanner を用いて、
 *       デバイスのカメラからQRコードをスキャンして結果をコールバックで返します。
 * 改善点: メインスレッドをブロックしない60fpsのプレビュー、高い認識率、自動フォーカス、スキャンボックス可視化。
 *         遠くのQRコード対応として、ネイティブズームとCSS+クロップによる擬似ソフトウェアズーム（ハイブリッドズーム）を搭載。
 */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import QrScanner from 'qr-scanner';
import { useTranslations } from 'next-intl';
import { RefreshCcw, AlertCircle, Loader2, Check } from 'lucide-react';
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
    
    // スキャン成功時のビジュアルフィードバック用ステート
    const [scanSuccess, setScanSuccess] = useState(false);
    
    // スキャンの二重検知を防止するための直近スキャンデータ保持用参照
    const lastSuccessRef = useRef<{ text: string; time: number } | null>(null);
    
    // Zoom control states
    const [zoomSupported, setZoomSupported] = useState(false);
    const [zoomState, setZoomState] = useState(1); // 1 = 1.0x, 2 = 1.8x (zoom)
    const [currentZoom, setCurrentZoom] = useState(1);

    const isMounted = useRef(true);
    
    // Refs to avoid stale closures in qr-scanner callbacks
    const zoomStateRef = useRef(1);
    const zoomSupportedRef = useRef(false);

    useEffect(() => {
        zoomStateRef.current = zoomState;
    }, [zoomState]);

    useEffect(() => {
        zoomSupportedRef.current = zoomSupported;
    }, [zoomSupported]);

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
        setZoomState(1);
        zoomStateRef.current = 1;

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
                    const decodedText = result.data;
                    const now = Date.now();
                    
                    // 同一のQRコードに対する重複フィードバックを防止する（クールダウン時間: 2秒）
                    const isDuplicate = lastSuccessRef.current && 
                                        lastSuccessRef.current.text === decodedText && 
                                        (now - lastSuccessRef.current.time) < 2000;
                    
                    if (!isDuplicate) {
                        lastSuccessRef.current = { text: decodedText, time: now };
                        
                        // スキャン成功時のフラッシュ表示を有効化
                        setScanSuccess(true);
                        setTimeout(() => {
                            setScanSuccess(false);
                        }, 350);
                    }

                    successCallbackRef.current(decodedText, result);
                    if (!isContinuousRef.current) {
                        stopScanner();
                    }
                },
                {
                    preferredCamera: cameraId || 'environment',
                    highlightScanRegion: true,
                    highlightCodeOutline: true,
                    // 古い端末のCPU負荷を下げるため、デコード頻度を1秒あたり12回（十分スムーズかつ軽量）に制限
                    maxScansPerSecond: props.fps || 12,
                    calculateScanRegion: (video) => {
                        const videoWidth = video.videoWidth;
                        const videoHeight = video.videoHeight;
                        const minDimension = Math.min(videoWidth, videoHeight);
                        
                        // ソフトウェアズーム（2x設定かつネイティブズーム非対応）のときは、スキャンエリアをより狭く切り取ります
                        // 1xの時は50%、2xの時は全体の約28% (50% / 1.8) を切り取ることで、映像拡大とアライメント枠のサイズ維持を両立させます
                        const cropFactor = (!zoomSupportedRef.current && zoomStateRef.current === 2) ? (0.5 / 1.8) : 0.5;
                        const scanRegionSize = Math.round(minDimension * cropFactor);
                        
                        return {
                            x: Math.round((videoWidth - scanRegionSize) / 2),
                            y: Math.round((videoHeight - scanRegionSize) / 2),
                            width: scanRegionSize,
                            height: scanRegionSize,
                            // ダウンスケール指定を省略することで、カメラセンサーの生の画素ディテールをそのままデコーダーに渡します
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
                        // 古いiPhoneの負荷軽減のため、720p（十分高画質）かつ30FPSを要求し、連続オートフォーカスを適用
                        if (typeof videoTrack.applyConstraints === 'function') {
                            await videoTrack.applyConstraints({
                                width: { ideal: 1280 },
                                height: { ideal: 720 },
                                frameRate: { ideal: 30 },
                                advanced: [{ focusMode: "continuous" }]
                            } as any);
                        }

                        // デバイスがズームに対応しているか判定
                        if (typeof videoTrack.getCapabilities === 'function') {
                            const capabilities = videoTrack.getCapabilities() as any;
                            if (capabilities && capabilities.zoom) {
                                setZoomSupported(true);
                                setCurrentZoom(capabilities.zoom.min || 1);
                            } else {
                                setZoomSupported(false);
                            }
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
        if (!videoRef.current) return;
        const nextZoomState = zoomState === 1 ? 2 : 1;
        setZoomState(nextZoomState);

        if (zoomSupported) {
            const stream = videoRef.current.srcObject as MediaStream;
            if (!stream) return;
            const videoTrack = stream.getVideoTracks()[0];
            if (!videoTrack) return;

            try {
                const capabilities = videoTrack.getCapabilities() as any;
                const min = capabilities.zoom.min || 1;
                const max = capabilities.zoom.max || 3;
                // ズーム倍率は 1倍 と 2倍 (または最大倍率) で切り替え
                const nextZoom = nextZoomState === 2 ? Math.min(2, max) : min;
                
                await videoTrack.applyConstraints({
                    advanced: [{ zoom: nextZoom }]
                } as any);
                setCurrentZoom(nextZoom);
            } catch (e) {
                console.error("Failed to apply zoom", e);
            }
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
            {/* ソフトウェアズーム適用時にビデオ要素とアライメントオーバーレイを一緒にCSS拡大 */}
            <div 
                className="w-full h-full transition-transform duration-300 ease-in-out"
                style={{ 
                    transform: (!zoomSupported && zoomState === 2) ? 'scale(1.8)' : 'scale(1.0)' 
                }}
            >
                <video 
                    ref={videoRef} 
                    className="w-full h-full object-cover" 
                    playsInline 
                    muted 
                />
            </div>
            
            {/* Overlay UI */}
            <div className="absolute inset-0 flex flex-col pointer-events-none">
                {/* Center Loading & Hint */}
                <div className="flex-grow flex flex-col items-center justify-center gap-4">
                    {isStarting ? (
                        <div className="bg-black/40 backdrop-blur-sm p-4 rounded-full">
                            <Loader2 className="w-8 h-8 text-white animate-spin" />
                        </div>
                    ) : (
                        <div className="bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10 shadow-lg text-[10px] sm:text-xs font-semibold text-white max-w-[85%] text-center leading-relaxed">
                            QRコードを少し離して枠の中心に近づけてください
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
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-10 px-3 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md transition-all active:scale-90 text-xs font-bold mr-1"
                                onClick={handleToggleZoom}
                                title="ズーム切り替え"
                            >
                                {zoomSupported ? `${currentZoom.toFixed(1)}x` : (zoomState === 2 ? "1.8x" : "1.0x")}
                            </Button>
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

            {/* スキャン成功時の緑色フラッシュオーバーレイ */}
            <div 
                className={`absolute inset-0 bg-emerald-500/20 pointer-events-none transition-opacity duration-150 z-30 ${
                    scanSuccess ? 'opacity-100' : 'opacity-0'
                }`} 
            />
            
            {/* スキャン成功時の中央チェックマークアイコン */}
            <div className={`absolute inset-0 flex items-center justify-center pointer-events-none z-40 transition-all duration-300 ${
                scanSuccess ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
            }`}>
                <div className="bg-emerald-500/90 text-white p-4 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.5)] backdrop-blur-md flex items-center justify-center">
                    <Check className="w-10 h-10 stroke-[3]" />
                </div>
            </div>

            {/* Corner Decorators */}
            <div className={`absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 rounded-tl-lg pointer-events-none transition-all duration-200 ${
                scanSuccess ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]' : 'border-white/30'
            }`} />
            <div className={`absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 rounded-tr-lg pointer-events-none transition-all duration-200 ${
                scanSuccess ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]' : 'border-white/30'
            }`} />
            <div className={`absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 rounded-bl-lg pointer-events-none transition-all duration-200 ${
                scanSuccess ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]' : 'border-white/30'
            }`} />
            <div className={`absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 rounded-br-lg pointer-events-none transition-all duration-200 ${
                scanSuccess ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]' : 'border-white/30'
            }`} />
        </div>
    );
};

export default QRScanner;
