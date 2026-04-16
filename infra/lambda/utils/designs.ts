/**
 * @file designs.ts
 * @role システムプリセットデザイン管理ユーティリティ
 * @responsibility
 *  - フロントエンドで定義された基本デザイン（カードフォーマット）をバックエンド側でも利用可能にします。
 *  - データベースにカスタムデザインが登録されていない場合のデフォルトデザイン情報を提供します。
 * @context
 *  - `frontend/lib/constants/designs.ts` をソースとして参照し、バックエンド・フロントエンド間でのデザイン ID の整合性を保証します。
 *  - ギフト履歴の表示や管理画面等、カード外観情報の Enrichment（補完）プロセスで使用されます。
 */

import { cardformats } from '../../../frontend/lib/constants/designs';

/**
 * システム提供のカードデザインマッピング。
 * フロントエンドの定数から自動抽出され、単一のソース（SSoT）を維持します。
 */
export const SYSTEM_DESIGNS: Record<string, { thumbf: string; thumbb: string; bgimgf: string; bgimgb: string; width?: number; height?: number; }> = Object.fromEntries(
    Object.entries(cardformats).map(([id, cfg]: [string, any]) => [
        id,
        { thumbf: cfg.bgimgf, thumbb: cfg.bgimgb, bgimgf: cfg.bgimgf, bgimgb: cfg.bgimgb, width: cfg.width, height: cfg.height }
    ])
);

/**
 * デザイン ID に基づいてシステムプリセットのデザイン情報を取得します。
 * 
 * @param designId - 取得したいデザインの ID。
 * @returns デザイン情報オブジェクト。システムプリセットに存在しない場合は null を返します。
 */
export function getSystemDesign(designId: string | undefined): { thumbf: string; thumbb: string; bgimgf: string; bgimgb: string; width?: number; height?: number; } | null {
    if (!designId) return null;
    return SYSTEM_DESIGNS[designId] || null;
}
