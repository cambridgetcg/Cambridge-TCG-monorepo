/**
 * Apply Usage Billing Migration to Aurora Database via Data API
 *
 * This script adds the lastChargedBatch field to BillingSubscription table
 * to support usage-based billing batch tracking.
 *
 * Migration: add_usage_billing_batch_tracking
 * Date: 2025-10-10
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyUsageBillingMigration() {
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

  console.log("🚀 Applying Usage Billing Migration to Aurora Database\n");
  console.log("Migration: add_usage_billing_batch_tracking");
  console.log("Purpose: Add lastChargedBatch field for usage billing\n");

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
    console.log("  1. Deploy updated application code");
    console.log("  2. Monitor usage billing for first few days");
    console.log("  3. Verify batch tracking in database\n");

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
  // Step 1: Add lastChargedBatch column to BillingSubscription table
  console.log("Step 1: Adding lastChargedBatch column to BillingSubscription...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "BillingSubscription"
          ADD COLUMN IF NOT EXISTS "lastChargedBatch" INTEGER`,
    transactionId,
  }));
  console.log("  ✓ Column added");

  // Step 2: Set default value to 0 for existing records
  console.log("Step 2: Setting default value for existing records...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `UPDATE "BillingSubscription"
          SET "lastChargedBatch" = 0
          WHERE "lastChargedBatch" IS NULL`,
    transactionId,
  }));
  console.log("  ✓ Default values set");

  // Step 3: Add comment to document the field's purpose
  console.log("Step 3: Adding column comment...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `COMMENT ON COLUMN "BillingSubscription"."lastChargedBatch"
          IS 'Tracks which batch was last charged for usage-based billing. E.g., 1 = first 100 orders, 2 = second 100 orders, etc.'`,
    transactionId,
  }));
  console.log("  ✓ Comment added");

  // Step 4: Record migration in Prisma's tracking table
  console.log("Step 4: Recording migration in _prisma_migrations...");
  const migrationId = crypto.randomBytes(18).toString('hex');
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const migrationName = `${timestamp}_add_usage_billing_batch_tracking`;

  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 3)`,
    parameters: [
      { name: "id", value: { stringValue: migrationId }},
      { name: "checksum", value: { stringValue: "usage_billing_batch_tracking_v1" }},
      { name: "name", value: { stringValue: migrationName }},
    ],
    transactionId,
  }));
  console.log(`  ✓ Migration recorded: ${migrationName}`);

  console.log("\n  ✓ All steps completed successfully");
}

// Run the migration
applyUsageBillingMigration().catch(error => {
  console.error("\n💥 Fatal error:", error);
  process.exit(1);
});
