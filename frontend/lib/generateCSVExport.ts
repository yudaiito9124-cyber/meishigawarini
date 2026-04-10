/**
 * ファイル概要: 外部入稿用データ一括書き出しユーティリティ (CSV & Image Export Utility)
 * 
 * 役割:
 * 指定されたバッチ内の全カードを、個別の画像ファイル（表面・裏面）と、
 * それらを紐付ける CSV ファイルとして一括生成し、ZIP 形式でダウンロードします。
 * 外部の印刷業者に入稿する際や、ローカルでのデータ管理に使用されます。
 * 
 * 主要機能:
 * 1. `Canvas API` を使用した、高解像度（600 PPI）でのカード画像描画。
 * 2. 表面・裏面それぞれの個別生成。
 * 3. `JSZip` を使用した複数ファイル（PNG & CSV）のパッケージング。
 * 4. BOM 付き UTF-8 形式での CSV 生成（Excel での文字化け防止）。
 */

import JSZip from 'jszip';
import { cardformats } from './constants/designs';
import { APP_CONFIG } from "@/lib/config";

const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

/** 
 * 書き出し解像度の設定
 * 600 PPI (Pixels Per Inch) を基準とし、1mm あたりのピクセル数を算出。
 * 25.4mm = 1inch とし、1mm = 約 23.622px となる。
 */
const CANVAS_SCALE = 600 / 25.4; 

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── 内部ユーティリティ ────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * QR コードを Canvas 要素として生成します。
 * 
 * @param code QR コードに埋め込む識別子
 * @param size カード上の物理サイズ (mm)
 * @returns QR 画像が描画された Canvas
 */
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

    /**
     * qr-code-styling の getRawData を使用して画像を生成。
     * 直接 Canvas への描画が難しいため、一度 Blob を経由して Image オブジェクト化する。
     */
    const rawData = await qr.getRawData('png');
    if (!rawData) return null;
    const blob = rawData instanceof Blob ? rawData : new Blob([rawData as any]);
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await new Promise((resolve) => { img.onload = resolve; });

    // 目的のサイズの Canvas を作成し、描画
    const canvas = document.createElement('canvas');
    canvas.width = size * CANVAS_SCALE;
    canvas.height = size * CANVAS_SCALE;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    // メモリ解放
    URL.revokeObjectURL(img.src);
    return canvas;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── メインエクスポート関数 ──────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * バッチデータから ZIP アーカイブを生成・ダウンロードします。
 * 
 * @param batch QRコードリストを含むバッチオブジェクト
 * @param cardformat 使用するカードデザイン ID または設定
 */
