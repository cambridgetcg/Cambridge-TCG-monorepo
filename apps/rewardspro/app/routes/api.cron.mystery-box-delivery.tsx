/**
 * Hourly cron job for mystery box reward delivery
 * - Finds all shops with PENDING mystery box winners
 * - Delivers rewards (points, discounts, store credit, etc.)
 *
 * Should run hourly
 * Add to vercel.json: { "path": "/api/cron/mystery-box-delivery", "schedule": "0 * * * *" }
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import { deliverAllPendingRewards } from "../services/mystery-box-delivery.server";
import { unauthenticated } from "../shopify.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";
import * as crypto from "node:crypto";

// Use loader for GET requests (Vercel sends GET, not POST)
export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  // Structured logging helper
  const log = (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
    console.log(JSON.stringify({
      level,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      service: 'mystery-box-delivery-cron',
      ...data
    }));
  };

  log('info', 'Mystery box delivery cron started');

  // 2. Clean up any expired locks from crashed instances
  await cleanupExpiredLocks();

  // 3. Acquire distributed lock to prevent concurrent execution
  const lock = await acquireCronLock('mystery-box-delivery', 10); // 10 minute TTL

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
    boxesProcessed: 0,
    totalDelivered: 0,
    totalFailed: 0,
    errors: 0,
    details: [] as any[]
  };

  try {
    // 5. Find all shops with PENDING mystery box winners
    const pendingWinners = await prisma.mysteryBoxWinner.findMany({
      where: {
        deliveryStatus: "PENDING",
      },
      select: {
        shop: true,
        boxId: true,
      },
    });

    if (pendingWinners.length === 0) {
      log('info', 'No pending mystery box deliveries found');
      return json({
        success: true,
        correlationId,
        summary: { shopsProcessed: 0, boxesProcessed: 0, totalDelivered: 0 }
      });
    }

    // Group by shop (deduplicate manually since Data API doesn't support distinct)
    const shopBoxes = new Map<string, string[]>();
    for (const winner of pendingWinners) {
      const boxes = shopBoxes.get(winner.shop) || [];
      if (!boxes.includes(winner.boxId)) {
        boxes.push(winner.boxId);
      }
      shopBoxes.set(winner.shop, boxes);
    }

    log('info', `Found pending deliveries across ${shopBoxes.size} shop(s), ${pendingWinners.length} box(es)`);

    // 6. Process each shop
    for (const [shop, boxIds] of shopBoxes) {
      results.shopsProcessed++;

      // Get admin API for this shop
      let admin: any;
      try {
        const unauthResult = await unauthenticated.admin(shop);
        admin = unauthResult.admin;
      } catch (error: any) {
        log('error', `Failed to get admin API for shop ${shop}`, { error: error.message });
        results.errors++;
        results.details.push({
          type: 'admin_error',
          shop,
          error: error.message,
        });
        continue;
      }

      // Process each box in this shop
      for (const boxId of boxIds) {
        results.boxesProcessed++;

        try {
          log('info', `Processing box ${boxId} for shop ${shop}`);

          if (!isDryRun) {
            const deliveryResult = await deliverAllPendingRewards(boxId, shop, admin);

            results.totalDelivered += deliveryResult.successful;
            results.totalFailed += deliveryResult.failed;
            results.details.push({
              type: 'delivered',
              shop,
              boxId,
              total: deliveryResult.total,
              successful: deliveryResult.successful,
              failed: deliveryResult.failed,
              requiresManual: deliveryResult.requiresManual,
            });

            log('info', `Box ${boxId} delivery complete`, {
              total: deliveryResult.total,
              successful: deliveryResult.successful,
              failed: deliveryResult.failed,
            });
          } else {
            // Dry run — count pending winners
            const pendingCount = await prisma.mysteryBoxWinner.count({
              where: { boxId, shop, deliveryStatus: "PENDING" },
            });

            results.details.push({
              type: 'would_deliver',
              shop,
              boxId,
              pendingCount,
            });
          }
        } catch (error: any) {
          log('error', `Failed to process box ${boxId}`, { error: error.message });
          results.errors++;
          results.details.push({
            type: 'error',
            shop,
            boxId,
            error: error.message,
          });
        }
      }
    }

    // 7. Log summary
    const summary = {
      shopsProcessed: results.shopsProcessed,
      boxesProcessed: results.boxesProcessed,
      totalDelivered: results.totalDelivered,
      totalFailed: results.totalFailed,
      errorCount: results.errors,
      duration: Date.now() - startTime,
      dryRun: isDryRun,
    };

    log('info', 'Mystery box delivery cron completed', summary);

    return json({
      success: true,
      correlationId,
      summary,
    });

  } catch (error: any) {
    log('error', 'Mystery box delivery cron failed', { error: error.message });
    return json({
      success: false,
      correlationId,
      error: "Mystery box delivery failed",
    });
  } finally {
    // Always release the lock when done, even if there was an error
    if (lock.lockId) {
      await releaseCronLock(lock.lockId);
      log('info', 'Released distributed lock');
    }
  }
}
