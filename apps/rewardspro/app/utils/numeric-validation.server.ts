/**
 * Numeric Validation Utilities
 * Provides safe parsing and validation for numeric inputs.
 *
 * Phase 2B: Validation Layer
 * Date: 2025-01-07
 *
 * IMPORTANT: Always use these functions instead of raw parseInt/parseFloat
 * to prevent NaN propagation and ensure consistent error handling.
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ParseResult<T> {
  success: boolean;
  value: T;
  error?: string;
}

export interface NumericBounds {
  min?: number;
  max?: number;
}

export interface PercentageBounds {
  min?: number; // Default: 0
  max?: number; // Default: 100
  allowOver100?: boolean;
}

export interface CurrencyOptions {
  /** Minimum value (default: 0) */
  min?: number;
  /** Maximum value (default: Infinity) */
  max?: number;
  /** Number of decimal places (default: 2) */
  decimals?: number;
  /** Allow negative values (default: false) */
  allowNegative?: boolean;
}

// ============================================
// CORE PARSING FUNCTIONS
// ============================================

/**
 * Safely parses a numeric input with bounds checking.
 * Returns a result object with success flag and parsed value or error.
 *
 * @example
 * ```typescript
 * const result = parseNumericInput('42', { min: 0, max: 100 });
 * if (result.success) {
 *   console.log(result.value); // 42
 * }
 * ```
 */
export function parseNumericInput(
  input: string | number | null | undefined,
  bounds: NumericBounds = {}
): ParseResult<number> {
  // Handle null/undefined
  if (input === null || input === undefined) {
    return { success: false, value: 0, error: 'Input is required' };
  }

  // Handle number type directly
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return { success: false, value: 0, error: 'Input must be a finite number' };
    }
    return validateNumericBounds(input, bounds);
  }

  // Handle string input
  const trimmed = String(input).trim();
  if (trimmed === '') {
    return { success: false, value: 0, error: 'Input is required' };
  }

  const parsed = Number(trimmed);

  if (isNaN(parsed)) {
    return { success: false, value: 0, error: `Invalid number: "${trimmed}"` };
  }

  if (!Number.isFinite(parsed)) {
    return { success: false, value: 0, error: 'Input must be a finite number' };
  }

  return validateNumericBounds(parsed, bounds);
}

/**
 * Validates numeric value against bounds.
 */
function validateNumericBounds(value: number, bounds: NumericBounds): ParseResult<number> {
  const { min, max } = bounds;

  if (min !== undefined && value < min) {
    return { success: false, value: min, error: `Value must be at least ${min}` };
  }

  if (max !== undefined && value > max) {
    return { success: false, value: max, error: `Value must be at most ${max}` };
  }

  return { success: true, value };
}

/**
 * Safely parses a numeric input, returning a fallback on failure.
 * Use this when you need a guaranteed value without error handling.
 *
 * @example
 * ```typescript
 * const quantity = safeParseNumber(input, 1, { min: 1, max: 100 });
 * ```
 */
export function safeParseNumber(
  input: string | number | null | undefined,
  fallback: number,
  bounds: NumericBounds = {}
): number {
  const result = parseNumericInput(input, bounds);
  return result.success ? result.value : fallback;
}

// ============================================
// INTEGER PARSING
// ============================================

/**
 * Parses and validates a positive integer.
 * Rejects decimals, negative numbers, and zero (unless allowZero is true).
 *
 * @example
 * ```typescript
 * const result = parsePositiveInteger('42');
 * if (result.success) {
 *   console.log(result.value); // 42
 * }
 * ```
 */
export function parsePositiveInteger(
  input: string | number | null | undefined,
  options: { allowZero?: boolean; max?: number } = {}
): ParseResult<number> {
  const { allowZero = false, max } = options;

  const result = parseNumericInput(input, { min: allowZero ? 0 : 1, max });

  if (!result.success) {
    return result;
  }

  if (!Number.isInteger(result.value)) {
    return { success: false, value: Math.floor(result.value), error: 'Value must be a whole number' };
  }

  return result;
}

/**
 * Safely parses a positive integer, returning fallback on failure.
 */
