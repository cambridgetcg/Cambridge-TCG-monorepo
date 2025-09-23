import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { MetricsService } from "~/services/monitoring/metrics.service";
import { Logger, CorrelationId } from "~/services/logger.service";
import { DatadogService } from "~/services/monitoring/datadog.service";
import { db } from "~/db.server";

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
export async function action({ request }: ActionFunctionArgs) {
  const correlationId = CorrelationId.generate();
  const startTime = Date.now();

  // Verify authorization (Vercel adds this header for cron jobs)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    Logger.security.suspiciousActivity('Unauthorized cron access attempt', {
      endpoint: '/api/cron/metrics',
      ip: request.headers.get('x-forwarded-for'),
    });
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    return await CorrelationId.run(correlationId, async () => {
      Logger.info('Starting daily metrics collection', {
        correlationId,
        trigger: request.headers.get('x-vercel-cron') ? 'vercel-cron' : 'manual',
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
        ...results,
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
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// GET method for testing/manual trigger
export async function loader({ request }: LoaderFunctionArgs) {
  return json({
    message: 'This is a POST-only endpoint for cron metrics collection',
    schedule: '0 2 * * * (daily at 2 AM UTC)',
    lastRun: 'Check Datadog or logs for last execution',
  });
}