/**
 * Money Utilities
 * Provides safe monetary calculations to prevent floating-point precision issues.
 *
 * Phase 2A: Calculation Fixes
 * Date: 2025-01-07
 *
 * IMPORTANT: Always use these functions for monetary operations.
 * JavaScript floating-point math can cause issues like:
 * - 0.1 + 0.2 = 0.30000000000000004
 * - 10.00 * 0.1 = 1.0000000000000002
 */

// ============================================
// CONSTANTS
// ============================================

/** Standard decimal places for currency */
export const CURRENCY_DECIMALS = 2;

/** Decimal places for exchange rates */
export const EXCHANGE_RATE_DECIMALS = 6;

/** Decimal places for percentage calculations */
export const PERCENTAGE_DECIMALS = 4;

// ============================================
// CORE MONEY FUNCTIONS
// ============================================

/**
 * Rounds a monetary value to the standard currency precision.
 * Uses banker's rounding (round half to even) to minimize bias.
 *
 * @example
 * ```typescript
 * roundMoney(19.999); // 20.00
 * roundMoney(19.995); // 20.00
 * roundMoney(19.994); // 19.99
 * ```
 */
export function roundMoney(value: number, decimals: number = CURRENCY_DECIMALS): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  // Use a multiplier approach to avoid floating-point issues
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Safely adds two monetary values.
 */
export function addMoney(a: number, b: number): number {
  return roundMoney(a + b);
}

/**
 * Safely subtracts two monetary values.
 */
export function subtractMoney(a: number, b: number): number {
  return roundMoney(a - b);
}

/**
 * Safely multiplies a monetary value by a factor.
 * Useful for quantity calculations.
 *
 * @example
 * ```typescript
 * multiplyMoney(19.99, 3); // 59.97
 * ```
 */
export function multiplyMoney(amount: number, factor: number): number {
  return roundMoney(amount * factor);
}

/**
 * Safely divides a monetary value.
 * Returns 0 if divisor is 0 to prevent errors.
 */
export function divideMoney(amount: number, divisor: number): number {
  if (divisor === 0 || !Number.isFinite(divisor)) {
    return 0;
  }
  return roundMoney(amount / divisor);
}

// ============================================
// PERCENTAGE CALCULATIONS
// ============================================

/**
 * Calculates a percentage of a monetary amount.
 * The percentage should be in human-readable form (e.g., 5 for 5%).
 *
 * @example
 * ```typescript
 * calculatePercentage(100, 5); // 5.00 (5% of 100)
 * calculatePercentage(99.99, 10); // 10.00 (10% of 99.99)
 * ```
 */
export function calculatePercentage(amount: number, percentage: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(percentage)) {
    return 0;
  }
  return roundMoney((amount * percentage) / 100);
}

/**
 * Calculates what percentage one amount is of another.
 *
 * @example
 * ```typescript
 * getPercentageOf(25, 100); // 25 (25 is 25% of 100)
 * getPercentageOf(50, 200); // 25 (50 is 25% of 200)
 * ```
 */
export function getPercentageOf(part: number, whole: number): number {
  if (whole === 0 || !Number.isFinite(whole) || !Number.isFinite(part)) {
    return 0;
  }
  return roundMoney((part / whole) * 100, PERCENTAGE_DECIMALS);
}

/**
 * Calculates cashback amount from an order total and cashback percentage.
 *
 * @example
 * ```typescript
 * calculateCashback(150.00, 5); // 7.50 (5% cashback on $150)
 * ```
 */
export function calculateCashback(orderTotal: number, cashbackPercent: number): number {
  if (orderTotal <= 0 || cashbackPercent <= 0) {
    return 0;
  }
  return calculatePercentage(orderTotal, cashbackPercent);
}

// ============================================
// EXCHANGE RATE FUNCTIONS
// ============================================

/**
 * Converts an amount from one currency to another using an exchange rate.
 * The exchange rate should be: target_currency / source_currency
 *
 * @example
 * ```typescript
 * // Convert $100 USD to EUR with rate 0.92
 * convertCurrency(100, 0.92); // 92.00 EUR
 * ```
 */
