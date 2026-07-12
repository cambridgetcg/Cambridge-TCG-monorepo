import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { MetricsService } from "~/services/monitoring/metrics.service";
import { Logger, CorrelationId } from "~/services/logger.service";
import { DatadogService } from "~/services/monitoring/datadog.service";
import { db } from "~/db.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";

const JOB_NAME = "daily-metrics";
const LOCK_TTL_MINUTES = 30;

/**
 * Cron job endpoint for daily metrics reporting
 * Should be called once per day by Vercel Cron or external scheduler
 *
 * Vercel cron configuration (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/metrics",
 *     "schedule": "0 2 * * *"
 *   }]
 * }
 */
export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const correlationId = CorrelationId.generate();
  const startTime = Date.now();
  let lockId: string | undefined;

  // Acquire distributed lock
  await cleanupExpiredLocks();
  const lock = await acquireCronLock(JOB_NAME, LOCK_TTL_MINUTES);

  if (!lock.acquired) {
    Logger.info('Metrics cron skipped - another instance running', {
      correlationId,
      existingLock: lock.existingLock,
    });
    return json({
      status: 'skipped',
      reason: 'Another instance is already running',
      existingLock: lock.existingLock,
    });
  }

  lockId = lock.lockId;

  try {
    return await CorrelationId.run(correlationId, async () => {
      Logger.info('Starting daily metrics collection', {
        correlationId,
        trigger: 'authenticated-cron',
      });

      // Get all shops to report metrics for
      const shops = await db.shopSettings.findMany({
        where: {
          isActive: true,
        },
        select: {
          shop: true,
          name: true,
        },
      });

      const results = {
        success: 0,
        failed: 0,
        shops: [] as Array<{ shop: string; status: string; error?: string }>,
        duration: 0,
      };

      // Report metrics for each shop
      for (const shopData of shops) {
        try {
          Logger.info(`Collecting metrics for shop: ${shopData.shop}`, {
            shop: shopData.shop,
          });

          // Collect and report metrics
          const metrics = await MetricsService.reportDailyMetrics(shopData.shop);

          results.shops.push({
            shop: shopData.shop,
            status: 'success',
          });
          results.success++;

          // Log summary
          Logger.info(`Metrics collected for shop: ${shopData.shop}`, {
            shop: shopData.shop,
            customers: metrics.metrics.customerMetrics.total,
            mrr: metrics.metrics.subscriptionMetrics.mrr,
            ledgerDiscrepancies: metrics.metrics.ledgerConsistency.discrepancyCount,
          });
        } catch (error) {
          Logger.error(`Failed to collect metrics for shop: ${shopData.shop}`, error as Error, {
            shop: shopData.shop,
          });

          results.shops.push({
            shop: shopData.shop,
            status: 'failed',
            error: (error as Error).message,
          });
          results.failed++;

          // Track failure
          DatadogService.metrics.increment('cron.metrics.shop_failed');
        }
      }

      // Collect system-wide performance metrics
      try {
        await MetricsService.collectPerformanceMetrics();
      } catch (error) {
        Logger.error('Failed to collect performance metrics', error as Error);
      }

      results.duration = Date.now() - startTime;

      // Log completion
      Logger.info('Daily metrics collection completed', {
        correlationId,
        ...results,
      });

      // Track cron execution
      DatadogService.metrics.increment('cron.metrics.executed');
      DatadogService.metrics.timing('cron.metrics.duration', results.duration);
      DatadogService.metrics.gauge('cron.metrics.shops_processed', shops.length);

      return json({
        status: 'completed',
        correlationId,
        timestamp: new Date().toISOString(),
        successfulShops: results.success,
        failedShops: results.failed,
        shopsProcessed: results.shops.length,
        duration: results.duration,
      });
    });
  } catch (error) {
    Logger.error('Critical error in metrics cron job', error as Error, {
      correlationId,
      critical: true,
    });

    // Track critical failure
    DatadogService.metrics.increment('cron.metrics.critical_failure');

    return json(
      {
        status: 'error',
        correlationId,
        error: "Metrics collection failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  } finally {
    // Always release the lock
    if (lockId) {
      await releaseCronLock(lockId);
    }
  }
}

// POST is deliberately non-mutating; Vercel invokes configured cron routes with GET.
export async function action() {
  return json(
    {
      error: "Method not allowed",
      message: "Use GET for authenticated cron metrics collection.",
    },
    {
      status: 405,
      headers: { Allow: "GET", "Cache-Control": "no-store" },
    },
  );
}
