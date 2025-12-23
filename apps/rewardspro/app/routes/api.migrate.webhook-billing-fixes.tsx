/**
 * One-time Migration Endpoint: Webhook Billing Fixes
 *
 * Creates tables for webhook idempotency, audit logging, and reconciliation.
 *
 * @security Requires CRON_SECRET header (same as cron jobs)
 * @usage Call once after deployment: GET /api/migrate/webhook-billing-fixes
 *
 * DELETE THIS FILE AFTER MIGRATION IS COMPLETE
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Verify secret
  const cronSecret = request.headers.get("X-Cron-Secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    console.warn("[Migration] Unauthorized request");
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Migration] Starting Webhook Billing Fixes migration...");

  const results: { step: string; success: boolean; error?: string }[] = [];

  // Helper to run SQL and track results
  async function runSQL(description: string, sql: string) {
    try {
      await db.$executeRawUnsafe(sql);
      results.push({ step: description, success: true });
      console.log(`[Migration] ✅ ${description}`);
    } catch (error: any) {
      const msg = error.message || "Unknown error";
      // Check for "already exists" errors which are fine
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        results.push({ step: description, success: true, error: "Already exists - skipped" });
        console.log(`[Migration] ⏭️  ${description} - Already exists`);
      } else {
        results.push({ step: description, success: false, error: msg });
        console.error(`[Migration] ❌ ${description} - ${msg}`);
      }
    }
  }

  // 1. Create ProcessedWebhook table
  await runSQL("Create ProcessedWebhook table", `
    CREATE TABLE IF NOT EXISTS "ProcessedWebhook" (
      "id" VARCHAR(255) PRIMARY KEY,
      "topic" VARCHAR(255) NOT NULL,
      "shop" VARCHAR(255) NOT NULL,
      "status" VARCHAR(50) NOT NULL DEFAULT 'PROCESSING',
      "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" TIMESTAMP(3),
      "errorMessage" TEXT,
      "retryCount" INTEGER NOT NULL DEFAULT 0,
      "payloadHash" VARCHAR(255)
    )
  `);

  // 2. ProcessedWebhook indexes
  await runSQL("Create ProcessedWebhook shop index",
    `CREATE INDEX IF NOT EXISTS "ProcessedWebhook_shop_idx" ON "ProcessedWebhook"("shop")`);
  await runSQL("Create ProcessedWebhook topic index",
    `CREATE INDEX IF NOT EXISTS "ProcessedWebhook_topic_idx" ON "ProcessedWebhook"("topic")`);
  await runSQL("Create ProcessedWebhook receivedAt index",
    `CREATE INDEX IF NOT EXISTS "ProcessedWebhook_receivedAt_idx" ON "ProcessedWebhook"("receivedAt")`);
  await runSQL("Create ProcessedWebhook status index",
    `CREATE INDEX IF NOT EXISTS "ProcessedWebhook_status_idx" ON "ProcessedWebhook"("status")`);

  // 3. Create WebhookAuditLog table
  await runSQL("Create WebhookAuditLog table", `
    CREATE TABLE IF NOT EXISTS "WebhookAuditLog" (
      "id" VARCHAR(255) PRIMARY KEY,
      "shop" VARCHAR(255) NOT NULL,
      "webhookId" VARCHAR(255) NOT NULL,
      "topic" VARCHAR(255) NOT NULL,
      "action" VARCHAR(100) NOT NULL,
      "incomingTimestamp" TIMESTAMP(3),
      "existingTimestamp" TIMESTAMP(3),
      "rejectionReason" VARCHAR(255),
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 4. WebhookAuditLog indexes
  await runSQL("Create WebhookAuditLog shop_createdAt index",
    `CREATE INDEX IF NOT EXISTS "WebhookAuditLog_shop_createdAt_idx" ON "WebhookAuditLog"("shop", "createdAt" DESC)`);
  await runSQL("Create WebhookAuditLog webhookId index",
    `CREATE INDEX IF NOT EXISTS "WebhookAuditLog_webhookId_idx" ON "WebhookAuditLog"("webhookId")`);
  await runSQL("Create WebhookAuditLog action index",
    `CREATE INDEX IF NOT EXISTS "WebhookAuditLog_action_idx" ON "WebhookAuditLog"("action")`);

  // 5. Create ReconciliationLog table
  await runSQL("Create ReconciliationLog table", `
    CREATE TABLE IF NOT EXISTS "ReconciliationLog" (
      "id" VARCHAR(255) PRIMARY KEY,
      "shop" VARCHAR(255) NOT NULL,
      "localState" JSONB,
      "shopifyState" JSONB,
      "mismatches" JSONB,
      "mismatchCount" INTEGER NOT NULL DEFAULT 0,
      "action" VARCHAR(100) NOT NULL,
      "resolution" TEXT,
      "resolvedAt" TIMESTAMP(3),
      "resolvedBy" VARCHAR(255),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. ReconciliationLog indexes
  await runSQL("Create ReconciliationLog shop_createdAt index",
    `CREATE INDEX IF NOT EXISTS "ReconciliationLog_shop_createdAt_idx" ON "ReconciliationLog"("shop", "createdAt" DESC)`);
  await runSQL("Create ReconciliationLog action index",
    `CREATE INDEX IF NOT EXISTS "ReconciliationLog_action_idx" ON "ReconciliationLog"("action")`);
  await runSQL("Create ReconciliationLog mismatchCount index",
    `CREATE INDEX IF NOT EXISTS "ReconciliationLog_mismatchCount_idx" ON "ReconciliationLog"("mismatchCount")`);

  // 7. Add webhookTimestamp to AppSubscription
  await runSQL("Add webhookTimestamp to AppSubscription",
    `ALTER TABLE "AppSubscription" ADD COLUMN IF NOT EXISTS "webhookTimestamp" TIMESTAMP(3)`);

  // 8. Index for webhookTimestamp
  await runSQL("Create AppSubscription webhookTimestamp index",
    `CREATE INDEX IF NOT EXISTS "AppSubscription_webhookTimestamp_idx" ON "AppSubscription"("webhookTimestamp")`);

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log(`[Migration] Complete: ${successCount} succeeded, ${failCount} failed`);

  return json({
    success: failCount === 0,
    message: `Migration complete: ${successCount} steps succeeded, ${failCount} failed`,
    results,
    timestamp: new Date().toISOString(),
  });
};
