/**
 * Hourly cron job for raffle status transitions
 * - Transition SCHEDULED → ACTIVE when startsAt <= now
 * - Transition ACTIVE → CLOSED when endsAt <= now (if not already in DRAWING/COMPLETED)
 *
 * Note: DRAWING → COMPLETED is handled by the draw execution, not this cron.
 *
 * Should run hourly
 * Add to vercel.json: { "path": "/api/cron/raffle-status", "schedule": "0 * * * *" }
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import { verifyCronAuth } from "../utils/cron-auth.server";
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
      service: 'raffle-status-cron',
      ...data
    }));
  };

  log('info', 'Raffle status cron started');

  // 1. Verify authorization (Bearer token, x-vercel-cron, or dev bypass)
  if (!verifyCronAuth(request)) {
    log('error', 'Unauthorized cron attempt');
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Clean up any expired locks from crashed instances
  await cleanupExpiredLocks();

  // 3. Acquire distributed lock to prevent concurrent execution
  const lock = await acquireCronLock('raffle-status', 10); // 10 minute TTL

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
    // Find raffles that should now be active
    const scheduledRaffles = await db.raffle.findMany({
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

    log('info', `Found ${scheduledRaffles.length} scheduled raffles to activate`);

    for (const raffle of scheduledRaffles) {
      try {
        // Check if the raffle hasn't already ended
        if (raffle.endsAt <= now) {
          // Raffle period already passed, go directly to CLOSED
          if (!isDryRun) {
            await db.raffle.update({
              where: { id: raffle.id },
              data: { status: 'CLOSED' }
            });
          }

          results.closedCount++;
          results.details.push({
            type: 'scheduled_to_closed',
            raffleId: raffle.id,
            name: raffle.name,
            shop: raffle.shop,
            reason: 'Raffle period already ended'
          });

          log('info', `Raffle ${raffle.id} (${raffle.name}) transitioned SCHEDULED → CLOSED (period ended)`);
        } else {
          // Normal activation
          if (!isDryRun) {
            await db.raffle.update({
              where: { id: raffle.id },
              data: { status: 'ACTIVE' }
            });
          }

          results.activatedCount++;
          results.details.push({
            type: 'activated',
            raffleId: raffle.id,
            name: raffle.name,
            shop: raffle.shop,
            startsAt: raffle.startsAt,
            endsAt: raffle.endsAt
          });

          log('info', `Raffle ${raffle.id} (${raffle.name}) transitioned SCHEDULED → ACTIVE`);
        }
      } catch (error: any) {
        log('error', `Failed to activate raffle ${raffle.id}`, { error: error.message });
        results.errors++;
      }
    }

    // 6. Transition ACTIVE → CLOSED
    // Find raffles that have ended (only if not already in DRAWING or later states)
    const expiredRaffles = await db.raffle.findMany({
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

    log('info', `Found ${expiredRaffles.length} active raffles to close`);

    for (const raffle of expiredRaffles) {
      try {
        if (!isDryRun) {
          await db.raffle.update({
            where: { id: raffle.id },
            data: { status: 'CLOSED' }
          });
        }

        results.closedCount++;
        results.details.push({
          type: 'closed',
          raffleId: raffle.id,
          name: raffle.name,
          shop: raffle.shop,
          endsAt: raffle.endsAt
        });

        log('info', `Raffle ${raffle.id} (${raffle.name}) transitioned ACTIVE → CLOSED`);
      } catch (error: any) {
        log('error', `Failed to close raffle ${raffle.id}`, { error: error.message });
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

    log('info', 'Raffle status cron completed', summary);

    return json({
      success: true,
      correlationId,
      summary,
      details: isDryRun ? results.details : undefined
    });

  } catch (error: any) {
    log('error', 'Raffle status cron failed', { error: error.message });
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
