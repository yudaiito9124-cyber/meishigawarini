/**
 * @file generateAddressPDF.ts
 * @role ショップ管理用：送り状（配送ラベル）PDF 生成ユーティリティ
 * @responsibility
 *  - ショップ設定に基づき、受注情報から配送ラベル（郵便・宅急便）の PDF を生成します。
 *  - 【精密レイアウト】ミリ単位での位置調整、フォントサイズ、アライメントに対応し、市販のラベル用紙への印字を可能にします。
 *  - 【日本語フォント対応】jsPDF へのカスタムフォント（Noto Sans JP）の動的登録を行い、文字化けを防ぎます。
 * @context
 *  - ショップ管理画面の受注一覧から、複数の注文を選択して一括でラベルを印刷する際に使用されます。
 */

import { jsPDF } from "jspdf";
import { ShippingLabelConfig, TextPos } from "@shared/api-types";


export async function generateAddressPDF(
    orders: any[],
    shop: {
        name: string;
        shop_postal_code?: string;
        shop_address?: string;
        shop_phone?: string;
        shop_recipient_name?: string;
    },
    config: ShippingLabelConfig,
    filename: string = "shippinglabels.pdf",
    fonts?: { [key: string]: string } // 日本語フォントデータ (Base64) - { 'normal': '...', 'bold': '...' }
) {
    const { paper, layout, labelWidth, labelHeight } = config;
    const doc = new jsPDF({
        orientation: paper.pageWidth > paper.pageHeight ? "landscape" : "portrait",
        unit: "mm",
        format: [paper.pageWidth, paper.pageHeight],
    });

    // 日本語フォントの追加と設定
    let fontName = "NotoSansJP";
    let isFontLoaded = false;

    if (fonts && (fonts.normal || fonts.bold)) {
        try {
            const normalData = fonts.normal || fonts.bold;
            const boldData = fonts.bold || fonts.normal;

            if (normalData) {
                doc.addFileToVFS("NotoSansJP-Regular.ttf", normalData);
                doc.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "");

                // 正常に登録された場合のみデフォルトフォントとして設定
                doc.setFont("NotoSansJP", "");
                isFontLoaded = true;
            }

            if (boldData) {
                doc.addFileToVFS("NotoSansJP-Bold.ttf", boldData);
                doc.addFont("NotoSansJP-Bold.ttf", "NotoSansJP", "bold");
            }

            if (isFontLoaded) {
                console.log("PDF: NotoSansJP successfully registered.");
            }
        } catch (e) {
            console.error("PDF: Failed to register NotoSansJP, falling back to helvetica", e);
            isFontLoaded = false;
        }
    }

    if (!isFontLoaded) {
        console.warn("PDF: No custom fonts provided or registration failed, using helvetica.");
        fontName = "helvetica";
        doc.setFont(fontName);
    }

    const itemsPerPage = paper.cols * paper.rows;

    // 1件あたりのサイズ計算
    const cellWidth = labelWidth || (paper.pageWidth - (paper.offset_x * 2) - (paper.cols_gap * (paper.cols - 1))) / paper.cols;
    const cellHeight = labelHeight || (paper.pageHeight - (paper.offset_y * 2) - (paper.rows_gap * (paper.rows - 1))) / paper.rows;

    for (let i = 0; i < orders.length; i++) {
        if (i > 0 && i % itemsPerPage === 0) {
            doc.addPage();
            doc.setFont(fontName, ""); // ページごとにフォントを再設定
        }

        const order = orders[i];
        const pageIdx = i % itemsPerPage;
        const col = pageIdx % paper.cols;
        const row = Math.floor(pageIdx / paper.cols);

        // 列間・行間の隙間を考慮した開始位置
        const startX = paper.offset_x + col * (cellWidth + paper.cols_gap);
        const startY = paper.offset_y + row * (cellHeight + paper.rows_gap);

        // 描画ヘルパー
        const drawText = (text: string | undefined, pos: TextPos | undefined) => {
            if (!text || !pos || pos.enabled === false) return;
            doc.setFontSize(pos.fontSize);
            doc.setFont(fontName, pos.fontWeight === 'bold' ? "bold" : "");

            let x = startX + pos.x;
            if (pos.align === 'center') x += cellWidth / 2;
            else if (pos.align === 'right') x = startX + cellWidth - pos.x;

            if (pos.maxWidth) {
                const lines = doc.splitTextToSize(text, pos.maxWidth);
                doc.text(lines, x, startY + pos.y, {
                    align: pos.align || 'left',
                    baseline: 'top'
                });
            } else {
                doc.text(text, x, startY + pos.y, {
                    align: pos.align || 'left',
                    baseline: 'top'
                });
            }
        };

        const formatZipCode = (zip: string | undefined) => {
            if (!zip) return "";
            const clean = zip.replace(/[^\d]/g, "");
            if (clean.length === 7) {
                return `${clean.substring(0, 3)}-${clean.substring(3)}`;
            }
            return zip;
        };

        // お届け先情報
        drawText(`〒${formatZipCode(order.postal_code)}`, layout.recipientZipPos);
        drawText(order.address, layout.recipientAddressPos);
        drawText(`${order.recipient_name || ""} 様`, layout.recipientNamePos);
        drawText(order.shipping_info?.phone, layout.recipientPhonePos);

        // ご依頼主情報 (ショップ情報)
        drawText(`〒${formatZipCode(shop.shop_postal_code)}`, layout.senderZipPos);
        drawText(shop.shop_address, layout.senderAddressPos);
        drawText(shop.shop_recipient_name || shop.name, layout.senderNamePos);
        drawText(shop.shop_phone, layout.senderPhonePos);

        // その他情報
        drawText(`注文ID: ${order.qr_id?.replace('QR#', '') || order.id || ""}`, layout.orderIdPos);
        drawText(`内容品: ${order.product_name ? order.product_name : ''}`, layout.productNamePos);

        if (layout.preferredDatePos) {
            drawText(`希望日: ${order.preferred_date || "指定なし"}`, layout.preferredDatePos);
        }
        if (layout.preferredTimePos) {
            drawText(`時間帯: ${order.preferred_time || "指定なし"}`, layout.preferredTimePos);
        }
    }

    doc.save(filename);
}
