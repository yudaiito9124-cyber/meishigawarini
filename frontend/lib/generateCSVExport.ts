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
import * as XLSX from 'xlsx';
import SVGPathCommander from 'svg-path-commander';
import { cardformats } from './constants/designs';
import { APP_CONFIG } from "@/lib/config";

const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

/**
 * SVGカラー文字列（#FFFFFF等）をPostScriptのsetrgbcolorコマンドに変換します。
 */
const parseColor = (colorStr: string): string => {
    if (!colorStr) return '0.000 0.000 0.000 setrgbcolor';
    const clean = colorStr.trim().toLowerCase();
    if (clean === 'none') return '';
    if (clean === 'white') return '1.000 1.000 1.000 setrgbcolor';
    if (clean === 'black') return '0.000 0.000 0.000 setrgbcolor';

    // Hex color parsing
    if (clean.startsWith('#')) {
        const hex = clean.slice(1);
        let r = 0, g = 0, b = 0;
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16) / 255;
            g = parseInt(hex[1] + hex[1], 16) / 255;
            b = parseInt(hex[2] + hex[2], 16) / 255;
        } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16) / 255;
            g = parseInt(hex.slice(2, 4), 16) / 255;
            b = parseInt(hex.slice(4, 6), 16) / 255;
        }
        if (isNaN(r)) r = 0;
        if (isNaN(g)) g = 0;
        if (isNaN(b)) b = 0;
        return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} setrgbcolor`;
    }

    // rgb(r, g, b) or rgba(r, g, b, a) parsing
    if (clean.startsWith('rgb')) {
        const match = clean.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (match) {
            const r = parseInt(match[1], 10) / 255;
            const g = parseInt(match[2], 10) / 255;
            const b = parseInt(match[3], 10) / 255;
            return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} setrgbcolor`;
        }
    }

    // Default fallback
    return '0.000 0.000 0.000 setrgbcolor';
};

/**
 * SVGパス（d）文字列をPostScriptパス描画コマンド文字列に変換します。
 * 各コマンドごとに改行を挟み、PostScriptインタプリタの1行文字数制限（通常255〜1024文字）によるクラッシュを防ぎます。
 */
const svgPathToPS = (d: string): string => {
    const segments = SVGPathCommander.pathToCurve(d);
    const result: string[] = [];
    let lineLength = 0;
    const maxLineLength = 80;

    for (const seg of segments) {
        const type = seg[0];
        let cmd = '';
        if (type === 'M') {
            const x = seg[1] ?? 0;
            const y = seg[2] ?? 0;
            cmd = `${x.toFixed(3)} ${y.toFixed(3)} moveto`;
        } else if (type === 'C') {
            const x1 = seg[1] ?? 0;
            const y1 = seg[2] ?? 0;
            const x2 = seg[3] ?? 0;
            const y2 = seg[4] ?? 0;
            const x = seg[5] ?? 0;
            const y = seg[6] ?? 0;
            cmd = `${x1.toFixed(3)} ${y1.toFixed(3)} ${x2.toFixed(3)} ${y2.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} curveto`;
        }

        if (cmd) {
            if (lineLength + cmd.length > maxLineLength) {
                result.push("\n");
                lineLength = 0;
            } else if (result.length > 0 && result[result.length - 1] !== "\n") {
                result.push(" ");
                lineLength += 1;
            }
            result.push(cmd);
            lineLength += cmd.length;
        }
    }

    if (/[Zz]\s*$/.test(d)) {
        if (lineLength + 10 > maxLineLength) {
            result.push("\n");
        } else if (result.length > 0 && result[result.length - 1] !== "\n") {
            result.push(" ");
        }
        result.push("closepath");
    }

    return result.join("");
};

/**
 * SVG transform属性（translate, scale, rotate, matrix）を解析して
 * 対応するPostScriptコマンドの配列に変換します。
 */
