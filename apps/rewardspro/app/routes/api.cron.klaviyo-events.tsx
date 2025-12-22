/**
 * Daily cron job for Klaviyo scheduled events
 * - Points expiring reminders
 * - Win-back campaigns for inactive customers
 * - Balance reminders for customers with unused cashback
 * - Tier upgrade nudges for customers close to next tier
 *
 * Should run daily at 6 AM (configurable per shop)
 * Add to vercel.json: { "path": "/api/cron/klaviyo-events", "schedule": "0 6 * * *" }
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import { processScheduledEventsForAllShops } from "../services/klaviyo-scheduled-events.server";
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
      service: 'klaviyo-events-cron',
      ...data
    }));
  };

  log('info', 'Klaviyo scheduled events cron started');

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
  const lock = await acquireCronLock('klaviyo-events', 30); // 30 minute TTL (processing can take a while)

  if (!lock.acquired) {
    log('info', 'Another instance is running, skipping', {
      existingLock: lock.existingLock
    });
    return Response.json({
      success: true,
      skipped: true,
      reason: 'lock_not_acquired',
      correlationId
    });
  }

  // 4. Parse query parameters
  const url = new URL(request.url);
  const isDryRun = url.searchParams.get('dry-run') === 'true';
  const shopFilter = url.searchParams.get('shop'); // Optional: only process specific shop

  if (isDryRun) {
    log('info', 'DRY RUN MODE - No events will be triggered');
  }

  if (shopFilter) {
    log('info', `Filtering to shop: ${shopFilter}`);
  }

  try {
    // 5. Process scheduled events for all shops
    const result = await processScheduledEventsForAllShops();

    // 6. Build summary
    const summary = {
      shopsProcessed: result.shopsProcessed,
      totalEventsTriggered: result.totalEventsTriggered,
      eventBreakdown: result.results.reduce((acc, r) => {
        acc[r.eventType] = (acc[r.eventType] || 0) + r.eventsTriggered;
        return acc;
      }, {} as Record<string, number>),
      errorsCount: result.errors.length,
      duration: Date.now() - startTime,
      dryRun: isDryRun
    };

    log('info', 'Klaviyo scheduled events job completed', summary);

    // 7. Send alert if there were errors
    if (result.errors.length > 0) {
      log('warn', 'Errors occurred during processing', { errors: result.errors });

      if (process.env.SLACK_WEBHOOK_URL) {
        await sendAlert(
          `⚠️ Klaviyo events cron had ${result.errors.length} errors:\n${result.errors.slice(0, 5).join('\n')}`
        );
      }
    }

    return Response.json({
      success: true,
      correlationId,
      summary,
      results: isDryRun ? result.results : undefined,
      errors: result.errors.length > 0 ? result.errors : undefined
    });

  } catch (error: any) {
    log('error', 'Klaviyo scheduled events job failed', {
      error: error.message,
      stack: error.stack
    });

    // Send alert for critical failure
    if (process.env.SLACK_WEBHOOK_URL) {
      await sendAlert(`❌ Klaviyo events cron failed: ${error.message}`);
    }

    return Response.json({
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
