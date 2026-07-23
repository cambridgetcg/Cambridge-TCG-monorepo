/**
 * Monthly Reset Cron Job
 * Resets order counts and unlocks all shops on the 1st of each month
 *
 * Schedule: 0 0 1 * * (Midnight on 1st of every month)
 * Security: Requires CRON_SECRET in Authorization header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";
import { getPlanOrderLimit } from "~/constants/billing.constants";
import { PRICING_PLANS, tryGetPlanKey } from "~/constants/pricing-contract";

const JOB_NAME = "monthly-reset";
const LOCK_TTL_MINUTES = 30; // 30 minutes for monthly reset

export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const correlationId = uuidv4();
  let lockId: string | undefined;

  // Structured logging
  const log = (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
    console.log(JSON.stringify({
      level,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      service: 'monthly-reset-cron',
      ...data
    }));
  };

  log('info', 'Monthly reset cron invocation started');

  // 2. Acquire distributed lock to prevent concurrent execution
  await cleanupExpiredLocks();
  const lock = await acquireCronLock(JOB_NAME, LOCK_TTL_MINUTES);

  if (!lock.acquired) {
    log('warn', 'Skipping - another instance is running', {
      existingLock: lock.existingLock
    });
    return json({
      success: false,
      skipped: true,
      reason: 'Another instance is already running',
      existingLock: lock.existingLock
    });
  }

  lockId = lock.lockId;
  log('info', 'Acquired distributed lock', { lockId });

  try {
  // 3. Get current month info
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-12
  const currentMonthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  log('info', `Processing monthly reset for ${currentMonthName}`, {
    year,
    month
  });

  // 3. Get all shops with usage from last month
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastYear = month === 1 ? year - 1 : year;

  const lastMonthUsage = await prisma.monthlyOrderUsage.findMany({
    where: {
      year: lastYear,
      month: lastMonth
    },
    orderBy: {
      shop: 'asc'
    }
  });

  log('info', `Found ${lastMonthUsage.length} shops with usage from last month`, {
    lastMonth: `${lastYear}-${lastMonth.toString().padStart(2, '0')}`
  });

  // 4. Create new month records for all shops
  const results = {
    created: 0,
    skipped: 0,
    errors: 0,
    shopsReset: [] as string[]
  };

  for (const usage of lastMonthUsage) {
    try {
      // Check if record already exists for current month
      // Note: Using findFirst instead of findUnique for Aurora Data API compatibility
      const existing = await prisma.monthlyOrderUsage.findFirst({
        where: {
          shop: usage.shop,
          year: year,
          month: month
        }
      });

      if (existing) {
        log('warn', `Record already exists for ${usage.shop}`, {
          shop: usage.shop,
          existingId: existing.id
        });
        results.skipped++;
        continue;
      }

      const [
        appSubscription,
        billingSubscription,
        shopSettings,
        entitlements,
      ] = await Promise.all([
        prisma.appSubscription.findUnique({
          where: { shop: usage.shop },
          select: { planName: true, status: true },
        }),
        prisma.billingSubscription.findUnique({
          where: { shop: usage.shop },
          select: {
            planType: true,
            planName: true,
            subscriptionStatus: true,
            status: true,
          },
        }),
        prisma.shopSettings.findUnique({
          where: { shop: usage.shop },
          select: {
            currentPlan: true,
            currentPlanName: true,
            subscriptionStatus: true,
            billingStatus: true,
          },
        }),
        prisma.shopEntitlements.findUnique({
          where: { shop: usage.shop },
          select: {
            effectivePlan: true,
            limitMaxOrders: true,
            hasOverride: true,
            overrideExpiry: true,
          },
        }),
      ]);
      const billingActive =
        billingSubscription?.subscriptionStatus === "ACTIVE" ||
        billingSubscription?.status === "ACTIVE";
      const appActive = appSubscription?.status === "ACTIVE";
      const settingsStatus =
        shopSettings?.subscriptionStatus || shopSettings?.billingStatus;
      const settingsActive = ["ACTIVE", "TRIAL"].includes(
        settingsStatus?.toUpperCase() || "",
      );
      const activeOverride = Boolean(
        entitlements?.hasOverride &&
        (!entitlements.overrideExpiry || entitlements.overrideExpiry > now),
      );
      const candidatePlan =
        (appActive ? appSubscription?.planName : null) ||
        (billingActive
          ? billingSubscription?.planType || billingSubscription?.planName
          : null) ||
        (settingsActive
          ? shopSettings?.currentPlanName || shopSettings?.currentPlan
          : null);
      const knownPlan = candidatePlan
        ? tryGetPlanKey(candidatePlan)
        : undefined;

      let planName: string = PRICING_PLANS.free.billingName;
      let planLimit: number = PRICING_PLANS.free.limits.orders;
      if (activeOverride && entitlements) {
        planName = entitlements.effectivePlan;
        planLimit = entitlements.limitMaxOrders;
      } else if (knownPlan) {
        planName = PRICING_PLANS[knownPlan].billingName;
        planLimit = getPlanOrderLimit(candidatePlan);
      } else if (candidatePlan) {
        // Do not silently downgrade a live unknown SKU.
        planName = usage.planName;
        planLimit = usage.planLimit;
      }

      if (candidatePlan && !knownPlan) {
        log("warn", "Preserving unknown legacy plan snapshot", {
          shop: usage.shop,
          candidatePlan,
        });
      }

      // Create new month record with reset count and advisory state.
      await prisma.monthlyOrderUsage.create({
        data: {
          id: uuidv4(),
          shop: usage.shop,
          year,
          month,
          orderCount: 0, // Reset to zero
          planLimit,
          planName,
          isLocked: false,
          lockedAt: null,
          lockReason: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      results.created++;
      results.shopsReset.push(usage.shop);

      log('info', `Reset ${usage.shop}`, {
        shop: usage.shop,
        oldUsage: usage.orderCount,
        planLimit,
        planName,
      });

    } catch (error: any) {
      log('error', `Failed to reset ${usage.shop}`, {
        shop: usage.shop,
        error: error.message
      });
      results.errors++;
    }
  }

  // 5. Summary
  const duration = Date.now() - startTime;
  const summary = {
    month: currentMonthName,
    year,
    monthNumber: month,
    shopsReset: results.created,
    shopsSkipped: results.skipped,
    errorCount: results.errors,
    totalShops: lastMonthUsage.length,
    duration: `${duration}ms`
  };

  log('info', 'Monthly reset completed', summary);

  // 6. Send alert if there were errors
  if (results.errors > 0 && process.env.SLACK_WEBHOOK_URL) {
    await sendAlert(
      `⚠️ Monthly reset had ${results.errors} errors for ${currentMonthName}`
    );
  } else if (results.created > 0 && process.env.SLACK_WEBHOOK_URL) {
    await sendAlert(
      `✅ Monthly reset successful: ${results.created} shops reset for ${currentMonthName}`
    );
  }

  return json({
    success: true,
    correlationId,
    summary,
    shopsReset: results.shopsReset.slice(0, 10) // Show first 10 shops
  });

  } finally {
    // Always release the lock
    if (lockId) {
      await releaseCronLock(lockId);
      log('info', 'Released distributed lock', { lockId });
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