const parseSVGTransform = (transformStr: string): string[] => {
    const cmds: string[] = [];
    if (!transformStr) return cmds;

    const regex = /([a-zA-Z]+)\s*\(([^)]+)\)/g;
    let match;
    while ((match = regex.exec(transformStr)) !== null) {
        const type = match[1].toLowerCase();
        const args = match[2].trim().split(/[\s,]+/).map(parseFloat);
        
        if (type === 'translate') {
            const tx = args[0] || 0;
            const ty = args[1] || 0;
            cmds.push(`${tx.toFixed(3)} ${ty.toFixed(3)} translate`);
        } else if (type === 'scale') {
            const sx = args[0] || 1;
            const sy = args.length > 1 ? args[1] : sx;
            cmds.push(`${sx.toFixed(3)} ${sy.toFixed(3)} scale`);
        } else if (type === 'rotate') {
            const angle = args[0] || 0;
            if (args.length > 2) {
                const cx = args[1];
                const cy = args[2];
                cmds.push(`${cx.toFixed(3)} ${cy.toFixed(3)} translate`);
                cmds.push(`${angle.toFixed(3)} rotate`);
                cmds.push(`${(-cx).toFixed(3)} ${(-cy).toFixed(3)} translate`);
            } else {
                cmds.push(`${angle.toFixed(3)} rotate`);
            }
        } else if (type === 'matrix' && args.length === 6) {
            cmds.push(`[${args.map(n => n.toFixed(3)).join(' ')}] concat`);
        }
    }
    return cmds;
};

/**
 * ラスタ画像をPostScript colorimage形式として埋め込み用のコマンド群を生成します。
 */
const embedImageInPS = async (href: string, x: number, y: number, w: number, h: number): Promise<string> => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = href;
    await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = () => {
            console.error("Failed to load embedded image inside SVG:", href);
            resolve(null);
        };
    });

    if (img.naturalWidth === 0) return "";

    const canvas = document.createElement('canvas');
    const renderW = Math.min(img.naturalWidth, 200);
    const renderH = Math.round((img.naturalHeight / img.naturalWidth) * renderW);
    canvas.width = renderW;
    canvas.height = renderH;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return "";
    
    // 透過背景に対応するため、背景を白色でクリア
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, renderW, renderH);
    ctx.drawImage(img, 0, 0, renderW, renderH);

    const imgData = ctx.getImageData(0, 0, renderW, renderH);
    const pixels = imgData.data;

    const ps: string[] = [];
    ps.push("gsave");
    ps.push(`${x} ${y} translate`);
    ps.push(`${w} ${h} scale`);
    
    // Y軸が反転（1 -1 scale）している座標系では、image matrixのYスケールを正のままとし、
    // [ renderW 0 0 renderH 0 0 ] とすることで画像が正立します。
    ps.push(`/imgStr ${renderW * 3} string def`);
    ps.push(`${renderW} ${renderH} 8 [ ${renderW} 0 0 ${renderH} 0 0 ]`);
    ps.push(`{ currentfile imgStr readhexstring pop } false 3 colorimage`);

    let currentLine = '';
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i].toString(16).padStart(2, '0');
        const g = pixels[i + 1].toString(16).padStart(2, '0');
        const b = pixels[i + 2].toString(16).padStart(2, '0');
        currentLine += r + g + b;
        
        if (currentLine.length >= 72) {
            ps.push(currentLine);
            currentLine = '';
        }
    }
    if (currentLine.length > 0) {
        ps.push(currentLine);
    }
    
    ps.push("grestore");
    return ps.join("\n");
};

/**
 * QRコードのSVGテキストを読み込んで、純ベクター形式のEPSファイルに変換します。
 */
