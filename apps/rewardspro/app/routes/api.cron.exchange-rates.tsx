/**
 * Exchange Rate Update Cron Job
 *
 * Updates exchange rates from ExchangeRate-API every 6 hours.
 * Monitors for staleness and sends alerts if rates are outdated.
 *
 * Schedule: 0 [every 6 hours] * * * (cron pattern)
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getExchangeRateService, monitorExchangeRates } from "~/services/exchange-rate.server";

/**
 * Verify cron authorization
 */
function verifyCronAuth(request: Request): boolean {
  // Check for Vercel cron secret
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Also check for a custom header that Vercel sends
  const vercelCron = request.headers.get('x-vercel-cron');
  if (vercelCron === '1') {
    return true;
  }

  // Development environment - require explicit bypass flag for safety
  if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_CRON_BYPASS === 'true') {
    console.warn('[ExchangeRate] Cron auth bypassed in development (ALLOW_DEV_CRON_BYPASS=true)');
    return true;
  }

  return false;
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Verify this is a legitimate cron request
  if (!verifyCronAuth(request)) {
    console.error('[ExchangeRate] Unauthorized cron request');
    return new Response('Unauthorized', { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    success: false,
    ratesUpdated: 0,
    provider: 'ExchangeRate-API',
    nextUpdate: '6 hours',
    monitoring: {
      needsUpdate: false,
      isStale: false,
      isCritical: false,
      hoursSinceUpdate: 0,
      lastUpdate: null as Date | null,
    },
    error: null as string | null,
    duration: 0,
  };

  try {
    console.log('[ExchangeRate] Starting scheduled update...');

    // First, check staleness and send alerts if needed
    await monitorExchangeRates();

    // Get the exchange rate service
    const service = getExchangeRateService();

    // Check current staleness status
    const status = await service.checkStaleness();
    results.monitoring = status;

    // Only update if needed (rates older than 6 hours)
    if (status.needsUpdate) {
      console.log('[ExchangeRate] Rates need update, fetching...');

      // Refresh rates for USD (base currency)
      const rates = await service.refreshRates('USD');

      results.success = true;
      results.ratesUpdated = Object.keys(rates.rates).length;

      console.log(`[ExchangeRate] Successfully updated ${results.ratesUpdated} exchange rates`);

      // Optional: Update rates for other base currencies if needed
      // This could be useful for stores that primarily use EUR, GBP, etc.
      const additionalCurrencies = process.env.ADDITIONAL_BASE_CURRENCIES?.split(',') || [];
      for (const currency of additionalCurrencies) {
        try {
          await service.refreshRates(currency as any);
          console.log(`[ExchangeRate] Updated rates for base currency: ${currency}`);
        } catch (error) {
          console.error(`[ExchangeRate] Failed to update rates for ${currency}:`, error);
        }
      }
    } else {
      console.log('[ExchangeRate] Rates are fresh, skipping update');
      results.success = true;
      results.ratesUpdated = 0;
    }

    // Calculate duration
    results.duration = Date.now() - startTime;

    // Log success metrics
    console.log('[ExchangeRate] Cron job completed', {
      duration: `${results.duration}ms`,
      ratesUpdated: results.ratesUpdated,
      isStale: results.monitoring.isStale,
      hoursSinceUpdate: results.monitoring.hoursSinceUpdate,
    });

  } catch (error) {
    // Log error but don't throw - cron should return 200 to avoid retries
    console.error('[ExchangeRate] Cron job failed:', error);
    results.error = error instanceof Error ? error.message : 'Unknown error';
    results.duration = Date.now() - startTime;

    // Still return 200 to prevent Vercel from retrying
    // The monitoring system will alert if rates become stale
  }

  return json(results, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

// Health check endpoint for manual testing
export async function action({ request }: LoaderFunctionArgs) {
  // Allow manual trigger in development
  if (process.env.NODE_ENV !== 'development') {
    return new Response('Method not allowed', { status: 405 });
  }

  console.log('[ExchangeRate] Manual trigger initiated');
  return loader({ request } as LoaderFunctionArgs);
}