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
import { verifyCronAuth } from "~/utils/cron-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
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
    results.error = 'Exchange rate update failed';
    results.duration = Date.now() - startTime;

    // Still return 200 to prevent Vercel from retrying
    // The monitoring system will alert if rates become stale
  }

  return json(
    {
      success: results.success,
      ratesUpdated: results.ratesUpdated,
      provider: results.provider,
      nextUpdate: results.nextUpdate,
      monitoring: results.monitoring,
      error: results.error,
      duration: results.duration,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}

// POST is deliberately non-mutating; Vercel invokes this cron with GET.
export async function action() {
  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET", "Cache-Control": "no-store" },
  });
}
