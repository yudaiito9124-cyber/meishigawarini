/**
 * 【システムデザインのマッピング管理】
 * このファイルは、フロントエンドの定数ファイル (frontend/lib/constants/designs.ts) をインポートして、
 * システムデザインの画像パスを自動的に抽出します。
 * 
 * 役割:
 * - データベース (DynamoDB) に `CARD_DESIGN#METADATA` レコードが存在しない「システムデザイン」について、
 *   APIレスポンス（ギフト履歴や管理画面のサムネイル表示等）として提供する画像パスを管理します。
 * 
 * ポイント:
 * 新しいデザインの追加や変更は `frontend/lib/constants/designs.ts` で行うだけで、
 * ここでの個別の更新は不要です。
 */

import { cardformats } from '../../../frontend/lib/constants/designs';

/**
 * System-provided card designs mapping.
 * Automatically extracted from the frontend constants to ensure a single source of truth.
 */
export const SYSTEM_DESIGNS: Record<string, { thumbf: string; thumbb: string; bgimgf: string }> = Object.fromEntries(
    Object.entries(cardformats).map(([id, cfg]: [string, any]) => [
        id,
        { thumbf: cfg.bgimgf, thumbb: cfg.bgimgb, bgimgf: cfg.bgimgf }
    ])
);

/**
 * Returns the system design if it exists, otherwise null.
 */
export function getSystemDesign(designId: string | undefined): { thumbf: string; thumbb: string; bgimgf: string } | null {
    if (!designId) return null;
    return SYSTEM_DESIGNS[designId] || null;
}