export const generateCSVExport = async (batch: any, cardformat: string | any) => {
    const zip = new JSZip();
    const batchName = `card_${(batch.id || '') || `batch-` + Date.now()}`;
    const folder = zip.folder(batchName); // ZIP 内のルートフォルダ

    // デザイン設定の取得と正規化
    let cf = typeof cardformat === 'string' ? cardformats[cardformat] : cardformat;
    if (!cf) {
        console.error("Invalid card format", cardformat);
        return;
    }

    // デフォルト設定での補完
    const defaultFormat = cardformats['gakuchousenbeiv1'];
    cf = { ...defaultFormat, ...cf };
    cf.qrpos = { ...defaultFormat.qrpos, ...(cf.qrpos || {}) };
    cf.pinpos = { ...defaultFormat.pinpos, ...(cf.pinpos || {}) };
    cf.codepos = { ...defaultFormat.codepos, ...(cf.codepos || {}) };

    if (!cf.width || cf.width <= 0) cf.width = defaultFormat.width;
    if (!cf.height || cf.height <= 0) cf.height = defaultFormat.height;

    /**
     * 背景画像を Image オブジェクトとしてロードする内部ヘルパー
     */
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

    // 表面・裏面の背景画像をロード
    const bgImgf = await loadImg(cf.bgimgf);
    const bgImgb = await loadImg(cf.bgimgb);

    const codes = batch.codes || [];
    // CSV のヘッダー行
    const csvRows: string[][] = [["qr_id", "pin", "front_image", "back_image"]];

    // 全てのコードをループ処理
    for (const code of codes) {
        const qr_id = code.qr_id || (code as any).uuid;
        const pin = code.pin;

        // ─── 表面 (Front) のレンダリング ───
        const canvasF = document.createElement('canvas');
        canvasF.width = cf.width * CANVAS_SCALE;
        canvasF.height = cf.height * CANVAS_SCALE;
        const ctxF = canvasF.getContext('2d');
        if (ctxF) {
            // 背景描画
            if (bgImgf) {
                ctxF.drawImage(bgImgf, 0, 0, canvasF.width, canvasF.height);
            }

            // QR コード描画
            if (cf.isfront_qr && cf.qrsize && cf.qrsize > 0) {
                const qrCanvas = await genQRCanvas(qr_id, cf.qrsize);
                if (qrCanvas) {
                    ctxF.drawImage(qrCanvas, cf.qrpos.x * CANVAS_SCALE, cf.qrpos.y * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE);
                }
            }

            // PIN コード印字
            if (cf.isfront_pin && cf.pinsize && cf.pinsize > 0) {
                ctxF.fillStyle = "black";
                // フォントサイズ計算: 1ポイント = 1/72 インチ = 0.3527 mm
                ctxF.font = `bold ${cf.pinsize * 0.3527 * CANVAS_SCALE}px Helvetica`;
                ctxF.textAlign = "center";
                ctxF.textBaseline = "middle";
                ctxF.fillText(pin, (cf.width / 2 + cf.pinpos.x) * CANVAS_SCALE, cf.pinpos.y * CANVAS_SCALE);
            }

            // UUID 印字
            if (cf.isfront_code && cf.codesize && cf.codesize > 0) {
                ctxF.fillStyle = "black";
                ctxF.font = `${cf.codesize * 0.3527 * CANVAS_SCALE}px Helvetica`;
                ctxF.textAlign = "center";
                ctxF.textBaseline = "middle";
                const uuidText = `${qr_id.substring(18, 34)}...`;
                ctxF.fillText(uuidText, (cf.width / 2 + cf.codepos.x) * CANVAS_SCALE, cf.codepos.y * CANVAS_SCALE);
            }
        }

        // ─── 裏面 (Back) のレンダリング ───
        const canvasB = document.createElement('canvas');
        canvasB.width = cf.width * CANVAS_SCALE;
        canvasB.height = cf.height * CANVAS_SCALE;
        const ctxB = canvasB.getContext('2d');
        if (ctxB) {
            // 背景描画
            if (bgImgb) {
                ctxB.drawImage(bgImgb, 0, 0, canvasB.width, canvasB.height);
            }

            // QR (裏面配置設定時)
            if (!cf.isfront_qr && cf.qrsize && cf.qrsize > 0) {
                const qrCanvas = await genQRCanvas(qr_id, cf.qrsize);
                if (qrCanvas) {
                    ctxB.drawImage(qrCanvas, cf.qrpos.x * CANVAS_SCALE, cf.qrpos.y * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE);
                }
            }

            // PIN (裏面配置設定時)
            if (!cf.isfront_pin && cf.pinsize && cf.pinsize > 0) {
                ctxB.fillStyle = "black";
                ctxB.font = `bold ${cf.pinsize * 0.3527 * CANVAS_SCALE}px Helvetica`;
                ctxB.textAlign = "center";
                ctxB.textBaseline = "middle";
                ctxB.fillText(pin, (cf.width / 2 + cf.pinpos.x) * CANVAS_SCALE, cf.pinpos.y * CANVAS_SCALE);
            }

            // UUID (裏面配置設定時)
            if (!cf.isfront_code && cf.codesize && cf.codesize > 0) {
                ctxB.fillStyle = "black";
                ctxB.font = `${cf.codesize * 0.3527 * CANVAS_SCALE}px Helvetica`;
                ctxB.textAlign = "center";
                ctxB.textBaseline = "middle";
                const uuidText = `${qr_id.substring(18, 34)}...`;
                ctxB.fillText(uuidText, (cf.width / 2 + cf.codepos.x) * CANVAS_SCALE, cf.codepos.y * CANVAS_SCALE);
            }
        }

        // ─── ZIP 内への保存 ───
        const frontFileName = `${qr_id}_front.png`;
        const backFileName = `${qr_id}_back.png`;

        const blobF = await new Promise<Blob | null>(res => canvasF.toBlob(res, 'image/png'));
        const blobB = await new Promise<Blob | null>(res => canvasB.toBlob(res, 'image/png'));

        if (blobF && folder) folder.file(frontFileName, blobF);
        if (blobB && folder) folder.file(backFileName, blobB);

        // CSV 行データの作成
        csvRows.push([qr_id, pin, `${frontFileName}`, `${backFileName}`]);
    }

    // ─── CSV ファイルの生成 ───
    // UTF-8 BOM (\uFEFF) を付与して Excel 対策を行う
    const csvContent = "\uFEFF" + csvRows.map(row => row.join(',') + ',').join('\n');
    if (folder) folder.file(`${batchName}.csv`, csvContent);

    // ─── ZIP アーカイブの生成とダウンロード実行 ───
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

