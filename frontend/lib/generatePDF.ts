
// import jsPDF from 'jspdf'; // Removed for SSR compatibility
import { APP_CONFIG } from "@/lib/config";
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

export const paperformats: { [format: string]: any } = {
    "1S31034": {
        description: "[A-one 31034] 切れ込みのないA4に10枚印刷",
        pageWidth: 210, // mm
        pageHeight: 297, // mm
        cols: 2,
        rows: 5,
        cols_gap: 0, // mm
        rows_gap: 0, // mm
        offset_x: 0, // mm
        offset_y: 0, // mm
        uraomote: false,
        comment: "",
        scale: 1,
        dots: true,
        dotsedge: false
    },
    "10S31251": {
        description: "[A-one 31251] A4-10切 返礼品用(はがせるタイプ・クレジットカードサイズ) 印刷時 向き注意",
        pageWidth: 210, // mm
        pageHeight: 297, // mm
        cols: 2,
        rows: 5,
        cols_gap: 8, // mm
        rows_gap: 4, // mm
        offset_x: 17, // mm
        offset_y: 10.7 - 1, // mm
        uraomote: false,
        comment: "Please pay attention to the orientation when printing. Printing in the wrong orientation (as indicated on the paper) will result in misalignment.",
        scale: 1,
        dots: false,
        dotsedge: true
    },
    "10S31251-2": {
        description: "[A-one 31251] 【フチなし】 A4-10切 返礼品用(はがせるタイプ・クレジットカードサイズ) 印刷時 向き注意",
        pageWidth: 210, // mm
        pageHeight: 297, // mm
        cols: 2,
        rows: 5,
        cols_gap: 8, // mm
        rows_gap: 4, // mm
        offset_x: 17, // mm
        offset_y: 10.7 - 1, // mm
        uraomote: false,
        comment: "Please pay attention to the orientation when printing. Printing in the wrong orientation (as indicated on the paper) will result in misalignment.",
        scale: 1.03,
        dots: false,
        dotsedge: true
    },
    "10S31370": {
        description: "[A-one 31370] A4-10切 返礼品用(クレカより横長・縦短)",
        pageWidth: 210, // mm
        pageHeight: 297, // mm
        cols: 2,
        rows: 5,
        cols_gap: -4.14, // mm
        rows_gap: -.6, // mm
        offset_x: 19 + 3, // mm
        offset_y: 21 - 2, // mm
        uraomote: false,
        comment: "",
        scale: .93,
        dots: false,
        dotsedge: true
    }
}

export const cardformats: { [format: string]: any } = {
    // 最初期 学長単体シンプル
    "gakuchousenbeiv0": {
        description: "初期デザイン・学長単体",
        bgimgf: "/cardimage-f-2.png",
        bgimgb: "/cardimage-b-2.png",
        width: 84, // 固定
        height: 52, // 固定
        qrsize: 26,
        qrpos: {
            x: 83.60 - 26 - 3.2,//  QRの左端がカード左端よりどれくらい右か
            y: 51.98 / 2 - 26 / 2 + 7.5,//  QRの上端がカード上端よりどれくらい下か
        },
        pinsize: 20,
        pinpos: {
            x: 10, // PIN文字列の左右中心がカード左端よりどれくらい右か
            y: 13.5  // PIN文字列の上端がカード上端よりどれくらい下か
        },
        codesize: 5,
        codepos: {
            x: 0, // UUID文字列の左右中心がカード左端よりどれくらい右か
            y: 51.98 - 2 // UUID文字列の上端がカード上端よりどれくらい下か
        },
        isfront_qr: true,
        isfront_pin: false,
        isfront_code: false,
    },
    // 返礼品用
    "gakuchousenbeiv1": {
        description: "役員配布用20260313",
        bgimgf: "/cardimage-f-" + "gakuchousenbeiv1" + ".png",
        bgimgb: "/cardimage-b-" + "gakuchousenbeiv1" + ".png",
        width: 84, // 固定
        height: 52, // 固定
        qrsize: 30,
        qrpos: {
            x: 84 - 30 - 3.2,//  QRがカード右端よりどれくらい右か
            y: 52 - 30 - 7.5,//  QRがカード下端よりどれくらい下か
        },
        pinsize: 20,
        pinpos: {
            x: 7.3, // PIN文字列の左右中心がカード左端よりどれくらい右か
            y: 19.7  // PIN文字列の上端がカード上端よりどれくらい下か
        },
        codesize: 5,
        codepos: {
            x: 24, // UUID文字列の左右中心がカード左端よりどれくらい右か
            y: 52 - 5.5 // UUID文字列の上端がカード上端よりどれくらい下か
        },
        isfront_qr: true,
        isfront_pin: false,
        isfront_code: true,
    },
    // 返礼品用
    "gakuchousenbei-henrei": {
        description: "みらい創造基金返礼品用20260317",
        bgimgf: "/cardimage-f-" + "gakuchousenbei-henrei" + ".png",
        bgimgb: "/cardimage-b-" + "gakuchousenbeiv1" + ".png",
        width: 84, // 固定
        height: 52, // 固定
        qrsize: 30,
        qrpos: {
            x: 84 - 30 - 3.2,
            y: 52 - 30 - 7.5,
        },
        pinsize: 20,
        pinpos: {
            x: 7.3,
            y: 18.1
        },
        codesize: 5,
        codepos: {
            x: 24,
            y: 52 - 7
        },
        isfront_qr: true,
        isfront_pin: false,
        isfront_code: true,
    }
}




