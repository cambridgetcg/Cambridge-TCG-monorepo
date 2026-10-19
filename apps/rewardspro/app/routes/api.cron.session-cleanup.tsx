/**
 * Session Cleanup Cron Job
 *
 * Cleans up expired Shopify sessions from the database to prevent bloat.
 * Sessions that have passed their expiry date are permanently deleted.
 *
 * Schedule: Daily at 4 AM UTC
 * Endpoint: GET /api/cron/session-cleanup
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";

// Cleanup configuration
const CONFIG = {
  // Delete sessions expired more than this many hours ago (buffer for timezone issues)
  EXPIRY_BUFFER_HOURS: 24,
  // Maximum sessions to delete per run (prevent timeout)
  BATCH_SIZE: 1000,
  // Also delete sessions without expiry that are older than this many days
  ORPHAN_SESSION_DAYS: 90,
};

interface CleanupStats {
  expiredDeleted: number;
  orphanDeleted: number;
  totalBefore: number;
  totalAfter: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const url = new URL(request.url);
  const statsOnly = url.searchParams.get("stats") === "true";
  const dryRun = url.searchParams.get("dry-run") === "true";

  console.log("[SessionCleanupCron] Starting session cleanup...", {
    statsOnly,
    dryRun,
  });

  try {
    const expiredWhere = {
      expires: {
        not: null,
        lt: new Date(Date.now() - CONFIG.EXPIRY_BUFFER_HOURS * 60 * 60 * 1000),
      },
    };

    // Get current session count
    const totalBefore = await prisma.session.count();

    // Get expired session count
    const expiredCount = await prisma.session.count({ where: expiredWhere });

    // Get orphan session count (online sessions without expiry)
    const orphanCount = await prisma.session.count({
      where: { expires: null, NOT: { id: { startsWith: "offline_" } } },
    });

    // If stats only, return current statistics
    if (statsOnly) {
      return json({
        success: true,
        job: "session-cleanup",
        mode: "stats",
        stats: {
          totalSessions: totalBefore,
          expiredSessions: expiredCount,
          orphanSessions: orphanCount,
          config: CONFIG,
        },
        timestamp: new Date().toISOString(),
      });
    }

    let expiredDeleted = 0;
    let orphanDeleted = 0;

    if (!dryRun) {
      // Delete expired sessions (with expiry date in the past)
      const deleteExpiredResult = await prisma.session.deleteMany({ where: expiredWhere });
      expiredDeleted = deleteExpiredResult.count;

      console.log(`[SessionCleanupCron] Deleted ${expiredDeleted} expired sessions`);

      // Note: We intentionally do NOT delete offline sessions (id LIKE 'offline_%')
      // as these are needed for background operations and webhook processing.
      // Online sessions without expiry that are very old could be cleaned up,
      // but for safety we leave this as a future enhancement.
    }

    // Get final count
    const totalAfter = await prisma.session.count();

    const duration = Date.now() - startTime;

    const stats: CleanupStats = {
      expiredDeleted,
      orphanDeleted,
      totalBefore,
      totalAfter,
    };

    console.log("[SessionCleanupCron] Job completed:", {
      ...stats,
      dryRun,
      durationMs: duration,
    });

    return json({
      success: true,
      job: "session-cleanup",
      dryRun,
      result: stats,
      config: CONFIG,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error("[SessionCleanupCron] Job failed:", error);

    return json(
      {
        success: false,
        job: "session-cleanup",
        error: "Session cleanup failed",
        durationMs: duration,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};
