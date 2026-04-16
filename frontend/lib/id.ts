/**
 * ファイル概要: 統合 ID 生成ユーティリティ (Unified ID Generator)
 * 
 * 役割:
 * システム全体で使用される、時系列情報を含む一意の ID を生成します。
 * 主に注文 ID (Order ID) やログ識別子など、生成順序が重要かつ
 * 重複が許されないエンティティの識別に使用されます。
 * 
 * 仕様:
 * `YYYYMMDDHHMMSS` (UTC) + 3文字のランダム文字列 + UUID という形式で生成されます。
 * これにより、文字列比較だけでおおよその生成順序を維持しつつ、
 * 高い衝突耐性を確保しています。
 */

/**
 * 統合 ID を生成します。
 * 形式: [YYYYMMDDHHMMSS][abc]-[UUID]
 * タイムスタンプは UTC 基準です。
 * 
 * @returns 生成されたユニークな ID 文字列
 */
export function generateId(): string {
    const now = new Date();

    /** 2桁のゼロパディング用内部関数 */
    const pad = (n: number) => n.toString().padStart(2, '0');

    // UTC タイムスタンプ部分の構築
    const y = now.getUTCFullYear();
    const m = pad(now.getUTCMonth() + 1);
    const d = pad(now.getUTCDate());
    const h = pad(now.getUTCHours());
    const min = pad(now.getUTCMinutes());
    const s = pad(now.getUTCSeconds());

    /** 
     * 秒単位で重複する可能性を極小化するため、
     * 3文字の英小文字ランダム文字列をタイムスタンプの末尾に付加 
     */
    const randomStr = [...Array(3)]
        .map(() => String.fromCharCode(Math.floor(Math.random() * 26) + 97))
        .join('')
    const timestamp = `${y}${m}${d}${h}${min}${s}${randomStr}`;

    /** 
     * UUID 部分の生成
     * ブラウザの crypto.randomUUID が使用可能な場合はそれを使用、
     * 未対応の古いブラウザではフォールバックロジックを使用します。
     */
    let uuid = '';
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        uuid = crypto.randomUUID();
    } else {
        // セキュアコンテキスト外や古いブラウザ向けのフォールバック
        uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // 両者をハイフンで結合して返す
    return `${timestamp}-${uuid}`;
}