const svgToEPS = async (svgText: string): Promise<string> => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) return "";

    let width = parseFloat(svgEl.getAttribute("width") || "300");
    let height = parseFloat(svgEl.getAttribute("height") || "300");
    if (isNaN(width) || width <= 0) width = 300;
    if (isNaN(height) || height <= 0) height = 300;

    const epsRows: string[] = [];
    epsRows.push("%!PS-Adobe-3.0 EPSF-3.0");
    epsRows.push(`%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}`);
    epsRows.push("%%LanguageLevel: 2");
    epsRows.push("%%DocumentData: Clean7Bit");
    epsRows.push("%%EndComments");
    epsRows.push("gsave");
    
    // SVGの座標系（左上原点、y軸下向き）に変換
    epsRows.push(`0 ${height} translate`);
    epsRows.push("1 -1 scale");

    // 再帰的にDOMツリーを探索し、グループのtransformを正しく引き継ぐ
    const processElement = async (el: Element) => {
        const tagName = el.tagName.toLowerCase();
        
        // defsやclippath、styleなどは直接描画しないためスキップ
        if (tagName === "defs" || tagName === "clippath" || tagName === "style" || tagName === "metadata") {
            return;
        }

        // clip-path属性がある場合は、参照先（clipPath）の子要素をこの要素のfill色で描画する
        const clipPathAttr = el.getAttribute("clip-path");
        if (clipPathAttr && clipPathAttr.startsWith("url(")) {
            const match = clipPathAttr.match(/url\(['"]?#([^'"]+?)['"]?\)/);
            if (match) {
                const clipId = match[1];
                const clipPathEl = svgEl.querySelector(`[id="${clipId}"]`);
                if (clipPathEl) {
                    const originalFill = el.getAttribute("fill") || "";
                    for (const child of Array.from(clipPathEl.children)) {
                        const hasChildFill = child.hasAttribute("fill") && child.getAttribute("fill") !== "none";
                        if (!hasChildFill) {
                            child.setAttribute("fill", originalFill);
                        }
                        await processElement(child);
                        if (!hasChildFill) {
                            child.removeAttribute("fill");
                        }
                    }
                    return; // クリップ元の矩形自体は描画しない
                }
            }
        }

        const fill = el.getAttribute("fill") || "";
        if (fill === "none") return; // 透明（fill=none）は描画しない

        // 個別要素のtransformの適用
        const transform = el.getAttribute("transform") || "";
        const transformCmds = parseSVGTransform(transform);
        const hasTransform = transformCmds.length > 0;
        
        if (hasTransform) {
            epsRows.push("gsave");
            epsRows.push(...transformCmds);
        }

        const colorCmd = parseColor(fill);

        if (tagName === "g") {
            for (const child of Array.from(el.children)) {
                await processElement(child);
            }
        } else if (tagName === "rect") {
            const x = parseFloat(el.getAttribute("x") || "0");
            const y = parseFloat(el.getAttribute("y") || "0");
            const w = parseFloat(el.getAttribute("width") || "0");
            const h = parseFloat(el.getAttribute("height") || "0");
            if (w > 0 && h > 0) {
                if (colorCmd) epsRows.push(colorCmd);
                epsRows.push(`${x.toFixed(3)} ${y.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)} rectfill`);
            }
        } else if (tagName === "circle") {
            const cx = parseFloat(el.getAttribute("cx") || "0");
            const cy = parseFloat(el.getAttribute("cy") || "0");
            const r = parseFloat(el.getAttribute("r") || "0");
            if (r > 0) {
                if (colorCmd) epsRows.push(colorCmd);
                epsRows.push("newpath");
                epsRows.push(`${cx.toFixed(3)} ${cy.toFixed(3)} ${r.toFixed(3)} 0 360 arc fill`);
            }
        } else if (tagName === "path") {
            const d = el.getAttribute("d") || "";
            if (d.trim()) {
                const psPath = svgPathToPS(d);
                // パスが空でなく、かつ moveto コマンドが含まれている場合のみ newpath ... fill を描画してクラッシュを防ぐ
                if (psPath.trim() && psPath.includes("moveto")) {
                    if (colorCmd) epsRows.push(colorCmd);
                    epsRows.push("newpath");
                    epsRows.push(psPath);
                    epsRows.push("fill");
                }
            }
        } else if (tagName === "image") {
            const href = el.getAttribute("href") || el.getAttribute("xlink:href") || "";
            const x = parseFloat(el.getAttribute("x") || "0");
            const y = parseFloat(el.getAttribute("y") || "0");
            const w = parseFloat(el.getAttribute("width") || "0");
            const h = parseFloat(el.getAttribute("height") || "0");
            if (href && w > 0 && h > 0) {
                const imgPS = await embedImageInPS(href, x, y, w, h);
                if (imgPS) epsRows.push(imgPS);
            }
        }

        if (hasTransform) {
            epsRows.push("grestore");
        }
    };

    // ルートSVGの直下要素から再帰処理を開始
    for (const child of Array.from(svgEl.children)) {
        await processElement(child);
    }

    epsRows.push("grestore");
    epsRows.push("showpage");
    epsRows.push("%%EOF");

    return epsRows.join("\n");
};