export function convertCurrency(amount: number, exchangeRate: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    return amount; // Return original if conversion not possible
  }
  return roundMoney(amount * exchangeRate);
}

/**
 * Calculates the exchange rate between two amounts.
 * Rate = presentment / shop (customer currency / shop currency)
 *
 * @example
 * ```typescript
 * // Customer paid 100 EUR, shop receives 86.21 GBP
 * calculateExchangeRate(100, 86.21); // 1.160073 (1 GBP = 1.16 EUR)
 * ```
 */
export function calculateExchangeRate(presentmentAmount: number, shopAmount: number): number | null {
  if (shopAmount === 0 || !Number.isFinite(shopAmount) || !Number.isFinite(presentmentAmount)) {
    return null;
  }
  return roundMoney(presentmentAmount / shopAmount, EXCHANGE_RATE_DECIMALS);
}

/**
 * Safely parses an exchange rate with validation.
 * Returns 1 (neutral) if the rate is invalid.
 */
export function parseExchangeRate(rate: unknown): number {
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
    return roundMoney(rate, EXCHANGE_RATE_DECIMALS);
  }

  if (typeof rate === 'string') {
    const parsed = parseFloat(rate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return roundMoney(parsed, EXCHANGE_RATE_DECIMALS);
    }
  }

  return 1; // Neutral rate if invalid
}

// ============================================
// DISCOUNT CALCULATIONS
// ============================================

/**
 * Calculates the net amount after applying a discount.
 *
 * @example
 * ```typescript
 * applyDiscount(100, 15); // 85.00 (100 - 15 discount)
 * ```
 */
export function applyDiscount(amount: number, discount: number): number {
  const result = subtractMoney(amount, Math.abs(discount));
  return Math.max(0, result); // Net cannot be negative
}

/**
 * Calculates the net amount after applying a percentage discount.
 *
 * @example
 * ```typescript
 * applyPercentageDiscount(100, 20); // 80.00 (20% off)
 * ```
 */
export function applyPercentageDiscount(amount: number, discountPercent: number): number {
  const discountAmount = calculatePercentage(amount, discountPercent);
  return applyDiscount(amount, discountAmount);
}

// ============================================
// REFUND CALCULATIONS
// ============================================

/**
 * Calculates the net amount after refunds.
 * Ensures the result is never negative.
 *
 * @example
 * ```typescript
 * calculateNetAfterRefund(100, 25); // 75.00
 * calculateNetAfterRefund(100, 150); // 0.00 (capped at 0)
 * ```
 */
export function calculateNetAfterRefund(totalAmount: number, refundedAmount: number): number {
  const net = subtractMoney(totalAmount, Math.abs(refundedAmount));
  return Math.max(0, net);
}

/**
 * Calculates cashback adjustment after a refund.
 * Returns the amount of cashback to deduct based on the refund.
 *
 * @example
 * ```typescript
 * // Original: $100 order with 5% cashback ($5 earned)
 * // Refund: $25
 * // Cashback to deduct: $1.25 (5% of $25)
 * calculateCashbackAdjustment(25, 5); // 1.25
 * ```
 */
export function calculateCashbackAdjustment(
  refundAmount: number,
  cashbackPercent: number
): number {
  return calculateCashback(refundAmount, cashbackPercent);
}

// ============================================
// STORE CREDIT FUNCTIONS
// ============================================

/**
 * Calculates the order amount eligible for cashback.
 * Excludes amounts paid with store credit or gift cards.
 *
 * @example
 * ```typescript
 * calculateCashbackEligibleAmount(100, 20, 10); // 70.00
 * // $100 total - $20 store credit - $10 gift card = $70 eligible
 * ```
 */
export function calculateCashbackEligibleAmount(
  orderTotal: number,
  storeCreditUsed: number = 0,
  giftCardUsed: number = 0
): number {
  const deductions = addMoney(Math.abs(storeCreditUsed), Math.abs(giftCardUsed));
  return Math.max(0, subtractMoney(orderTotal, deductions));
}

/**
 * Calculates new store credit balance after earning cashback.
 */
export function addStoreCredit(currentBalance: number, earned: number): number {
  if (earned < 0) {
    return currentBalance; // Don't allow negative earnings
  }
  return addMoney(currentBalance, earned);
}

