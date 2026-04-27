/**
 * デザイン関連のユーティリティ関数
 * 
 * カードデザインのアスペクト比の計算や、フロント/バックの画像URLの取得など、
 * デザイン表示に関する共通ロジックを提供します。
 */

import { cardformats } from '@/lib/constants/designs';

/**
 * カードデザインのアスペクト比を計算します。
 * @param designId カードデザインのID。
 * @param allowedDesigns (任意) ショップのカスタムデザインリスト。
 * @param designObj (任意) 幅/高さの詳細を含むオーバーライドデザインオブジェクト。
 * @returns アスペクト比の文字列 (例: "84 / 52")。
 */
export const getDesignAspectRatio = (
  designId: string,
  allowedDesigns?: any[],
  designObj?: any
): string => {
  if (designObj?.width && designObj?.height) {
    return `${designObj.width} / ${designObj.height}`;
  }
  if (designId && Array.isArray(allowedDesigns)) {
    const custom = allowedDesigns.find((d: any) => d.design_id === designId || d.id === designId);
    if (custom?.width && custom?.height) {
      return `${custom.width} / ${custom.height}`;
    }
  }
  if (designId && cardformats[designId]) {
    return `${cardformats[designId].width || 84} / ${cardformats[designId].height || 52}`;
  }
  return '84 / 52';
};

/**
 * カードデザインの表面と裏面の画像URLを取得します。
 * @param designId カードデザインのID。
 * @param allowedDesigns (任意) ショップのカスタムデザインリスト。
 * @param designObj (任意) 画像の詳細を含むオーバーライドデザインオブジェクト。
 * @returns 表面 (`front`) と裏面 (`back`) の画像URL（見つからない場合は undefined）を含むオブジェクト。
 */
export const getDesignImages = (
  designId: string,
  allowedDesigns?: any[],
  designObj?: any
): { front: string | undefined; back: string | undefined } => {
  let f = designObj?.thumbf || designObj?.bgimgf || undefined;
  let b = designObj?.thumbb || designObj?.bgimgb || undefined;

  if (!f && designId && Array.isArray(allowedDesigns)) {
    const custom = allowedDesigns.find((d: any) => d.design_id === designId || d.id === designId);
    if (custom) {
      f = custom.thumbf || custom.bgimgf || undefined;
      b = custom.thumbb || custom.bgimgb || undefined;
    }
  }

  if (!f && designId && cardformats[designId]) {
    f = cardformats[designId].thumbf || cardformats[designId].bgimgf || undefined;
    b = cardformats[designId].thumbb || cardformats[designId].bgimgb || undefined;
  }

  return { front: f, back: b };
};
