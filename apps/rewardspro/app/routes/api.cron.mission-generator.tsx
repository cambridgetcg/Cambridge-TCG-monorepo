/**
 * Daily cron job for generating mission instances from templates
 *
 * - Generates DAILY missions every day at midnight UTC
 * - Generates WEEKLY missions on Mondays
 * - Generates MONTHLY missions on the 1st of each month
 *
 * Should run daily at midnight UTC
 * Add to vercel.json: { "path": "/api/cron/mission-generator", "schedule": "0 0 * * *" }
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import { generateMissionInstances, closePreviousDailyMissions } from "../services/mission-scheduler.server";
import * as crypto from "crypto";

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
      service: 'mission-generator-cron',
      ...data
    }));
  };

  log('info', 'Mission generator cron started');

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
  const lock = await acquireCronLock('mission-generator', 15); // 15 minute TTL

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
  const shopFilter = url.searchParams.get('shop') || undefined;

  if (isDryRun) {
    log('info', 'DRY RUN MODE - No changes will be made');
  }

  try {
    // 5. Close any stale daily missions from previous days
    const closedCount = isDryRun ? 0 : await closePreviousDailyMissions(shopFilter);
    if (closedCount > 0) {
      log('info', `Closed ${closedCount} stale daily missions`);
    }

    // 6. Generate new mission instances from active templates
    const result = await generateMissionInstances({
      shop: shopFilter,
      dryRun: isDryRun
    });

    // 7. Log summary
    const summary = {
      generated: result.generated,
      skipped: result.skipped,
      errors: result.errors,
      closedStaleMissions: closedCount,
      duration: Date.now() - startTime,
      dryRun: isDryRun,
      dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
      dayOfMonth: new Date().getUTCDate()
    };

    log('info', 'Mission generator cron completed', summary);

    // Log details in dry run mode or if there were generations
    if (isDryRun || result.generated > 0 || result.errors > 0) {
      log('info', 'Generation details', { details: result.details });
    }

    return json({
      success: true,
      correlationId,
      summary,
      details: isDryRun ? result.details : undefined
    });

  } catch (error: any) {
    log('error', 'Mission generator cron failed', { error: error.message });
    return json({
      success: false,
      correlationId,
      error: error.message
    });
  } finally {
    // Always release the lock when done, even if there was an error
    if (lock.lockId) {
      await releaseCronLock(lock.lockId);
      log('info', 'Released distributed lock');
    }
  }
}
