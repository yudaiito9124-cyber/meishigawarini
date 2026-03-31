import JSZip from 'jszip';
import { cardformats } from './constants/designs';
import { APP_CONFIG } from "@/lib/config";

const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

// Constant for image quality/scale (600 PPI)
const CANVAS_SCALE = 600 / 25.4; // 1mm = 23.622px

const genQRCanvas = async (code: string, size: number): Promise<HTMLCanvasElement | null> => {
    const QRCodeStyling = (await import('qr-code-styling')).default;
    const qr = new QRCodeStyling({
        width: size * CANVAS_SCALE,
        height: size * CANVAS_SCALE,
        data: `${NEXT_PUBLIC_APP_URL}/receive/${code}`,
        image: APP_CONFIG.QR_LOGO_PATH,
        qrOptions: {
            typeNumber: 0,
            mode: "Byte",
            errorCorrectionLevel: "Q"
        },
        imageOptions: {
            saveAsBlob: true,
            hideBackgroundDots: true,
            imageSize: 0.4,
            margin: 0
        },
        dotsOptions: {
            type: "dots",
        },
        backgroundOptions: {
            round: 0,
            color: "#ffffff"
        },
        cornersSquareOptions: {
            type: "extra-rounded",
            color: "#000000"
        },
        cornersDotOptions: {
            type: "dot",
            color: "#000000"
        },
    });

    // We can't use getRawData easily to get a canvas directly without appending to DOM usually, 
    // but qr-code-styling has a 'draw' method or we can get it from the container. 
    // For browser compatibility and ease, we use getRawData to blob then to image.
    const rawData = await qr.getRawData('png');
    if (!rawData) return null;
    const blob = rawData instanceof Blob ? rawData : new Blob([rawData as any]);
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await new Promise((resolve) => { img.onload = resolve; });

    const canvas = document.createElement('canvas');
    canvas.width = size * CANVAS_SCALE;
    canvas.height = size * CANVAS_SCALE;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    URL.revokeObjectURL(img.src);
    return canvas;
};

