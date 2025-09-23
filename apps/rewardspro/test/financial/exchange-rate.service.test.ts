import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExchangeRateService } from '~/services/exchange-rate.service';
import Decimal from 'decimal.js';

// Mock Exchange Rate API
class MockExchangeRateAPI {
  private rates: Record<string, number> = {
    USD: 1.0,
    EUR: 0.85,
    GBP: 0.73,
    JPY: 110.25,
    AUD: 1.35,
    CAD: 1.25,
    CHF: 0.92,
    CNY: 6.45,
    SEK: 8.85,
    NZD: 1.42
  };
  private shouldFail = false;
  private callCount = 0;
  private responseDelay = 0;

  setRate(currency: string, rate: number) {
    this.rates[currency] = rate;
  }

  setRates(rates: Record<string, number>) {
    this.rates = { ...this.rates, ...rates };
  }

  simulateFailure(shouldFail: boolean) {
    this.shouldFail = shouldFail;
  }

  setResponseDelay(ms: number) {
    this.responseDelay = ms;
  }

  getCallCount() {
    return this.callCount;
  }

  resetCallCount() {
    this.callCount = 0;
  }

  async fetchLatestRates(base: string = 'USD') {
    this.callCount++;

    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    if (this.shouldFail) {
      throw new Error('API request failed: Network error');
    }

    // Convert rates to requested base
    const baseRate = this.rates[base] || 1.0;
    const convertedRates: Record<string, number> = {};

    for (const [currency, rate] of Object.entries(this.rates)) {
      if (currency !== base) {
        convertedRates[currency] = rate / baseRate;
      }
    }

    return {
      success: true,
      timestamp: Date.now() / 1000,
      base,
      date: new Date().toISOString().split('T')[0],
      rates: convertedRates
    };
  }
}

