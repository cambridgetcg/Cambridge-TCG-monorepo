/**
 * Price Validation Utility
 * Ensures price integrity and prevents billing issues
 */

import type { Currency } from "@prisma/client";

export interface PriceValidationResult {
  valid: boolean;
  error?: string;
  sanitizedPrice?: number;
}

export interface PriceLimits {
  min: number;
  max: number;
  precision: number;
}

// Currency-specific limits and rules
const CURRENCY_LIMITS: Record<string, PriceLimits> = {
  USD: { min: 0.50, max: 999999.99, precision: 2 },
  EUR: { min: 0.50, max: 999999.99, precision: 2 },
  GBP: { min: 0.50, max: 999999.99, precision: 2 },
  CAD: { min: 0.50, max: 999999.99, precision: 2 },
  AUD: { min: 0.50, max: 999999.99, precision: 2 },
  JPY: { min: 50, max: 99999999, precision: 0 }, // No decimals for JPY
  CHF: { min: 0.50, max: 999999.99, precision: 2 },
  CNY: { min: 1.00, max: 999999.99, precision: 2 },
  SEK: { min: 5.00, max: 9999999.99, precision: 2 },
  NZD: { min: 0.50, max: 999999.99, precision: 2 },
  MXN: { min: 10.00, max: 9999999.99, precision: 2 },
  SGD: { min: 0.50, max: 999999.99, precision: 2 },
  HKD: { min: 1.00, max: 9999999.99, precision: 2 },
  NOK: { min: 5.00, max: 9999999.99, precision: 2 },
  KRW: { min: 500, max: 999999999, precision: 0 }, // No decimals for KRW
  TRY: { min: 1.00, max: 9999999.99, precision: 2 },
  RUB: { min: 10.00, max: 9999999.99, precision: 2 },
  INR: { min: 10.00, max: 9999999.99, precision: 2 },
  BRL: { min: 1.00, max: 9999999.99, precision: 2 },
  ZAR: { min: 5.00, max: 9999999.99, precision: 2 },
  AED: { min: 1.00, max: 9999999.99, precision: 2 },
  AFN: { min: 10.00, max: 9999999.99, precision: 2 },
  ALL: { min: 10.00, max: 9999999.99, precision: 2 },
  AMD: { min: 100, max: 999999999, precision: 0 },
  ANG: { min: 1.00, max: 999999.99, precision: 2 },
  AOA: { min: 50.00, max: 99999999.99, precision: 2 },
  ARS: { min: 10.00, max: 99999999.99, precision: 2 },
  // Default for unknown currencies
  DEFAULT: { min: 0.01, max: 999999.99, precision: 2 },
};

/**
 * Validate a price for a specific currency
 */
export function validatePrice(
  price: number | string | null | undefined,
  currency: Currency | string
): PriceValidationResult {
  // Handle null/undefined
  if (price === null || price === undefined) {
    return {
      valid: false,
      error: 'Price is required',
    };
  }
  
  // Convert string to number if needed
  const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
  
  // Check if it's a valid number
  if (!Number.isFinite(numericPrice)) {
    return {
      valid: false,
      error: 'Price must be a valid number',
    };
  }
  
  // Check for negative prices
  if (numericPrice < 0) {
    return {
      valid: false,
      error: 'Price cannot be negative',
    };
  }
  
  // Get currency limits
  const limits = CURRENCY_LIMITS[currency] || CURRENCY_LIMITS.DEFAULT;
  
  // Check minimum price
  if (numericPrice < limits.min) {
    return {
      valid: false,
      error: `Price must be at least ${limits.min} ${currency}`,
    };
  }
  
  // Check maximum price
  if (numericPrice > limits.max) {
    return {
      valid: false,
      error: `Price cannot exceed ${limits.max} ${currency}`,
    };
  }
  
  // Sanitize price to correct precision
  const sanitizedPrice = parseFloat(numericPrice.toFixed(limits.precision));
  
  // Check for precision issues
  if (numericPrice !== sanitizedPrice) {
    return {
      valid: true,
      sanitizedPrice,
      error: `Price adjusted to ${limits.precision} decimal places`,
    };
  }
  
  return {
    valid: true,
    sanitizedPrice,
  };
}

