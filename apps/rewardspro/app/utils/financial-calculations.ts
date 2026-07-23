/**
 * Financial Calculation Utilities
 *
 * Core functions for currency conversion, cashback calculations,
 * and financial precision handling.
 *
 * Uses native JavaScript for high-precision decimal calculations
 * to avoid dependency issues.
 */

import type { Currency } from '@prisma/client';
import { CURRENCY_DECIMALS, roundToCurrencyPrecision } from '~/services/currency-formatter.server';

// ============================================================================
// DECIMAL PRECISION UTILITIES
// ============================================================================

/**
 * Custom Decimal class for financial precision
 * Handles calculations in integer cents to avoid floating point issues
 */
export class FinancialDecimal {
  private cents: bigint;
  private decimals: number;

  constructor(value: number | string, decimals: number = 2) {
    this.decimals = decimals;
    const multiplier = Math.pow(10, decimals);

    if (typeof value === 'string') {
      const num = parseFloat(value);
      this.cents = BigInt(Math.round(num * multiplier));
    } else {
      this.cents = BigInt(Math.round(value * multiplier));
    }
  }

  static from(value: number | string, decimals: number = 2): FinancialDecimal {
    return new FinancialDecimal(value, decimals);
  }

  add(other: FinancialDecimal): FinancialDecimal {
    if (this.decimals !== other.decimals) {
      throw new Error('Cannot add decimals with different precision');
    }
    const result = new FinancialDecimal(0, this.decimals);
    result.cents = this.cents + other.cents;
    return result;
  }

  subtract(other: FinancialDecimal): FinancialDecimal {
    if (this.decimals !== other.decimals) {
      throw new Error('Cannot subtract decimals with different precision');
    }
    const result = new FinancialDecimal(0, this.decimals);
    result.cents = this.cents - other.cents;
    return result;
  }

  multiply(factor: number): FinancialDecimal {
    const result = new FinancialDecimal(0, this.decimals);
    result.cents = BigInt(Math.round(Number(this.cents) * factor));
    return result;
  }

  divide(divisor: number): FinancialDecimal {
    if (divisor === 0) throw new Error('Division by zero');
    const result = new FinancialDecimal(0, this.decimals);
    result.cents = BigInt(Math.round(Number(this.cents) / divisor));
    return result;
  }

  toNumber(): number {
    const divisor = Math.pow(10, this.decimals);
    return Number(this.cents) / divisor;
  }

