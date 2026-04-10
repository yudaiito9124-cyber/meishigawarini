/**
 * ファイル概要: カード印刷用 PDF 生成ユーティリティ (Card PDF Generation Utility)
 * 
 * 役割:
 * 指定されたバッチ内の QR コードと PIN を使用して、印刷用の PDF ファイルを生成します。
 * 複数の用紙フォーマット（A4, ハガキ等）とカードデザインに対応しています。
 * 
 * 主要機能:
 * 1. `qr-code-styling` を使用したカスタマイズされた QR コードの生成。
 * 2. `jsPDF` を使用したマルチページ PDF の構築。
 * 3. 用紙サイズ、マージン、カラム、行、ギャップなどの精密なレイアウト計算。
 * 4. 表裏印刷（uraomote）時の鏡像配置（Mirrored columns）の対応。
 * 5. 背景画像の合成（S3 またはローカルアセット）。
 */

import { APP_CONFIG } from "@/lib/config";
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

import { paperformats, cardformats } from "./constants/designs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── 内部ユーティリティ ────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 指定されたコードに対応する QR コード画像を生成し、Base64 文字列として返します。
 * 
 * @param code 受取用 URL に含まれる一意の識別子 (qr_id)
 * @returns QR 画像の Base64 データ、生成失敗時は undefined
 */
