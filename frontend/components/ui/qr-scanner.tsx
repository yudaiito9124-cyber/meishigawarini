'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerProps {
    fps?: number;
    qrbox?: number;
    aspectRatio?: number;
    disableFlip?: boolean;
    verbose?: boolean;
    qrCodeSuccessCallback: (decodedText: string, decodedResult: any) => void;
    qrCodeErrorCallback?: (errorMessage: string) => void;
}

const QRScanner = (props: QRScannerProps) => {
    // Unique ID for this instance to prevent collisions in Strict Mode
    const scannerRegionId = useRef(`html5qr-code-${Math.random().toString(36).substring(7)}`).current;
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [permissionError, setPermissionError] = useState(false);

    useEffect(() => {
        // Initialize scanner instance
        const html5QrCode = new Html5Qrcode(scannerRegionId);
        scannerRef.current = html5QrCode;
        let isMounted = true;
        let isStarted = false;

        const config = {
            fps: props.fps || 10,
            qrbox: props.qrbox || 250,
            aspectRatio: props.aspectRatio || 1.0,
            disableFlip: props.disableFlip !== undefined ? props.disableFlip : false,
        };

        const startScanner = async () => {
            try {
                // Use rear camera by default
                await html5QrCode.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText: string, decodedResult: any) => {
                        if (isMounted) {
                            props.qrCodeSuccessCallback(decodedText, decodedResult);
                        }
                    },
                    (errorMessage: any) => {
                        // ignore
                    }
                );
                // Only mark as started if we are still mounted
                if (isMounted) {
                    isStarted = true;
                } else {
                    // If unmounted during start, stop immediately
                    html5QrCode.stop().catch(() => { });
                }
            } catch (err: any) {
                if (isMounted) {
                    // Filter out AbortError which happens on unmount
                    if (err.name !== 'AbortError') {
                        console.error("Error starting scanner", err);
                        setPermissionError(true);
                    }
                }
            }
        };

        // Slight delay to handle React Strict Mode double-mount
        // This avoids starting the scanner for the short-lived first mount
        const timerId = setTimeout(() => {
            if (isMounted) {
                startScanner();
            }
        }, 150);

        // Cleanup function
        return () => {
            isMounted = false;
            clearTimeout(timerId); // Cancel start if it hasn't happened yet
            // Only stop if we successfully started
            if (scannerRef.current && isStarted) {
                scannerRef.current.stop().then(() => {
                    return scannerRef.current?.clear();
                }).catch((_err: any) => {
                    // Ignore errors during stop/clear
                });
            } else if (scannerRef.current) {
                // If not started (or start failed), just clear/nullify
                // scannerRef.current.clear(); // Clear might throw if not running?
                // Just let it be garbage collected or cleared if possible
                try {
                    scannerRef.current.clear();
                } catch (e) { /* ignore */ }
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (permissionError) {
        return <div className="p-4 text-red-500">Camera permission denied or error starting scanner.</div>;
    }

    return (
        <div id={scannerRegionId} className="w-full max-w-sm mx-auto overflow-hidden rounded-lg bg-gray-100" />
    );
};

export default QRScanner;
