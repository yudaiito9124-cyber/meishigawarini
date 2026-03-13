
import jsPDF from 'jspdf';
import { APP_CONFIG } from "@/lib/config";
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

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


const paperformats: { [format: string]: any } = {
    // 切れ込みのないA4
    "1S31034": {
        pageWidth: 210, // mm
        pageHeight: 297, // mm
        cols: 2,
        rows: 5,
        cols_gap: 0, // mm
        rows_gap: 0, // mm
        offset_x: 0, // mm
        offset_y: 0, // mm
        uraomote: true,
        comment: ""
    },
    // 切れ込みのあるA4 返礼品用 印刷の際には向き注意
    "10S31251": {
        pageWidth: 210, // mm
        pageHeight: 297, // mm
        cols: 2,
        rows: 5,
        cols_gap: 8, // mm
        rows_gap: 4, // mm
        offset_x: 17, // mm
        offset_y: 10.7, // mm
        uraomote: false,
        comment: "Please pay attention to the orientation when printing. Printing in the wrong orientation (as indicated on the paper) will result in misalignment."
    }
}

const cardformats: { [format: string]: any } = {
    // 最初期 学長単体シンプル
    "gakuchousenbeiv0": {
        bgimgf: "/cardimage-f-2.png",
        bgimgb: "/cardimage-b-2.png",
        width: 85.60 - 2,
        height: 53.98 - 2,
        qrsize: 26,
        qrpos: {
            x: 83.60 - 26 - 3.2,//  QRの左端がカード左端よりどれくらい右か
            y: 51.98 / 2 - 26 / 2 + 7.5,//  QRの上端がカード上端よりどれくらい下か
        },
        pinsize: 20,
        pinpos: {
            x: 10, // PIN文字列の左右中心がカード左端よりどれくらい右か
            y: 16  // PIN文字列の上端がカード上端よりどれくらい下か
        },
        codesize: 5,
        codepos: {
            x: 0, // UUID文字列の左右中心がカード左端よりどれくらい右か
            y: 51.98 - 1 // UUID文字列の上端がカード上端よりどれくらい下か
        },
        isfront_qr: true,
        isfront_pin: false,
        isfront_code: false,
    },
    // 返礼品用
    "gakuchousenbeiv1": {
        bgimgf: "/cardimage-f-" + "gakuchousenbeiv1" + ".png",
        bgimgb: "/cardimage-b-" + "gakuchousenbeiv1" + ".png",
        width: 84,
        height: 52,
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
    }
}


export const generatePDF = async (batch: any, paperformat: string, cardformat: string) => {
    const codes = batch.codes || [];
    if (codes.length === 0) return;

    let doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    const pf = paperformats[paperformat];
    const cf = cardformats[cardformat];

    // Background Image
    const bgImgf = new Image();
    const bgImgb = new Image();
    bgImgf.src = cf.bgimgf;
    bgImgb.src = cf.bgimgb;
    await new Promise((resolve) => {
        bgImgf.onload = resolve;
        bgImgb.onload = resolve;
    });

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


    for (let i = 0; i < codes.length; i += itemsPerPage) {
        if (i > 0) doc.addPage();

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(5);
        doc.setFont("helvetica", "normal");
        doc.text(pf.comment, 3, 3);

        const pageCodes = codes.slice(i, i + itemsPerPage);

        // FRONT PAGE (QR Codes)
        for (let j = 0; j < pageCodes.length; j++) {
            const code = pageCodes[j];
            const { ax, ay } = getFrontPos(j); // anchor point

            // Draw Background Image
            doc.addImage(bgImgf, 'PNG', ax, ay, cardWidth, cardHeight);

            // Draw Corner Dots (Cut marks)
            doc.setFillColor(0, 0, 0); // Black
            const dotRadius = 0.2; // mm radius
            doc.circle(ax, ay, dotRadius, 'F'); // Top Left
            doc.circle(ax + cardWidth, ay, dotRadius, 'F'); // Top Right
            doc.circle(ax, ay + cardHeight, dotRadius, 'F'); // Bottom Left
            doc.circle(ax + cardWidth, ay + cardHeight, dotRadius, 'F');// Bottom Right

            // Draw QR
            if (cf.isfront_qr) {
                const base64data = await genQR(code.uuid);
                if (!base64data) continue;
                const qrSize = cf.qrsize;
                doc.addImage(base64data, 'PNG', ax + cf.qrpos.x, ay + cf.qrpos.y, qrSize, qrSize);
            }

            // Draw PIN
            if (cf.isfront_pin) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.pinsize);
                doc.setFont("helvetica", "bold");
                const pinWidth = doc.getTextWidth(code.pin);
                doc.text(code.pin, ax + (cardWidth - pinWidth) / 2 + cf.pinpos.x, ay + cf.pinpos.y);
            }

            // Draw UUID head
            if (cf.isfront_code) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.codesize);
                doc.setFont("helvetica", "normal");
                const uuidText = `${code.uuid.substring(18, 34)}...`;
                const uuidWidth = doc.getTextWidth(uuidText);
                doc.text(uuidText, ax + (cardWidth - uuidWidth) / 2 + cf.codepos.x, ay + cf.codepos.y);
            }
        }

        doc.addPage(); // Back Page
        // BACK PAGE (PIN Codes)
        for (let j = 0; j < pageCodes.length; j++) {
            const code = pageCodes[j];
            const { ax, ay } = pf.uraomote ? getBackPos(j) : getFrontPos(j); // anchor point

            // Draw Background Image (Reuse same bg or different back bg?)
            // Assuming same bg for now, typically back has instructions
            doc.addImage(bgImgb, 'PNG', ax, ay, cardWidth, cardHeight);

            // Draw Corner Dots (Cut marks)
            doc.setFillColor(0, 0, 0); // Black
            const dotRadius = 0.2; // mm radius
            doc.circle(ax, ay, dotRadius, 'F'); // Top Left
            doc.circle(ax + cardWidth, ay, dotRadius, 'F'); // Top Right
            doc.circle(ax, ay + cardHeight, dotRadius, 'F'); // Bottom Left
            doc.circle(ax + cardWidth, ay + cardHeight, dotRadius, 'F');// Bottom Right

            // Draw QR
            if (!cf.isfront_qr) {
                const base64data = await genQR(code.uuid);
                if (!base64data) continue;
                const qrSize = cf.qrsize;
                doc.addImage(base64data, 'PNG', ax + cf.qrpos.x, ay + cf.qrpos.y, qrSize, qrSize);
            }

            // Draw PIN
            if (!cf.isfront_pin) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.pinsize);
                doc.setFont("helvetica", "bold");
                const pinWidth = doc.getTextWidth(code.pin);
                doc.text(code.pin, ax + (cardWidth - pinWidth) / 2 + cf.pinpos.x, ay + cf.pinpos.y);
            }

            // Draw UUID head
            if (!cf.isfront_code) {
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(cf.codesize);
                doc.setFont("helvetica", "normal");
                const uuidText = `${code.uuid.substring(18, 34)}...`;
                const uuidWidth = doc.getTextWidth(uuidText);
                doc.text(uuidText, ax + (cardWidth - uuidWidth) / 2 + cf.codepos.x, ay + cf.codepos.y);
            }
        }
    }

    doc.save(`qrcodes-${batch.id}.pdf`);
};