const genQR = async (code: string) => {
    const QRCodeStyling = (await import('qr-code-styling')).default;
    // Create Custom QR
    //https://qr-code-styling.com/
    const qr = new QRCodeStyling({
        width: 600,
        height: 600,
        data: `${NEXT_PUBLIC_APP_URL}/receive/${code}`,
        image: APP_CONFIG.QR_LOGO_PATH, // Placeholder Logo
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
            color: "#ffffff" // Transparent background for QR not supported well in all viewers, keeping white for safety or custom
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

    // Get Raw Data (Blob) -> Base64
    const rawData = await qr.getRawData('png');
    if (!rawData) return;

    // Ensure we have a Blob (qr-code-styling can return Buffer in Node environment)
    const blob = rawData instanceof Blob ? rawData : new Blob([rawData as any]);

    const base64data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });

    return base64data;
}


export const generatePDF = async (batch: any, paperformat: string, cardformat: string | any, fillall: boolean = false) => {
    // Dynamically import jsPDF only when this function is called (on the client)
    const { default: jsPDF } = await import('jspdf');

    let codes = batch.codes || [];
    if (codes.length === 0) return;

    let doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    const pf = paperformats[paperformat];
    const cf = typeof cardformat === 'string' ? cardformats[cardformat] : cardformat;

    if (!pf || !cf) {
        console.error("Invalid format", { paperformat, cardformat });
        return;
    }

    // Background Image
    const bgImgf = new Image();
    const bgImgb = new Image();
    bgImgf.crossOrigin = "anonymous";
    bgImgb.crossOrigin = "anonymous";

    // Support relative paths for public folder and absolute URLs for S3
    // Note: Do NOT add cache-busting to S3 signed URLs as it invalidates the signature.
    const getFinalUrl = (url: string) => {
        if (!url) return "";
        if (url.startsWith('http')) return url;
        return url.startsWith('/') ? url : `/${url}`;
    };

    bgImgf.src = getFinalUrl(cf.bgimgf);
    bgImgb.src = getFinalUrl(cf.bgimgb);

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

    // paper format
    const pageWidth = pf.pageWidth; // mm
    const pageHeight = pf.pageHeight; // mm
    const cols = pf.cols;
    const rows = pf.rows;
    const cardWidth = cf.width; // mm
    const cardHeight = cf.height; // mm
    const totalGridWidth = cols * cardWidth;
    const totalGridHeight = rows * cardHeight;
    const marginLeft = pf.offset_x === 0 ? (pageWidth - totalGridWidth) / 2 : 0;
    const marginTop = pf.offset_y === 0 ? (pageHeight - totalGridHeight) / 2 : 0;
    const itemsPerPage = cols * rows;
    const cardsPerPage = pf.uraomote ? itemsPerPage : itemsPerPage / 2;
    const fbswitch = pf.uraomote ? cols * rows : 1;
    const scaleofx = (1 - pf.scale) / 2 * cardWidth;
    const scaleofy = (1 - pf.scale) / 2 * cardHeight;

    console.log("fillall", fillall);
    console.log("codes.length", codes.length);
    console.log("cardsPerPage", cardsPerPage);
    console.log("fbswitch", fbswitch);
    if (fillall && codes.length < cardsPerPage) {
        console.log("fillall is true and codes.length < cardsPerPage");
        const times = Math.floor(cardsPerPage / codes.length);
        console.log("times", times);
        codes = Array(times).fill(codes).flat();
        console.log("codes.length", codes.length);
    }

    // Helper to get position
    const getFrontPos = (indexInPage: number) => {
        const row = Math.floor(indexInPage / cols);
        const col = indexInPage % cols;
        return {
            ax: marginLeft + col * cardWidth + pf.offset_x + pf.cols_gap * col,
            ay: marginTop + row * cardHeight + pf.offset_y + pf.rows_gap * row
        };
    };

    // Helper for Back Page (Mirrored columns) (裏表印刷のために左右反転させて配置させるのに使用)
    // If col 0 -> print at col 1 pos (so it is behind col 0 when flipped on long edge)
    // If col 1 -> print at col 0 pos
    const getBackPos = (indexInPage: number) => {
        const row = Math.floor(indexInPage / cols);
        const col = indexInPage % cols;
        const mirroredCol = cols - (col + 1);
        return {
            ax: marginLeft + mirroredCol * cardWidth + pf.offset_x + pf.cols_gap * mirroredCol,
            ay: marginTop + row * cardHeight + pf.offset_y + pf.rows_gap * row
        };
    };


    let posInSheet = 0;
    for (let i = 0; i < codes.length; i += fbswitch) {
        if (i > 0 && pf.uraomote || posInSheet >= itemsPerPage) {
            doc.addPage();
            posInSheet = 0;
        }

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(5);
        doc.setFont("helvetica", "normal");
        doc.text(pf.comment, 3, 3);

        const pageCodes = codes.slice(i, i + fbswitch);
        // FRONT PAGE (QR Codes)
        for (let j = 0; j < pageCodes.length; j++) {
            const code = pageCodes[j];
            const { ax, ay } = getFrontPos(posInSheet); // anchor point

            // Draw Background Image
            if (bgImgf.naturalWidth > 0) {
                try {
                    doc.addImage(bgImgf, 'PNG', scaleofx + ax, scaleofy + ay, cardWidth * pf.scale, cardHeight * pf.scale);
                } catch (e) {
                    console.error("addImage front failed", e);
                }
            }

            // Draw Corner Dots (Cut marks)
            if (pf.dots) {
                const dotRadius = 0.2; // mm radius
                doc.setFillColor(0, 0, 0); // Black
                doc.circle(scaleofx + ax, scaleofy + ay, dotRadius, 'F'); // Top Left
                doc.circle(scaleofx + ax + cardWidth * pf.scale, scaleofy + ay, dotRadius, 'F'); // Top Right
                doc.circle(scaleofx + ax, scaleofy + ay + cardHeight * pf.scale, dotRadius, 'F'); // Bottom Left
                doc.circle(scaleofx + ax + cardWidth * pf.scale, scaleofy + ay + cardHeight * pf.scale, dotRadius, 'F');// Bottom Right
            }

            // Draw QR
            if (cf.isfront_qr) {
                const base64data = await genQR(code.uuid);
                if (!base64data) continue;
                const qrSize = cf.qrsize;
                doc.addImage(base64data, 'PNG', scaleofx + ax + cf.qrpos.x * pf.scale, scaleofy + ay + cf.qrpos.y * pf.scale, qrSize * pf.scale, qrSize * pf.scale);
            }

            // Draw PIN
            if (cf.isfront_pin) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.pinsize * pf.scale);
                doc.setFont("helvetica", "bold");
                const pinWidth = doc.getTextWidth(code.pin);
                const pinHeight = doc.getTextDimensions(code.pin).h;
                doc.text(code.pin, scaleofx + ax + (cardWidth * pf.scale - pinWidth) / 2 + cf.pinpos.x * pf.scale, scaleofy + ay + cf.pinpos.y * pf.scale, {
                    baseline: 'middle'  // 垂直方向の中央揃え
                });
            }

            // Draw UUID head
            if (cf.isfront_code) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.codesize * pf.scale);
                doc.setFont("helvetica", "normal");
                const uuidText = `${code.uuid.substring(18, 34)}...`;
                const uuidWidth = doc.getTextWidth(uuidText);
                const uuidHeight = doc.getTextDimensions(uuidText).h;
                doc.text(uuidText, scaleofx + ax + (cardWidth * pf.scale - uuidWidth) / 2 + cf.codepos.x * pf.scale, scaleofy + ay + cf.codepos.y * pf.scale, {
                    baseline: 'middle'  // 垂直方向の中央揃え
                });
            }
            posInSheet++;
        }
        if (pf.dotsedge) {
            const dotRadius = 0.2; // mm radius
            doc.setFillColor(0, 0, 0); // Black
            doc.circle(scaleofx + pf.offset_x, scaleofy + pf.offset_y, dotRadius, 'F'); // Top Left
            doc.circle(pf.offset_x + cardWidth * pf.cols + pf.cols_gap * (pf.cols - 1) - scaleofx, scaleofy + pf.offset_y, dotRadius, 'F'); // Top Right
            doc.circle(scaleofx + pf.offset_x, pf.offset_y + cardHeight * pf.rows + pf.rows_gap * (pf.rows - 1) - scaleofy, dotRadius, 'F'); // Bottom Left
            doc.circle(pf.offset_x + cardWidth * pf.cols + pf.cols_gap * (pf.cols - 1) - scaleofx, pf.offset_y + cardHeight * pf.rows + pf.rows_gap * (pf.rows - 1) - scaleofy, dotRadius, 'F');// Bottom Right
        }

        if (pf.uraomote) {
            doc.addPage(); // Back Page
            posInSheet = 0;
        }

        // BACK PAGE (PIN Codes)
        for (let j = 0; j < pageCodes.length; j++) {
            const code = pageCodes[j];
            const { ax, ay } = pf.uraomote ? getBackPos(posInSheet) : getFrontPos(posInSheet); // anchor point

            // Draw Background Image (Reuse same bg or different back bg?)
            // Assuming same bg for now, typically back has instructions
            doc.addImage(bgImgb, 'PNG', scaleofx + ax, scaleofy + ay, cardWidth * pf.scale, cardHeight * pf.scale);

            // Draw Corner Dots (Cut marks)
            if (pf.dots) {
                const dotRadius = 0.2; // mm radius
                doc.setFillColor(0, 0, 0); // Black
                doc.circle(scaleofx + ax, scaleofy + ay, dotRadius, 'F'); // Top Left
                doc.circle(scaleofx + ax + cardWidth * pf.scale, scaleofy + ay, dotRadius, 'F'); // Top Right
                doc.circle(scaleofx + ax, scaleofy + ay + cardHeight * pf.scale, dotRadius, 'F'); // Bottom Left
                doc.circle(scaleofx + ax + cardWidth * pf.scale, scaleofy + ay + cardHeight * pf.scale, dotRadius, 'F');// Bottom Right
            }

            // Draw QR
            if (!cf.isfront_qr) {
                const base64data = await genQR(code.uuid);
                if (!base64data) continue;
                const qrSize = cf.qrsize;
                doc.addImage(base64data, 'PNG', scaleofx + ax + cf.qrpos.x * pf.scale, scaleofy + ay + cf.qrpos.y * pf.scale, qrSize * pf.scale, qrSize * pf.scale);
            }

            // Draw PIN
            if (!cf.isfront_pin) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.pinsize * pf.scale);
                doc.setFont("helvetica", "bold");
                const pinWidth = doc.getTextWidth(code.pin);
                const pinHeight = doc.getTextDimensions(code.pin).h;
                doc.text(code.pin, scaleofx + ax + (cardWidth * pf.scale - pinWidth) / 2 + (cf.pinpos.x) * pf.scale, scaleofy + ay + cf.pinpos.y * pf.scale, {
                    baseline: 'middle'  // 垂直方向の中央揃え
                });
            }

            // Draw UUID head
            if (!cf.isfront_code) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.codesize * pf.scale);
                doc.setFont("helvetica", "normal");
                const uuidText = `${code.uuid.substring(18, 34)}...`;
                const uuidWidth = doc.getTextWidth(uuidText);
                const uuidHeight = doc.getTextDimensions(uuidText).h;
                doc.text(uuidText, scaleofx + ax + (cardWidth * pf.scale - uuidWidth) / 2 + (cf.codepos.x) * pf.scale, scaleofy + ay + cf.codepos.y * pf.scale, {
                    baseline: 'middle'  // 垂直方向の中央揃え
                });
            }
            posInSheet++;
        }
        if (pf.dotsedge) {
            const dotRadius = 0.2; // mm radius
            doc.setFillColor(0, 0, 0); // Black
            doc.circle(scaleofx + pf.offset_x, scaleofy + pf.offset_y, dotRadius, 'F'); // Top Left
            doc.circle(pf.offset_x + cardWidth * pf.cols + pf.cols_gap * (pf.cols - 1) - scaleofx, scaleofy + pf.offset_y, dotRadius, 'F'); // Top Right
            doc.circle(scaleofx + pf.offset_x, pf.offset_y + cardHeight * pf.rows + pf.rows_gap * (pf.rows - 1) - scaleofy, dotRadius, 'F'); // Bottom Left
            doc.circle(pf.offset_x + cardWidth * pf.cols + pf.cols_gap * (pf.cols - 1) - scaleofx, pf.offset_y + cardHeight * pf.rows + pf.rows_gap * (pf.rows - 1) - scaleofy, dotRadius, 'F');// Bottom Right
        }
    }

    doc.save(`card_${(batch.id || '') || `batch-` + Date.now()}.pdf`);
};