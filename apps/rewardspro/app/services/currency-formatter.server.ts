/**
 * Currency Formatting Service
 *
 * Handles proper formatting of currency amounts according to ISO 4217 standards.
 * Ensures correct decimal places for each currency.
 */

import type { Currency, CurrencyDisplayType } from '@prisma/client';

// ============================================================================
// ISO 4217 CURRENCY DECIMALS
// ============================================================================

/**
 * ISO 4217 standard decimal places for each currency
 * Most currencies use 2 decimals, some use 0, and a few use 3
 */
export const CURRENCY_DECIMALS: Record<Currency, number> = {
  // Standard 2 decimal currencies
  USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, NZD: 2,
  CHF: 2, SEK: 2, NOK: 2, MXN: 2, SGD: 2, BRL: 2,
  RUB: 2, ZAR: 2, TRY: 2, AED: 2, PLN: 2, THB: 2,
  DKK: 2, CZK: 2, ILS: 2, PHP: 2, RON: 2, MYR: 2,
  INR: 2, CNY: 2, HKD: 2,

  // Zero decimal currencies (no minor units)
  JPY: 0,  // Japanese Yen
  KRW: 0,  // South Korean Won
  IDR: 0,  // Indonesian Rupiah
  HUF: 0,  // Hungarian Forint
  CLP: 0,  // Chilean Peso

  // Note: The following currencies would use 3 decimals if they were in our enum:
  // BHD: 3,  // Bahraini Dinar
  // KWD: 3,  // Kuwaiti Dinar
  // OMR: 3,  // Omani Rial
  // JOD: 3,  // Jordanian Dinar
  // TND: 3,  // Tunisian Dinar
};

// ============================================================================
// CURRENCY SYMBOLS & METADATA
// ============================================================================

export interface CurrencyMetadata {
  symbol: string;
  symbolPosition: 'before' | 'after';
  name: string;
  locale: string;  // Best locale for formatting
}

export const CURRENCY_METADATA: Record<Currency, CurrencyMetadata> = {
  USD: { symbol: '$', symbolPosition: 'before', name: 'US Dollar', locale: 'en-US' },
  EUR: { symbol: '€', symbolPosition: 'before', name: 'Euro', locale: 'de-DE' },
  GBP: { symbol: '£', symbolPosition: 'before', name: 'British Pound', locale: 'en-GB' },
  CAD: { symbol: 'C$', symbolPosition: 'before', name: 'Canadian Dollar', locale: 'en-CA' },
  AUD: { symbol: 'A$', symbolPosition: 'before', name: 'Australian Dollar', locale: 'en-AU' },
  JPY: { symbol: '¥', symbolPosition: 'before', name: 'Japanese Yen', locale: 'ja-JP' },
  CHF: { symbol: 'CHF', symbolPosition: 'after', name: 'Swiss Franc', locale: 'de-CH' },
  CNY: { symbol: '¥', symbolPosition: 'before', name: 'Chinese Yuan', locale: 'zh-CN' },
  SEK: { symbol: 'kr', symbolPosition: 'after', name: 'Swedish Krona', locale: 'sv-SE' },
  NZD: { symbol: 'NZ$', symbolPosition: 'before', name: 'New Zealand Dollar', locale: 'en-NZ' },
  NOK: { symbol: 'kr', symbolPosition: 'after', name: 'Norwegian Krone', locale: 'nb-NO' },
  MXN: { symbol: '$', symbolPosition: 'before', name: 'Mexican Peso', locale: 'es-MX' },
  SGD: { symbol: 'S$', symbolPosition: 'before', name: 'Singapore Dollar', locale: 'en-SG' },
  HKD: { symbol: 'HK$', symbolPosition: 'before', name: 'Hong Kong Dollar', locale: 'zh-HK' },
  KRW: { symbol: '₩', symbolPosition: 'before', name: 'South Korean Won', locale: 'ko-KR' },
  INR: { symbol: '₹', symbolPosition: 'before', name: 'Indian Rupee', locale: 'hi-IN' },
  BRL: { symbol: 'R$', symbolPosition: 'before', name: 'Brazilian Real', locale: 'pt-BR' },
  RUB: { symbol: '₽', symbolPosition: 'after', name: 'Russian Ruble', locale: 'ru-RU' },
  ZAR: { symbol: 'R', symbolPosition: 'before', name: 'South African Rand', locale: 'en-ZA' },
  TRY: { symbol: '₺', symbolPosition: 'before', name: 'Turkish Lira', locale: 'tr-TR' },
  AED: { symbol: 'د.إ', symbolPosition: 'after', name: 'UAE Dirham', locale: 'ar-AE' },
  PLN: { symbol: 'zł', symbolPosition: 'after', name: 'Polish Zloty', locale: 'pl-PL' },
  DKK: { symbol: 'kr', symbolPosition: 'after', name: 'Danish Krone', locale: 'da-DK' },
  THB: { symbol: '฿', symbolPosition: 'before', name: 'Thai Baht', locale: 'th-TH' },
  IDR: { symbol: 'Rp', symbolPosition: 'before', name: 'Indonesian Rupiah', locale: 'id-ID' },
  HUF: { symbol: 'Ft', symbolPosition: 'after', name: 'Hungarian Forint', locale: 'hu-HU' },
  CZK: { symbol: 'Kč', symbolPosition: 'after', name: 'Czech Koruna', locale: 'cs-CZ' },
  ILS: { symbol: '₪', symbolPosition: 'before', name: 'Israeli Shekel', locale: 'he-IL' },
  CLP: { symbol: '$', symbolPosition: 'before', name: 'Chilean Peso', locale: 'es-CL' },
  PHP: { symbol: '₱', symbolPosition: 'before', name: 'Philippine Peso', locale: 'en-PH' },
  RON: { symbol: 'lei', symbolPosition: 'after', name: 'Romanian Leu', locale: 'ro-RO' },
  MYR: { symbol: 'RM', symbolPosition: 'before', name: 'Malaysian Ringgit', locale: 'ms-MY' },
};

// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

/**
 * Round amount to correct decimal places for currency
 */
export function roundToCurrencyPrecision(amount: number, currency: Currency): number {
  const decimals = CURRENCY_DECIMALS[currency];
  const multiplier = Math.pow(10, decimals);
  return Math.round(amount * multiplier) / multiplier;
}

/**
 * Format amount with proper decimal places (no symbol)
 */
export function formatAmountOnly(amount: number, currency: Currency): string {
  const decimals = CURRENCY_DECIMALS[currency];
  return amount.toFixed(decimals);
}

/**
 * Format currency with symbol using custom formatting
 */
export function formatCurrencyWithSymbol(
  amount: number,
  currency: Currency,
  displayType: CurrencyDisplayType = 'SYMBOL'
): string {
  const rounded = roundToCurrencyPrecision(amount, currency);
  const formatted = formatAmountOnly(rounded, currency);
  const metadata = CURRENCY_METADATA[currency];

  if (displayType === 'CODE') {
    return `${formatted} ${currency}`;
  }

  // Symbol display
  if (metadata.symbolPosition === 'before') {
    return `${metadata.symbol}${formatted}`;
  } else {
    return `${formatted} ${metadata.symbol}`;
  }
}

/**
 * Format currency using Intl.NumberFormat for locale-aware formatting
 */
