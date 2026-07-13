/**
 * Points Maintenance Cron Job
 *
 * Handles scheduled maintenance for the Points Engagement System:
 * - Points expiration processing
 * - Expiration warning emails
 * - Streak updates
 *
 * Schedule: Daily at 1:00 AM UTC
 * Endpoint: GET /api/cron/points-maintenance
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  runAllShopsMaintenance,
  type AllShopsMaintenanceResult,
} from "~/services/points-maintenance.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";

const JOB_NAME = "points-maintenance";
const LOCK_TTL_MINUTES = 30;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  let lockId: string | undefined;

  // Acquire distributed lock
  await cleanupExpiredLocks();
  const lock = await acquireCronLock(JOB_NAME, LOCK_TTL_MINUTES);

  if (!lock.acquired) {
    console.warn("[PointsMaintenanceCron] Skipping - another instance is running");
    return json({
      success: false,
      skipped: true,
      reason: "Another instance is already running",
      existingLock: lock.existingLock,
    });
  }

  lockId = lock.lockId;
  console.log("[PointsMaintenanceCron] Starting points maintenance job...");

  try {
    // Run the maintenance job for all shops
    const result: AllShopsMaintenanceResult = await runAllShopsMaintenance();

    const duration = Date.now() - startTime;

    console.log("[PointsMaintenanceCron] Job completed:", {
      shopsProcessed: result.shopsProcessed,
      totalCustomersAffected: result.totalCustomersAffected,
      totalPointsExpired: result.totalPointsExpired,
      totalWarningsSent: result.totalWarningsSent,
      errorsCount: result.errors.length,
      durationMs: duration,
    });

    return json({
      success: true,
      job: "points-maintenance",
      result: {
        shopsProcessed: result.shopsProcessed,
        totalCustomersAffected: result.totalCustomersAffected,
        totalPointsExpired: result.totalPointsExpired,
        totalWarningsSent: result.totalWarningsSent,
        errorCount: result.errors.length,
      },
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.error("[PointsMaintenanceCron] Job failed:", error);

    return json({
      success: false,
      job: "points-maintenance",
      error: "Points maintenance failed",
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  } finally {
    // Always release the lock
    if (lockId) {
      await releaseCronLock(lockId);
    }
  }
};
