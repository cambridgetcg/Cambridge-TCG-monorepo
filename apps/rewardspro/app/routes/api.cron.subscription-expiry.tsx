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
import { timingSafeEqual } from "node:crypto";
import {
  runExpiryCheckJob,
  type ExpiryCheckResult,
} from "~/services/billing/subscription-expiry.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";

const JOB_NAME = "subscription-expiry";
const LOCK_TTL_MINUTES = 15;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startTime = Date.now();
  let lockId: string | undefined;

  // Verify cron secret with timing-safe comparison
  const cronSecret = request.headers.get("X-Cron-Secret");
  const isAuthorized = (() => {
    if (!process.env.CRON_SECRET || !cronSecret) return false;
    try {
      const secretBuffer = Buffer.from(cronSecret);
      const expectedBuffer = Buffer.from(process.env.CRON_SECRET);
      if (secretBuffer.length !== expectedBuffer.length) return false;
      return timingSafeEqual(secretBuffer, expectedBuffer);
    } catch {
      return false;
    }
  })();

  if (!isAuthorized) {
    console.warn("[SubscriptionExpiryCron] Unauthorized request");
    return json({ error: "Unauthorized" }, { status: 401 });
  }

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
        errors: result.errors.length,
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
      error: error.message,
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