  toString(): string {
    return this.toNumber().toFixed(this.decimals);
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  isNegative(): boolean {
    return this.cents < 0n;
  }

  abs(): FinancialDecimal {
    const result = new FinancialDecimal(0, this.decimals);
    result.cents = this.cents < 0n ? -this.cents : this.cents;
    return result;
  }

  round(decimals: number): FinancialDecimal {
    if (decimals === this.decimals) return this;

    const currentDivisor = Math.pow(10, this.decimals);
    const value = Number(this.cents) / currentDivisor;

    return new FinancialDecimal(value, decimals);
  }
}

// ============================================================================
// CURRENCY CONVERSION
// ============================================================================

/**
 * Convert currency amount using exchange rate
 * @param amount - Amount to convert
 * @param rate - Exchange rate to apply
 * @returns Converted amount
 */
export function convertCurrency(amount: number, rate: number): number {
  if (rate <= 0) {
    throw new Error('Exchange rate must be positive');
  }

  // Use high precision calculation
  const decimal = FinancialDecimal.from(amount, 8);
  const converted = decimal.multiply(rate);

  // Return as number with appropriate precision
  return converted.toNumber();
}

/**
 * Convert between specific currencies with proper precision
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency
 * @param toCurrency - Target currency
 * @param rate - Exchange rate (from currency to target currency)
 * @returns Converted amount rounded to target currency precision
 */
export function convertBetweenCurrencies(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  rate: number
): number {
  const converted = convertCurrency(amount, rate);
  return roundToCurrencyPrecision(converted, toCurrency);
}

// ============================================================================
// CASHBACK CALCULATIONS
// ============================================================================

/**
 * Calculate cashback amount
 * @param amount - Order amount
 * @param percentage - Cashback percentage (0-100)
 * @param currency - Currency for rounding precision (optional)
 * @returns Cashback amount
 */
export function calculateCashback(
  amount: number,
  percentage: number,
  currency?: Currency
): number {
  // Validate percentage
  if (percentage < 0) {
    throw new Error('Cashback percentage cannot be negative');
  }

  if (percentage > 100) {
    console.warn('Cashback percentage exceeds 100%, capping at 100%');
    percentage = 100;
  }

  // Handle edge cases
  if (amount <= 0 || percentage === 0) {
    return 0;
  }

  // Calculate cashback using high precision
  const decimal = FinancialDecimal.from(amount, 8);
  const cashbackDecimal = decimal.multiply(percentage / 100);
  let cashback = cashbackDecimal.toNumber();

  // Round to currency precision if specified
  if (currency) {
    cashback = roundToCurrencyPrecision(cashback, currency);
  }

  // Ensure cashback doesn't exceed original amount
  return Math.min(cashback, amount);
}

/**
 * Calculate tiered cashback with multiple rates
 * @param amount - Order amount
 * @param tiers - Array of tier thresholds and rates
 * @returns Total cashback amount
 */
export function calculateTieredCashback(
  amount: number,
  tiers: Array<{ threshold: number; rate: number }>
): number {
  if (amount <= 0) return 0;

  // Sort tiers by threshold ascending
  const sortedTiers = [...tiers].sort((a, b) => a.threshold - b.threshold);

  let totalCashback = 0;
  let previousThreshold = 0;

  for (const tier of sortedTiers) {
    if (amount <= previousThreshold) break;

    const applicableAmount = Math.min(amount - previousThreshold, tier.threshold - previousThreshold);
    totalCashback += calculateCashback(applicableAmount, tier.rate);

    previousThreshold = tier.threshold;
  }

  // Apply highest tier rate to amount above all thresholds
  if (amount > previousThreshold && sortedTiers.length > 0) {
    const highestRate = sortedTiers[sortedTiers.length - 1].rate;
    totalCashback += calculateCashback(amount - previousThreshold, highestRate);
  }

  return totalCashback;
}

// ============================================================================
// REFUND CALCULATIONS
// ============================================================================

/**
 * Calculate cashback clawback for refunds
 * @param originalOrderAmount - Original order amount
 * @param refundAmount - Amount being refunded
 * @param originalCashback - Original cashback granted
 * @returns Cashback amount to claw back
 */
export function calculateCashbackClawback(
  originalOrderAmount: number,
  refundAmount: number,
  originalCashback: number
): number {
  if (originalOrderAmount <= 0) {
    throw new Error('Original order amount must be positive');
  }

  if (refundAmount <= 0) {
    return 0;
  }

  if (refundAmount > originalOrderAmount) {
    // Full refund plus potential additional credit
    return originalCashback;
  }

  // Proportional clawback
  const refundPercentage = refundAmount / originalOrderAmount;
  const clawback = originalCashback * refundPercentage;

  // Use high precision calculation
  const decimal = FinancialDecimal.from(clawback, 8);

  // Round down to avoid over-clawing
  return Math.floor(decimal.toNumber() * 100) / 100;
}

// ============================================================================
// CURRENCY UTILITIES
// ============================================================================

/**
 * Format currency amount for display
 * Re-export from currency formatter for convenience
 */
export { formatCurrency } from '~/utils/currency';

/**
 * Check if amount is effectively zero for currency
 * @param amount - Amount to check
 * @param currency - Currency for precision
 * @returns True if amount rounds to zero
 */
export function isZeroAmount(amount: number, currency: Currency): boolean {
  const rounded = roundToCurrencyPrecision(amount, currency);
  const epsilon = Math.pow(10, -(CURRENCY_DECIMALS[currency] + 2));
  return Math.abs(rounded) < epsilon;
}

/**
 * Compare two amounts accounting for currency precision
 * @param amount1 - First amount
 * @param amount2 - Second amount
 * @param currency - Currency for precision
 * @returns -1 if amount1 < amount2, 0 if equal, 1 if amount1 > amount2
 */
export function compareAmounts(
  amount1: number,
  amount2: number,
  currency: Currency
): -1 | 0 | 1 {
  const rounded1 = roundToCurrencyPrecision(amount1, currency);
  const rounded2 = roundToCurrencyPrecision(amount2, currency);
  const epsilon = Math.pow(10, -(CURRENCY_DECIMALS[currency] + 2));

  if (Math.abs(rounded1 - rounded2) < epsilon) {
    return 0;
  }

  return rounded1 < rounded2 ? -1 : 1;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate monetary amount
 * @param amount - Amount to validate
 * @param options - Validation options
 * @returns True if valid
 */
export function validateAmount(
  amount: number,
  options: {
    allowNegative?: boolean;
    allowZero?: boolean;
    maxAmount?: number;
    currency?: Currency;
  } = {}
): boolean {
  const {
    allowNegative = false,
    allowZero = true,
    maxAmount = Number.MAX_SAFE_INTEGER,
    currency
  } = options;

  // Check for NaN or Infinity
  if (!Number.isFinite(amount)) {
    return false;
  }

  // Check negative
  if (amount < 0 && !allowNegative) {
    return false;
  }

  // Check zero
  if (amount === 0 && !allowZero) {
    return false;
  }

  // Check maximum
  if (Math.abs(amount) > maxAmount) {
    return false;
  }

  // Check currency precision if specified
  if (currency) {
    const decimals = CURRENCY_DECIMALS[currency];
    const multiplier = Math.pow(10, decimals);
    const cents = Math.round(amount * multiplier);

    // Check if amount has more precision than currency allows
    if (Math.abs(amount * multiplier - cents) > 0.001) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// EXPORT ALL FOR TESTING
// ============================================================================

// Export everything for comprehensive testing
export const FinancialCalculations = {
  FinancialDecimal,
  convertCurrency,
  convertBetweenCurrencies,
  calculateCashback,
  calculateTieredCashback,
  calculateCashbackClawback,
  isZeroAmount,
  compareAmounts,
  validateAmount,
  roundToCurrencyPrecision
};
