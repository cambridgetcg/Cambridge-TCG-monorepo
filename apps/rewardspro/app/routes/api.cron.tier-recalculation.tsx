/**
 * Scheduled tier recalculation cron job
 * Runs based on shop-specific frequency settings
 *
 * Runs daily at 09:00 UTC (vercel.json: "0 9 * * *")
 * Will check each shop's settings to determine if recalculation is needed
 *
 * Every customer is resolved by the same rules orders use
 * (recalculateTiersSmart → updateCustomerToEffectiveTier).
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { recalculateTiersSmart, refreshAnnualSpending } from "../services/tier-management.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import * as crypto from "node:crypto";
import { verifyCronAuth } from "~/utils/cron-auth.server";

// Configuration
type RecalculationFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_BETWEEN_RUNS: Record<RecalculationFrequency, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 90,
};

// The cron fires at the same time every day and lastRun is stamped a little
// after that, so a whole number of days later slightly less than that many
// days have passed. Without this slack DAILY ran every other day and WEEKLY
// every 8 days.
const DUE_SLACK_MS = 60 * 60 * 1000;

// Functions stop at 300 seconds. Start no customer after this, so the run
// reports what it did and the next run carries on.
const RUN_TIME_BUDGET_MS = 240 * 1000;

// Helper function to determine if recalculation should run
function shouldRunRecalculation(
  frequency: RecalculationFrequency,
  lastRun: Date | null
): boolean {
  if (!lastRun) return true; // Never run before

  const days = DAYS_BETWEEN_RUNS[frequency];
  if (!days) return false;

  return Date.now() - lastRun.getTime() >= days * DAY_MS - DUE_SLACK_MS;
}

// Use loader for GET requests (Vercel sends GET, not POST)
export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const deadline = startTime + RUN_TIME_BUDGET_MS;
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
    unfinishedShops: 0,
    // Track tier sources across all shops
    bySource: {
      manualOverride: 0,
      tierSubscription: 0,
      tierPurchase: 0,
      spendingBased: 0,
      none: 0,
    },
    // Track annual spending refresh stats
    annualSpendingRefresh: {
      customersProcessed: 0,
      customersUpdated: 0,
      errors: 0,
      totalDurationMs: 0,
    },
    details: [] as any[]
  };

  try {
    // 3. Find all shops with automatic recalculation enabled
    const shops = await prisma.shopSettings.findMany({
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

        if (Date.now() >= deadline) {
          log('warn', `Out of time before ${shopSettings.shop}; it stays due for the next run`);
          results.unfinishedShops++;
          continue;
        }

        log('info', `Processing ${shopSettings.shop}`);

        if (!isDryRun) {
          // 5a. Refresh Customer.annualSpent (the shopper's account page shows
          // it). Tiers don't read it: the resolver sums orders itself.
          log('info', `Refreshing annual spending for ${shopSettings.shop}`);
          try {
            const spendingRefreshResult = await refreshAnnualSpending(shopSettings.shop);
            results.annualSpendingRefresh.customersProcessed += spendingRefreshResult.processed;
            results.annualSpendingRefresh.customersUpdated += spendingRefreshResult.updated;
            results.annualSpendingRefresh.errors += spendingRefreshResult.errors;
            results.annualSpendingRefresh.totalDurationMs += spendingRefreshResult.duration;

            log('info', `Annual spending refresh complete for ${shopSettings.shop}`, {
              processed: spendingRefreshResult.processed,
              updated: spendingRefreshResult.updated,
              errors: spendingRefreshResult.errors,
              durationMs: spendingRefreshResult.duration
            });
          } catch (spendingError: any) {
            log('error', `Annual spending refresh failed for ${shopSettings.shop}`, {
              error: spendingError.message
            });
            // Continue with tier recalculation even if spending refresh fails
          }

          // 5b. Resolve every customer's tier by the rules orders use
          const recalcResult = await recalculateTiersSmart(shopSettings.shop, { deadline });

          // 6. Stamp the last run only when every customer was resolved, so a
          // shop with failures or one that ran out of time stays due
          results.errors += recalcResult.errors;
          if (!recalcResult.complete) {
            results.unfinishedShops++;
            log('warn', `Ran out of time for ${shopSettings.shop}; the next run carries on`, {
              processed: recalcResult.processed
            });
          }
          if (recalcResult.errors === 0 && recalcResult.complete) {
            await prisma.shopSettings.update({
              where: { shop: shopSettings.shop },
              data: {
                tierRecalculationLastRun: new Date(),
                updatedAt: new Date()
              }
            });
          }

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
            errors: recalcResult.errors,
            complete: recalcResult.complete,
            bySource: recalcResult.bySource,
            engine: recalcResult.engine,
            optimizedPath: recalcResult.optimizedPath,
            timing: recalcResult.timing
          });

          log('info', `Completed ${shopSettings.shop}`, {
            processed: recalcResult.processed,
            upgraded: recalcResult.upgraded,
            downgraded: recalcResult.downgraded,
            errors: recalcResult.errors,
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
      shopsUnfinished: results.unfinishedShops,
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
      // Annual spending refresh statistics
      annualSpendingRefresh: {
        customersProcessed: results.annualSpendingRefresh.customersProcessed,
        customersUpdated: results.annualSpendingRefresh.customersUpdated,
        errorCount: results.annualSpendingRefresh.errors,
        durationMs: results.annualSpendingRefresh.totalDurationMs,
      },
      errorCount: results.errors,
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
      summary
    });

  } catch (error: any) {
    log('error', 'Tier recalculation cron failed', { error: error.message, stack: error.stack });
    return json({
      success: false,
      correlationId,
      error: "Tier recalculation failed"
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
