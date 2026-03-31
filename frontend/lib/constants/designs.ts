/**
 * 【システムデザインの定義: Source of Truth】
 * このファイルは、システムが標準で提供するカードデザイン (cardformats) と用紙フォーマット (paperformats) の唯一の定義場所です。
 * 
 * 重要:
 * 1. バックエンドのユーティリティ (infra/lambda/utils/designs.ts) がこのファイルを直接参照し、
 *    システムデザインの画像パスを自動的に抽出して、履歴表示や管理画面のサムネイルとして利用します。
 * 2. 新しいシステムデザインを追加する場合、このファイルの `cardformats` に定義を追加するだけで、
 *    フロントエンド（PDF生成等）とバックエンド（サムネイル表示等）の両方に自動的に反映されます。
 */

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
        bgimgf: "/cardimage-f-gakuchousenbeiv1.png",
        bgimgb: "/cardimage-b-gakuchousenbeiv1.png",
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
        bgimgf: "/cardimage-f-gakuchousenbei-henrei.png",
        bgimgb: "/cardimage-b-gakuchousenbeiv1.png",
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