describe('Exchange Rate Service', () => {
  let api: MockExchangeRateAPI;
  let service: ExchangeRateService;

  beforeEach(() => {
    vi.useFakeTimers();
    api = new MockExchangeRateAPI();
    service = new ExchangeRateService(api);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Currency Conversion', () => {
    it('should convert currencies using latest rates', async () => {
      api.setRate('EUR', 0.85);

      const result = await service.convertCurrency(100, 'USD', 'EUR');
      expect(result).toBeCloseTo(85.0, 2);
    });

    it('should handle same currency conversion', async () => {
      const result = await service.convertCurrency(100, 'USD', 'USD');
      expect(result).toBe(100);
    });

    it('should handle JPY (0 decimal) conversion correctly', async () => {
      api.setRate('JPY', 110.25);

      const result = await service.convertCurrency(1, 'USD', 'JPY');
      expect(result).toBeCloseTo(110.25, 2);

      // Should round to no decimal places for JPY
      const rounded = service.roundToTargetCurrency(result, 'JPY');
      expect(rounded).toBe(110);
    });

    it('should handle KWD (3 decimal) conversion correctly', async () => {
      api.setRate('KWD', 0.3025);

      const result = await service.convertCurrency(100, 'USD', 'KWD');
      expect(result).toBeCloseTo(30.25, 3);

      // Should maintain 3 decimal places for KWD
      const rounded = service.roundToTargetCurrency(result, 'KWD');
      expect(rounded).toBeCloseTo(30.250, 3);
    });

    it('should convert through base currency for cross rates', async () => {
      api.setRates({
        EUR: 0.85,
        GBP: 0.73
      });

      // Convert EUR to GBP (through USD as base)
      const result = await service.convertCurrency(100, 'EUR', 'GBP');
      // 100 EUR = 100/0.85 USD = 117.65 USD
      // 117.65 USD = 117.65 * 0.73 GBP = 85.88 GBP
      expect(result).toBeCloseTo(85.88, 2);
    });

    it('should use Decimal for precise calculations', async () => {
      api.setRate('EUR', 0.85);

      // Test that 0.1 + 0.2 scenario works correctly
      const amount1 = await service.convertCurrency(0.1, 'USD', 'EUR');
      const amount2 = await service.convertCurrency(0.2, 'USD', 'EUR');
      const sum = new Decimal(amount1).plus(amount2);

      const directConversion = await service.convertCurrency(0.3, 'USD', 'EUR');
      expect(sum.toNumber()).toBeCloseTo(directConversion, 10);
    });
  });

  describe('Caching and TTL', () => {
    it('should cache rates and not refetch within TTL', async () => {
      api.resetCallCount();

      // First call - should fetch from API
      await service.getRates('USD');
      expect(api.getCallCount()).toBe(1);

      // Second call within TTL - should use cache
      await service.getRates('USD');
      expect(api.getCallCount()).toBe(1); // No additional call

      // Change the rate in API (shouldn't affect cached value)
      api.setRate('EUR', 0.95);

      const result = await service.convertCurrency(100, 'USD', 'EUR');
      expect(result).toBeCloseTo(85.0, 2); // Still using cached rate
      expect(api.getCallCount()).toBe(1); // Still no additional call
    });

    it('should refetch rates after TTL expires', async () => {
      api.resetCallCount();
      api.setRate('EUR', 0.85);

      // Initial fetch
      await service.getRates('USD');
      expect(api.getCallCount()).toBe(1);

      const firstResult = await service.convertCurrency(100, 'USD', 'EUR');
      expect(firstResult).toBeCloseTo(85.0, 2);

      // Advance time by 6 hours + 1 second (beyond TTL)
      vi.advanceTimersByTime(6 * 60 * 60 * 1000 + 1000);

      // Update rate in API
      api.setRate('EUR', 0.90);

      // Should trigger new fetch
      const secondResult = await service.convertCurrency(100, 'USD', 'EUR');
      expect(api.getCallCount()).toBe(2); // New API call
      expect(secondResult).toBeCloseTo(90.0, 2); // Using new rate
    });

    it('should handle cache across different base currencies', async () => {
      api.resetCallCount();

      // Fetch USD base rates
      await service.getRates('USD');
      expect(api.getCallCount()).toBe(1);

      // Fetch EUR base rates - should be a new call
      await service.getRates('EUR');
      expect(api.getCallCount()).toBe(2);

      // Fetch USD again - should use cache
      await service.getRates('USD');
      expect(api.getCallCount()).toBe(2); // No additional call
    });

    it('should share cache for concurrent requests', async () => {
      api.resetCallCount();
      api.setResponseDelay(100); // Simulate slow API

      // Launch multiple concurrent requests
      const promises = [
        service.convertCurrency(100, 'USD', 'EUR'),
        service.convertCurrency(200, 'USD', 'EUR'),
        service.convertCurrency(300, 'USD', 'EUR')
      ];

      const results = await Promise.all(promises);

      // Should only make one API call despite concurrent requests
      expect(api.getCallCount()).toBe(1);

      // All results should be consistent
      expect(results[0]).toBeCloseTo(85.0, 2);
      expect(results[1]).toBeCloseTo(170.0, 2);
      expect(results[2]).toBeCloseTo(255.0, 2);
    });
  });

  describe('Error Handling and Fallback', () => {
    it('should use cached rates when API fails', async () => {
      api.setRate('EUR', 0.85);

      // Prime the cache
      await service.getRates('USD');

      // Simulate API failure
      api.simulateFailure(true);

      // Should use cached rate
      const result = await service.convertCurrency(100, 'USD', 'EUR', {
        useFallback: true
      });

      expect(result.value).toBeCloseTo(85.0, 2);
      expect(result.fromCache).toBe(true);
      expect(result.warning).toContain('Using cached rate');
    });

    it('should throw error when API fails with no cache', async () => {
      api.simulateFailure(true);

      await expect(service.convertCurrency(100, 'USD', 'EUR'))
        .rejects
        .toThrow('Failed to fetch exchange rates');
    });

    it('should retry failed requests with exponential backoff', async () => {
      let attempts = 0;
      const mockApi = {
        fetchLatestRates: vi.fn().mockImplementation(async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Network error');
          }
          return {
            success: true,
            timestamp: Date.now() / 1000,
            base: 'USD',
            rates: { EUR: 0.85 }
          };
        })
      };

      const serviceWithRetry = new ExchangeRateService(mockApi, {
        maxRetries: 3,
        retryDelay: 100
      });

      const result = await serviceWithRetry.convertCurrency(100, 'USD', 'EUR');
      expect(result).toBeCloseTo(85.0, 2);
      expect(mockApi.fetchLatestRates).toHaveBeenCalledTimes(3);
    });

    it('should handle API rate limiting gracefully', async () => {
      let callCount = 0;
      const mockApi = {
        fetchLatestRates: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount > 5) {
            throw new Error('Rate limit exceeded');
          }
          return {
            success: true,
            timestamp: Date.now() / 1000,
            base: 'USD',
            rates: { EUR: 0.85 }
          };
        })
      };

      const service = new ExchangeRateService(mockApi);

      // Make several successful calls
      for (let i = 0; i < 5; i++) {
        await service.convertCurrency(100, 'USD', 'EUR');
      }

      // Next call should hit rate limit
      await expect(service.convertCurrency(100, 'USD', 'EUR'))
        .rejects
        .toThrow('Rate limit exceeded');
    });

    it('should validate API response structure', async () => {
      const invalidApi = {
        fetchLatestRates: vi.fn().mockResolvedValue({
          // Missing required fields
          success: true
        })
      };

      const service = new ExchangeRateService(invalidApi);

      await expect(service.getRates('USD'))
        .rejects
        .toThrow('Invalid API response structure');
    });
  });

  describe('Stale Data Handling', () => {
    it('should mark data as stale but usable within grace period', async () => {
      api.setRate('EUR', 0.85);

      // Prime the cache
      await service.getRates('USD');

      // Advance time beyond TTL but within grace period (6-12 hours)
      vi.advanceTimersByTime(7 * 60 * 60 * 1000);

      // API fails but we're within grace period
      api.simulateFailure(true);

      const result = await service.convertCurrency(100, 'USD', 'EUR', {
        allowStale: true
      });

      expect(result.value).toBeCloseTo(85.0, 2);
      expect(result.isStale).toBe(true);
      expect(result.staleness).toBeCloseTo(1 * 60 * 60 * 1000, -3); // ~1 hour stale
    });

    it('should reject stale data beyond grace period', async () => {
      api.setRate('EUR', 0.85);

      // Prime the cache
      await service.getRates('USD');

      // Advance time well beyond grace period (>12 hours)
      vi.advanceTimersByTime(13 * 60 * 60 * 1000);

      // API fails
      api.simulateFailure(true);

      await expect(service.convertCurrency(100, 'USD', 'EUR', {
        allowStale: true
      })).rejects.toThrow('Exchange rates too stale');
    });
  });

  describe('Performance and Precision', () => {
    it('should complete conversion within performance budget', async () => {
      api.setRate('EUR', 0.85);
      await service.getRates('USD'); // Prime cache

      const start = performance.now();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        await service.convertCurrency(Math.random() * 1000, 'USD', 'EUR');
      }

      const duration = performance.now() - start;
      const avgTime = duration / iterations;

      expect(avgTime).toBeLessThan(1); // Less than 1ms per conversion
    });

    it('should maintain precision to 4 decimal places', async () => {
      api.setRate('EUR', 0.8534567);

      const result = await service.convertCurrency(123.456789, 'USD', 'EUR');
      expect(result).toBeCloseTo(105.3456, 4);
    });

    it('should handle extreme exchange rates', async () => {
      // Test hyperinflation scenario
      api.setRate('VEF', 4_500_000); // Venezuelan Bolivar

      const result = await service.convertCurrency(1, 'USD', 'VEF');
      expect(result).toBe(4_500_000);

      // Test very small rates
      api.setRate('BTC', 0.00002345); // Bitcoin rate

      const btcResult = await service.convertCurrency(50000, 'USD', 'BTC');
      expect(btcResult).toBeCloseTo(1.1725, 4);
    });
  });

  describe('Multi-Currency Scenarios', () => {
    it('should handle triangular arbitrage check', async () => {
      api.setRates({
        EUR: 0.85,
        GBP: 0.73,
        USD: 1.0
      });

      // USD -> EUR -> GBP -> USD should result in ~same amount
      const startAmount = 1000;
      const toEur = await service.convertCurrency(startAmount, 'USD', 'EUR');
      const toGbp = await service.convertCurrency(toEur, 'EUR', 'GBP');
      const backToUsd = await service.convertCurrency(toGbp, 'GBP', 'USD');

      // Should be very close to original (small loss due to rounding)
      expect(backToUsd).toBeCloseTo(startAmount, 0);
      expect(Math.abs(backToUsd - startAmount)).toBeLessThan(1); // Less than $1 difference
    });

    it('should batch convert multiple amounts efficiently', async () => {
      api.resetCallCount();
      api.setRates({
        EUR: 0.85,
        GBP: 0.73,
        JPY: 110.25
      });

      const amounts = [100, 200, 300, 400, 500];
      const currencies = ['EUR', 'GBP', 'JPY'];

      const results = await service.batchConvert(amounts, 'USD', currencies);

      // Should only fetch rates once
      expect(api.getCallCount()).toBe(1);

      // Verify results
      expect(results).toHaveLength(amounts.length * currencies.length);
      expect(results[0]).toMatchObject({
        amount: 100,
        from: 'USD',
        to: 'EUR',
        value: expect.closeTo(85, 2)
      });
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache on demand', async () => {
      api.resetCallCount();
      api.setRate('EUR', 0.85);

      // Initial fetch
      await service.getRates('USD');
      expect(api.getCallCount()).toBe(1);

      // Use cached rate
      const firstResult = await service.convertCurrency(100, 'USD', 'EUR');
      expect(firstResult).toBeCloseTo(85.0, 2);

      // Invalidate cache
      service.invalidateCache();

      // Update rate
      api.setRate('EUR', 0.90);

      // Should fetch new rates
      const secondResult = await service.convertCurrency(100, 'USD', 'EUR');
      expect(api.getCallCount()).toBe(2);
      expect(secondResult).toBeCloseTo(90.0, 2);
    });

    it('should support selective cache invalidation', async () => {
      // Fetch rates for multiple bases
      await service.getRates('USD');
      await service.getRates('EUR');

      // Invalidate only USD cache
      service.invalidateCache('USD');

      api.resetCallCount();

      // USD should refetch
      await service.getRates('USD');
      expect(api.getCallCount()).toBe(1);

      // EUR should still use cache
      await service.getRates('EUR');
      expect(api.getCallCount()).toBe(1); // No additional call
    });
  });
});