export const generateCSVExport = async (batch: any, cardformat: string | any) => {
    const zip = new JSZip();
    const batchName = `card_${(batch.id || '') || `batch-` + Date.now()}`;
    const folder = zip.folder(batchName);

    let cf = typeof cardformat === 'string' ? cardformats[cardformat] : cardformat;
    if (!cf) {
        console.error("Invalid card format", cardformat);
        return;
    }

    // Merge with default format to ensure no missing properties for DB designs
    const defaultFormat = cardformats['gakuchousenbeiv1'];
    cf = { ...defaultFormat, ...cf };
    cf.qrpos = { ...defaultFormat.qrpos, ...(cf.qrpos || {}) };
    cf.pinpos = { ...defaultFormat.pinpos, ...(cf.pinpos || {}) };
    cf.codepos = { ...defaultFormat.codepos, ...(cf.codepos || {}) };

    // Explicit numeric fallbacks in case DB has `0` values (width and height must be valid)
    if (!cf.width || cf.width <= 0) cf.width = defaultFormat.width;
    if (!cf.height || cf.height <= 0) cf.height = defaultFormat.height;

    // Load Background Images
    const loadImg = (url: string): Promise<HTMLImageElement | null> => {
        return new Promise((resolve) => {
            if (!url) return resolve(null);
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = url.startsWith('http') ? url : (url.startsWith('/') ? url : `/${url}`);
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.error("Failed to load background image:", url);
                resolve(null);
            };
        });
    };

    const bgImgf = await loadImg(cf.bgimgf);
    const bgImgb = await loadImg(cf.bgimgb);

    const codes = batch.codes || [];
    const csvRows: string[][] = [["uuid", "pin", "front_image", "back_image"]];

    for (const code of codes) {
        const uuid = code.uuid;
        const pin = code.pin;

        // --- Render Front ---
        const canvasF = document.createElement('canvas');
        canvasF.width = cf.width * CANVAS_SCALE;
        canvasF.height = cf.height * CANVAS_SCALE;
        const ctxF = canvasF.getContext('2d');
        if (ctxF) {
            // Background
            if (bgImgf) {
                ctxF.drawImage(bgImgf, 0, 0, canvasF.width, canvasF.height);
            }

            // QR
            if (cf.isfront_qr && cf.qrsize && cf.qrsize > 0) {
                const qrCanvas = await genQRCanvas(uuid, cf.qrsize);
                if (qrCanvas) {
                    ctxF.drawImage(qrCanvas, cf.qrpos.x * CANVAS_SCALE, cf.qrpos.y * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE);
                }
            }

            // PIN
            if (cf.isfront_pin && cf.pinsize && cf.pinsize > 0) {
                ctxF.fillStyle = "black";
                ctxF.font = `bold ${cf.pinsize * 0.3527 * CANVAS_SCALE}px Helvetica`;
                ctxF.textAlign = "center";
                ctxF.textBaseline = "middle";
                ctxF.fillText(pin, (cf.width / 2 + cf.pinpos.x) * CANVAS_SCALE, cf.pinpos.y * CANVAS_SCALE);
            }

            // UUID
            if (cf.isfront_code && cf.codesize && cf.codesize > 0) {
                ctxF.fillStyle = "black";
                ctxF.font = `${cf.codesize * 0.3527 * CANVAS_SCALE}px Helvetica`;
                ctxF.textAlign = "center";
                ctxF.textBaseline = "middle";
                const uuidText = `${uuid.substring(18, 34)}...`;
                ctxF.fillText(uuidText, (cf.width / 2 + cf.codepos.x) * CANVAS_SCALE, cf.codepos.y * CANVAS_SCALE);
            }
        }

        // --- Render Back ---
        const canvasB = document.createElement('canvas');
        canvasB.width = cf.width * CANVAS_SCALE;
        canvasB.height = cf.height * CANVAS_SCALE;
        const ctxB = canvasB.getContext('2d');
        if (ctxB) {
            // Background
            if (bgImgb) {
                ctxB.drawImage(bgImgb, 0, 0, canvasB.width, canvasB.height);
            }

            // QR (if on back)
            if (!cf.isfront_qr && cf.qrsize && cf.qrsize > 0) {
                const qrCanvas = await genQRCanvas(uuid, cf.qrsize);
                if (qrCanvas) {
                    ctxB.drawImage(qrCanvas, cf.qrpos.x * CANVAS_SCALE, cf.qrpos.y * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE);
                }
            }

            // PIN (if on back)
            if (!cf.isfront_pin && cf.pinsize && cf.pinsize > 0) {
                ctxB.fillStyle = "black";
                ctxB.font = `bold ${cf.pinsize * 0.3527 * CANVAS_SCALE}px Helvetica`;
                ctxB.textAlign = "center";
                ctxB.textBaseline = "middle";
                ctxB.fillText(pin, (cf.width / 2 + cf.pinpos.x) * CANVAS_SCALE, cf.pinpos.y * CANVAS_SCALE);
            }

            // UUID (if on back)
            if (!cf.isfront_code && cf.codesize && cf.codesize > 0) {
                ctxB.fillStyle = "black";
                ctxB.font = `${cf.codesize * 0.3527 * CANVAS_SCALE}px Helvetica`;
                ctxB.textAlign = "center";
                ctxB.textBaseline = "middle";
                const uuidText = `${uuid.substring(18, 34)}...`;
                ctxB.fillText(uuidText, (cf.width / 2 + cf.codepos.x) * CANVAS_SCALE, cf.codepos.y * CANVAS_SCALE);
            }
        }

        // --- Save to ZIP ---
        const frontFileName = `${uuid}_front.png`;
        const backFileName = `${uuid}_back.png`;

        const blobF = await new Promise<Blob | null>(res => canvasF.toBlob(res, 'image/png'));
        const blobB = await new Promise<Blob | null>(res => canvasB.toBlob(res, 'image/png'));

        if (blobF && folder) folder.file(frontFileName, blobF);
        if (blobB && folder) folder.file(backFileName, blobB);

        // --- Add to CSV ---
        csvRows.push([uuid, pin, `${frontFileName}`, `${backFileName}`]);
    }

    // --- Generate CSV File ---
    const csvContent = "\uFEFF" + csvRows.map(row => row.join(',') + ',').join('\n');
    if (folder) folder.file(`${batchName}.csv`, csvContent);

    // --- Generate ZIP and Download ---
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${batchName}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
