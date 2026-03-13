
import jsPDF from 'jspdf';
import { APP_CONFIG } from "@/lib/config";
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

const genQR = async (code: string) => {
    const QRCodeStyling = (await import('qr-code-styling')).default;
    // Create Custom QR
    //https://qr-code-styling.com/
    const qr = new QRCodeStyling({
        width: 300,
        height: 300,
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


const paperformat = {
    "1S31034-gakuchousenbeiv1": {
        pageWidth: 210, // mm
        pageHeight: 297, // mm
        width: 85.60 - 2,
        height: 53.98 - 2,
        cols: 2,
        rows: 5,
    },
    "10S31251": {
        width: 85.60 - 2,
        height: 53.98 - 2,
        cols: 2,
        rows: 5,
    }
}

const cardformat = {
    "1S31034-gakuchousenbeiv1": {
        bgimgf: "/cardimage-f-2.png",
        bgimgb: "/cardimage-b-2.png",
        qrpos: {
            x: 10,
            y: 10
        },
        qrsize: {
            width: 26,
            height: 26
        },
        pinpos: {
            x: 10,
            y: 10
        },
        pinsize: {
            width: 26,
            height: 26
        },
        codepos: {
            x: 10,
            y: 10
        },
        codesize: {
            width: 26,
            height: 26
        }
    },
    "10S31251": {
    }
}

export const generatePDF = async (batch: any, format: string) => {


    const codes = batch.codes || [];
    if (codes.length === 0) return;

    // Dynamic import for QRCodeStyling to ensure it runs on client
    const QRCodeStyling = (await import('qr-code-styling')).default;

    const doc = new jsPDF();

    // Background Image
    const bgImgf = new Image();
    const bgImgb = new Image();
    bgImgf.src = '/cardimage-f-2.png';
    bgImgb.src = '/cardimage-b-2.png';
    await new Promise((resolve) => {
        bgImgf.onload = resolve;
        bgImgb.onload = resolve;
    });

    let papertype = ""

    // Layout Settings for A4
    const pageWidth = 210; // mm
    const pageHeight = 297; // mm

    // Card Size
    const cardWidth = 85.60 - 2; // mm
    const cardHeight = 53.98 - 2; // mm

    const cols = 2;
    const rows = 5;

    // Calculate Margins to Center the Grid
    const totalGridWidth = cols * cardWidth;
    const totalGridHeight = rows * cardHeight;
    const marginLeft = (pageWidth - totalGridWidth) / 2;
    const marginTop = (pageHeight - totalGridHeight) / 2;

    const itemsPerPage = cols * rows;

    // Helper to get position
    const getFrontPos = (indexInPage: number) => {
        const row = Math.floor(indexInPage / cols);
        const col = indexInPage % cols;
        return {
            x: marginLeft + col * cardWidth,
            y: marginTop + row * cardHeight
        };
    };

    // Helper for Back Page (Mirrored columns)
    // If col 0 -> print at col 1 pos (so it is behind col 0 when flipped on long edge)
    // If col 1 -> print at col 0 pos
    const getBackPos = (indexInPage: number) => {
        const row = Math.floor(indexInPage / cols);
        const col = indexInPage % cols;
        const mirroredCol = cols - col - 1;
        return {
            x: marginLeft + mirroredCol * cardWidth,
            y: marginTop + row * cardHeight
        };
    };

    for (let i = 0; i < codes.length; i += itemsPerPage) {
        if (i > 0) doc.addPage();
        const pageCodes = codes.slice(i, i + itemsPerPage);

        // FRONT PAGE (QR Codes)
        for (let j = 0; j < pageCodes.length; j++) {
            const code = pageCodes[j];
            const { x, y } = getFrontPos(j);

            // Draw Background Image
            doc.addImage(bgImgf, 'PNG', x, y, cardWidth, cardHeight);

            // Draw Corner Dots (Cut marks)
            doc.setFillColor(0, 0, 0); // Black
            const dotRadius = 0.2; // mm radius

            // Top Left
            doc.circle(x, y, dotRadius, 'F');
            // Top Right
            doc.circle(x + cardWidth, y, dotRadius, 'F');
            // Bottom Left
            doc.circle(x, y + cardHeight, dotRadius, 'F');
            // Bottom Right
            doc.circle(x + cardWidth, y + cardHeight, dotRadius, 'F');

            const base64data = await genQR(code.uuid);
            if (!base64data) continue;

            // Draw QR
            const qrSize = 26; // Slightly smaller to fit better
            // Position QR: Center horizontally, slightly above center vertically or as per design
            // Let's place it somewhat centrally
            doc.addImage(base64data, 'PNG', x + (cardWidth - qrSize) - 3.2, y + cardHeight / 2 - qrSize / 2 + 7.5, qrSize, qrSize);

            doc.setFontSize(12);
            doc.setTextColor(255, 255, 255); // White text assuming dark background, change if needed
            doc.setFont("helvetica", "bold");
            // const textWidth = doc.getTextWidth(`Gift for you !`);
            // doc.text(`Gift for you !`, x + (cardWidth - textWidth) / 2, y + 10);
        }

        doc.addPage(); // Back Page

        // BACK PAGE (PIN Codes)
        for (let j = 0; j < pageCodes.length; j++) {
            const code = pageCodes[j];
            const { x, y } = getBackPos(j);

            // Draw Background Image (Reuse same bg or different back bg?)
            // Assuming same bg for now, typically back has instructions
            doc.addImage(bgImgb, 'PNG', x, y, cardWidth, cardHeight);

            // Draw Corner Dots
            doc.setFillColor(0, 0, 0); // Black
            const dotRadius = 0.5;

            // Top Left
            doc.circle(x, y, dotRadius, 'F');
            // Top Right
            doc.circle(x + cardWidth, y, dotRadius, 'F');
            // Bottom Left
            doc.circle(x, y + cardHeight, dotRadius, 'F');
            // Bottom Right
            doc.circle(x + cardWidth, y + cardHeight, dotRadius, 'F');

            // Draw PIN
            doc.setTextColor(0, 0, 0); // Reset to black or keep white depending on BG
            // Let's make a white box for text readability if bg is complex, or just use white text with shadow
            // Simple approach: White Text
            doc.setTextColor(255, 255, 255);
            doc.setTextColor(0, 0, 0);

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            // const labelWidth = doc.getTextWidth("Security PIN");
            // doc.text("Security PIN", x + (cardWidth - labelWidth) / 2, y + cardHeight / 2 - 8);

            doc.setFontSize(20);
            doc.setFont("helvetica", "bold");
            const pinWidth = doc.getTextWidth(code.pin);
            doc.text(code.pin, x + (cardWidth - pinWidth) / 2 + 10, y + 16);

            doc.setFontSize(5);
            doc.setFont("helvetica", "normal");
            const uuidText = `${code.uuid.substring(0, 16)}...`;
            const uuidWidth = doc.getTextWidth(uuidText);
            doc.text(uuidText, x + (cardWidth - uuidWidth) / 2, y + cardHeight - 1);
        }
    }

    doc.save(`qrcodes-${batch.id}.pdf`);
};