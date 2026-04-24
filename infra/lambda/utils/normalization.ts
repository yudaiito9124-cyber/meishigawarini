/**
 * @file normalization.ts
 * @role 入力データの正規化ユーティリティ
 */

/**
 * 郵便番号を XXX-XXXX 形式に正規化します。
 * 7桁の数字のみの場合、ハイフンを挿入します。
 */
export function normalizeZipCode(zip: string | undefined): string | undefined {
    if (!zip) return zip;
    
    // 全角数字を半角に変換し、数字とハイフン以外を除去
    let normalized = zip
        .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/[^0-9-]/g, '');

    const digitsOnly = normalized.replace(/-/g, '');
    
    if (digitsOnly.length === 7) {
        return digitsOnly.slice(0, 3) + '-' + digitsOnly.slice(3);
    }
    
    return normalized;
}

/**
 * 電話番号からハイフンを除去し、数字のみにします（必要に応じて）。
 * または、特定のフォーマットに統一します。
 * 現状は郵便番号のみ実装。
 */
