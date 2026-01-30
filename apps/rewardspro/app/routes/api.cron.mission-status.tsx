/**
 * Hourly cron job for mission status transitions
 * - Transition SCHEDULED → ACTIVE when startsAt <= now
 * - Transition ACTIVE → CLOSED when endsAt <= now
 *
 * Should run hourly
 * Add to vercel.json: { "path": "/api/cron/mission-status", "schedule": "0 * * * *" }
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
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
      service: 'mission-status-cron',
      ...data
    }));
  };

  log('info', 'Mission status cron started');

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
  const lock = await acquireCronLock('mission-status', 10); // 10 minute TTL

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
    // Find missions that should now be active
    const scheduledMissions = await db.challenge.findMany({
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

    log('info', `Found ${scheduledMissions.length} scheduled missions to activate`);

    for (const mission of scheduledMissions) {
      try {
        // Also check if the mission hasn't already ended
        if (mission.endsAt <= now) {
          // Mission period already passed, go directly to CLOSED
          if (!isDryRun) {
            await db.challenge.update({
              where: { id: mission.id },
              data: { status: 'CLOSED' }
            });
          }

          results.closedCount++;
          results.details.push({
            type: 'scheduled_to_closed',
            missionId: mission.id,
            name: mission.name,
            shop: mission.shop,
            reason: 'Mission period already ended'
          });

          log('info', `Mission ${mission.id} (${mission.name}) transitioned SCHEDULED → CLOSED (period ended)`);
        } else {
          // Normal activation
          if (!isDryRun) {
            await db.challenge.update({
              where: { id: mission.id },
              data: { status: 'ACTIVE' }
            });
          }

          results.activatedCount++;
          results.details.push({
            type: 'activated',
            missionId: mission.id,
            name: mission.name,
            shop: mission.shop,
            startsAt: mission.startsAt,
            endsAt: mission.endsAt
          });

          log('info', `Mission ${mission.id} (${mission.name}) transitioned SCHEDULED → ACTIVE`);
        }
      } catch (error: any) {
        log('error', `Failed to activate mission ${mission.id}`, { error: error.message });
        results.errors++;
      }
    }

    // 6. Transition ACTIVE → CLOSED
    // Find missions that have ended
    const expiredMissions = await db.challenge.findMany({
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

    log('info', `Found ${expiredMissions.length} active missions to close`);

    for (const mission of expiredMissions) {
      try {
        if (!isDryRun) {
          await db.challenge.update({
            where: { id: mission.id },
            data: { status: 'CLOSED' }
          });
        }

        results.closedCount++;
        results.details.push({
          type: 'closed',
          missionId: mission.id,
          name: mission.name,
          shop: mission.shop,
          endsAt: mission.endsAt
        });

        log('info', `Mission ${mission.id} (${mission.name}) transitioned ACTIVE → CLOSED`);
      } catch (error: any) {
        log('error', `Failed to close mission ${mission.id}`, { error: error.message });
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

    log('info', 'Mission status cron completed', summary);

    return json({
      success: true,
      correlationId,
      summary,
      details: isDryRun ? results.details : undefined
    });

  } catch (error: any) {
    log('error', 'Mission status cron failed', { error: error.message });
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
