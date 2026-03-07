import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  formatCurrency,
  roundToCurrencyPrecision,
  parseCurrencyAmount,
  CURRENCY_DECIMALS,
  getCurrencySymbol
} from '~/utils/currency';

// Configure Decimal for financial precision
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP // Standard financial rounding
});

// Complete currency configuration with decimal places
const CURRENCY_CONFIG = {
  // 0 decimal currencies
  JPY: { decimals: 0, symbol: '¥', name: 'Japanese Yen' },
  KRW: { decimals: 0, symbol: '₩', name: 'South Korean Won' },
  VND: { decimals: 0, symbol: '₫', name: 'Vietnamese Dong' },
  IDR: { decimals: 0, symbol: 'Rp', name: 'Indonesian Rupiah' },
  CLP: { decimals: 0, symbol: '$', name: 'Chilean Peso' },
  PYG: { decimals: 0, symbol: '₲', name: 'Paraguayan Guarani' },

  // 2 decimal currencies (most common)
  USD: { decimals: 2, symbol: '$', name: 'US Dollar' },
  EUR: { decimals: 2, symbol: '€', name: 'Euro' },
  GBP: { decimals: 2, symbol: '£', name: 'British Pound' },
  CAD: { decimals: 2, symbol: 'C$', name: 'Canadian Dollar' },
  AUD: { decimals: 2, symbol: 'A$', name: 'Australian Dollar' },
  NZD: { decimals: 2, symbol: 'NZ$', name: 'New Zealand Dollar' },
  CHF: { decimals: 2, symbol: 'Fr', name: 'Swiss Franc' },
  SEK: { decimals: 2, symbol: 'kr', name: 'Swedish Krona' },
  NOK: { decimals: 2, symbol: 'kr', name: 'Norwegian Krone' },
  DKK: { decimals: 2, symbol: 'kr', name: 'Danish Krone' },
  SGD: { decimals: 2, symbol: 'S$', name: 'Singapore Dollar' },
  HKD: { decimals: 2, symbol: 'HK$', name: 'Hong Kong Dollar' },
  CNY: { decimals: 2, symbol: '¥', name: 'Chinese Yuan' },
  INR: { decimals: 2, symbol: '₹', name: 'Indian Rupee' },
  MXN: { decimals: 2, symbol: '$', name: 'Mexican Peso' },
  BRL: { decimals: 2, symbol: 'R$', name: 'Brazilian Real' },
  ZAR: { decimals: 2, symbol: 'R', name: 'South African Rand' },
  RUB: { decimals: 2, symbol: '₽', name: 'Russian Ruble' },
  TRY: { decimals: 2, symbol: '₺', name: 'Turkish Lira' },
  PLN: { decimals: 2, symbol: 'zł', name: 'Polish Zloty' },
  THB: { decimals: 2, symbol: '฿', name: 'Thai Baht' },

  // 3 decimal currencies
  BHD: { decimals: 3, symbol: 'BD', name: 'Bahraini Dinar' },
  KWD: { decimals: 3, symbol: 'KD', name: 'Kuwaiti Dinar' },
  OMR: { decimals: 3, symbol: 'ر.ع.', name: 'Omani Rial' },
  JOD: { decimals: 3, symbol: 'JD', name: 'Jordanian Dinar' },
  TND: { decimals: 3, symbol: 'DT', name: 'Tunisian Dinar' },

  // Cryptocurrency (for future support)
  BTC: { decimals: 8, symbol: '₿', name: 'Bitcoin' }
};

