/**
 * Scheduled tier recalculation cron job
 * Runs based on shop-specific frequency settings
 *
 * Should run daily at 3 AM UTC
 * Will check each shop's settings to determine if recalculation is needed
 *
 * Add to vercel.json: { "path": "/api/cron/tier-recalculation", "schedule": "0 3 * * *" }
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { recalculateTiersSmart } from "../services/tier-management.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import * as crypto from "crypto";

// Configuration
type RecalculationFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

// Helper function to determine if recalculation should run
function shouldRunRecalculation(
  frequency: RecalculationFrequency,
  lastRun: Date | null
): boolean {
  if (!lastRun) return true; // Never run before

  const now = new Date();
  const daysSinceLastRun = Math.floor(
    (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60 * 24)
  );

  switch (frequency) {
    case 'DAILY':
      return daysSinceLastRun >= 1;
    case 'WEEKLY':
      return daysSinceLastRun >= 7;
    case 'MONTHLY':
      return daysSinceLastRun >= 30;
    case 'QUARTERLY':
      return daysSinceLastRun >= 90;
    default:
      return false;
  }
}

// Use loader for GET requests (Vercel sends GET, not POST)
export async function loader({ request }: LoaderFunctionArgs) {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  // Structured logging helper
  const log = (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
    console.log(JSON.stringify({
      level,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      service: 'tier-recalculation-cron',
      ...data
    }));
  };

  log('info', 'Tier recalculation cron started');

  // 1. Verify authorization
  const auth = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || auth !== expectedAuth) {
    log('error', 'Unauthorized cron attempt');
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Clean up any expired locks from crashed instances
  await cleanupExpiredLocks();

  // 3. Acquire distributed lock to prevent concurrent execution
  const lock = await acquireCronLock('tier-recalculation', 30); // 30 minute TTL (longer due to batch processing)

  if (!lock.acquired) {
    log('info', 'Another instance is running, skipping', {
      existingLock: lock.existingLock
    });
    return json({
      success: true,
      skipped: true,
      reason: 'lock_not_acquired',
      correlationId
    });
  }

  // 4. Parse query parameters
  const url = new URL(request.url);
  const isDryRun = url.searchParams.get('dry-run') === 'true';

  if (isDryRun) {
    log('info', 'DRY RUN MODE - No changes will be made');
  }

  const results = {
    shopsProcessed: 0,
    customersProcessed: 0,
    totalUpgraded: 0,
    totalDowngraded: 0,
    totalUnchanged: 0,
    errors: 0,
    skippedShops: 0,
    // Track tier sources across all shops
    bySource: {
      manualOverride: 0,
      tierSubscription: 0,
      tierPurchase: 0,
      spendingBased: 0,
      none: 0,
    },
    details: [] as any[]
  };

  try {
    // 3. Find all shops with automatic recalculation enabled
    const shops = await db.shopSettings.findMany({
      where: {
        tierRecalculationEnabled: true
      },
      select: {
        shop: true,
        tierRecalculationFrequency: true,
        tierRecalculationLastRun: true
      }
    });

    log('info', `Found ${shops.length} shops with auto-recalculation enabled`);

    // 4. For each shop, check if it's time to run based on frequency
    for (const shopSettings of shops) {
      try {
        const shouldRun = shouldRunRecalculation(
          shopSettings.tierRecalculationFrequency as RecalculationFrequency,
          shopSettings.tierRecalculationLastRun
        );

        if (!shouldRun) {
          log('info', `Skipping ${shopSettings.shop} - not due yet`, {
            frequency: shopSettings.tierRecalculationFrequency,
            lastRun: shopSettings.tierRecalculationLastRun
          });
          results.skippedShops++;
          continue;
        }

        log('info', `Processing ${shopSettings.shop}`);

        if (!isDryRun) {
          // 5. Run tier recalculation for this shop (uses optimized path for 100+ customers)
          const recalcResult = await recalculateTiersSmart(shopSettings.shop);

          // 6. Update last run timestamp
          await db.shopSettings.update({
            where: { shop: shopSettings.shop },
            data: {
              tierRecalculationLastRun: new Date(),
              updatedAt: new Date()
            }
          });

          results.shopsProcessed++;
          results.customersProcessed += recalcResult.processed;
          results.totalUpgraded += recalcResult.upgraded;
          results.totalDowngraded += recalcResult.downgraded;
          results.totalUnchanged += recalcResult.unchanged;

          // Aggregate tier source statistics
          if (recalcResult.bySource) {
            results.bySource.manualOverride += recalcResult.bySource.manualOverride;
            results.bySource.tierSubscription += recalcResult.bySource.tierSubscription;
            results.bySource.tierPurchase += recalcResult.bySource.tierPurchase;
            results.bySource.spendingBased += recalcResult.bySource.spendingBased;
            results.bySource.none += recalcResult.bySource.none;
          }

          results.details.push({
            shop: shopSettings.shop,
            processed: recalcResult.processed,
            upgraded: recalcResult.upgraded,
            downgraded: recalcResult.downgraded,
            unchanged: recalcResult.unchanged,
            bySource: recalcResult.bySource,
            engine: recalcResult.engine,
            optimizedPath: recalcResult.optimizedPath,
            timing: recalcResult.timing
          });

          log('info', `Completed ${shopSettings.shop}`, {
            processed: recalcResult.processed,
            upgraded: recalcResult.upgraded,
            downgraded: recalcResult.downgraded,
            engine: recalcResult.engine,
            ...(recalcResult.timing && { totalMs: recalcResult.timing.totalMs })
          });
        } else {
          // Dry run - just log what would happen
          log('info', `[DRY RUN] Would process ${shopSettings.shop}`);
          results.details.push({
            shop: shopSettings.shop,
            dryRun: true,
            frequency: shopSettings.tierRecalculationFrequency
          });
        }
      } catch (error: any) {
        log('error', `Error processing shop ${shopSettings.shop}`, { error: error.message });
        results.errors++;
      }
    }

    // 7. Log summary
    const summary = {
      shopsProcessed: results.shopsProcessed,
      shopsSkipped: results.skippedShops,
      customersProcessed: results.customersProcessed,
      totalUpgraded: results.totalUpgraded,
      totalDowngraded: results.totalDowngraded,
      totalUnchanged: results.totalUnchanged,
      // Tier source breakdown (shows how many customers get their tier from each source)
      tierSources: {
        manualOverride: results.bySource.manualOverride,
        tierSubscription: results.bySource.tierSubscription,
        tierPurchase: results.bySource.tierPurchase,
        spendingBased: results.bySource.spendingBased,
        noTier: results.bySource.none,
      },
      errors: results.errors,
      duration: Date.now() - startTime,
      dryRun: isDryRun
    };

    log('info', 'Tier recalculation cron completed', summary);

    // 8. Send alert if there were errors
    if (results.errors > 0 && process.env.SLACK_WEBHOOK_URL) {
      await sendAlert(`⚠️ Tier recalculation cron had ${results.errors} errors`);
    }

    return json({
      success: true,
      correlationId,
      summary,
      details: isDryRun || results.errors > 0 ? results.details : undefined
    });

  } catch (error: any) {
    log('error', 'Tier recalculation cron failed', { error: error.message, stack: error.stack });
    return json({
      success: false,
      correlationId,
      error: error.message
    }, { status: 500 });
  } finally {
    // Always release the lock when done, even if there was an error
    if (lock.lockId) {
      await releaseCronLock(lock.lockId);
      log('info', 'Released distributed lock');
    }
  }
}

// Helper function to send alerts
async function sendAlert(message: string) {
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          channel: '#alerts'
        })
      });
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }
}