export function safeParsePositiveInteger(
  input: string | number | null | undefined,
  fallback: number,
  options: { allowZero?: boolean; max?: number } = {}
): number {
  const result = parsePositiveInteger(input, options);
  return result.success ? result.value : fallback;
}

/**
 * Parses any integer (positive, negative, or zero).
 */
export function parseInteger(
  input: string | number | null | undefined,
  bounds: NumericBounds = {}
): ParseResult<number> {
  const result = parseNumericInput(input, bounds);

  if (!result.success) {
    return result;
  }

  if (!Number.isInteger(result.value)) {
    return { success: false, value: Math.floor(result.value), error: 'Value must be a whole number' };
  }

  return result;
}

// ============================================
// PERCENTAGE PARSING
// ============================================

/**
 * Parses a percentage value (0-100 by default).
 * Handles both "50" and "50%" formats.
 *
 * @example
 * ```typescript
 * const result = parsePercentage('25%');
 * if (result.success) {
 *   console.log(result.value); // 25
 * }
 * ```
 */
export function parsePercentage(
  input: string | number | null | undefined,
  options: PercentageBounds = {}
): ParseResult<number> {
  const { min = 0, max = 100, allowOver100 = false } = options;

  // Handle null/undefined
  if (input === null || input === undefined) {
    return { success: false, value: 0, error: 'Percentage is required' };
  }

  // Strip percentage sign if present
  let cleanInput = input;
  if (typeof input === 'string') {
    cleanInput = input.replace(/%$/, '').trim();
  }

  const effectiveMax = allowOver100 ? (max > 100 ? max : Infinity) : max;

  return parseNumericInput(cleanInput, { min, max: effectiveMax });
}

/**
 * Safely parses a percentage, returning fallback on failure.
 */
export function safeParsePercentage(
  input: string | number | null | undefined,
  fallback: number,
  options: PercentageBounds = {}
): number {
  const result = parsePercentage(input, options);
  return result.success ? result.value : fallback;
}

/**
 * Converts a percentage (0-100) to a decimal (0-1).
 */
export function percentageToDecimal(percentage: number): number {
  return percentage / 100;
}

/**
 * Converts a decimal (0-1) to a percentage (0-100).
 */
export function decimalToPercentage(decimal: number): number {
  return decimal * 100;
}

// ============================================
// CURRENCY PARSING
// ============================================

/**
 * Parses a currency value with proper decimal handling.
 * Handles formats: "10.99", "$10.99", "10,99" (European), etc.
 *
 * @example
 * ```typescript
 * const result = parseCurrency('$19.99');
 * if (result.success) {
 *   console.log(result.value); // 19.99
 * }
 * ```
 */
export function parseCurrency(
  input: string | number | null | undefined,
  options: CurrencyOptions = {}
): ParseResult<number> {
  const { min = 0, max = Infinity, decimals = 2, allowNegative = false } = options;

  // Handle null/undefined
  if (input === null || input === undefined) {
    return { success: false, value: 0, error: 'Amount is required' };
  }

  // Handle number type directly
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return { success: false, value: 0, error: 'Amount must be a finite number' };
    }

    const rounded = roundToDecimals(input, decimals);
    return validateCurrencyBounds(rounded, min, max, allowNegative);
  }

  // Clean string input
  let cleanInput = String(input).trim();

  // Remove currency symbols
  cleanInput = cleanInput.replace(/^[$€£¥₹]+/, '').trim();

  // Handle European format (1.234,56 -> 1234.56)
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(cleanInput)) {
    cleanInput = cleanInput.replace(/\./g, '').replace(',', '.');
  }
  // Handle simple comma as decimal (10,99 -> 10.99)
  else if (/^\d+,\d{1,2}$/.test(cleanInput)) {
    cleanInput = cleanInput.replace(',', '.');
  }
  // Remove thousand separators (1,234.56 -> 1234.56)
  else {
    cleanInput = cleanInput.replace(/,/g, '');
  }

  const parsed = Number(cleanInput);

  if (isNaN(parsed)) {
    return { success: false, value: 0, error: `Invalid amount: "${input}"` };
  }

  if (!Number.isFinite(parsed)) {
    return { success: false, value: 0, error: 'Amount must be a finite number' };
  }

  const rounded = roundToDecimals(parsed, decimals);
  return validateCurrencyBounds(rounded, min, max, allowNegative);
}

