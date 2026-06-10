/**
 * Currency Types and Utilities
 *
 * This file imports types directly from Prisma to maintain a single source of truth.
 * All currency-related types should be defined in prisma/schema.prisma and imported here.
 */

import type { Currency, CurrencyDisplayType } from '@prisma/client';

// Re-export Prisma types for convenience
export type { Currency, CurrencyDisplayType };

// Currency metadata that extends Prisma enum
export const CURRENCY_CONFIG: Record<Currency, {
  symbol: string;
  decimals: number;
  symbolPosition: 'before' | 'after';
  thousandsSeparator: string;
  decimalSeparator: string;
  locale: string;
}> = {
  USD: {
    symbol: '$',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'en-US'
  },
  EUR: {
    symbol: '€',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: '.',
    decimalSeparator: ',',
    locale: 'de-DE'
  },
  GBP: {
    symbol: '£',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'en-GB'
  },
  CAD: {
    symbol: 'C$',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'en-CA'
  },
  AUD: {
    symbol: 'A$',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'en-AU'
  },
  JPY: {
    symbol: '¥',
    decimals: 0, // No decimals for Yen
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'ja-JP'
  },
  CHF: {
    symbol: 'CHF',
    decimals: 2,
    symbolPosition: 'after',
    thousandsSeparator: "'",
    decimalSeparator: '.',
    locale: 'de-CH'
  },
  CNY: {
    symbol: '¥',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'zh-CN'
  },
  SEK: {
    symbol: 'kr',
    decimals: 2,
    symbolPosition: 'after',
    thousandsSeparator: ' ',
    decimalSeparator: ',',
    locale: 'sv-SE'
  },
  NZD: {
    symbol: 'NZ$',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'en-NZ'
  },
  NOK: {
    symbol: 'kr',
    decimals: 2,
    symbolPosition: 'after',
    thousandsSeparator: ' ',
    decimalSeparator: ',',
    locale: 'nb-NO'
  },
  MXN: {
    symbol: '$',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'es-MX'
  },
  SGD: {
    symbol: 'S$',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'en-SG'
  },
  HKD: {
    symbol: 'HK$',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'zh-HK'
  },
  KRW: {
    symbol: '₩',
    decimals: 0, // No decimals for Won
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'ko-KR'
  },
  INR: {
    symbol: '₹',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'hi-IN'
  },
  BRL: {
    symbol: 'R$',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: '.',
    decimalSeparator: ',',
    locale: 'pt-BR'
  },
  RUB: {
    symbol: '₽',
    decimals: 2,
    symbolPosition: 'after',
    thousandsSeparator: ' ',
    decimalSeparator: ',',
    locale: 'ru-RU'
  },
  ZAR: {
    symbol: 'R',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ' ',
    decimalSeparator: '.',
    locale: 'en-ZA'
  },
  TRY: {
    symbol: '₺',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: '.',
    decimalSeparator: ',',
    locale: 'tr-TR'
  },
  AED: {
    symbol: 'د.إ',
    decimals: 2,
    symbolPosition: 'after',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'ar-AE'
  },
  PLN: {
    symbol: 'zł',
    decimals: 2,
    symbolPosition: 'after',
    thousandsSeparator: ' ',
    decimalSeparator: ',',
    locale: 'pl-PL'
  },
  THB: {
    symbol: '฿',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'th-TH'
  },
  DKK: {
    symbol: 'kr',
    decimals: 2,
    symbolPosition: 'after',
    thousandsSeparator: '.',
    decimalSeparator: ',',
    locale: 'da-DK'
  },
  HUF: {
    symbol: 'Ft',
    decimals: 0, // No decimals for Forint
    symbolPosition: 'after',
    thousandsSeparator: ' ',
    decimalSeparator: ',',
    locale: 'hu-HU'
  },
  CZK: {
    symbol: 'Kč',
    decimals: 2,
    symbolPosition: 'after',
    thousandsSeparator: ' ',
    decimalSeparator: ',',
    locale: 'cs-CZ'
  },
  ILS: {
    symbol: '₪',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'he-IL'
  },
  CLP: {
    symbol: '$',
    decimals: 0, // No decimals for Chilean Peso
    symbolPosition: 'before',
    thousandsSeparator: '.',
    decimalSeparator: ',',
    locale: 'es-CL'
  },
  PHP: {
    symbol: '₱',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'en-PH'
  },
  RON: {
    symbol: 'lei',
    decimals: 2,
    symbolPosition: 'after',
    thousandsSeparator: '.',
    decimalSeparator: ',',
    locale: 'ro-RO'
  },
  MYR: {
    symbol: 'RM',
    decimals: 2,
    symbolPosition: 'before',
    thousandsSeparator: ',',
    decimalSeparator: '.',
    locale: 'ms-MY'
  },
  IDR: {
    symbol: 'Rp',
    decimals: 0, // No decimals for Rupiah
    symbolPosition: 'before',
    thousandsSeparator: '.',
    decimalSeparator: ',',
    locale: 'id-ID'
  }
};

