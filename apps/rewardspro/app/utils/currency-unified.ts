/**
 * Unified Currency System
 *
 * Single source of truth for all currency operations.
 * Imports types from Prisma and extends with metadata.
 */

import type {
  Currency,
  CurrencyDisplayType,
  ShopSettings,
} from '@prisma/client';

// ============================================================================
// TYPE GUARDS & VALIDATION
// ============================================================================

/**
 * Runtime check if string is valid Currency enum value
 */
export function isCurrency(value: string): value is Currency {
  // This list MUST match Prisma enum exactly
  const validCurrencies: readonly Currency[] = [
    'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY',
    'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY',
    'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB',
    'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR'
  ] as const;

  return validCurrencies.includes(value as Currency);
}

/**
 * Safely parse string to Currency, with fallback
 */
export function parseCurrency(value: string, fallback: Currency = 'USD'): Currency {
  const upper = value.toUpperCase();
  return isCurrency(upper) ? (upper as Currency) : fallback;
}

// ============================================================================
// CURRENCY METADATA
// ============================================================================

interface CurrencyMetadata {
  symbol: string;
  decimals: number;
  symbolPosition: 'before' | 'after';
  name: string;
}

/**
 * Currency metadata mapped to Prisma Currency enum
 * This is the ONLY place currency metadata should be defined
 */
export const CURRENCY_METADATA: Record<Currency, CurrencyMetadata> = {
  USD: { symbol: '$', decimals: 2, symbolPosition: 'before', name: 'US Dollar' },
  EUR: { symbol: '€', decimals: 2, symbolPosition: 'before', name: 'Euro' },
  GBP: { symbol: '£', decimals: 2, symbolPosition: 'before', name: 'British Pound' },
  CAD: { symbol: 'C$', decimals: 2, symbolPosition: 'before', name: 'Canadian Dollar' },
  AUD: { symbol: 'A$', decimals: 2, symbolPosition: 'before', name: 'Australian Dollar' },
  JPY: { symbol: '¥', decimals: 0, symbolPosition: 'before', name: 'Japanese Yen' },
  CHF: { symbol: 'CHF', decimals: 2, symbolPosition: 'after', name: 'Swiss Franc' },
  CNY: { symbol: '¥', decimals: 2, symbolPosition: 'before', name: 'Chinese Yuan' },
  SEK: { symbol: 'kr', decimals: 2, symbolPosition: 'after', name: 'Swedish Krona' },
  NZD: { symbol: 'NZ$', decimals: 2, symbolPosition: 'before', name: 'New Zealand Dollar' },
  NOK: { symbol: 'kr', decimals: 2, symbolPosition: 'after', name: 'Norwegian Krone' },
  MXN: { symbol: '$', decimals: 2, symbolPosition: 'before', name: 'Mexican Peso' },
  SGD: { symbol: 'S$', decimals: 2, symbolPosition: 'before', name: 'Singapore Dollar' },
  HKD: { symbol: 'HK$', decimals: 2, symbolPosition: 'before', name: 'Hong Kong Dollar' },
  KRW: { symbol: '₩', decimals: 0, symbolPosition: 'before', name: 'South Korean Won' },
  INR: { symbol: '₹', decimals: 2, symbolPosition: 'before', name: 'Indian Rupee' },
  BRL: { symbol: 'R$', decimals: 2, symbolPosition: 'before', name: 'Brazilian Real' },
  RUB: { symbol: '₽', decimals: 2, symbolPosition: 'after', name: 'Russian Ruble' },
  ZAR: { symbol: 'R', decimals: 2, symbolPosition: 'before', name: 'South African Rand' },
  TRY: { symbol: '₺', decimals: 2, symbolPosition: 'before', name: 'Turkish Lira' },
  AED: { symbol: 'د.إ', decimals: 2, symbolPosition: 'after', name: 'UAE Dirham' },
  PLN: { symbol: 'zł', decimals: 2, symbolPosition: 'after', name: 'Polish Zloty' },
  DKK: { symbol: 'kr', decimals: 2, symbolPosition: 'after', name: 'Danish Krone' },
  THB: { symbol: '฿', decimals: 2, symbolPosition: 'before', name: 'Thai Baht' },
  IDR: { symbol: 'Rp', decimals: 0, symbolPosition: 'before', name: 'Indonesian Rupiah' },
  HUF: { symbol: 'Ft', decimals: 0, symbolPosition: 'after', name: 'Hungarian Forint' },
  CZK: { symbol: 'Kč', decimals: 2, symbolPosition: 'after', name: 'Czech Koruna' },
  ILS: { symbol: '₪', decimals: 2, symbolPosition: 'before', name: 'Israeli Shekel' },
  CLP: { symbol: '$', decimals: 0, symbolPosition: 'before', name: 'Chilean Peso' },
  PHP: { symbol: '₱', decimals: 2, symbolPosition: 'before', name: 'Philippine Peso' },
  RON: { symbol: 'lei', decimals: 2, symbolPosition: 'after', name: 'Romanian Leu' },
  MYR: { symbol: 'RM', decimals: 2, symbolPosition: 'before', name: 'Malaysian Ringgit' },
};

// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

/**
 * Format amount respecting currency's decimal places
 */
export function formatAmount(amount: number, currency: Currency): number {
  const { decimals } = CURRENCY_METADATA[currency];
  const multiplier = Math.pow(10, decimals);
  return Math.round(amount * multiplier) / multiplier;
}

/**
 * Format currency for display
 */
export function formatCurrency(
  amount: number | string,
  currency: Currency,
  displayType: CurrencyDisplayType = 'SYMBOL'
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return displayType === 'SYMBOL'
      ? `${CURRENCY_METADATA[currency].symbol}0`
      : `0 ${currency}`;
  }

  const { symbol, decimals, symbolPosition } = CURRENCY_METADATA[currency];
  const formatted = formatAmount(numAmount, currency).toFixed(decimals);

  if (displayType === 'CODE') {
    return `${formatted} ${currency}`;
  }

  // Symbol display
  return symbolPosition === 'before'
    ? `${symbol}${formatted}`
    : `${formatted} ${symbol}`;
}

/**
 * Format with shop settings
 */
export function formatCurrencyWithSettings(
  amount: number | string,
  settings?: Pick<ShopSettings, 'storeCurrency' | 'currencyDisplayType'> | null
): string {
  const currency = settings?.storeCurrency || 'USD';
  const displayType = settings?.currencyDisplayType || 'SYMBOL';

  return formatCurrency(amount, currency, displayType);
}

/**
 * Use Intl for locale-aware formatting
 */
export function formatCurrencyIntl(
  amount: number,
  currency: Currency,
  locale: string = 'en-US'
): string {
  const { decimals } = CURRENCY_METADATA[currency];

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get all supported currencies for dropdowns
 */
export function getSupportedCurrencies(): Array<{
  value: Currency;
  label: string;
  symbol: string;
}> {
  return (Object.keys(CURRENCY_METADATA) as Currency[]).map(currency => ({
    value: currency,
    label: `${currency} - ${CURRENCY_METADATA[currency].name}`,
    symbol: CURRENCY_METADATA[currency].symbol,
  }));
}

/**
 * Parse currency string to number
 */
export function parseCurrencyAmount(value: string): number {
  // Remove all non-numeric characters except . and -
  const cleaned = value.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Get currency info
 */
export function getCurrencyInfo(currency: Currency): CurrencyMetadata {
  return CURRENCY_METADATA[currency];
}

/**
 * Check if amount needs decimal display
 */
export function hasDecimals(currency: Currency): boolean {
  return CURRENCY_METADATA[currency].decimals > 0;
}

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Migrate string currency to enum
 * Use this when transitioning from string to Currency enum
 */
export function migrateCurrencyField(value: string | null | undefined): Currency {
  if (!value) return 'USD';

  const upper = value.toUpperCase();
  if (isCurrency(upper)) {
    return upper as Currency;
  }

  // Handle common variations
  const mappings: Record<string, Currency> = {
    'US$': 'USD',
    'CA$': 'CAD',
    'AU$': 'AUD',
    'NZ$': 'NZD',
    'HK$': 'HKD',
    'S$': 'SGD',
    'YUAN': 'CNY',
    'POUND': 'GBP',
    'EURO': 'EUR',
  };

  return mappings[upper] || 'USD';
}

/**
 * Validate currency for database operations
 */
export function validateCurrencyForDB(
  value: unknown,
  fieldName: string = 'currency'
): Currency {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  const currency = parseCurrency(value);
  if (!isCurrency(currency)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }

  return currency;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { Currency, CurrencyDisplayType };

// Default export for convenience
export default {
  isCurrency,
  parseCurrency,
  formatCurrency,
  formatAmount,
  formatCurrencyIntl,
  formatCurrencyWithSettings,
  getSupportedCurrencies,
  parseCurrencyAmount,
  getCurrencyInfo,
  hasDecimals,
  migrateCurrencyField,
  validateCurrencyForDB,
  CURRENCY_METADATA,
};
