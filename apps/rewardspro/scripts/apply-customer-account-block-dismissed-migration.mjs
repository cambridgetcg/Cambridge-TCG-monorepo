/**
 * Apply Customer Account Block Dismissed Migration to Aurora Database via Data API
 *
 * This script adds the customerAccountBlockDismissed field to ShopSettings table
 * to support dismissible customer account block setup banner.
 *
 * Migration: add_customer_account_block_dismissed
 * Date: 2025-10-17
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyCustomerAccountBlockDismissedMigration() {
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

  console.log("🚀 Applying Customer Account Block Dismissed Migration to Aurora Database\n");
  console.log("Migration: add_customer_account_block_dismissed");
  console.log("Purpose: Add dismissible banner flag for customer account block setup\n");

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
    console.log("  2. Test banner dismissal on dashboard");
    console.log("  3. Verify banner stays hidden after dismissal\n");

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
  // Step 1: Add customerAccountBlockDismissed column
  console.log("Step 1: Adding customerAccountBlockDismissed column to ShopSettings...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "ShopSettings"
          ADD COLUMN IF NOT EXISTS "customerAccountBlockDismissed" BOOLEAN NOT NULL DEFAULT FALSE`,
    transactionId,
  }));
  console.log("  ✓ customerAccountBlockDismissed column added");

  // Step 2: Add comment to document the field
  console.log("Step 2: Adding column comment...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `COMMENT ON COLUMN "ShopSettings"."customerAccountBlockDismissed"
          IS 'Whether merchant has clicked the Enable customer account block button (hides setup banner)'`,
    transactionId,
  }));
  console.log("  ✓ Comment added");

  // Step 3: Record migration in Prisma's tracking table
  console.log("Step 3: Recording migration in _prisma_migrations...");
  const migrationId = crypto.randomBytes(18).toString('hex');
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const migrationName = `${timestamp}_add_customer_account_block_dismissed`;

  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 2)`,
    parameters: [
      { name: "id", value: { stringValue: migrationId }},
      { name: "checksum", value: { stringValue: "customer_account_block_dismissed_v1" }},
      { name: "name", value: { stringValue: migrationName }},
    ],
    transactionId,
  }));
  console.log(`  ✓ Migration recorded: ${migrationName}`);

  console.log("\n  ✓ All steps completed successfully");
}

// Run the migration
applyCustomerAccountBlockDismissedMigration().catch(error => {
  console.error("\n💥 Fatal error:", error);
  process.exit(1);
});