/**
 * Validate a discount percentage
 */
export function validateDiscountPercentage(
  percentage: number | string | null | undefined
): PriceValidationResult {
  if (percentage === null || percentage === undefined) {
    return {
      valid: false,
      error: 'Discount percentage is required',
    };
  }
  
  const numericPercentage = typeof percentage === 'string' ? 
    parseFloat(percentage) : percentage;
  
  if (!Number.isFinite(numericPercentage)) {
    return {
      valid: false,
      error: 'Discount must be a valid number',
    };
  }
  
  if (numericPercentage < 0) {
    return {
      valid: false,
      error: 'Discount cannot be negative',
    };
  }
  
  if (numericPercentage > 100) {
    return {
      valid: false,
      error: 'Discount cannot exceed 100%',
    };
  }
  
  return {
    valid: true,
    sanitizedPrice: numericPercentage,
  };
}

/**
 * Calculate discounted price
 */
export function calculateDiscountedPrice(
  basePrice: number,
  discountPercentage: number,
  currency: Currency | string
): PriceValidationResult {
  const priceValidation = validatePrice(basePrice, currency);
  if (!priceValidation.valid) {
    return priceValidation;
  }
  
  const discountValidation = validateDiscountPercentage(discountPercentage);
  if (!discountValidation.valid) {
    return discountValidation;
  }
  
  const discountedPrice = basePrice * (1 - discountPercentage / 100);
  
  return validatePrice(discountedPrice, currency);
}

/**
 * Validate price change
 */
export function validatePriceChange(
  oldPrice: number,
  newPrice: number,
  maxChangePercent = 50
): PriceValidationResult {
  if (oldPrice <= 0) {
    return validatePrice(newPrice, 'USD'); // Basic validation only
  }
  
  const changePercent = Math.abs((newPrice - oldPrice) / oldPrice) * 100;
  
  if (changePercent > maxChangePercent) {
    return {
      valid: false,
      error: `Price change exceeds ${maxChangePercent}% limit (${changePercent.toFixed(1)}% change)`,
    };
  }
  
  return {
    valid: true,
    sanitizedPrice: newPrice,
  };
}

/**
 * Batch validate prices
 */
export function batchValidatePrices(
  prices: Array<{ price: number; currency: Currency | string }>,
  allowPartialSuccess = false
): {
  valid: boolean;
  results: PriceValidationResult[];
  errors: string[];
} {
  const results = prices.map(({ price, currency }) => 
    validatePrice(price, currency)
  );
  
  const errors = results
    .filter(r => !r.valid)
    .map(r => r.error!)
    .filter(Boolean);
  
  return {
    valid: allowPartialSuccess ? errors.length < prices.length : errors.length === 0,
    results,
    errors,
  };
}

/**
 * Format price for display
 */
export function formatPriceForDisplay(
  price: number,
  currency: Currency | string
): string {
  const limits = CURRENCY_LIMITS[currency] || CURRENCY_LIMITS.DEFAULT;
  
  // Handle zero-decimal currencies
  if (limits.precision === 0) {
    return Math.round(price).toString();
  }
  
  return price.toFixed(limits.precision);
}

/**
 * Sanitize price input
 */
export function sanitizePriceInput(
  input: string,
  currency: Currency | string
): number | null {
  // Remove currency symbols and whitespace
  const cleaned = input.replace(/[^\d.,\-]/g, '');
  
  // Replace comma with period for decimal
  const normalized = cleaned.replace(',', '.');
  
  // Parse as float
  const parsed = parseFloat(normalized);
  
  if (!Number.isFinite(parsed)) {
    return null;
  }
  
  const validation = validatePrice(parsed, currency);
  
  return validation.valid ? validation.sanitizedPrice! : null;
}