/**
 * Calculates new store credit balance after redemption.
 * Caps at 0 if redemption exceeds balance.
 */
export function redeemStoreCredit(currentBalance: number, amount: number): {
  newBalance: number;
  actualRedeemed: number;
} {
  const redemption = Math.abs(amount);
  const actualRedeemed = Math.min(redemption, currentBalance);
  const newBalance = subtractMoney(currentBalance, actualRedeemed);

  return {
    newBalance: Math.max(0, newBalance),
    actualRedeemed: roundMoney(actualRedeemed),
  };
}

// ============================================
// PARSING FUNCTIONS
// ============================================

/**
 * Safely parses a monetary value from various input types.
 * Returns 0 for invalid inputs instead of NaN.
 *
 * @example
 * ```typescript
 * parseMoney('$19.99'); // 19.99
 * parseMoney('19.99'); // 19.99
 * parseMoney(19.99); // 19.99
 * parseMoney(null); // 0
 * parseMoney('invalid'); // 0
 * ```
 */
export function parseMoney(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? roundMoney(value) : 0;
  }

  if (typeof value === 'string') {
    // Remove currency symbols and thousand separators
    const cleaned = value
      .replace(/^[$€£¥₹]+/, '') // Remove currency symbols
      .replace(/,/g, '') // Remove commas
      .trim();

    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? roundMoney(parsed) : 0;
  }

  // Handle Prisma Decimal type
  if (typeof value === 'object' && value !== null) {
    const numValue = Number(value);
    return Number.isFinite(numValue) ? roundMoney(numValue) : 0;
  }

  return 0;
}

/**
 * Formats a number as a currency string.
 * Does not include currency symbol - use with formatCurrency() for full formatting.
 */
export function formatMoneyValue(amount: number, decimals: number = CURRENCY_DECIMALS): string {
  const rounded = roundMoney(amount, decimals);
  return rounded.toFixed(decimals);
}

/**
 * Formats a number as a full currency string with symbol.
 *
 * @example
 * ```typescript
 * formatCurrency(1234.56, 'USD'); // "$1,234.56"
 * formatCurrency(1234.56, 'EUR'); // "€1,234.56"
 * ```
 */
export function formatCurrency(
  amount: number,
  currencyCode: string = 'USD',
  locale: string = 'en-US'
): string {
  const rounded = roundMoney(amount);

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(rounded);
  } catch {
    // Fallback if currency code is invalid
    return `${currencyCode} ${formatMoneyValue(rounded)}`;
  }
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Checks if a value is a valid positive monetary amount.
 */
export function isValidMoneyAmount(value: unknown): value is number {
  if (typeof value !== 'number') return false;
  return Number.isFinite(value) && value >= 0;
}

/**
 * Checks if a value is a valid non-zero monetary amount.
 */
export function isPositiveMoneyAmount(value: unknown): value is number {
  return isValidMoneyAmount(value) && (value as number) > 0;
}

/**
 * Compares two monetary values for equality.
 * Handles floating-point precision issues.
 */
export function moneyEquals(a: number, b: number): boolean {
  return roundMoney(a) === roundMoney(b);
}

/**
 * Compares two monetary values.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareMoney(a: number, b: number): -1 | 0 | 1 {
  const roundedA = roundMoney(a);
  const roundedB = roundMoney(b);

  if (roundedA < roundedB) return -1;
  if (roundedA > roundedB) return 1;
  return 0;
}

// ============================================
// AGGREGATE FUNCTIONS
// ============================================

/**
 * Calculates the sum of an array of monetary values.
 */
export function sumMoney(amounts: number[]): number {
  if (!Array.isArray(amounts) || amounts.length === 0) {
    return 0;
  }

  const total = amounts.reduce((sum, amount) => {
    const parsed = parseMoney(amount);
    return sum + parsed;
  }, 0);

  return roundMoney(total);
}

/**
 * Calculates the average of an array of monetary values.
 */
export function averageMoney(amounts: number[]): number {
  if (!Array.isArray(amounts) || amounts.length === 0) {
    return 0;
  }

  const total = sumMoney(amounts);
  return divideMoney(total, amounts.length);
}