describe('Currency Formatter - All 33 Currencies', () => {
  describe('Decimal Places by Currency', () => {
    Object.entries(CURRENCY_CONFIG).forEach(([currency, config]) => {
      if (currency === 'BTC') return; // Skip cryptocurrency for now

      describe(`${currency} - ${config.name} (${config.decimals} decimals)`, () => {
        it(`should format ${currency} with exactly ${config.decimals} decimal places`, () => {
          const amount = 123.456789;
          const formatted = formatCurrency(amount, currency);

          // Extract numeric part — first strip the known symbol, then non-numeric chars
          const withoutSymbol = formatted.replace(config.symbol, '');
          const numericPart = withoutSymbol.replace(/[^0-9.-]/g, '');
          const parts = numericPart.split('.');

          if (config.decimals === 0) {
            expect(parts.length).toBe(1); // No decimal part
          } else {
            expect(parts[1]?.length || 0).toBe(config.decimals);
          }
        });

        it(`should round ${currency} correctly at the ${config.decimals} decimal boundary`, () => {
          // Test rounding at the boundary
          const testCases = [
            { input: 10.444, expected: config.decimals === 0 ? 10 : 10.44 },
            { input: 10.445, expected: config.decimals === 0 ? 10 : 10.45 },
            { input: 10.4444, expected: config.decimals === 3 ? 10.444 : config.decimals === 0 ? 10 : 10.44 },
            { input: 10.4445, expected: config.decimals === 3 ? 10.445 : config.decimals === 0 ? 10 : 10.44 },
            { input: 10.4455, expected: config.decimals === 3 ? 10.446 : config.decimals === 0 ? 10 : 10.45 },
          ];

          if (config.decimals === 0) {
            // Special cases for 0-decimal currencies
            expect(roundToCurrencyPrecision(9.4, currency)).toBe(9);
            expect(roundToCurrencyPrecision(9.5, currency)).toBe(10);
            expect(roundToCurrencyPrecision(9.6, currency)).toBe(10);
          } else if (config.decimals === 2) {
            expect(roundToCurrencyPrecision(10.444, currency)).toBe(10.44);
            expect(roundToCurrencyPrecision(10.445, currency)).toBe(10.45);
            expect(roundToCurrencyPrecision(10.446, currency)).toBe(10.45);
          } else if (config.decimals === 3) {
            expect(roundToCurrencyPrecision(10.4444, currency)).toBe(10.444);
            expect(roundToCurrencyPrecision(10.4445, currency)).toBe(10.445);
            expect(roundToCurrencyPrecision(10.4446, currency)).toBe(10.445);
          }
        });

        it(`should handle very small amounts in ${currency}`, () => {
          const smallAmount = 0.0001;
          const rounded = roundToCurrencyPrecision(smallAmount, currency);

          if (config.decimals === 0) {
            expect(rounded).toBe(0);
          } else if (config.decimals === 2) {
            expect(rounded).toBe(0);
          } else if (config.decimals === 3) {
            expect(rounded).toBe(0);
          }

          // Test smallest representable non-zero amount
          const smallestUnit = Math.pow(10, -config.decimals);
          if (config.decimals > 0) {
            const result = roundToCurrencyPrecision(smallestUnit, currency);
            expect(result).toBe(smallestUnit);
          }
        });

        it(`should handle very large amounts in ${currency}`, () => {
          const largeAmount = 999999999.999999;
          const rounded = roundToCurrencyPrecision(largeAmount, currency);

          expect(Number.isFinite(rounded)).toBe(true);
          expect(rounded).toBeGreaterThan(0);

          // Verify decimal places are still correct
          const parts = rounded.toString().split('.');
          if (config.decimals === 0) {
            expect(parts.length).toBe(1);
          } else {
            expect(parts[1]?.length || 0).toBeLessThanOrEqual(config.decimals);
          }
        });

        it(`should be idempotent for ${currency}`, () => {
          const amount = 123.456789;
          const once = roundToCurrencyPrecision(amount, currency);
          const twice = roundToCurrencyPrecision(once, currency);

          expect(twice).toBe(once);
        });
      });
    });
  });

  describe('0-Decimal Currencies (JPY, KRW, VND, etc.)', () => {
    const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'PYG'];

    zeroDecimalCurrencies.forEach(currency => {
      it(`${currency} should have no decimal places`, () => {
        const testAmounts = [
          { input: 1234.49, expected: 1234 },
          { input: 1234.50, expected: 1235 },
          { input: 1234.99, expected: 1235 },
          { input: 0.4, expected: 0 },
          { input: 0.5, expected: 1 },
          { input: 0.6, expected: 1 }
        ];

        testAmounts.forEach(({ input, expected }) => {
          const result = roundToCurrencyPrecision(input, currency);
          expect(result).toBe(expected);
        });
      });

      it(`${currency} should format without decimal separator`, () => {
        const formatted = formatCurrency(1234567, currency);
        expect(formatted).not.toContain('.');
        expect(formatted).toMatch(/1,234,567/); // Should have thousand separators
      });
    });

    it('should handle JPY to USD conversion correctly', () => {
      // 1 USD = ~110 JPY
      const usdAmount = 10.00; // $10.00
      const jpyAmount = Math.round(usdAmount * 110); // ¥1100

      const formattedJpy = formatCurrency(jpyAmount, 'JPY');
      expect(formattedJpy).not.toContain('.');

      // Convert back
      const backToUsd = jpyAmount / 110;
      const formattedUsd = formatCurrency(backToUsd, 'USD');
      expect(formattedUsd).toContain('10.00');
    });
  });

  describe('3-Decimal Currencies (KWD, BHD, OMR, etc.)', () => {
    const threeDecimalCurrencies = ['BHD', 'KWD', 'OMR', 'JOD', 'TND'];

    threeDecimalCurrencies.forEach(currency => {
      it(`${currency} should maintain 3 decimal places`, () => {
        const testAmounts = [
          { input: 1.2345, expected: 1.235 },
          { input: 1.2344, expected: 1.234 },
          { input: 0.0005, expected: 0.001 },
          { input: 0.0004, expected: 0.000 },
          { input: 10.9995, expected: 11.000 }
        ];

        testAmounts.forEach(({ input, expected }) => {
          const result = roundToCurrencyPrecision(input, currency);
          expect(result).toBeCloseTo(expected, 3);
        });
      });

      it(`${currency} should format with exactly 3 decimal places`, () => {
        const amounts = [1, 1.2, 1.23, 1.234, 1.2345];

        amounts.forEach(amount => {
          const formatted = formatCurrency(amount, currency);
          const config = CURRENCY_CONFIG[currency];
          const withoutSymbol = formatted.replace(config.symbol, '');
          const numericPart = withoutSymbol.replace(/[^0-9.-]/g, '');
          const parts = numericPart.split('.');

          expect(parts[1]).toHaveLength(3);
        });
      });
    });

    it('should handle very small KWD amounts correctly', () => {
      // KWD is one of the most valuable currencies
      const smallKwd = 0.001; // 1 fils (smallest unit)
      const rounded = roundToCurrencyPrecision(smallKwd, 'KWD');
      expect(rounded).toBe(0.001);

      const halfFils = 0.0005;
      const roundedHalf = roundToCurrencyPrecision(halfFils, 'KWD');
      expect(roundedHalf).toBe(0.001); // Round up
    });
  });

  describe('Common 2-Decimal Currencies', () => {
    const commonCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

    commonCurrencies.forEach(currency => {
      it(`${currency} should handle standard rounding correctly`, () => {
        const testCases = [
          { input: 10.244, expected: 10.24 },
          { input: 10.245, expected: 10.25 }, // Half-up rounding
          { input: 10.246, expected: 10.25 },
          { input: 0.001, expected: 0.00 },
          { input: 0.005, expected: 0.01 },
          { input: 0.009, expected: 0.01 }
        ];

        testCases.forEach(({ input, expected }) => {
          const result = roundToCurrencyPrecision(input, currency);
          expect(result).toBeCloseTo(expected, 2);
        });
      });

      it(`${currency} should format with proper symbol placement`, () => {
        const amount = 1234.56;
        const formatted = formatCurrency(amount, currency);

        const config = CURRENCY_CONFIG[currency];
        expect(formatted).toContain(config.symbol);
        expect(formatted).toContain('1,234.56');
      });
    });
  });

  describe('Decimal.js Precision', () => {
    it('should avoid JavaScript floating point errors', () => {
      // Classic floating point problem
      const jsSum = 0.1 + 0.2; // 0.30000000000000004 in JavaScript
      expect(jsSum).not.toBe(0.3);

      // Using Decimal.js
      const decimalSum = new Decimal('0.1').plus('0.2');
      expect(decimalSum.toNumber()).toBe(0.3);
      expect(decimalSum.toString()).toBe('0.3');
    });

    it('should handle compound interest calculations precisely', () => {
      // $1000 at 5.25% annual interest, compounded monthly for 1 year
      const principal = new Decimal(1000);
      const rate = new Decimal(0.0525);
      const periods = 12;

      let balance = principal;
      for (let i = 0; i < periods; i++) {
        balance = balance.times(rate.div(periods).plus(1));
      }

      // $1000 * (1 + 0.0525/12)^12 = $1053.78 (rounded to cents)
      const finalAmount = balance.toDecimalPlaces(2);
      expect(finalAmount.toNumber()).toBeCloseTo(1053.78, 2);
    });

    it('should maintain precision across multiple operations', () => {
      const operations = [
        new Decimal('123.45'),
        new Decimal('67.89'),
        new Decimal('0.12'),
        new Decimal('999.99')
      ];

      // Sum all
      const sum = operations.reduce((acc, val) => acc.plus(val), new Decimal(0));
      expect(sum.toString()).toBe('1191.45');

      // Divide by count and multiply back
      const average = sum.div(operations.length);
      const reconstructed = average.times(operations.length);
      expect(reconstructed.toString()).toBe(sum.toString());
    });
  });

  describe('Rounding Strategies', () => {
    it('should use half-up rounding (standard for finance)', () => {
      // ROUND_HALF_UP in Decimal.js rounds away from zero (not toward +inf)
      const testCases = [
        { input: 2.5, expected: 3 },
        { input: 3.5, expected: 4 },
        { input: -2.5, expected: -3 }, // Away from zero
        { input: -3.5, expected: -4 }
      ];

      testCases.forEach(({ input, expected }) => {
        const decimal = new Decimal(input);
        const rounded = decimal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        expect(rounded.toNumber()).toBe(expected);
      });
    });

    it('should support banker\'s rounding if configured', () => {
      // Configure for banker's rounding
      const bankerDecimal = Decimal.clone({ rounding: Decimal.ROUND_HALF_EVEN });

      // Banker's rounding: .5 rounds to nearest even
      const testCases = [
        { input: 2.5, expected: 2 }, // Round to even
        { input: 3.5, expected: 4 }, // Round to even
        { input: 4.5, expected: 4 }, // Round to even
        { input: 5.5, expected: 6 }  // Round to even
      ];

      testCases.forEach(({ input, expected }) => {
        const decimal = new bankerDecimal(input);
        const rounded = decimal.toDecimalPlaces(0);
        expect(rounded.toNumber()).toBe(expected);
      });
    });
  });

  describe('Currency Conversion Edge Cases', () => {
    it('should handle currency pairs with extreme rate differences', () => {
      // USD to VND (1 USD ≈ 23,000 VND)
      const usdAmount = 100.00;
      const vndAmount = Math.round(usdAmount * 23000);
      expect(vndAmount).toBe(2300000);

      const formattedVnd = formatCurrency(vndAmount, 'VND');
      expect(formattedVnd).not.toContain('.');
      expect(formattedVnd).toContain('2,300,000');
    });

    it('should handle micro-transactions in high-value currencies', () => {
      // Small transaction in KWD (high value currency)
      const kwdAmount = 0.005; // 5 fils
      const rounded = roundToCurrencyPrecision(kwdAmount, 'KWD');
      expect(rounded).toBe(0.005);

      // Convert to USD (1 KWD ≈ 3.30 USD)
      const usdEquivalent = kwdAmount * 3.30;
      const roundedUsd = roundToCurrencyPrecision(usdEquivalent, 'USD');
      expect(roundedUsd).toBeCloseTo(0.02, 2); // ~2 cents
    });

    it('should handle cross-currency calculations without compound rounding errors', () => {
      // Multi-step conversion: USD -> EUR -> JPY -> USD
      const originalUsd = 100.00;

      // Step 1: USD to EUR (rate: 0.85)
      const eurAmount = new Decimal(originalUsd).times(0.85);
      const eurRounded = eurAmount.toDecimalPlaces(2); // 85.00 EUR

      // Step 2: EUR to JPY (rate: 130)
      const jpyAmount = eurRounded.times(130);
      const jpyRounded = jpyAmount.toDecimalPlaces(0); // 11,050 JPY

      // Step 3: JPY back to USD (rate: 1/110)
      const backToUsd = jpyRounded.div(110);
      const usdFinal = backToUsd.toDecimalPlaces(2); // Should be close to 100.45

      // Small difference due to rounding at each step is acceptable
      expect(Math.abs(usdFinal.toNumber() - originalUsd)).toBeLessThan(1);
    });
  });

  describe('Formatting Edge Cases', () => {
    it('should handle negative amounts correctly', () => {
      const currencies = ['USD', 'EUR', 'JPY', 'KWD'];

      currencies.forEach(currency => {
        const formatted = formatCurrency(-1234.56, currency);
        expect(formatted).toContain('-');

        // Verify the negative sign is before the currency symbol
        const config = CURRENCY_CONFIG[currency];
        const symbolIndex = formatted.indexOf(config.symbol);
        const minusIndex = formatted.indexOf('-');
        expect(minusIndex).toBeLessThan(symbolIndex);
      });
    });

    it('should handle zero amounts', () => {
      Object.keys(CURRENCY_CONFIG).forEach(currency => {
        if (currency === 'BTC') return;

        const formatted = formatCurrency(0, currency);
        const config = CURRENCY_CONFIG[currency];

        expect(formatted).toContain(config.symbol);

        if (config.decimals === 0) {
          expect(formatted).toContain('0');
          expect(formatted).not.toContain('.');
        } else {
          const zeros = '0'.repeat(config.decimals);
          expect(formatted).toContain(`0.${zeros}`);
        }
      });
    });

    it('should handle maximum safe integer', () => {
      const maxSafe = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991

      const formatted = formatCurrency(maxSafe, 'USD');
      expect(formatted).toContain('9,007,199,254,740,991.00');

      // For JPY (no decimals)
      const formattedJpy = formatCurrency(maxSafe, 'JPY');
      expect(formattedJpy).not.toContain('.');
    });
  });

  describe('Cumulative Rounding Error Prevention', () => {
    it('should not accumulate rounding errors in sum operations', () => {
      // Sum many small transactions
      const transactions = Array(1000).fill(0).map(() => 0.01); // 1000 × $0.01

      // Using regular JavaScript (may accumulate errors)
      const jsSum = transactions.reduce((sum, t) => sum + t, 0);

      // Using Decimal
      const decimalSum = transactions.reduce(
        (sum, t) => sum.plus(new Decimal(t)),
        new Decimal(0)
      );

      expect(decimalSum.toNumber()).toBe(10.00);
      expect(decimalSum.toString()).toBe('10');

      // JavaScript might have tiny errors
      expect(Math.abs(jsSum - 10.00)).toBeLessThan(0.0000001);
    });

    it('should maintain accuracy in percentage calculations', () => {
      // Calculate 3.33% cashback on many transactions
      const transactions = [
        123.45, 67.89, 234.56, 89.01, 456.78,
        12.34, 567.89, 890.12, 345.67, 678.90
      ];

      const percentage = new Decimal('3.33');

      const cashbacks = transactions.map(amount => {
        const cashback = new Decimal(amount)
          .times(percentage)
          .div(100)
          .toDecimalPlaces(2); // Round to cents
        return cashback;
      });

      const totalCashback = cashbacks.reduce(
        (sum, cb) => sum.plus(cb),
        new Decimal(0)
      );

      // Verify total is exact sum of rounded cashbacks
      const expectedSum = cashbacks
        .map(cb => cb.toNumber())
        .reduce((sum, cb) => sum + cb, 0);

      expect(totalCashback.toNumber()).toBe(expectedSum);
    });
  });
});