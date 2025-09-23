import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Import the services to test
import {
  convertCurrency,
  roundToCurrencyPrecision,
  calculateCashback,
  formatCurrency
} from '~/utils/currency';

import {
  FinancialDecimal,
  convertBetweenCurrencies,
  calculateTieredCashback,
  calculateCashbackClawback,
  isZeroAmount,
  compareAmounts,
  validateAmount
} from '~/utils/financial-calculations';

// Currency codes for testing
const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'IDR', 'HUF', 'CLP'];
const THREE_DECIMAL_CURRENCIES = ['BHD', 'KWD', 'OMR', 'JOD', 'TND'];
const TWO_DECIMAL_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

describe('Financial Calculations - Property-Based Tests', () => {
  describe('Currency Conversion Properties', () => {
    it('should maintain inverse relationship for currency conversion', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
          fc.float({ min: Math.fround(0.0001), max: Math.fround(1000), noNaN: true }),
          (amount, rate) => {
            const converted = convertCurrency(amount, rate);
            const roundTrip = convertCurrency(converted, 1 / rate);

            // Should return to original amount within precision tolerance
            // Use lower precision due to floating point limitations
            expect(roundTrip).toBeCloseTo(amount, 2);
          }
        ),
        { numRuns: 500 }
      );
    });

    it('should scale linearly with amount', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          fc.float({ min: Math.fround(0.0001), max: Math.fround(1000), noNaN: true }),
          fc.integer({ min: 2, max: 10 }),
          (amount, rate, multiplier) => {
            const singleConversion = convertCurrency(amount, rate);
            const scaledConversion = convertCurrency(amount * multiplier, rate);

            // Scaled conversion should equal single conversion times multiplier
            expect(scaledConversion).toBeCloseTo(singleConversion * multiplier, 2);
          }
        )
      );
    });

    it('should handle zero amount correctly', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.0001), max: Math.fround(1000), noNaN: true }),
          (rate) => {
            const result = convertCurrency(0, rate);
            expect(result).toBe(0);
          }
        )
      );
    });

    it('should never produce negative amounts from positive inputs', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
          fc.float({ min: Math.fround(0.0001), max: Math.fround(1000), noNaN: true }),
          (amount, rate) => {
            const result = convertCurrency(amount, rate);
            expect(result).toBeGreaterThanOrEqual(0);
          }
        )
      );
    });

    it('should maintain transitivity through multiple conversions', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          fc.float({ min: Math.fround(0.1), max: Math.fround(10), noNaN: true }),
          fc.float({ min: Math.fround(0.1), max: Math.fround(10), noNaN: true }),
          (amount, rateAtoB, rateBtoC) => {
            // Convert A → B → C
            const toB = convertCurrency(amount, rateAtoB);
            const toC = convertCurrency(toB, rateBtoC);

            // Convert A → C directly
            const directToC = convertCurrency(amount, rateAtoB * rateBtoC);

            // Should be approximately equal
            expect(toC).toBeCloseTo(directToC, 2);
          }
        )
      );
    });
  });

  describe('Cashback Calculation Properties', () => {
    it('should never exceed the original amount', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000000 }), // amount in cents
          fc.integer({ min: 0, max: 100 }),        // percentage
          (amountCents, percentage) => {
            const amount = amountCents / 100;
            const cashback = calculateCashback(amount, percentage);

            expect(cashback).toBeLessThanOrEqual(amount);
            expect(cashback).toBeGreaterThanOrEqual(0);
          }
        )
      );
    });

    it('should be deterministic', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000000 }),
          fc.integer({ min: 0, max: 100 }),
          (amountCents, percentage) => {
            const amount = amountCents / 100;
            const cashback1 = calculateCashback(amount, percentage);
            const cashback2 = calculateCashback(amount, percentage);

            expect(cashback1).toBe(cashback2);
          }
        )
      );
    });

    it('should handle edge percentages correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000000 }),
          (amountCents) => {
            const amount = amountCents / 100;

            // 0% cashback should be 0
            expect(calculateCashback(amount, 0)).toBe(0);

            // 100% cashback should equal amount (floored to cents)
            const fullCashback = calculateCashback(amount, 100);
            expect(fullCashback).toBe(Math.floor(amount * 100) / 100);
          }
        )
      );
    });

    it('should scale proportionally with percentage', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
          fc.integer({ min: 1, max: 50 }),
          (amount, basePercent) => {
            const baseCashback = calculateCashback(amount, basePercent);
            const doubleCashback = calculateCashback(amount, basePercent * 2);

            // Double percentage should approximately double cashback (accounting for rounding)
            const expected = baseCashback * 2;
            expect(doubleCashback).toBeCloseTo(expected, 2);
          }
        )
      );
    });

    it('should handle tiny percentages without overflow', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(1000000), max: Math.fround(100000000), noNaN: true }),
          fc.float({ min: Math.fround(0.001), max: Math.fround(0.1), noNaN: true }),
          (amount, percentage) => {
            const cashback = calculateCashback(amount, percentage);

            expect(Number.isFinite(cashback)).toBe(true);
            expect(cashback).toBeGreaterThanOrEqual(0);
            expect(cashback).toBeLessThanOrEqual(amount);
          }
        )
      );
    });

    it('should maintain additive property for split transactions', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(10), max: Math.fround(10000), noNaN: true }),
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 2, max: 5 }),
          (totalAmount, percentage, splits) => {
            const totalCashback = calculateCashback(totalAmount, percentage);

            // Split amount into parts
            const partAmount = totalAmount / splits;
            let sumOfParts = 0;
            for (let i = 0; i < splits; i++) {
              sumOfParts += calculateCashback(partAmount, percentage);
            }

            // Sum of cashback on parts should be close to cashback on total
            // (may differ slightly due to rounding)
            expect(sumOfParts).toBeCloseTo(totalCashback, 1);
          }
        )
      );
    });
  });

  describe('Decimal Precision Properties', () => {
    it('should avoid floating point errors with FinancialDecimal', () => {
      // Classic floating point problem
      const decimal1 = FinancialDecimal.from(0.1, 8);
      const decimal2 = FinancialDecimal.from(0.2, 8);
      const sum = decimal1.add(decimal2);

      expect(sum.toNumber()).toBeCloseTo(0.3, 8);
      expect(sum.toString()).toBe('0.30000000');
    });

    it('should round consistently for all amounts', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.001), max: Math.fround(100000), noNaN: true }),
          (amount) => {
            // Test with USD (2 decimals)
            const roundedUSD = roundToCurrencyPrecision(amount, 'USD');
            const partsUSD = roundedUSD.toString().split('.');
            if (partsUSD[1]) {
              expect(partsUSD[1].length).toBeLessThanOrEqual(2);
            }

            // Test with JPY (0 decimals)
            const roundedJPY = roundToCurrencyPrecision(amount, 'JPY');
            expect(Number.isInteger(roundedJPY)).toBe(true);
          }
        )
      );
    });

    it('should handle very large numbers without overflow', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(1000000), max: Math.fround(Number.MAX_SAFE_INTEGER / 100), noNaN: true }),
          (amount) => {
            const decimal = FinancialDecimal.from(amount, 2);
            const result = decimal.multiply(100).divide(100);

            expect(Number.isFinite(result.toNumber())).toBe(true);
            expect(result.toNumber()).toBeCloseTo(amount, 2);
          }
        )
      );
    });

    it('should handle very small numbers without underflow', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.00001), max: Math.fround(0.1), noNaN: true }),
          (amount) => {
            const decimal = FinancialDecimal.from(amount, 8);
            const result = decimal.multiply(1000).divide(1000);

            expect(result.toNumber()).toBeCloseTo(amount, 8);
          }
        )
      );
    });
  });

  describe('Multi-Currency Calculation Properties', () => {
    it('should maintain consistency across currency boundaries', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
          fc.float({ min: Math.fround(0.1), max: Math.fround(10), noNaN: true }),
          fc.choice(fc.constant('USD'), fc.constant('EUR'), fc.constant('JPY')),
          fc.choice(fc.constant('USD'), fc.constant('EUR'), fc.constant('JPY')),
          (amount, rate, fromCurrency, toCurrency) => {
            if (fromCurrency === toCurrency) {
              // Same currency conversion should return same amount
              const result = convertBetweenCurrencies(amount, fromCurrency, toCurrency, 1);
              expect(result).toBe(roundToCurrencyPrecision(amount, fromCurrency));
            } else {
              // Cross-currency conversion should respect precision
              const result = convertBetweenCurrencies(amount, fromCurrency, toCurrency, rate);

              // Check precision based on target currency
              if (toCurrency === 'JPY') {
                expect(Number.isInteger(result)).toBe(true);
              } else {
                const parts = result.toString().split('.');
                if (parts[1]) {
                  expect(parts[1].length).toBeLessThanOrEqual(2);
                }
              }
            }
          }
        )
      );
    });

    it('should handle JPY (0 decimal) conversions correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100000000 }),
          fc.float({ min: Math.fround(100), max: Math.fround(150), noNaN: true }),
          (yenAmount, usdToJpyRate) => {
            // JPY to USD and back
            const usd = convertCurrency(yenAmount, 1 / usdToJpyRate);
            const backToJpy = convertCurrency(usd, usdToJpyRate);

            // Round to JPY precision (0 decimals)
            const roundedJpy = Math.round(backToJpy);

            // Should be close to original (within rounding)
            expect(Math.abs(roundedJpy - yenAmount)).toBeLessThanOrEqual(1);
          }
        )
      );
    });

    it('should handle small percentage calculations accurately', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 1000000 }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(1), noNaN: true }),
          (amountCents, percentage) => {
            const amount = amountCents / 100;
            const cashback = calculateCashback(amount, percentage);

            // Verify precision
            const expectedMax = amount * percentage / 100;
            expect(cashback).toBeLessThanOrEqual(expectedMax + 0.01); // Allow for rounding
            expect(cashback).toBeGreaterThanOrEqual(0);
          }
        )
      );
    });
  });

  describe('Ledger Balance Properties', () => {
    it('should maintain balance consistency with FinancialDecimal', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              type: fc.constantFrom('credit', 'debit'),
              amount: fc.integer({ min: 1, max: 100000 })
            }),
            { minLength: 1, maxLength: 100 }
          ),
          (transactions) => {
            let balance = FinancialDecimal.from(0, 2);
            let sumCredits = FinancialDecimal.from(0, 2);
            let sumDebits = FinancialDecimal.from(0, 2);

            for (const tx of transactions) {
              const amount = FinancialDecimal.from(tx.amount / 100, 2);
              if (tx.type === 'credit') {
                balance = balance.add(amount);
                sumCredits = sumCredits.add(amount);
              } else {
                balance = balance.subtract(amount);
                sumDebits = sumDebits.add(amount);
              }
            }

            // Balance should equal credits minus debits
            const expected = sumCredits.subtract(sumDebits);
            expect(balance.toNumber()).toBeCloseTo(expected.toNumber(), 2);
          }
        )
      );
    });

    it('should never lose cents in transactions', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 1, max: 99 }), { minLength: 10, maxLength: 100 }),
          (centAmounts) => {
            let totalCents = 0;
            let runningBalance = FinancialDecimal.from(0, 2);

            for (const cents of centAmounts) {
              const amount = cents / 100;
              totalCents += cents;
              runningBalance = runningBalance.add(FinancialDecimal.from(amount, 2));
            }

            // Total should match exactly
            const expectedTotal = totalCents / 100;
            expect(runningBalance.toNumber()).toBeCloseTo(expectedTotal, 2);
          }
        )
      );
    });
  });

  describe('Refund and Clawback Properties', () => {
    it('should calculate proportional clawback correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 100000 }),
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 1, max: 100 }),
          (orderAmount, cashbackPercent, refundPercent) => {
            const amount = orderAmount / 100;
            const cashback = calculateCashback(amount, cashbackPercent);
            const refundAmount = amount * refundPercent / 100;

            const clawback = calculateCashbackClawback(amount, refundAmount, cashback);

            // Clawback should be proportional to refund
            const expectedClawback = cashback * refundPercent / 100;
            expect(clawback).toBeCloseTo(expectedClawback, 2);

            // Clawback should never exceed original cashback
            expect(clawback).toBeLessThanOrEqual(cashback);
          }
        )
      );
    });

    it('should handle full refunds correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 100000 }),
          fc.integer({ min: 1, max: 20 }),
          (orderAmount, cashbackPercent) => {
            const amount = orderAmount / 100;
            const cashback = calculateCashback(amount, cashbackPercent);

            // Full refund should claw back all cashback
            const clawback = calculateCashbackClawback(amount, amount, cashback);
            expect(clawback).toBe(cashback);
          }
        )
      );
    });

    it('should handle zero refunds correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 100000 }),
          fc.integer({ min: 1, max: 20 }),
          (orderAmount, cashbackPercent) => {
            const amount = orderAmount / 100;
            const cashback = calculateCashback(amount, cashbackPercent);

            // Zero refund should claw back nothing
            const clawback = calculateCashbackClawback(amount, 0, cashback);
            expect(clawback).toBe(0);
          }
        )
      );
    });
  });
});