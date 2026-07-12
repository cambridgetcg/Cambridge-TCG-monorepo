/**
 * Tier Product Cleanup Cron Job
 *
 * Permanently deletes soft-deleted tier products that have passed the
 * 30-day recovery window. Also detects orphaned tier products (DB record
 * exists but Shopify product is missing).
 *
 * Schedule: Daily at 3 AM UTC
 * Endpoint: GET /api/cron/tier-product-cleanup
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  cleanupExpiredDeletedProducts,
  getDeletedTierProducts,
} from "~/services/tier-products/tier-product-deletion.server";
import prisma from "~/db.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const url = new URL(request.url);
  const statsOnly = url.searchParams.get("stats") === "true";
  const dryRun = url.searchParams.get("dry-run") === "true";
  const shopFilter = url.searchParams.get("shop") || undefined;

  console.log("[TierProductCleanupCron] Starting tier product cleanup...", {
    statsOnly,
    dryRun,
    shopFilter,
  });

  try {
    // Gather stats: all soft-deleted products across shops
    const shops = shopFilter
      ? [shopFilter]
      : await prisma.tierProduct
          .findMany({
            where: { deletedAt: { not: null } },
            select: { shop: true },
            distinct: ["shop"] as any,
          })
          .then((rows: any[]) => rows.map((r) => r.shop));

    let totalSoftDeleted = 0;
    let totalExpired = 0;
    let totalRecoverable = 0;
    const shopStats: Array<{
      shop: string;
      softDeleted: number;
      expired: number;
      recoverable: number;
    }> = [];

    for (const shop of shops) {
      const deleted = await getDeletedTierProducts(shop);
      const expired = deleted.filter((d) => !d.canRecover);
      const recoverable = deleted.filter((d) => d.canRecover);

      totalSoftDeleted += deleted.length;
      totalExpired += expired.length;
      totalRecoverable += recoverable.length;

      if (deleted.length > 0) {
        shopStats.push({
          shop,
          softDeleted: deleted.length,
          expired: expired.length,
          recoverable: recoverable.length,
        });
      }
    }

    if (statsOnly) {
      return json({
        success: true,
        job: "tier-product-cleanup",
        mode: "stats",
        stats: {
          totalSoftDeleted,
          totalExpired,
          totalRecoverable,
          shops: shopStats,
        },
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    // Perform cleanup (unless dry run)
    let permanentlyDeleted = 0;

    if (!dryRun) {
      permanentlyDeleted = await cleanupExpiredDeletedProducts(shopFilter);
    }

    const duration = Date.now() - startTime;

    console.log("[TierProductCleanupCron] Job completed:", {
      permanentlyDeleted,
      dryRun,
      totalExpired,
      totalRecoverable,
      durationMs: duration,
    });

    return json({
      success: true,
      job: "tier-product-cleanup",
      dryRun,
      result: {
        permanentlyDeleted,
        expiredBeforeRun: totalExpired,
        recoverableRemaining: totalRecoverable,
      },
      shops: shopStats,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.error("[TierProductCleanupCron] Job failed:", error);

    return json(
      {
        success: false,
        job: "tier-product-cleanup",
        error: "Tier product cleanup failed",
        durationMs: duration,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
};
