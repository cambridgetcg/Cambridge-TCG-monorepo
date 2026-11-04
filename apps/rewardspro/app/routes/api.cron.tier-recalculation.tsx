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
 * A pass over a shop resolves every customer not resolved since the shop
 * became due. It can span several runs, and each due shop gets a share of a
 * run's time, so a big shop finishes and can't hold up the others. The shop's
 * last run is stamped only when its pass is complete and error-free.
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
import { cronFailed, monitoredCron } from "~/services/cron-monitor.server";

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

// Customers resolved at or after this time are up to date for this pass: an
// earlier run of the pass, or an order, resolved them after the shop became
// due. A shop that never finished a pass has no due time, so a customer
// resolved within the last period (and the slack) counts as up to date.
function passStartedAt(frequency: RecalculationFrequency, lastRun: Date | null): Date {
  const period = DAYS_BETWEEN_RUNS[frequency] * DAY_MS;
  return lastRun
    ? new Date(lastRun.getTime() + period - DUE_SLACK_MS)
    : new Date(Date.now() - period - DUE_SLACK_MS);
}

// No complete pass for two periods: the shop is falling behind, so the run
// answers 500 for the cron monitor
function isOverdue(frequency: RecalculationFrequency, lastRun: Date | null, createdAt: Date): boolean {
  const period = DAYS_BETWEEN_RUNS[frequency] * DAY_MS;
  return Date.now() - (lastRun ?? createdAt).getTime() > 2 * period;
}

// Use loader for GET requests (Vercel sends GET, not POST)
export const loader = monitoredCron("tier-recalculation", async ({ request }: LoaderFunctionArgs) => {
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
    overdueShops: [] as string[],
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
  // The first thing that failed, for the cron monitor
  let firstProblem: unknown;

  try {
    // 3. Find all shops with automatic recalculation enabled, those that
    // waited longest first
    const shops = await prisma.shopSettings.findMany({
      where: {
        tierRecalculationEnabled: true
      },
      select: {
        shop: true,
        tierRecalculationFrequency: true,
        tierRecalculationLastRun: true,
        createdAt: true
      },
      orderBy: { tierRecalculationLastRun: { sort: 'asc', nulls: 'first' } }
    });

    log('info', `Found ${shops.length} shops with auto-recalculation enabled`);

    // 4. Keep the shops that are due, based on their frequency
    const dueShops = shops.filter((shopSettings) => {
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
      }
      return shouldRun;
    });

    for (const [index, shopSettings] of dueShops.entries()) {
      const frequency = shopSettings.tierRecalculationFrequency as RecalculationFrequency;
      let stamped = false;
      try {
        const now = Date.now();
        if (now >= deadline) {
          log('warn', `Out of time before ${shopSettings.shop}; it stays due for the next run`);
          results.unfinishedShops++;
          continue;
        }
        // An equal share of the time left, so every due shop moves forward;
        // time a shop doesn't use goes to the shops after it
        const shopDeadline = now + (deadline - now) / (dueShops.length - index);

        log('info', `Processing ${shopSettings.shop}`);

        if (!isDryRun) {
          // 5a. Resolve the tier, by the rules orders use, of every customer
          // not resolved since the shop became due
          const recalcResult = await recalculateTiersSmart(shopSettings.shop, {
            deadline: shopDeadline,
            resolvedBefore: passStartedAt(frequency, shopSettings.tierRecalculationLastRun),
          });

          // 5b. Refresh Customer.annualSpent (the shopper's account page shows
          // it) with what is left of the shop's share. Tiers don't read it: the
          // resolver sums orders itself.
          log('info', `Refreshing annual spending for ${shopSettings.shop}`);
          try {
            const spendingRefreshResult = await refreshAnnualSpending(shopSettings.shop, { deadline: shopDeadline });
            results.annualSpendingRefresh.customersProcessed += spendingRefreshResult.processed;
            results.annualSpendingRefresh.customersUpdated += spendingRefreshResult.updated;
            results.annualSpendingRefresh.errors += spendingRefreshResult.errors;
            results.annualSpendingRefresh.totalDurationMs += spendingRefreshResult.duration;

            log('info', `Annual spending refresh ${spendingRefreshResult.complete ? 'complete' : 'stopped at the time limit'} for ${shopSettings.shop}`, {
              processed: spendingRefreshResult.processed,
              updated: spendingRefreshResult.updated,
              errors: spendingRefreshResult.errors,
              durationMs: spendingRefreshResult.duration
            });
          } catch (spendingError: any) {
            log('error', `Annual spending refresh failed for ${shopSettings.shop}`, {
              error: spendingError.message
            });
          }

          // 6. Stamp the last run only when every customer was resolved, so a
          // shop with failures or one that ran out of time stays due
          results.errors += recalcResult.errors;
          if (recalcResult.errors > 0) {
            firstProblem ??= new Error(`${recalcResult.errors} customers failed tier recalculation in ${shopSettings.shop}`);
          }
          if (!recalcResult.complete) {
            results.unfinishedShops++;
            log('warn', `Ran out of time for ${shopSettings.shop}; the next run carries on`, {
              processed: recalcResult.processed,
              remaining: recalcResult.remaining
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
            stamped = true;
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
        firstProblem ??= error;
      } finally {
        if (!isDryRun && !stamped && isOverdue(frequency, shopSettings.tierRecalculationLastRun, shopSettings.createdAt)) {
          results.overdueShops.push(shopSettings.shop);
        }
      }
    }

    // 7. Log summary
    const summary = {
      shopsProcessed: results.shopsProcessed,
      shopsSkipped: results.skippedShops,
      shopsUnfinished: results.unfinishedShops,
      // No complete pass for two of their periods
      shopsOverdue: results.overdueShops.length,
      overdueShops: results.overdueShops,
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

    // 8. Send alert if there were errors (only when SLACK_WEBHOOK_URL is set)
    if (results.errors > 0 && process.env.SLACK_WEBHOOK_URL) {
      await sendAlert(`⚠️ Tier recalculation cron had ${results.errors} errors`);
    }

    // Customers left with a stale tier, or a shop falling behind, make this a
    // failed run, so the cron monitor and the logs show it as one
    const failed = results.errors > 0 || results.overdueShops.length > 0;
    if (failed) {
      cronFailed(request, firstProblem ?? new Error(`${results.overdueShops.length} shops overdue for tier recalculation: ${results.overdueShops.join(', ')}`));
    }
    return json({
      success: !failed,
      correlationId,
      summary
    }, { status: failed ? 500 : 200 });

  } catch (error: any) {
    log('error', 'Tier recalculation cron failed', { error: error.message, stack: error.stack });
    cronFailed(request, error);
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
});

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
