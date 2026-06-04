/**
 * Hourly cron job for mystery box status transitions
 * - Transition SCHEDULED → ACTIVE when startsAt <= now
 * - Transition ACTIVE → CLOSED when endsAt <= now
 *
 * Should run hourly
 * Add to vercel.json: { "path": "/api/cron/mystery-box-status", "schedule": "0 * * * *" }
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import { verifyCronAuth } from "../utils/cron-auth.server";
import * as crypto from "node:crypto";

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
      service: 'mystery-box-status-cron',
      ...data
    }));
  };

  log('info', 'Mystery box status cron started');

  // 1. Verify authorization (Bearer token, x-vercel-cron, or dev bypass)
  if (!verifyCronAuth(request)) {
    log('error', 'Unauthorized cron attempt');
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Clean up any expired locks from crashed instances
  await cleanupExpiredLocks();

  // 3. Acquire distributed lock to prevent concurrent execution
  const lock = await acquireCronLock('mystery-box-status', 10); // 10 minute TTL

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
    activatedCount: 0,
    closedCount: 0,
    errors: 0,
    details: [] as any[]
  };

  const now = new Date();

  try {
    // 5. Transition SCHEDULED → ACTIVE
    // Find mystery boxes that should now be active
    const scheduledBoxes = await prisma.mysteryBox.findMany({
      where: {
        status: 'SCHEDULED',
        startsAt: {
          lte: now
        }
      },
      select: {
        id: true,
        shop: true,
        name: true,
        startsAt: true,
        endsAt: true
      }
    });

    log('info', `Found ${scheduledBoxes.length} scheduled mystery boxes to activate`);

    for (const box of scheduledBoxes) {
      try {
        // Also check if the box hasn't already ended
        if (box.endsAt <= now) {
          // Box period already passed, go directly to CLOSED
          if (!isDryRun) {
            await prisma.mysteryBox.update({
              where: { id: box.id },
              data: { status: 'CLOSED' }
            });
          }

          results.closedCount++;
          results.details.push({
            type: 'scheduled_to_closed',
            boxId: box.id,
            name: box.name,
            shop: box.shop,
            reason: 'Box period already ended'
          });

          log('info', `Mystery box ${box.id} (${box.name}) transitioned SCHEDULED → CLOSED (period ended)`);
        } else {
          // Normal activation
          if (!isDryRun) {
            await prisma.mysteryBox.update({
              where: { id: box.id },
              data: { status: 'ACTIVE' }
            });
          }

          results.activatedCount++;
          results.details.push({
            type: 'activated',
            boxId: box.id,
            name: box.name,
            shop: box.shop,
            startsAt: box.startsAt,
            endsAt: box.endsAt
          });

          log('info', `Mystery box ${box.id} (${box.name}) transitioned SCHEDULED → ACTIVE`);
        }
      } catch (error: any) {
        log('error', `Failed to activate mystery box ${box.id}`, { error: error.message });
        results.errors++;
      }
    }

    // 6. Transition ACTIVE → CLOSED
    // Find mystery boxes that have ended
    const expiredBoxes = await prisma.mysteryBox.findMany({
      where: {
        status: 'ACTIVE',
        endsAt: {
          lte: now
        }
      },
      select: {
        id: true,
        shop: true,
        name: true,
        startsAt: true,
        endsAt: true
      }
    });

    log('info', `Found ${expiredBoxes.length} active mystery boxes to close`);

    for (const box of expiredBoxes) {
      try {
        if (!isDryRun) {
          await prisma.mysteryBox.update({
            where: { id: box.id },
            data: { status: 'CLOSED' }
          });
        }

        results.closedCount++;
        results.details.push({
          type: 'closed',
          boxId: box.id,
          name: box.name,
          shop: box.shop,
          endsAt: box.endsAt
        });

        log('info', `Mystery box ${box.id} (${box.name}) transitioned ACTIVE → CLOSED`);
      } catch (error: any) {
        log('error', `Failed to close mystery box ${box.id}`, { error: error.message });
        results.errors++;
      }
    }

    // 7. Log summary
    const summary = {
      activated: results.activatedCount,
      closed: results.closedCount,
      errors: results.errors,
      duration: Date.now() - startTime,
      dryRun: isDryRun
    };

    log('info', 'Mystery box status cron completed', summary);

    return json({
      success: true,
      correlationId,
      summary,
      details: isDryRun ? results.details : undefined
    });

  } catch (error: any) {
    log('error', 'Mystery box status cron failed', { error: error.message });
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
