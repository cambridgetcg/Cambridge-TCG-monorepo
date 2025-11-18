import type { Currency, CurrencyDisplayType } from "@prisma/client";

/**
 * Currency formatting utilities
 * 
 * For color coding financial values (positive/negative amounts, gains/losses):
 * @see /docs/04-ui-components/color-design-guide.md#ui-implementation-strategies
 * 
 * Color recommendations:
 * - Positive amounts/gains: Green (#00AA00)
 * - Negative amounts/losses: Red (#CC0000)
 * - Neutral amounts: Default text color
 */

// Currency symbols mapping
const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "C$",
  AUD: "A$",
  JPY: "¥",
  CHF: "CHF",
  CNY: "¥",
  SEK: "kr",
  NZD: "NZ$",
  NOK: "kr",
  MXN: "$",
  SGD: "S$",
  HKD: "HK$",
  KRW: "₩",
  INR: "₹",
  BRL: "R$",
  RUB: "₽",
  ZAR: "R",
  TRY: "₺",
  AED: "د.إ",
  PLN: "zł",
  THB: "฿",
  DKK: "kr",
  HUF: "Ft",
  CZK: "Kč",
  ILS: "₪",
  CLP: "$",
  PHP: "₱",
  RON: "lei",
  MYR: "RM",
  IDR: "Rp",
};

// Currency decimal places
const CURRENCY_DECIMALS: Record<Currency, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  JPY: 0, // Japanese Yen has no decimal places
  CHF: 2,
  CNY: 2,
  SEK: 2,
  NZD: 2,
  NOK: 2,
  MXN: 2,
  SGD: 2,
  HKD: 2,
  KRW: 0, // Korean Won has no decimal places
  INR: 2,
  BRL: 2,
  RUB: 2,
  ZAR: 2,
  TRY: 2,
  AED: 2,
  PLN: 2,
  THB: 2,
  DKK: 2,
  HUF: 0, // Hungarian Forint typically shown without decimals
  CZK: 2,
  ILS: 2,
  CLP: 0, // Chilean Peso has no decimal places
  PHP: 2,
  RON: 2,
  MYR: 2,
  IDR: 0, // Indonesian Rupiah has no decimal places
};

export interface ShopSettings {
  storeCurrency: Currency;
  currencyDisplayType: CurrencyDisplayType;
}

/**
 * Format a monetary amount according to shop settings
 */
export function formatCurrency(
  amount: number | string,
  settings?: ShopSettings | null
): string {
  // Default settings if none provided
  const currency = settings?.storeCurrency || "USD";
  const displayType = settings?.currencyDisplayType || "SYMBOL";

  // Handle null/undefined amounts
  if (amount === null || amount === undefined) {
    return displayType === "SYMBOL" ? `${CURRENCY_SYMBOLS[currency]}0` : `0 ${currency}`;
  }

  // Convert to number if string
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  // Handle invalid amounts
  if (isNaN(numAmount)) {
    return displayType === "SYMBOL" ? `${CURRENCY_SYMBOLS[currency]}0` : `0 ${currency}`;
  }
  
  // Get decimal places for currency
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  
  // Format the number
  const formatted = numAmount.toFixed(decimals);
  
  // Return based on display type
  if (displayType === "SYMBOL") {
    const symbol = CURRENCY_SYMBOLS[currency] || "$";
    // Some currencies put symbol after (e.g., Swedish krona)
    if (["SEK", "NOK", "DKK", "CZK", "PLN"].includes(currency)) {
      return `${formatted} ${symbol}`;
    }
    return `${symbol}${formatted}`;
  } else {
    // CODE display type
    return `${formatted} ${currency}`;
  }
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: Currency): string {
  return CURRENCY_SYMBOLS[currency] || "$";
}

/**
 * Parse a currency string back to number
 */
export function parseCurrency(value: string): number {
  // Remove all non-numeric characters except . and -
  const cleaned = value.replace(/[^0-9.-]/g, "");
  return parseFloat(cleaned) || 0;
}

/**
 * Round amount to currency precision
 */
export function roundToCurrencyPrecision(amount: number, currency: Currency): number {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const multiplier = Math.pow(10, decimals);
  return Math.round(amount * multiplier) / multiplier;
}

/**
 * Convert currency using exchange rate
 */
export function convertCurrency(amount: number, rate: number): number {
  if (rate <= 0) {
    throw new Error('Exchange rate must be positive');
  }
  return amount * rate;
}

/**
 * Calculate cashback amount
 */
export function calculateCashback(amount: number, percentage: number): number {
  if (percentage < 0 || percentage > 100) {
    throw new Error('Cashback percentage must be between 0 and 100');
  }
  return Math.floor((amount * percentage / 100) * 100) / 100; // Round down to cents
}

/**
 * Format with locale-specific thousands separators
 */
export function formatCurrencyWithLocale(
  amount: number | string,
  settings?: ShopSettings | null,
  locale?: string
): string {
  const currency = settings?.storeCurrency || "USD";
  const displayType = settings?.currencyDisplayType || "SYMBOL";
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return displayType === "SYMBOL" ? `${CURRENCY_SYMBOLS[currency]}0` : `0 ${currency}`;
  }
  
  // Use Intl.NumberFormat for locale-specific formatting
  const formatter = new Intl.NumberFormat(locale || "en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: CURRENCY_DECIMALS[currency] ?? 2,
    maximumFractionDigits: CURRENCY_DECIMALS[currency] ?? 2,
  });
  
  const formatted = formatter.format(numAmount);
  
  // If CODE display type requested, replace symbol with code
  if (displayType === "CODE") {
    // Try to replace the symbol with the code
    const symbol = CURRENCY_SYMBOLS[currency];
    if (symbol && formatted.includes(symbol)) {
      return formatted.replace(symbol, currency + " ");
    }
    // Fallback: just append the code
    return `${numAmount.toFixed(CURRENCY_DECIMALS[currency] ?? 2)} ${currency}`;
  }
  
  return formatted;
}

/**
 * Get all supported currencies for dropdown
 */
export function getSupportedCurrencies(): Array<{ label: string; value: Currency }> {
  return Object.keys(CURRENCY_SYMBOLS).map((code) => ({
    label: `${code} - ${CURRENCY_SYMBOLS[code as Currency]}`,
    value: code as Currency,
  }));
}