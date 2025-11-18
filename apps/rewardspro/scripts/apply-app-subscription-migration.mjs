/**
 * Apply App Subscription Migration to Aurora Database via Data API
 *
 * This script creates the AppSubscription table for tracking Shopify app billing subscriptions
 * (Pro, Max, Ultra plans) with proper trial period, usage-based billing, and webhook tracking.
 *
 * Migration: add_app_subscription_model
 * Date: 2025-11-11
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyAppSubscriptionMigration() {
  const client = new RDSDataClient({
    region: process.env.AWS_REGION || "eu-north-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const resourceArn = process.env.AURORA_RESOURCE_ARN;
  const secretArn = process.env.AURORA_SECRET_ARN;
  const database = process.env.AURORA_DATABASE_NAME || "rewardspro";

  console.log("🚀 Applying App Subscription Migration to Aurora Database\n");
  console.log("Migration: add_app_subscription_model");
  console.log("Purpose: Create AppSubscription table for app-level billing\n");

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Execute migration steps
    await executeMigrationSteps(client, resourceArn, secretArn, database, transactionId);

    // Commit if all successful
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");
    console.log("Next steps:");
    console.log("  1. Deploy updated application code with subscription persistence");
    console.log("  2. Test subscription flow end-to-end");
    console.log("  3. Monitor webhook updates to AppSubscription table\n");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Migration failed: ${error.message}\n`);
    console.log("Rolling back transaction...");

    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.error("❌ Transaction rolled back. No changes were made to the database.\n");
    throw error;
  }
}

async function executeMigrationSteps(client, resourceArn, secretArn, database, transactionId) {
  // Step 1: Create AppSubscription table
  console.log("Step 1: Creating AppSubscription table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "AppSubscription" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "shop" TEXT NOT NULL UNIQUE,
      "shopifySubscriptionId" TEXT UNIQUE,
      "chargeId" TEXT,
      "planName" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "test" BOOLEAN NOT NULL DEFAULT false,
      "trialDays" INTEGER,
      "trialEndsAt" TIMESTAMP(3),
      "recurringAmount" DECIMAL(10,2),
      "recurringCurrency" TEXT,
      "recurringInterval" TEXT,
      "usageCap" DECIMAL(10,2),
      "usageCurrency" TEXT,
      "usageTerms" TEXT,
      "usageBalanceUsed" DECIMAL(10,2),
      "currentPeriodEnd" TIMESTAMP(3),
      "nextBillingDate" TIMESTAMP(3),
      "activatedAt" TIMESTAMP(3),
      "cancelledAt" TIMESTAMP(3),
      "cancellationReason" TEXT,
      "lastWebhookUpdate" TIMESTAMP(3),
      "webhookUpdateCount" INTEGER NOT NULL DEFAULT 0,
      "returnUrlProcessed" BOOLEAN NOT NULL DEFAULT false,
      "returnUrlProcessedAt" TIMESTAMP(3),
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    transactionId,
  }));
  console.log("  ✓ Table created");

  // Step 2: Create indexes for performance
  console.log("Step 2: Creating indexes...");

  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "AppSubscription_shop_status_idx"
          ON "AppSubscription"("shop", "status")`,
    transactionId,
  }));
  console.log("  ✓ Index on shop, status created");

  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "AppSubscription_shopifySubscriptionId_idx"
          ON "AppSubscription"("shopifySubscriptionId")`,
    transactionId,
  }));
  console.log("  ✓ Index on shopifySubscriptionId created");

  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "AppSubscription_chargeId_idx"
          ON "AppSubscription"("chargeId")`,
    transactionId,
  }));
  console.log("  ✓ Index on chargeId created");

  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "AppSubscription_status_nextBillingDate_idx"
          ON "AppSubscription"("status", "nextBillingDate")`,
    transactionId,
  }));
  console.log("  ✓ Index on status, nextBillingDate created");

  // Step 3: Add comments to document the table
  console.log("Step 3: Adding table and column comments...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `COMMENT ON TABLE "AppSubscription" IS 'Tracks Shopify app subscriptions (Pro, Max, Ultra plans) for each merchant'`,
    transactionId,
  }));

  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `COMMENT ON COLUMN "AppSubscription"."shopifySubscriptionId" IS 'Full Shopify GID: gid://shopify/AppSubscription/123'`,
    transactionId,
  }));

  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `COMMENT ON COLUMN "AppSubscription"."chargeId" IS 'Numeric ID from charge_id parameter in return URL'`,
    transactionId,
  }));

  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `COMMENT ON COLUMN "AppSubscription"."usageBalanceUsed" IS 'Current usage balance from Shopify (updated via webhooks)'`,
    transactionId,
  }));

  console.log("  ✓ Comments added");

  // Step 4: Record migration in Prisma's tracking table
  console.log("Step 4: Recording migration in _prisma_migrations...");
  const migrationId = crypto.randomBytes(18).toString('hex');
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const migrationName = `${timestamp}_add_app_subscription_model`;

  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 4)`,
    parameters: [
      { name: "id", value: { stringValue: migrationId }},
      { name: "checksum", value: { stringValue: "app_subscription_model_v1" }},
      { name: "name", value: { stringValue: migrationName }},
    ],
    transactionId,
  }));
  console.log(`  ✓ Migration recorded: ${migrationName}`);

  console.log("\n  ✓ All steps completed successfully");
}

// Run the migration
applyAppSubscriptionMigration().catch(error => {
  console.error("\n💥 Fatal error:", error);
  process.exit(1);
});
