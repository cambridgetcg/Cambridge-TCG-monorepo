/**
 * Monthly Reset Cron Job
 * Resets order counts and unlocks all shops on the 1st of each month
 *
 * Schedule: 0 0 1 * * (Midnight on 1st of every month)
 * Security: Requires CRON_SECRET in Authorization header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { timingSafeEqual } from "crypto";
import db from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";

const JOB_NAME = "monthly-reset";
const LOCK_TTL_MINUTES = 30; // 30 minutes for monthly reset

export async function loader({ request }: LoaderFunctionArgs) {
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

  // 1. Verify authorization using timing-safe comparison
  const auth = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  const isAuthorized = (() => {
    if (!process.env.CRON_SECRET || !auth) return false;
    try {
      const authBuffer = Buffer.from(auth);
      const expectedBuffer = Buffer.from(expectedAuth);
      if (authBuffer.length !== expectedBuffer.length) return false;
      return timingSafeEqual(authBuffer, expectedBuffer);
    } catch {
      return false;
    }
  })();

  if (!isAuthorized) {
    log('error', 'Unauthorized cron attempt', {
      hasSecret: !!process.env.CRON_SECRET,
      userAgent: request.headers.get('user-agent')
    });
    return new Response('Unauthorized', { status: 401 });
  }

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
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const currentMonthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  log('info', `Processing monthly reset for ${currentMonthName}`, {
    year,
    month
  });

  // 3. Get all shops with usage from last month
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastYear = month === 1 ? year - 1 : year;

  const lastMonthUsage = await db.monthlyOrderUsage.findMany({
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
      const existing = await db.monthlyOrderUsage.findFirst({
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

      // Create new month record with reset count and unlocked state
      await db.monthlyOrderUsage.create({
        data: {
          id: uuidv4(),
          shop: usage.shop,
          year,
          month,
          orderCount: 0, // Reset to zero
          planLimit: usage.planLimit, // Keep same plan limit
          planName: usage.planName, // Keep same plan name
          isLocked: false, // Unlock for new month
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
        planLimit: usage.planLimit,
        wasLocked: usage.isLocked
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
    errors: results.errors,
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
