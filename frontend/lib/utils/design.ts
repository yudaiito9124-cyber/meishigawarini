import { cardformats } from '@/lib/constants/designs';

/**
 * Calculates the aspect ratio for a card design.
 * @param designId The ID of the card design.
 * @param allowedDesigns (Optional) A list of custom designs from the shop.
 * @param designObj (Optional) An override design object with width/height details.
 * @returns An aspect ratio string (e.g., "84 / 52").
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
 * Retrieves the front and back image URLs for a card design.
 * @param designId The ID of the card design.
 * @param allowedDesigns (Optional) A list of custom designs from the shop.
 * @param designObj (Optional) An override design object with image details.
 * @returns An object with `front` and `back` image URLs.
 */
export const getDesignImages = (
  designId: string,
  allowedDesigns?: any[],
  designObj?: any
): { front: string; back: string } => {
  let f = designObj?.thumbf || designObj?.bgimgf || '';
  let b = designObj?.thumbb || designObj?.bgimgb || '';

  if (!f && designId && Array.isArray(allowedDesigns)) {
    const custom = allowedDesigns.find((d: any) => d.design_id === designId || d.id === designId);
    if (custom) {
      f = custom.thumbf || custom.bgimgf || '';
      b = custom.thumbb || custom.bgimgb || '';
    }
  }

  if (!f && designId && cardformats[designId]) {
    f = cardformats[designId].thumbf || cardformats[designId].bgimgf || '';
    b = cardformats[designId].thumbb || cardformats[designId].bgimgb || '';
  }

  return { front: f, back: b };
};
