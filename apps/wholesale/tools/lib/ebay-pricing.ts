// eBay pricing — applies markup to wholesale GBP price

export const EBAY_MARKUP = 0.22;
export const EBAY_ITEM_FEE = 0.30;

/** (Wholesale GBP × 1.22) + £0.30 item fee, rounded up to nearest £0.10 */
export function calculateEbayPrice(wholesalePriceGbp: number): number {
  return Math.ceil((wholesalePriceGbp * (1 + EBAY_MARKUP) + EBAY_ITEM_FEE) * 10) / 10;
}