/**
 * QRコードのベクター形式のSVGテキストを生成します。
 */
const genQRSVGText = async (code: string, size: number): Promise<string> => {
    const QRCodeStyling = (await import('qr-code-styling')).default;
    
    // 用紙ポイントサイズ（1ポイント＝1/72インチ＝約0.3527mm）に直接スケール
    const ptWidth = size * (72 / 25.4);
    const ptHeight = size * (72 / 25.4);

    const qr = new QRCodeStyling({
        type: "svg",
        width: ptWidth,
        height: ptHeight,
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

    const rawData = await qr.getRawData('svg');
    if (!rawData) return "";
    const blob = rawData instanceof Blob ? rawData : new Blob([rawData as any]);
    return blob.text();
};

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
    const batchName = `cardbatch_${(batch.id || '') || `batch-` + Date.now()}`;
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
    const csvRows: string[][] = [["qr_id", "pin", "front_image", "back_image", "qr_eps"]];
    const excelRows: string[][] = [["PINコード8桁ナンバー", "QRコード下のナンバー", "QRコード(.eps)"]];

    // 全てのコードをループ処理
    for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        const qr_id = code.qr_id || (code as any).uuid;
        const pin = code.pin;
        const indexStr = String(i + 1).padStart(4, '0');
        const qrCodeUnderText = qr_id.substring(18, 34) + "...";

        // QRコードのキャンバスをあらかじめ生成（表面・裏面・EPS出力で共用）
        const qrCanvas = (cf.qrsize && cf.qrsize > 0) ? await genQRCanvas(qr_id, cf.qrsize) : null;

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
            if (cf.isfront_qr && qrCanvas) {
                ctxF.drawImage(qrCanvas, cf.qrpos.x * CANVAS_SCALE, cf.qrpos.y * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE);
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
            if (!cf.isfront_qr && qrCanvas) {
                ctxB.drawImage(qrCanvas, cf.qrpos.x * CANVAS_SCALE, cf.qrpos.y * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE, cf.qrsize * CANVAS_SCALE);
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
        const epsFileName = `${indexStr}.eps`;

        const blobF = await new Promise<Blob | null>(res => canvasF.toBlob(res, 'image/png'));
        const blobB = await new Promise<Blob | null>(res => canvasB.toBlob(res, 'image/png'));
        const qrSvgText = (cf.qrsize && cf.qrsize > 0) ? await genQRSVGText(qr_id, cf.qrsize) : "";
        const epsContent = qrSvgText ? await svgToEPS(qrSvgText) : "";
        
        // 一部機能をオミット(印刷会社へ渡すフォーマットで不要なものは一旦保存しない)
        // if (blobF && folder) folder.file(frontFileName, blobF);
        // if (blobB && folder) folder.file(backFileName, blobB);
        if (folder && epsContent) folder.file(epsFileName, epsContent);

        // CSV 行データの作成
        csvRows.push([qr_id, pin, `${frontFileName}`, `${backFileName}`, `${epsFileName}`]);
        excelRows.push([pin, qrCodeUnderText, epsFileName]);
    }

    
    // 一部機能をオミット(印刷会社へ渡すフォーマットで不要なものは一旦保存しない)
    // ─── CSV ファイルの生成 ───
    // UTF-8 BOM (\uFEFF) を付与して Excel 対策を行う
    const csvContent = "\uFEFF" + csvRows.map(row => row.join(',') + ',').join('\n');
    // if (folder) folder.file(`${batchName}.csv`, csvContent);

    // ─── XLSX ファイルの生成 ───
    const worksheet = XLSX.utils.aoa_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    if (folder) folder.file(`ギフトカード差込_${batchName}.xlsx`, xlsxBuffer);

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