const genQR = async (code: string) => {
    // クライアントサイドでのみ動作させるため動的インポート
    const QRCodeStyling = (await import('qr-code-styling')).default;

    /**
     * カスタム QR コードの設定
     * https://qr-code-styling.com/ 参照
     */
    const qr = new QRCodeStyling({
        width: 600,
        height: 600,
        data: `${NEXT_PUBLIC_APP_URL}/receive/${code}`,
        image: APP_CONFIG.QR_LOGO_PATH, // 中央に配置するロゴ
        qrOptions: {
            typeNumber: 0,
            mode: "Byte",
            errorCorrectionLevel: "Q" // 誤り訂正レベルを Q (25%) に設定 (中央ロゴ配置を考慮)
        },
        imageOptions: {
            saveAsBlob: true,
            hideBackgroundDots: true,
            imageSize: 0.4,
            margin: 0
        },
        dotsOptions: {
            type: "dots", // ドット形式の QR
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

    // 描画結果を Blob として取得
    const rawData = await qr.getRawData('png');
    if (!rawData) return;

    // Node 環境での動作も考慮した Blob への正規化
    const blob = rawData instanceof Blob ? rawData : new Blob([rawData as any]);

    // Blob を Data URL (Base64) に変換
    const base64data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });

    return base64data;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── メインPDF生成関数 ──────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 複数のコードを含むバッチから、指定されたレイアウトの PDF を生成・ダウンロードします。
 * 
 * @param batch QRコードとPINのリストを含むオブジェクト
 * @param paperformat 用紙フォーマット ID (例: 'a4')
 * @param cardformat カードデザイン設定 (ID 文字列かオブジェクト)
 * @param fillall 用紙の残りを同じカードで埋めるかどうか (デフォルト: false)
 */
export const generatePDF = async (batch: any, paperformat: string, cardformat: string | any, fillall: boolean = false) => {
    // SSR 互換性のため jsPDF を動的インポート
    const { default: jsPDF } = await import('jspdf');

    let codes = batch.codes || [];
    if (codes.length === 0) return;

    // 用紙フォーマット情報の取得
    const pf = paperformats[paperformat];
    const pageWidth = pf.pageWidth; // mm
    const pageHeight = pf.pageHeight; // mm

    // PDF インスタンスの作成 (用紙サイズに合わせて向きを自動設定)
    let doc = new jsPDF({
        orientation: (pageWidth > pageHeight ? 'l' : 'p'),
        unit: 'mm',
        format: [pageWidth, pageHeight]
    });

    // カードデザイン情報の取得とデフォルト値のマージ
    let cf = typeof cardformat === 'string' ? cardformats[cardformat] : cardformat;

    if (!pf || !cf) {
        console.error("Invalid format", { paperformat, cardformat });
        return;
    }

    /* 
      DB上のデザイン設定に欠落がある場合に備え、
      基準となるデフォルトフォーマット ('gakuchousenbeiv1') で補完を行う。
    */
    const defaultFormat = cardformats['gakuchousenbeiv1'];
    cf = { ...defaultFormat, ...cf };
    cf.qrpos = { ...defaultFormat.qrpos, ...(cf.qrpos || {}) };
    cf.pinpos = { ...defaultFormat.pinpos, ...(cf.pinpos || {}) };
    cf.codepos = { ...defaultFormat.codepos, ...(cf.codepos || {}) };

    // 数値の安全性の確保 (0以下の場合はデフォルトを使用)
    if (!cf.width || cf.width <= 0) cf.width = defaultFormat.width;
    if (!cf.height || cf.height <= 0) cf.height = defaultFormat.height;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ─── 画像リソースのプリロード ────────────────────────────────────────────────
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const bgImgf = new Image();
    const bgImgb = new Image();
    bgImgf.crossOrigin = "anonymous"; // S3 画像などの CORS 対応
    bgImgb.crossOrigin = "anonymous";

    /**
     * URL を正規化します。
     * ローカルパスなら `/` から開始、S3 などならそのまま使用。
     */
    const getFinalUrl = (url: string) => {
        if (!url) return "";
        if (url.startsWith('http')) return url;
        return url.startsWith('/') ? url : `/${url}`;
    };

    bgImgf.src = getFinalUrl(cf.bgimgf);
    bgImgb.src = getFinalUrl(cf.bgimgb);

    // 両方の画像の読み込み完了を待機
    await Promise.all([
        new Promise((resolve) => {
            bgImgf.onload = resolve;
            bgImgf.onerror = (e) => {
                console.error("Failed to load front background image", e);
                resolve(null);
            };
        }),
        new Promise((resolve) => {
            bgImgb.onload = resolve;
            bgImgb.onerror = (e) => {
                console.error("Failed to load back background image", e);
                resolve(null);
            };
        })
    ]);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ─── レイアウト定数の計算 ───────────────────────────────────────────────────
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const cols = pf.cols;
    const rows = pf.rows;
    const cardWidth = cf.width; // mm
    const cardHeight = cf.height; // mm
    const totalGridWidth = cols * cardWidth;
    const totalGridHeight = rows * cardHeight;

    // offset_x/y が 0 の場合は、用紙の中央に配置されるようにマージンを計算
    const marginLeft = pf.offset_x === 0 ? (pageWidth - totalGridWidth) / 2 : 0;
    const marginTop = pf.offset_y === 0 ? (pageHeight - totalGridHeight) / 2 : 0;

    const itemsPerPage = cols * rows;               // 1ページあたりのスロット数
    const cardsPerPage = pf.uraomote ? itemsPerPage : itemsPerPage / 2; // 理論上のカード数
    const fbswitch = pf.uraomote ? cols * rows : 1; // 表裏切り替えの閾値

    // デザインのスケール (scale < 1.0) に基づく補正値
    const scaleofx = (1 - pf.scale) / 2 * cardWidth;
    const scaleofy = (1 - pf.scale) / 2 * cardHeight;

    // fillall 指定時のコード埋め処理
    if (fillall && codes.length < cardsPerPage) {
        const times = Math.floor(cardsPerPage / codes.length);
        codes = Array(times).fill(codes).flat();
    }

    /**
     * 表面 (Front) の座標を取得
     * 用紙の左上から数えたインデックスに対して、物理座標 (x, y) を返す
     */
    const getFrontPos = (indexInPage: number) => {
        const row = Math.floor(indexInPage / cols);
        const col = indexInPage % cols;
        return {
            ax: marginLeft + col * cardWidth + pf.offset_x + pf.cols_gap * col,
            ay: marginTop + row * cardHeight + pf.offset_y + pf.rows_gap * row
        };
    };

    /**
     * 裏面 (Back) の座標を取得
     * 長辺反転 (Flip on Long Edge) で印刷した際に、
     * 表面と同じカードの裏側に重なるよう、カラムを左右反転させて計算。
     */
    const getBackPos = (indexInPage: number) => {
        const row = Math.floor(indexInPage / cols);
        const col = indexInPage % cols;
        const mirroredCol = cols - (col + 1); // ここで反転
        return {
            ax: marginLeft + mirroredCol * cardWidth + pf.offset_x + pf.cols_gap * mirroredCol,
            ay: marginTop + row * cardHeight + pf.offset_y + pf.rows_gap * row
        };
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ─── PDF 描画ループ ────────────────────────────────────────────────────────
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    let posInSheet = 0;
    for (let i = 0; i < codes.length; i += fbswitch) {
        // 次のページが必要か判定
        if (i > 0 && pf.uraomote || posInSheet >= itemsPerPage) {
            doc.addPage();
            posInSheet = 0;
        }

        // 用紙隅にコメント印字
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(5);
        doc.setFont("helvetica", "normal");
        doc.text(pf.comment, 3, 3);

        const pageCodes = codes.slice(i, i + fbswitch);

        // ─── 表面 (FRONT PAGE / QR面) の描画 ───
        for (let j = 0; j < pageCodes.length; j++) {
            const code = pageCodes[j];
            const { ax, ay } = getFrontPos(posInSheet); // 用紙上の基準点

            // 1. 背景画像の描画
            if (bgImgf.naturalWidth > 0) {
                try {
                    doc.addImage(bgImgf, 'PNG', scaleofx + ax, scaleofy + ay, cardWidth * pf.scale, cardHeight * pf.scale);
                } catch (e) {
                    console.error("addImage front failed", e);
                }
            }

            // 2. 切断ガイド (角のドット) の描画
            if (pf.dots) {
                const dotRadius = 0.2; // mm radius
                doc.setFillColor(0, 0, 0); // Black
                doc.circle(scaleofx + ax, scaleofy + ay, dotRadius, 'F'); // Top Left
                doc.circle(scaleofx + ax + cardWidth * pf.scale, scaleofy + ay, dotRadius, 'F'); // Top Right
                doc.circle(scaleofx + ax, scaleofy + ay + cardHeight * pf.scale, dotRadius, 'F'); // Bottom Left
                doc.circle(scaleofx + ax + cardWidth * pf.scale, scaleofy + ay + cardHeight * pf.scale, dotRadius, 'F');// Bottom Right
            }

            // 3. QR コードの描画
            if (cf.isfront_qr && cf.qrsize && cf.qrsize > 0) {
                const qr_id = code.qr_id || (code as any).uuid;
                const base64data = await genQR(qr_id);
                if (!base64data) continue;
                const qrSize = cf.qrsize;
                doc.addImage(base64data, 'PNG', scaleofx + ax + cf.qrpos.x * pf.scale, scaleofy + ay + cf.qrpos.y * pf.scale, qrSize * pf.scale, qrSize * pf.scale);
            }

            // 4. PIN コードの印字
            if (cf.isfront_pin && cf.pinsize && cf.pinsize > 0) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.pinsize * pf.scale);
                doc.setFont("helvetica", "bold");
                const pinWidth = doc.getTextWidth(code.pin);
                doc.text(code.pin, scaleofx + ax + (cardWidth * pf.scale - pinWidth) / 2 + cf.pinpos.x * pf.scale, scaleofy + ay + cf.pinpos.y * pf.scale, {
                    baseline: 'middle'  // 垂直方向の中央揃え
                });
            }

            // 5. 管理用 UUID (下16桁) の印字
            if (cf.isfront_code && cf.codesize && cf.codesize > 0) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.codesize * pf.scale);
                doc.setFont("helvetica", "normal");
                const qr_id = code.qr_id || (code as any).uuid;
                const uuidText = `${qr_id.substring(18, 34)}...`;
                const uuidWidth = doc.getTextWidth(uuidText);
                doc.text(uuidText, scaleofx + ax + (cardWidth * pf.scale - uuidWidth) / 2 + cf.codepos.x * pf.scale, scaleofy + ay + cf.codepos.y * pf.scale, {
                    baseline: 'middle'
                });
            }
            posInSheet++;
        }

        // 用紙全体の四隅ガイド
        if (pf.dotsedge) {
            const dotRadius = 0.2; // mm radius
            doc.setFillColor(0, 0, 0); // Black
            doc.circle(scaleofx + pf.offset_x, scaleofy + pf.offset_y, dotRadius, 'F'); // Top Left
            doc.circle(pf.offset_x + cardWidth * pf.cols + pf.cols_gap * (pf.cols - 1) - scaleofx, scaleofy + pf.offset_y, dotRadius, 'F'); // Top Right
            doc.circle(scaleofx + pf.offset_x, pf.offset_y + cardHeight * pf.rows + pf.rows_gap * (pf.rows - 1) - scaleofy, dotRadius, 'F'); // Bottom Left
            doc.circle(pf.offset_x + cardWidth * pf.cols + pf.cols_gap * (pf.cols - 1) - scaleofx, pf.offset_y + cardHeight * pf.rows + pf.rows_gap * (pf.rows - 1) - scaleofy, dotRadius, 'F');// Bottom Right
        }

        if (pf.uraomote) {
            doc.addPage();
            posInSheet = 0;
        }

        // ─── 裏面 (BACK PAGE / PIN面) の描画 ───
        for (let j = 0; j < pageCodes.length; j++) {
            const code = pageCodes[j];
            const { ax, ay } = pf.uraomote ? getBackPos(posInSheet) : getFrontPos(posInSheet);

            // 1. 背景画像 (裏面用)
            doc.addImage(bgImgb, 'PNG', scaleofx + ax, scaleofy + ay, cardWidth * pf.scale, cardHeight * pf.scale);

            // 2. 切断ガイド
            if (pf.dots) {
                const dotRadius = 0.2; // mm radius
                doc.setFillColor(0, 0, 0); // Black
                doc.circle(scaleofx + ax, scaleofy + ay, dotRadius, 'F'); // Top Left
                doc.circle(scaleofx + ax + cardWidth * pf.scale, scaleofy + ay, dotRadius, 'F'); // Top Right
                doc.circle(scaleofx + ax, scaleofy + ay + cardHeight * pf.scale, dotRadius, 'F'); // Bottom Left
                doc.circle(scaleofx + ax + cardWidth * pf.scale, scaleofy + ay + cardHeight * pf.scale, dotRadius, 'F');// Bottom Right
            }

            // 3. QR コード (もし裏面に配置設定されている場合)
            if (!cf.isfront_qr && cf.qrsize && cf.qrsize > 0) {
                const qr_id = code.qr_id || (code as any).uuid;
                const base64data = await genQR(qr_id);
                if (!base64data) continue;
                const qrSize = cf.qrsize;
                doc.addImage(base64data, 'PNG', scaleofx + ax + cf.qrpos.x * pf.scale, scaleofy + ay + cf.qrpos.y * pf.scale, qrSize * pf.scale, qrSize * pf.scale);
            }

            // 4. PIN コード (裏面用)
            if (!cf.isfront_pin && cf.pinsize && cf.pinsize > 0) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.pinsize * pf.scale);
                doc.setFont("helvetica", "bold");
                const pinWidth = doc.getTextWidth(code.pin);
                doc.text(code.pin, scaleofx + ax + (cardWidth * pf.scale - pinWidth) / 2 + (cf.pinpos.x) * pf.scale, scaleofy + ay + cf.pinpos.y * pf.scale, {
                    baseline: 'middle'
                });
            }

            // 5. UUID印字 (裏面用)
            if (!cf.isfront_code && cf.codesize && cf.codesize > 0) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.codesize * pf.scale);
                doc.setFont("helvetica", "normal");
                const qr_id = code.qr_id || (code as any).uuid;
                const uuidText = `${qr_id.substring(18, 34)}...`;
                const uuidWidth = doc.getTextWidth(uuidText);
                doc.text(uuidText, scaleofx + ax + (cardWidth * pf.scale - uuidWidth) / 2 + (cf.codepos.x) * pf.scale, scaleofy + ay + cf.codepos.y * pf.scale, {
                    baseline: 'middle'
                });
            }
            posInSheet++;
        }

        // 裏面ページの四隅ガイド
        if (pf.dotsedge) {
            const dotRadius = 0.2; // mm radius
            doc.setFillColor(0, 0, 0); // Black
            doc.circle(scaleofx + pf.offset_x, scaleofy + pf.offset_y, dotRadius, 'F'); // Top Left
            doc.circle(pf.offset_x + cardWidth * pf.cols + pf.cols_gap * (pf.cols - 1) - scaleofx, scaleofy + pf.offset_y, dotRadius, 'F'); // Top Right
            doc.circle(scaleofx + pf.offset_x, pf.offset_y + cardHeight * pf.rows + pf.rows_gap * (pf.rows - 1) - scaleofy, dotRadius, 'F'); // Bottom Left
            doc.circle(pf.offset_x + cardWidth * pf.cols + pf.cols_gap * (pf.cols - 1) - scaleofx, pf.offset_y + cardHeight * pf.rows + pf.rows_gap * (pf.rows - 1) - scaleofy, dotRadius, 'F');// Bottom Right
        }
    }

    // PDF ファイルをブラウザでダウンロード
    doc.save(`card_${(batch.id || '') || `batch-` + Date.now()}.pdf`);
};