/**
 * Currency Validation Service
 *
 * Validates incoming currency codes from Shopify and other sources.
 * Tracks unsupported currencies for future consideration.
 */

import type { Currency } from '@prisma/client';
import db from '~/db.server';
import { z } from 'zod';

// ============================================================================
// CONFIGURATION
// ============================================================================

// List of valid currencies (must match Prisma enum exactly)
const VALID_CURRENCIES = new Set<Currency>([
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY',
  'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY',
  'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB',
  'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR'
]);

// Common currency code mappings
const CURRENCY_MAPPINGS: Record<string, Currency> = {
  'US$': 'USD',
  'CA$': 'CAD',
  'AU$': 'AUD',
  'NZ$': 'NZD',
  'HK$': 'HKD',
  'S$': 'SGD',
  'YUAN': 'CNY',
  'POUND': 'GBP',
  'EURO': 'EUR',
  'YEN': 'JPY',
  'WON': 'KRW',
  'RUPEE': 'INR',
  'REAL': 'BRL',
  'RAND': 'ZAR',
  'PESO': 'MXN', // Default peso to MXN
  'DOLLAR': 'USD', // Default dollar to USD
  'KRONA': 'SEK', // Default krona to SEK
  'KRONE': 'NOK', // Default krone to NOK
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Zod schema for currency validation
 */
export const currencySchema = z.string().transform((val, ctx) => {
  const validated = validateCurrency(val);
  if (!validated.isValid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid currency: ${val}`,
    });
    return z.NEVER;
  }
  return validated.currency;
});

/**
 * Order currency validation schema
 */
export const orderCurrencySchema = z.object({
  currency: currencySchema,
  totalPrice: z.number().positive(),
  financialStatus: z.string().optional(),
});

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  currency: Currency;
  originalValue: string;
  warning?: string;
}

/**
 * Validate and normalize a currency code
 */
export function validateCurrency(
  value: string | null | undefined,
  fallback: Currency = 'USD'
): ValidationResult {
  // Handle empty values
  if (!value) {
    return {
      isValid: false,
      currency: fallback,
      originalValue: value || '',
      warning: 'Currency value was empty, using fallback',
    };
  }

  const upper = value.toUpperCase().trim();

  // Check if it's a valid Currency enum value
  if (VALID_CURRENCIES.has(upper as Currency)) {
    return {
      isValid: true,
      currency: upper as Currency,
      originalValue: value,
    };
  }

  // Check mappings for common variations
  const mapped = CURRENCY_MAPPINGS[upper];
  if (mapped) {
    return {
      isValid: true,
      currency: mapped,
      originalValue: value,
      warning: `Mapped "${value}" to ${mapped}`,
    };
  }

  // Currency not supported - log for future consideration
  logUnsupportedCurrency(value).catch(console.error);

  return {
    isValid: false,
    currency: fallback,
    originalValue: value,
    warning: `Unsupported currency "${value}", using ${fallback}`,
  };
}

/**
 * Validate currency for database operations (throws on invalid)
 */
export function validateCurrencyStrict(
  value: unknown,
  fieldName: string = 'currency'
): Currency {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string, got ${typeof value}`);
  }

  const validation = validateCurrency(value);
  if (!validation.isValid) {
    throw new Error(
      `Invalid ${fieldName}: "${value}" is not a supported currency. ` +
      `Supported currencies: ${Array.from(VALID_CURRENCIES).join(', ')}`
    );
  }

  return validation.currency;
}

/**
 * Batch validate multiple currencies
 */
export function validateCurrencies(
  values: Array<string | null | undefined>
): Array<ValidationResult> {
  return values.map(value => validateCurrency(value));
}

// ============================================================================
// TRACKING FUNCTIONS
// ============================================================================

/**
 * Log unsupported currency for future consideration
 */
async function logUnsupportedCurrency(code: string): Promise<void> {
  try {
    // Check if we have a DeadLetterQueue table for tracking
    // This could also be stored in SystemAlert or a dedicated table
    await (db as any).$executeRawUnsafe(
      `INSERT INTO "DeadLetterQueue" (id, type, payload, error, "createdAt")
       VALUES (gen_random_uuid(), 'UNSUPPORTED_CURRENCY', $1::jsonb, $2, CURRENT_TIMESTAMP)
       ON CONFLICT DO NOTHING`,
      JSON.stringify({ currencyCode: code, timestamp: new Date() }),
      `Unsupported currency: ${code}`
    );

    console.warn(`[Currency] Unsupported currency tracked: ${code}`);
  } catch (error) {
    // Don't fail the main operation if logging fails
    console.error('[Currency] Failed to log unsupported currency:', error);
  }
}

/**
 * Get statistics on unsupported currencies
 */
export async function getUnsupportedCurrencyStats(): Promise<Array<{
  code: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}>> {
  try {
    const stats: Array<{
      code: string;
      count: bigint;
      first_seen: Date;
      last_seen: Date;
    }> = await (db as any).$queryRawUnsafe(
      `SELECT
        payload->>'currencyCode' as code,
        COUNT(*) as count,
        MIN("createdAt") as first_seen,
        MAX("createdAt") as last_seen
       FROM "DeadLetterQueue"
       WHERE type = 'UNSUPPORTED_CURRENCY'
       GROUP BY payload->>'currencyCode'
       ORDER BY count DESC`
    );

    return stats.map((row: any) => ({
      code: row.code,
      count: Number(row.count),
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
    }));
  } catch (error) {
    console.error('[Currency] Failed to get unsupported currency stats:', error);
    return [];
  }
}

// ============================================================================
// SHOPIFY INTEGRATION
// ============================================================================

/**
 * Validate Shopify order currency
 */
export function validateShopifyOrderCurrency(order: any): Currency {
  const currencyCode = order.currency || order.presentment_currency;

  if (!currencyCode) {
    console.warn('[Currency] Shopify order missing currency, using USD');
    return 'USD';
  }

  const validation = validateCurrency(currencyCode);

  if (validation.warning) {
    console.warn(`[Currency] ${validation.warning} for order ${order.id}`);
  }

  return validation.currency;
}

/**
 * Validate Shopify customer currency preference
 */
export function validateCustomerCurrency(customer: any): Currency {
  // Shopify customers don't have a direct currency field
  // But we might store preferences in metafields or tags
  const metafieldCurrency = customer.metafields?.find(
    (mf: any) => mf.key === 'preferred_currency'
  )?.value;

  if (metafieldCurrency) {
    const validation = validateCurrency(metafieldCurrency);
    if (validation.isValid) {
      return validation.currency;
    }
  }

  // Default to USD if no preference
  return 'USD';
}

// ============================================================================
// UTILS
// ============================================================================

/**
 * Check if a value is a valid Currency
 */
export function isCurrency(value: string): value is Currency {
  return VALID_CURRENCIES.has(value.toUpperCase() as Currency);
}

/**
 * Get all supported currencies
 */
export function getSupportedCurrencies(): Currency[] {
  return Array.from(VALID_CURRENCIES);
}

/**
 * Parse amount string with currency symbol
 */
export function parseAmountWithCurrency(value: string): {
  amount: number;
  currency?: Currency;
} {
  // Remove all non-numeric except . and -
  const cleanAmount = value.replace(/[^0-9.-]/g, '');
  const amount = parseFloat(cleanAmount) || 0;

  // Try to extract currency from the string
  const currencyMatch = value.match(/[A-Z]{3}/);
  if (currencyMatch) {
    const validation = validateCurrency(currencyMatch[0]);
    if (validation.isValid) {
      return { amount, currency: validation.currency };
    }
  }

  return { amount };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  validateCurrency,
  validateCurrencyStrict,
  validateCurrencies,
  validateShopifyOrderCurrency,
  validateCustomerCurrency,
  getUnsupportedCurrencyStats,
  isCurrency,
  getSupportedCurrencies,
  parseAmountWithCurrency,
  currencySchema,
  orderCurrencySchema,
};