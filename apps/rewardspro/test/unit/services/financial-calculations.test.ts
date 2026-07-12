import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Import the actual functions from your codebase
// For now, I'll define them here as examples
const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  KRW: 0,
  CAD: 2,
  AUD: 2,
  CHF: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  BHD: 3, // Bahraini dinar - 3 decimal places
};

// Calculate cashback with proper rounding
function calculateCashback(
  netAmount: number,
  cashbackPercent: number,
  currency: string
): number {
  if (netAmount < 0) return 0; // No cashback on refunds
  if (cashbackPercent < 0 || cashbackPercent > 100) {
    throw new Error('Cashback percent must be between 0 and 100');
  }

  const rawCashback = netAmount * (cashbackPercent / 100);
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const multiplier = Math.pow(10, decimals);

  // Round to the nearest unit supported by the currency.
  return Math.round(rawCashback * multiplier) / multiplier;
}

// Convert between currencies
function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRate: number
): number {
  const fromDecimals = CURRENCY_DECIMALS[fromCurrency] ?? 2;
  const toDecimals = CURRENCY_DECIMALS[toCurrency] ?? 2;

  // Convert to base currency value
  const baseAmount = amount * exchangeRate;

  // Round to target currency precision
  const multiplier = Math.pow(10, toDecimals);
  return Math.round(baseAmount * multiplier) / multiplier;
}

// Format currency for display
function formatCurrency(amount: number, currency: string): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return formatter.format(amount);
}

