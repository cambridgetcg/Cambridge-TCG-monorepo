#!/usr/bin/env node

/**
 * Migration Script for Store Credit Sync Fields
 * Adds Shopify transaction tracking to StoreCreditLedger table
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

async function applyCreditSyncMigration() {
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

  console.log("🚀 Applying Store Credit Sync Migration to Aurora Database\n");
  console.log("   Resource ARN:", resourceArn);
  console.log("   Database:", database);
  console.log("");

  // Start transaction for atomicity
  let transactionId;
  try {
    const txResult = await client.send(new BeginTransactionCommand({
      resourceArn,
      secretArn,
      database,
    }));
    transactionId = txResult.transactionId;
    console.log("✅ Transaction started\n");
  } catch (error) {
    console.error("❌ Failed to start transaction:", error.message);
    process.exit(1);
  }

  try {
    // Step 1: Create the CreditSyncStatus enum type
    console.log("Step 1: Creating CreditSyncStatus enum type...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `DO $$ BEGIN
        CREATE TYPE "CreditSyncStatus" AS ENUM (
          'PENDING',
          'SYNCING',
          'SYNCED',
          'FAILED',
          'NOT_APPLICABLE'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;`,
      transactionId,
    }));
    console.log("   ✓ CreditSyncStatus enum created or already exists\n");

    // Step 2: Add new columns to StoreCreditLedger table
    console.log("Step 2: Adding new columns to StoreCreditLedger table...");

    // Add shopifyTransactionId column
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "StoreCreditLedger"
            ADD COLUMN IF NOT EXISTS "shopifyTransactionId" TEXT`,
      transactionId,
    }));
    console.log("   ✓ Added shopifyTransactionId column");

    // Add syncStatus column with default value
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "StoreCreditLedger"
            ADD COLUMN IF NOT EXISTS "syncStatus" "CreditSyncStatus" DEFAULT 'PENDING'`,
      transactionId,
    }));
    console.log("   ✓ Added syncStatus column");

    // Add syncedAt column
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "StoreCreditLedger"
            ADD COLUMN IF NOT EXISTS "syncedAt" TIMESTAMP`,
      transactionId,
    }));
    console.log("   ✓ Added syncedAt column\n");

    // Step 3: Update existing records to NOT_APPLICABLE for non-cashback entries
    console.log("Step 3: Updating existing records...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `UPDATE "StoreCreditLedger"
            SET "syncStatus" = 'NOT_APPLICABLE'
            WHERE "type" != 'CASHBACK_EARNED'
            AND "syncStatus" IS NULL`,
      transactionId,
    }));
    console.log("   ✓ Updated existing non-cashback entries to NOT_APPLICABLE\n");

    // Step 4: Create index for faster queries
    console.log("Step 4: Creating indexes for performance...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "StoreCreditLedger_syncStatus_idx"
            ON "StoreCreditLedger" ("syncStatus")`,
      transactionId,
    }));
    console.log("   ✓ Created syncStatus index");

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "StoreCreditLedger_shopifyTransactionId_idx"
            ON "StoreCreditLedger" ("shopifyTransactionId")`,
      transactionId,
    }));
    console.log("   ✓ Created shopifyTransactionId index\n");

    // Step 5: Record migration in _prisma_migrations table
    console.log("Step 5: Recording migration...");
    const migrationName = '20250131_add_credit_sync_fields';
    const checksum = 'manual_' + Date.now();

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, migration_name, started_at, applied_steps_count, finished_at, logs)
            VALUES
            (:id, :checksum, :migration_name, NOW(), 1, NOW(), :logs)`,
      parameters: [
        { name: 'id', value: { stringValue: crypto.randomUUID() } },
        { name: 'checksum', value: { stringValue: checksum } },
        { name: 'migration_name', value: { stringValue: migrationName } },
        { name: 'logs', value: { stringValue: 'Applied via custom Data API migration script' } }
      ],
      transactionId,
    }));
    console.log("   ✓ Migration recorded\n");

    // Commit the transaction
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");
    console.log("Summary:");
    console.log("  - Created CreditSyncStatus enum type");
    console.log("  - Added shopifyTransactionId column to StoreCreditLedger");
    console.log("  - Added syncStatus column with default value PENDING");
    console.log("  - Added syncedAt timestamp column");
    console.log("  - Created indexes for performance");
    console.log("  - Updated existing records appropriately");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Migration failed: ${error.message}\n`);

    if (transactionId) {
      try {
        await client.send(new RollbackTransactionCommand({
          resourceArn,
          secretArn,
          transactionId,
        }));
        console.log("🔄 Transaction rolled back");
      } catch (rollbackError) {
        console.error("Failed to rollback:", rollbackError.message);
      }
    }

    process.exit(1);
  }
}

// Import crypto for UUID generation
import crypto from 'crypto';

// Run the migration
applyCreditSyncMigration().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});