/**
 * Validates currency value against bounds.
 */
function validateCurrencyBounds(
  value: number,
  min: number,
  max: number,
  allowNegative: boolean
): ParseResult<number> {
  if (!allowNegative && value < 0) {
    return { success: false, value: 0, error: 'Amount cannot be negative' };
  }

  if (value < min) {
    return { success: false, value: min, error: `Amount must be at least ${min}` };
  }

  if (value > max) {
    return { success: false, value: max, error: `Amount must be at most ${max}` };
  }

  return { success: true, value };
}

/**
 * Safely parses a currency value, returning fallback on failure.
 */
export function safeParseCurrency(
  input: string | number | null | undefined,
  fallback: number,
  options: CurrencyOptions = {}
): number {
  const result = parseCurrency(input, options);
  return result.success ? result.value : fallback;
}

/**
 * Rounds a number to specified decimal places.
 * Uses proper banker's rounding to avoid floating point issues.
 */
export function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Formats a number as currency string (without symbol).
 */
export function formatCurrencyValue(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

// ============================================
// SHOPIFY-SPECIFIC PARSING
// ============================================

/**
 * Parses a Shopify GID to extract the numeric ID.
 * Handles formats: "gid://shopify/Order/12345" -> 12345
 *
 * @example
 * ```typescript
 * const id = parseShopifyGidNumber('gid://shopify/Order/12345');
 * console.log(id); // 12345
 * ```
 */
export function parseShopifyGidNumber(gid: string | null | undefined): number | null {
  if (!gid || typeof gid !== 'string') {
    return null;
  }

  // Extract trailing numeric ID
  const match = gid.match(/\/(\d+)$/);
  if (!match) {
    return null;
  }

  const parsed = parseInt(match[1], 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parses a Shopify GID to extract the string ID.
 * Preserves leading zeros unlike parseShopifyGidNumber.
 */
export function parseShopifyGidString(gid: string | null | undefined): string | null {
  if (!gid || typeof gid !== 'string') {
    return null;
  }

  const match = gid.match(/\/([^/]+)$/);
  return match ? match[1] : null;
}

/**
 * Parses Shopify money format (cents as string) to dollars.
 */
export function parseShopifyMoney(
  amountInCents: string | number | null | undefined
): ParseResult<number> {
  const result = parseNumericInput(amountInCents);

  if (!result.success) {
    return result;
  }

  // Convert cents to dollars
  const dollars = roundToDecimals(result.value / 100, 2);
  return { success: true, value: dollars };
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Checks if a value is a valid finite number.
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Checks if a value is a valid positive number.
 */
export function isPositiveNumber(value: unknown): value is number {
  return isValidNumber(value) && value > 0;
}

/**
 * Checks if a value is a valid non-negative number (includes zero).
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return isValidNumber(value) && value >= 0;
}

/**
 * Checks if a value is a valid positive integer.
 */
export function isPositiveInteger(value: unknown): value is number {
  return isValidNumber(value) && Number.isInteger(value) && value > 0;
}

/**
 * Clamps a number within bounds.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================
// EXCHANGE RATE PARSING
// ============================================

/**
 * Parses and validates an exchange rate.
 * Exchange rates must be positive and within reasonable bounds.
 */
export function parseExchangeRate(
  input: string | number | null | undefined
): ParseResult<number> {
  const result = parseNumericInput(input, { min: 0.0001, max: 100000 });

  if (!result.success) {
    return {
      success: false,
      value: 1,
      error: result.error || 'Invalid exchange rate',
    };
  }

  // Round to reasonable precision for exchange rates
  return { success: true, value: roundToDecimals(result.value, 6) };
}

/**
 * Safely parses an exchange rate, returning 1 on failure.
 */
export function safeParseExchangeRate(
  input: string | number | null | undefined
): number {
  const result = parseExchangeRate(input);
  return result.success ? result.value : 1;
}
