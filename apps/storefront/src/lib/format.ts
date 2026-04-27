/**
 * Format a GBP price with proper £ symbol, leading zero, and comma separators.
 * Examples: 0.57 → "£0.57", 1234.5 → "£1,234.50"
 */
export function formatPrice(price: number): string {
  return "£" + price.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
