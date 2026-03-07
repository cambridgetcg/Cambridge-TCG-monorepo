/**
 * Exchange Rate Service
 *
 * Manages currency exchange rates using ExchangeRate-API as the primary source.
 * Implements caching, fallback mechanisms, and staleness monitoring.
 *
 * Based on research:
 * - ExchangeRate-API free tier: 1,500 requests/month
 * - Updates every 6 hours (4x daily = 120 requests/month)
 * - Caches in database for persistence across instances
 */

import type { Currency } from '@prisma/client';
import db from '~/db.server';
import { z } from 'zod';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  provider: 'ExchangeRate-API',
  apiKey: process.env.EXCHANGE_RATE_API_KEY?.trim() || '',
  apiUrl: 'https://v6.exchangerate-api.com/v6',
  updateIntervalHours: 6,     // Update 4 times per day
  staleThresholdHours: 72,    // Alert if rates >3 days old
  criticalThresholdHours: 168, // Critical alert if >7 days old
  fallbackToStatic: true,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

// ============================================================================
// TYPES
// ============================================================================

export interface ExchangeRates {
  [currency: string]: number;
}

export interface CachedRates {
  id: string;
  baseCurrency: Currency;
  rates: ExchangeRates;
  provider: string;
  fetchedAt: Date;
  isStale: boolean;
  hoursSinceUpdate: number;
}

export interface ConversionResult {
  from: Currency;
  to: Currency;
  amount: number;
  converted: number;
  rate: number;
  ratesDate: Date;
  isStale: boolean;
}

// ExchangeRate-API response schema
const ExchangeRateAPIResponse = z.object({
  result: z.string(),
  documentation: z.string().optional(),
  terms_of_use: z.string().optional(),
  time_last_update_unix: z.number(),
  time_last_update_utc: z.string(),
  time_next_update_unix: z.number(),
  time_next_update_utc: z.string(),
  base_code: z.string(),
  conversion_rates: z.record(z.string(), z.number()),
});

// ============================================================================
// EXCHANGE RATE SERVICE
// ============================================================================

export class ExchangeRateService {
  private memoryCache: Map<string, CachedRates> = new Map();
  private readonly TTL_MS = CONFIG.updateIntervalHours * 60 * 60 * 1000;

  /**
   * Get exchange rates for a base currency
   */
  async getRates(baseCurrency: Currency = 'USD'): Promise<CachedRates> {
    // 1. Check memory cache first (fastest)
    const memoryCached = this.memoryCache.get(baseCurrency);
    if (memoryCached && !this.isStale(memoryCached.fetchedAt)) {
      return memoryCached;
    }

    // 2. Check database cache (persistent)
    const dbCached = await this.getFromDatabase(baseCurrency);
    if (dbCached && !this.isStale(dbCached.fetchedAt)) {
      // Refresh memory cache
      this.memoryCache.set(baseCurrency, dbCached);
      return dbCached;
    }

    // 3. Fetch fresh rates from API
    try {
      return await this.fetchFreshRates(baseCurrency);
    } catch (error) {
      console.error('[ExchangeRate] Failed to fetch fresh rates:', error);

      // 4. Fall back to stale rates if available
      if (CONFIG.fallbackToStatic && dbCached) {
        console.warn('[ExchangeRate] Using stale rates as fallback');
        return { ...dbCached, isStale: true };
      }

      throw new Error('Unable to get exchange rates');
    }
  }

  /**
   * Convert amount between currencies
   */
  async convert(
    amount: number,
    from: Currency,
    to: Currency,
    baseCurrency: Currency = 'USD'
  ): Promise<ConversionResult> {
    if (from === to) {
      return {
        from,
        to,
        amount,
        converted: amount,
        rate: 1,
        ratesDate: new Date(),
        isStale: false,
      };
    }

    const rates = await this.getRates(baseCurrency);

    // Get rates relative to base currency
    const fromRate = rates.rates[from] || 1;
    const toRate = rates.rates[to] || 1;

    // Calculate cross rate and convert
    // Rates are "1 BASE = X CURRENCY", so to convert from→to: amount * toRate / fromRate
    const rate = toRate / fromRate;
    const converted = amount * rate;

    return {
      from,
      to,
      amount,
      converted: Math.round(converted * 100) / 100, // Round to 2 decimals
      rate,
      ratesDate: rates.fetchedAt,
      isStale: rates.isStale,
    };
  }

