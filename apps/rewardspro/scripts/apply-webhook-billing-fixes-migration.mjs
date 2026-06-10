/**
 * Migration: Webhook Billing Fixes
 *
 * Adds tables for:
 * - ProcessedWebhook: Webhook idempotency tracking
 * - WebhookAuditLog: Webhook processing audit trail
 * - ReconciliationLog: Subscription state reconciliation
 *
 * Also adds webhookTimestamp field to AppSubscription for ordering
 *
 * Run with: node scripts/apply-webhook-billing-fixes-migration.mjs
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({ region: "us-east-1" });

const resourceArn = process.env.DATABASE_RESOURCE_ARN || "arn:aws:rds:us-east-1:748091776737:cluster:rewardspro-database-cluster";
const secretArn = process.env.DATABASE_SECRET_ARN || "arn:aws:secretsmanager:us-east-1:748091776737:secret:RewardsProDatabaseSecret-nqwMzo";
const database = process.env.DATABASE_NAME || "rewardspro";

async function executeSQL(sql, description) {
  console.log(`\n[Migration] ${description}...`);
  try {
    const command = new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql,
    });
    await client.send(command);
    console.log(`[Migration] ✅ ${description} - SUCCESS`);
    return true;
  } catch (error) {
    if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
      console.log(`[Migration] ⏭️  ${description} - Already exists, skipping`);
      return true;
    }
    console.error(`[Migration] ❌ ${description} - FAILED:`, error.message);
    return false;
  }
}

async function runMigration() {
  console.log("=".repeat(60));
  console.log("Webhook Billing Fixes Migration");
  console.log("=".repeat(60));

  // 1. Create ProcessedWebhook table
  await executeSQL(`
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
  `, "Create ProcessedWebhook table");

  // 2. Create indexes for ProcessedWebhook
  await executeSQL(`
    CREATE INDEX IF NOT EXISTS "ProcessedWebhook_shop_idx" ON "ProcessedWebhook"("shop")
  `, "Create ProcessedWebhook shop index");

  await executeSQL(`
    CREATE INDEX IF NOT EXISTS "ProcessedWebhook_topic_idx" ON "ProcessedWebhook"("topic")
  `, "Create ProcessedWebhook topic index");

  await executeSQL(`
    CREATE INDEX IF NOT EXISTS "ProcessedWebhook_receivedAt_idx" ON "ProcessedWebhook"("receivedAt")
  `, "Create ProcessedWebhook receivedAt index");

  await executeSQL(`
    CREATE INDEX IF NOT EXISTS "ProcessedWebhook_status_idx" ON "ProcessedWebhook"("status")
  `, "Create ProcessedWebhook status index");

  // 3. Create WebhookAuditLog table
  await executeSQL(`
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
  `, "Create WebhookAuditLog table");

  // 4. Create indexes for WebhookAuditLog
  await executeSQL(`
    CREATE INDEX IF NOT EXISTS "WebhookAuditLog_shop_createdAt_idx" ON "WebhookAuditLog"("shop", "createdAt" DESC)
  `, "Create WebhookAuditLog shop_createdAt index");

  await executeSQL(`
    CREATE INDEX IF NOT EXISTS "WebhookAuditLog_webhookId_idx" ON "WebhookAuditLog"("webhookId")
  `, "Create WebhookAuditLog webhookId index");

  await executeSQL(`
    CREATE INDEX IF NOT EXISTS "WebhookAuditLog_action_idx" ON "WebhookAuditLog"("action")
  `, "Create WebhookAuditLog action index");

  // 5. Create ReconciliationLog table
  await executeSQL(`
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
  `, "Create ReconciliationLog table");

  // 6. Create indexes for ReconciliationLog
  await executeSQL(`
    CREATE INDEX IF NOT EXISTS "ReconciliationLog_shop_createdAt_idx" ON "ReconciliationLog"("shop", "createdAt" DESC)
  `, "Create ReconciliationLog shop_createdAt index");

  await executeSQL(`
    CREATE INDEX IF NOT EXISTS "ReconciliationLog_action_idx" ON "ReconciliationLog"("action")
  `, "Create ReconciliationLog action index");

  await executeSQL(`
    CREATE INDEX IF NOT EXISTS "ReconciliationLog_mismatchCount_idx" ON "ReconciliationLog"("mismatchCount")
  `, "Create ReconciliationLog mismatchCount index");

  // 7. Add webhookTimestamp to AppSubscription for ordering checks
  await executeSQL(`
    ALTER TABLE "AppSubscription" ADD COLUMN IF NOT EXISTS "webhookTimestamp" TIMESTAMP(3)
  `, "Add webhookTimestamp to AppSubscription");

  // 8. Add index for webhookTimestamp
  await executeSQL(`
    CREATE INDEX IF NOT EXISTS "AppSubscription_webhookTimestamp_idx" ON "AppSubscription"("webhookTimestamp")
  `, "Create AppSubscription webhookTimestamp index");

  console.log("\n" + "=".repeat(60));
  console.log("Migration Complete!");
  console.log("=".repeat(60));
}

runMigration().catch(console.error);