export function formatCurrencyIntl(
  amount: number,
  currency: Currency,
  locale?: string
): string {
  const metadata = CURRENCY_METADATA[currency];
  const decimals = CURRENCY_DECIMALS[currency];
  const useLocale = locale || metadata.locale || 'en-US';

  try {
    return new Intl.NumberFormat(useLocale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch (error) {
    // Fallback to custom formatting if Intl fails
    console.warn(`Intl.NumberFormat failed for ${currency}, using fallback`);
    return formatCurrencyWithSymbol(amount, currency);
  }
}

/**
 * Format currency for display in Shopify admin
 */
export function formatForShopifyAdmin(
  amount: number,
  currency: Currency,
  displayType: CurrencyDisplayType = 'SYMBOL'
): string {
  // Shopify admin typically uses simple formatting
  const rounded = roundToCurrencyPrecision(amount, currency);
  const formatted = formatAmountOnly(rounded, currency);

  if (displayType === 'CODE') {
    return `${formatted} ${currency}`;
  }

  const metadata = CURRENCY_METADATA[currency];

  // Use simple symbol placement
  if (metadata.symbolPosition === 'before') {
    return `${metadata.symbol}${formatted}`;
  } else {
    return `${formatted} ${metadata.symbol}`;
  }
}

/**
 * Parse currency string to number (handles various formats)
 */
export function parseCurrencyString(
  value: string,
  currency?: Currency
): number {
  // Remove currency symbols and spaces
  let cleaned = value.replace(/[^\d.,\-]/g, '');

  // Handle different decimal separators (. vs ,)
  // Assume last separator is decimal point
  const separators = cleaned.match(/[.,]/g);
  if (separators && separators.length > 0) {
    const lastSeparator = separators[separators.length - 1];
    if (lastSeparator === ',') {
      // European format: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  const parsed = parseFloat(cleaned) || 0;

  // If currency provided, round to correct precision
  if (currency) {
    return roundToCurrencyPrecision(parsed, currency);
  }

  return parsed;
}

// ============================================================================
// COMPARISON & VALIDATION
// ============================================================================

/**
 * Compare two amounts in same currency (accounting for precision)
 */
export function compareAmounts(
  amount1: number,
  amount2: number,
  currency: Currency
): -1 | 0 | 1 {
  const rounded1 = roundToCurrencyPrecision(amount1, currency);
  const rounded2 = roundToCurrencyPrecision(amount2, currency);

  // Use epsilon for floating point comparison
  const epsilon = Math.pow(10, -CURRENCY_DECIMALS[currency] - 2);

  if (Math.abs(rounded1 - rounded2) < epsilon) {
    return 0;
  }
  return rounded1 < rounded2 ? -1 : 1;
}

/**
 * Check if amount is zero (accounting for precision)
 */
export function isZeroAmount(amount: number, currency: Currency): boolean {
  const rounded = roundToCurrencyPrecision(amount, currency);
  const epsilon = Math.pow(10, -CURRENCY_DECIMALS[currency] - 2);
  return Math.abs(rounded) < epsilon;
}

/**
 * Validate if amount is valid for currency
 */
export function isValidAmount(
  amount: number,
  currency: Currency,
  options: {
    allowNegative?: boolean;
    allowZero?: boolean;
    maxAmount?: number;
  } = {}
): boolean {
  const { allowNegative = false, allowZero = true, maxAmount } = options;

  if (!Number.isFinite(amount)) {
    return false;
  }

  if (!allowNegative && amount < 0) {
    return false;
  }

  if (!allowZero && isZeroAmount(amount, currency)) {
    return false;
  }

  if (maxAmount !== undefined && amount > maxAmount) {
    return false;
  }

  return true;
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Sum amounts in same currency
 */
export function sumAmounts(amounts: number[], currency: Currency): number {
  const sum = amounts.reduce((total, amount) => total + amount, 0);
  return roundToCurrencyPrecision(sum, currency);
}

/**
 * Calculate average of amounts
 */
export function averageAmounts(amounts: number[], currency: Currency): number {
  if (amounts.length === 0) return 0;
  const sum = sumAmounts(amounts, currency);
  return roundToCurrencyPrecision(sum / amounts.length, currency);
}

/**
 * Find min/max amounts
 */
export function minMaxAmounts(
  amounts: number[],
  currency: Currency
): { min: number; max: number } {
  if (amounts.length === 0) {
    return { min: 0, max: 0 };
  }

  const rounded = amounts.map(a => roundToCurrencyPrecision(a, currency));
  return {
    min: Math.min(...rounded),
    max: Math.max(...rounded),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Constants
  CURRENCY_DECIMALS,
  CURRENCY_METADATA,

  // Formatting
  roundToCurrencyPrecision,
  formatAmountOnly,
  formatCurrencyWithSymbol,
  formatCurrencyIntl,
  formatForShopifyAdmin,
  parseCurrencyString,

  // Comparison
  compareAmounts,
  isZeroAmount,
  isValidAmount,

  // Bulk operations
  sumAmounts,
  averageAmounts,
  minMaxAmounts,
};