  /**
   * Round a conversion result to the target currency's standard decimal places.
   * JPY, KRW, VND etc. → 0 decimals; KWD, BHD, OMR → 3 decimals; most → 2 decimals.
   */
  roundToTargetCurrency(result: ConversionResult, currency: string): number {
    const zeroDecimal = ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'PYG', 'RWF'];
    const threeDecimal = ['KWD', 'BHD', 'OMR'];

    let decimals = 2;
    if (zeroDecimal.includes(currency)) decimals = 0;
    else if (threeDecimal.includes(currency)) decimals = 3;

    const factor = Math.pow(10, decimals);
    return Math.round(result.converted * factor) / factor;
  }

  /**
   * Force refresh rates from API
   */
  async refreshRates(baseCurrency: Currency = 'USD'): Promise<CachedRates> {
    return this.fetchFreshRates(baseCurrency);
  }

  /**
   * Check if rates need updating
   */
  async checkStaleness(): Promise<{
    needsUpdate: boolean;
    isStale: boolean;
    isCritical: boolean;
    hoursSinceUpdate: number;
    lastUpdate: Date | null;
  }> {
    const latest = await db.exchangeRate.findFirst({
      orderBy: { fetchedAt: 'desc' },
    });

    if (!latest) {
      return {
        needsUpdate: true,
        isStale: true,
        isCritical: true,
        hoursSinceUpdate: Infinity,
        lastUpdate: null,
      };
    }

    const hoursSinceUpdate = this.getHoursSince(latest.fetchedAt);

    return {
      needsUpdate: hoursSinceUpdate >= CONFIG.updateIntervalHours,
      isStale: hoursSinceUpdate >= CONFIG.staleThresholdHours,
      isCritical: hoursSinceUpdate >= CONFIG.criticalThresholdHours,
      hoursSinceUpdate,
      lastUpdate: latest.fetchedAt,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Fetch rates from database
   */
  private async getFromDatabase(baseCurrency: Currency): Promise<CachedRates | null> {
    const record = await db.exchangeRate.findFirst({
      where: { baseCurrency },
      orderBy: { fetchedAt: 'desc' },
    });

    if (!record) return null;

    const hoursSinceUpdate = this.getHoursSince(record.fetchedAt);

    return {
      id: record.id,
      baseCurrency: record.baseCurrency,
      rates: record.rates as ExchangeRates,
      provider: record.provider,
      fetchedAt: record.fetchedAt,
      isStale: hoursSinceUpdate >= CONFIG.staleThresholdHours,
      hoursSinceUpdate,
    };
  }

  /**
   * Fetch fresh rates from ExchangeRate-API
   */
  private async fetchFreshRates(baseCurrency: Currency): Promise<CachedRates> {
    if (!CONFIG.apiKey) {
      throw new Error('EXCHANGE_RATE_API_KEY not configured');
    }

    let lastError: Error | null = null;

    // Retry logic
    for (let attempt = 1; attempt <= CONFIG.retryAttempts; attempt++) {
      try {
        console.log(`[ExchangeRate] Fetching rates for ${baseCurrency} (attempt ${attempt})`);

        const url = `${CONFIG.apiUrl}/${CONFIG.apiKey}/latest/${baseCurrency}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const parsed = ExchangeRateAPIResponse.parse(data);

        if (parsed.result !== 'success') {
          throw new Error(`API error: ${parsed.result}`);
        }

        // Save to database
        const saved = await db.exchangeRate.create({
          data: {
            id: `${baseCurrency}-${Date.now()}`,
            baseCurrency,
            rates: parsed.conversion_rates,
            provider: CONFIG.provider,
            fetchedAt: new Date(parsed.time_last_update_unix * 1000),
            metadata: {
              nextUpdate: parsed.time_next_update_utc,
              baseCode: parsed.base_code,
            },
          },
        });

        const cachedRates: CachedRates = {
          id: saved.id,
          baseCurrency: saved.baseCurrency,
          rates: parsed.conversion_rates,
          provider: saved.provider,
          fetchedAt: saved.fetchedAt,
          isStale: false,
          hoursSinceUpdate: 0,
        };

        // Update memory cache
        this.memoryCache.set(baseCurrency, cachedRates);

        console.log(`[ExchangeRate] Successfully fetched ${Object.keys(parsed.conversion_rates).length} rates`);

        // Clean up old rates (keep last 30 days)
        await this.cleanupOldRates();

        return cachedRates;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[ExchangeRate] Attempt ${attempt} failed:`, lastError.message);

        if (attempt < CONFIG.retryAttempts) {
          await this.sleep(CONFIG.retryDelayMs * attempt);
        }
      }
    }

    throw lastError || new Error('Failed to fetch exchange rates');
  }

  /**
   * Clean up old exchange rate records
   */
  private async cleanupOldRates(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const deleted = await db.exchangeRate.deleteMany({
        where: {
          fetchedAt: { lt: thirtyDaysAgo },
        },
      });

      if (deleted.count > 0) {
        console.log(`[ExchangeRate] Cleaned up ${deleted.count} old rate records`);
      }
    } catch (error) {
      console.error('[ExchangeRate] Cleanup failed:', error);
    }
  }

  /**
   * Check if cached rates are stale
   */
  private isStale(fetchedAt: Date): boolean {
    return this.getHoursSince(fetchedAt) >= CONFIG.updateIntervalHours;
  }

  /**
   * Calculate hours since a date
   */
  private getHoursSince(date: Date): number {
    return (Date.now() - date.getTime()) / (1000 * 60 * 60);
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: ExchangeRateService | null = null;

export function getExchangeRateService(): ExchangeRateService {
  if (!instance) {
    instance = new ExchangeRateService();
  }
  return instance;
}

// ============================================================================
// MONITORING & ALERTS
// ============================================================================

/**
 * Check exchange rate health and send alerts if needed
 */
export async function monitorExchangeRates(): Promise<void> {
  const service = getExchangeRateService();
  const status = await service.checkStaleness();

  if (status.isCritical) {
    console.error('[ExchangeRate] CRITICAL: Rates have not updated in 7+ days!');
    // TODO: Send alert to admin/monitoring service
    await sendAlert('CRITICAL: Exchange rates are 7+ days old', {
      lastUpdate: status.lastUpdate,
      hoursSinceUpdate: status.hoursSinceUpdate,
    });
  } else if (status.isStale) {
    console.warn(`[ExchangeRate] WARNING: Rates are ${status.hoursSinceUpdate} hours old`);
    // TODO: Send warning to admin
    await sendAlert('WARNING: Exchange rates are stale', {
      lastUpdate: status.lastUpdate,
      hoursSinceUpdate: status.hoursSinceUpdate,
    });
  }

  if (status.needsUpdate) {
    console.log('[ExchangeRate] Triggering rate update...');
    try {
      await service.refreshRates();
    } catch (error) {
      console.error('[ExchangeRate] Update failed:', error);
    }
  }
}

/**
 * Send alert (placeholder - implement with your alerting system)
 */
async function sendAlert(message: string, details?: any): Promise<void> {
  console.error(`[ALERT] ${message}`, details);

  // TODO: Implement actual alerting
  // Options:
  // - Send email via SendGrid/AWS SES
  // - Post to Slack webhook
  // - Create incident in PagerDuty
  // - Log to monitoring service (Datadog, New Relic, etc.)

  // For now, just log to database
  try {
    await db.systemAlert.create({
      data: {
        id: `alert-${Date.now()}`,
        type: 'EXCHANGE_RATE_STALENESS',
        severity: message.includes('CRITICAL') ? 'CRITICAL' : 'WARNING',
        message,
        details: details || {},
        createdAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[ALERT] Failed to save alert:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getService: getExchangeRateService,
  monitorRates: monitorExchangeRates,
  ExchangeRateService,
};