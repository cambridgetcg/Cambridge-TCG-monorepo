/**
 * Subscription Expiry Check Cron Job
 *
 * Detects and handles expired subscriptions that may have been missed by webhooks.
 * Shopify doesn't always fire webhooks for natural subscription expiry.
 *
 * Schedule: Daily at midnight
 * Endpoint: GET /api/cron/subscription-expiry
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  runExpiryCheckJob,
  type ExpiryCheckResult,
} from "~/services/billing/subscription-expiry.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";

const JOB_NAME = "subscription-expiry";
const LOCK_TTL_MINUTES = 15;

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
    console.warn("[SubscriptionExpiryCron] Skipping - another instance is running");
    return json({
      success: false,
      skipped: true,
      reason: "Another instance is already running",
      existingLock: lock.existingLock,
    });
  }

  lockId = lock.lockId;
  console.log("[SubscriptionExpiryCron] Starting subscription expiry check...");

  try {
    // Run the expiry check job
    const result: ExpiryCheckResult = await runExpiryCheckJob();

    const duration = Date.now() - startTime;

    console.log("[SubscriptionExpiryCron] Job completed:", {
      ...result,
      durationMs: duration,
    });

    return json({
      success: true,
      job: "subscription-expiry",
      result: {
        checked: result.checked,
        expired: result.expired,
        updated: result.updated,
        errorCount: result.errors.length,
      },
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.error("[SubscriptionExpiryCron] Job failed:", error);

    return json({
      success: false,
      job: "subscription-expiry",
      error: "Subscription expiry check failed",
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