/**
 * Type guard to check if a string is a valid Currency
 */
export function isCurrency(value: string): value is Currency {
  return value in CURRENCY_CONFIG;
}

/**
 * Safely convert string to Currency enum
 */
export function toCurrency(value: string): Currency | null {
  if (isCurrency(value)) {
    return value as Currency;
  }
  return null;
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: Currency): string {
  return CURRENCY_CONFIG[currency].symbol;
}

/**
 * Get currency decimals
 */
export function getCurrencyDecimals(currency: Currency): number {
  return CURRENCY_CONFIG[currency].decimals;
}

/**
 * Get all supported currencies
 */
export function getSupportedCurrencies(): Currency[] {
  return Object.keys(CURRENCY_CONFIG) as Currency[];
}

/**
 * Validate and sanitize currency string
 */
export function validateCurrency(currency: string, fallback: Currency = 'USD'): Currency {
  const validated = toCurrency(currency.toUpperCase());
  return validated ?? fallback;
}

/**
 * Format amount with proper decimals for currency
 */
export function formatAmountForCurrency(amount: number, currency: Currency): number {
  const decimals = getCurrencyDecimals(currency);
  const multiplier = Math.pow(10, decimals);
  return Math.round(amount * multiplier) / multiplier;
}

/**
 * Format currency using Intl.NumberFormat with proper locale
 */
export function formatCurrencyWithLocale(
  amount: number,
  currency: Currency,
  displayType: CurrencyDisplayType = 'SYMBOL'
): string {
  const config = CURRENCY_CONFIG[currency];
  const formatted = new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  }).format(amount);

  // If CODE display type requested, replace symbol with code
  if (displayType === 'CODE') {
    // For most currencies, Intl formats as "symbol amount"
    // We want to show "amount CODE" instead
    const numberOnly = new Intl.NumberFormat(config.locale, {
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(amount);
    return `${numberOnly} ${currency}`;
  }

  return formatted;
}

/**
 * Parse currency string to number, handling different formats
 */
export function parseCurrencyAmount(value: string, currency: Currency): number {
  const config = CURRENCY_CONFIG[currency];

  // Remove currency symbol and spaces
  let cleaned = value.replace(new RegExp(`[${config.symbol}\\s]`, 'g'), '');

  // Handle different decimal separators
  if (config.decimalSeparator === ',') {
    // European format: 1.234,56 -> 1234.56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // US/UK format: 1,234.56 -> 1234.56
    cleaned = cleaned.replace(/,/g, '');
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Currency conversion rate interface
 */
export interface CurrencyRate {
  from: Currency;
  to: Currency;
  rate: number;
  timestamp: Date;
}

/**
 * Check if we need to fetch new exchange rates (older than 24 hours)
 */
export function isRateStale(timestamp: Date): boolean {
  const hoursSinceUpdate = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60);
  return hoursSinceUpdate > 24;
}