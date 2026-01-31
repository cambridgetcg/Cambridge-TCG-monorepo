/**
 * Hourly cron job for automatic raffle draw execution
 * - Execute draws for CLOSED raffles where drawAt <= now and no winners exist
 *
 * Prerequisites:
 * - Raffle must be in CLOSED status (handled by raffle-status cron)
 * - drawAt must be set and <= current time
 * - Raffle must not have any winners yet
 *
 * Should run hourly
 * Add to vercel.json: { "path": "/api/cron/raffle-draw", "schedule": "0 * * * *" }
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import { executeRaffleDraw } from "../services/raffle-drawing.server";
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
      service: 'raffle-draw-cron',
      ...data
    }));
  };

  log('info', 'Raffle auto-draw cron started');

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
  const lock = await acquireCronLock('raffle-auto-draw', 10); // 10 minute TTL

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
    drawnCount: 0,
    totalWinners: 0,
    errors: 0,
    details: [] as any[]
  };

  const now = new Date();

  try {
    // 5. Find CLOSED raffles with drawAt set and no winners
    const rafflesToDraw = await db.raffle.findMany({
      where: {
        status: 'CLOSED',
        drawAt: {
          not: null,
          lte: now
        }
      },
      include: {
        _count: {
          select: { winners: true }
        }
      }
    });

    // Filter to only raffles with no winners
    const pendingDraws = rafflesToDraw.filter(r => r._count.winners === 0);

    log('info', `Found ${pendingDraws.length} raffles ready for auto-draw (${rafflesToDraw.length} total with drawAt passed)`);

    // 6. Execute draws for each pending raffle
    for (const raffle of pendingDraws) {
      try {
        log('info', `Processing raffle ${raffle.id} (${raffle.name})`, {
          shop: raffle.shop,
          drawAt: raffle.drawAt
        });

        if (!isDryRun) {
          const drawResult = await executeRaffleDraw(raffle.id, raffle.shop);

          if (drawResult.success) {
            results.drawnCount++;
            results.totalWinners += drawResult.winnersSelected;
            results.details.push({
              type: 'drawn',
              raffleId: raffle.id,
              name: raffle.name,
              shop: raffle.shop,
              winnersSelected: drawResult.winnersSelected,
              failedPrizes: drawResult.failedPrizes?.length || 0
            });

            log('info', `Raffle ${raffle.id} (${raffle.name}) drawn successfully`, {
              winnersSelected: drawResult.winnersSelected,
              failedPrizes: drawResult.failedPrizes?.length || 0
            });
          } else {
            results.errors++;
            results.details.push({
              type: 'draw_failed',
              raffleId: raffle.id,
              name: raffle.name,
              shop: raffle.shop,
              error: drawResult.error
            });

            log('error', `Raffle ${raffle.id} draw failed`, { error: drawResult.error });
          }
        } else {
          // Dry run - just log what would happen
          results.details.push({
            type: 'would_draw',
            raffleId: raffle.id,
            name: raffle.name,
            shop: raffle.shop,
            drawAt: raffle.drawAt
          });
        }
      } catch (error: any) {
        log('error', `Failed to process raffle ${raffle.id}`, { error: error.message });
        results.errors++;
        results.details.push({
          type: 'error',
          raffleId: raffle.id,
          name: raffle.name,
          error: error.message
        });
      }
    }

    // 7. Log summary
    const summary = {
      drawn: results.drawnCount,
      totalWinners: results.totalWinners,
      errors: results.errors,
      duration: Date.now() - startTime,
      dryRun: isDryRun
    };

    log('info', 'Raffle auto-draw cron completed', summary);

    return json({
      success: true,
      correlationId,
      summary,
      details: isDryRun ? results.details : undefined
    });

  } catch (error: any) {
    log('error', 'Raffle auto-draw cron failed', { error: error.message });
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