describe('Financial Calculations', () => {
  describe('Cashback Calculation', () => {
    it('should calculate cashback correctly for standard percentages', () => {
      expect(calculateCashback(100, 5, 'USD')).toBe(5.0);
      expect(calculateCashback(123.45, 5, 'USD')).toBe(6.17);
      expect(calculateCashback(50.99, 10, 'USD')).toBe(5.1);
      expect(calculateCashback(1000, 2.5, 'USD')).toBe(25.0);
    });

    it('should handle zero decimal currencies correctly', () => {
      expect(calculateCashback(10000, 5, 'JPY')).toBe(500); // ¥10,000 * 5% = ¥500
      expect(calculateCashback(5000, 3, 'KRW')).toBe(150); // ₩5,000 * 3% = ₩150
    });

    it('should handle three decimal currencies correctly', () => {
      expect(calculateCashback(100, 5.5, 'BHD')).toBe(5.5); // 100 BD * 5.5% = 5.500 BD
      expect(calculateCashback(123.456, 10, 'BHD')).toBe(12.346);
    });

    it('should return 0 for negative amounts (refunds)', () => {
      expect(calculateCashback(-100, 10, 'USD')).toBe(0);
      expect(calculateCashback(-50.5, 5, 'EUR')).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(calculateCashback(0, 10, 'USD')).toBe(0);
      expect(calculateCashback(100, 0, 'USD')).toBe(0);
      expect(calculateCashback(100, 100, 'USD')).toBe(100);
    });

    it('should throw error for invalid cashback percentages', () => {
      expect(() => calculateCashback(100, -1, 'USD')).toThrow();
      expect(() => calculateCashback(100, 101, 'USD')).toThrow();
    });

    it('should handle very small amounts correctly', () => {
      expect(calculateCashback(0.01, 10, 'USD')).toBe(0.0); // Too small to round up
      expect(calculateCashback(0.1, 10, 'USD')).toBe(0.01);
      expect(calculateCashback(1, 1, 'USD')).toBe(0.01);
    });

    it('should handle very large amounts without overflow', () => {
      const largeAmount = 1_000_000_000; // 1 billion
      expect(calculateCashback(largeAmount, 5, 'USD')).toBe(50_000_000);

      // Test with JavaScript's max safe integer
      const maxSafe = Number.MAX_SAFE_INTEGER / 100; // Divide to avoid overflow in calculation
      const result = calculateCashback(maxSafe, 1, 'USD');
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(maxSafe);
    });
  });

  describe('Property-Based Testing for Cashback', () => {
    it('cashback should stay between 0 and the net amount at currency precision', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
          fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
          fc.constantFrom('USD', 'EUR', 'JPY', 'GBP'),
          (amount, percent, currency) => {
            const cashback = calculateCashback(amount, percent, currency);
            const decimals = CURRENCY_DECIMALS[currency] ?? 2;
            const multiplier = Math.pow(10, decimals);
            const roundedAmount = Math.round(amount * multiplier) / multiplier;

            expect(cashback).toBeGreaterThanOrEqual(0);
            expect(cashback).toBeLessThanOrEqual(roundedAmount);
          }
        )
      );
    });

    it('cashback should be 0 when percent is 0', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
          fc.constantFrom('USD', 'EUR', 'JPY', 'GBP'),
          (amount, currency) => {
            expect(calculateCashback(amount, 0, currency)).toBe(0);
          }
        )
      );
    });

    it('cashback should equal amount when percent is 100', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
          fc.constantFrom('USD', 'EUR', 'JPY', 'GBP'),
          (amount, currency) => {
            const cashback = calculateCashback(amount, 100, currency);
            const decimals = CURRENCY_DECIMALS[currency] ?? 2;
            const multiplier = Math.pow(10, decimals);
            const roundedAmount = Math.round(amount * multiplier) / multiplier;
            expect(cashback).toBe(roundedAmount);
          }
        )
      );
    });

    it('cashback calculation should be monotonic', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
          fc.float({ min: Math.fround(0), max: Math.fround(50), noNaN: true }),
          fc.float({ min: Math.fround(0), max: Math.fround(50), noNaN: true }),
          fc.constantFrom('USD', 'EUR', 'JPY', 'GBP'),
          (amount, percent1, percent2, currency) => {
            const cashback1 = calculateCashback(amount, percent1, currency);
            const cashback2 = calculateCashback(amount, percent2, currency);

            if (percent1 <= percent2) {
              expect(cashback1).toBeLessThanOrEqual(cashback2);
            } else {
              expect(cashback1).toBeGreaterThanOrEqual(cashback2);
            }
          }
        )
      );
    });
  });

  describe('Currency Conversion', () => {
    it('should convert between currencies correctly', () => {
      // USD to EUR at 0.85
      expect(convertCurrency(100, 'USD', 'EUR', 0.85)).toBe(85.0);

      // USD to JPY at 110 (no decimals)
      expect(convertCurrency(100, 'USD', 'JPY', 110)).toBe(11000);

      // JPY to USD at 0.0091
      expect(convertCurrency(11000, 'JPY', 'USD', 0.0091)).toBe(100.1);
    });

    it('should handle round-trip conversions with acceptable precision loss', () => {
      const amount = 100;
      const usdToEur = 0.85;
      const eurToUsd = 1 / 0.85;

      const euros = convertCurrency(amount, 'USD', 'EUR', usdToEur);
      const backToUsd = convertCurrency(euros, 'EUR', 'USD', eurToUsd);

      // Allow for small rounding difference
      expect(Math.abs(backToUsd - amount)).toBeLessThan(0.5);
    });

    it('should handle zero decimal currency conversions', () => {
      // USD to JPY
      expect(convertCurrency(123.45, 'USD', 'JPY', 110)).toBe(13580);

      // JPY to KRW (both zero decimal)
      expect(convertCurrency(1000, 'JPY', 'KRW', 10.5)).toBe(10500);
    });

    it('should handle edge cases', () => {
      expect(convertCurrency(0, 'USD', 'EUR', 0.85)).toBe(0);
      expect(convertCurrency(100, 'USD', 'USD', 1)).toBe(100);
    });
  });

  describe('Property-Based Testing for Currency Conversion', () => {
    it('converting to same currency should return same amount', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
          fc.constantFrom('USD', 'EUR', 'JPY', 'GBP'),
          (amount, currency) => {
            const result = convertCurrency(amount, currency, currency, 1);
            const decimals = CURRENCY_DECIMALS[currency] ?? 2;
            const multiplier = Math.pow(10, decimals);
            const roundedAmount = Math.round(amount * multiplier) / multiplier;
            expect(result).toBe(roundedAmount);
          }
        )
      );
    });

    it('conversion should be proportional to exchange rate', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
          fc.float({ min: Math.fround(0.5), max: Math.fround(100), noNaN: true }),
          (amount, rate) => {
            const result1 = convertCurrency(amount, 'USD', 'EUR', rate);
            const result2 = convertCurrency(amount * 2, 'USD', 'EUR', rate);

            // Skip edge cases where tiny amounts round to zero
            if (result1 === 0) return;

            // Result should double when amount doubles (within rounding)
            const ratio = result2 / result1;
            expect(ratio).toBeGreaterThan(1.98);
            expect(ratio).toBeLessThan(2.02);
          }
        )
      );
    });
  });

  describe('Currency Formatting', () => {
    it('should format currencies with correct decimal places', () => {
      expect(formatCurrency(123.456, 'USD')).toBe('123.46');
      expect(formatCurrency(123.456, 'EUR')).toBe('123.46');
      expect(formatCurrency(12345, 'JPY')).toBe('12,345');
      expect(formatCurrency(123.4567, 'BHD')).toBe('123.457');
    });

    it('should add trailing zeros when needed', () => {
      expect(formatCurrency(100, 'USD')).toBe('100.00');
      expect(formatCurrency(50.5, 'EUR')).toBe('50.50');
      expect(formatCurrency(1000, 'JPY')).toBe('1,000');
    });

    it('should handle negative amounts', () => {
      expect(formatCurrency(-100, 'USD')).toBe('-100.00');
      expect(formatCurrency(-50.5, 'EUR')).toBe('-50.50');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0, 'USD')).toBe('0.00');
      expect(formatCurrency(0, 'JPY')).toBe('0');
    });
  });

  describe('Floating Point Precision', () => {
    it('should handle known problematic floating point operations', () => {
      // Classic 0.1 + 0.2 problem
      const sum = 0.1 + 0.2;
      expect(calculateCashback(sum, 100, 'USD')).toBe(0.3);

      // Other problematic operations
      expect(calculateCashback(0.1 + 0.7, 100, 'USD')).toBe(0.8);
      expect(calculateCashback(1.1 + 2.2, 100, 'USD')).toBe(3.3);
    });

    it('should handle division results correctly', () => {
      // 10 / 3 = 3.333...
      const oneThird = 10 / 3;
      expect(calculateCashback(oneThird, 100, 'USD')).toBe(3.33);

      // 100 / 6 = 16.666...
      const oneSixth = 100 / 6;
      expect(calculateCashback(oneSixth, 100, 'USD')).toBe(16.67);
    });
  });

  describe('Boundary Testing', () => {
    it('should handle amounts at decimal boundaries', () => {
      // Test rounding at .5 boundaries
      expect(calculateCashback(10.005, 100, 'USD')).toBe(10.01); // Round up
      expect(calculateCashback(10.015, 100, 'USD')).toBe(10.02); // Round up

      // Test at precision limits
      expect(calculateCashback(0.001, 100, 'USD')).toBe(0.0);
      expect(calculateCashback(0.004, 100, 'USD')).toBe(0.0);
      expect(calculateCashback(0.005, 100, 'USD')).toBe(0.01);
    });

    it('should handle percentages at boundaries', () => {
      expect(calculateCashback(100, 0.01, 'USD')).toBe(0.01);
      expect(calculateCashback(100, 99.99, 'USD')).toBe(99.99);
      expect(calculateCashback(100, 50.5, 'USD')).toBe(50.5);
    });
  });
});
