#!/usr/bin/env node

/**
 * Migration Script for Store Credit Sync Fields
 * Uses AWS Data API to add Shopify transaction tracking to StoreCreditLedger table
 * Following the successful migration method guide
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

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
    // Step 1: Check if CreditSyncStatus enum already exists
    console.log("Step 1: Checking for existing CreditSyncStatus enum type...");
    try {
      const enumCheckResult = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT typname FROM pg_type WHERE typname = 'CreditSyncStatus'`,
        transactionId,
      }));

      if (!enumCheckResult.records || enumCheckResult.records.length === 0) {
        // Create enum if it doesn't exist
        console.log("   Creating CreditSyncStatus enum...");
        await client.send(new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: `CREATE TYPE "CreditSyncStatus" AS ENUM (
            'PENDING',
            'SYNCING',
            'SYNCED',
            'FAILED',
            'NOT_APPLICABLE'
          )`,
          transactionId,
        }));
        console.log("   ✓ CreditSyncStatus enum created\n");
      } else {
        console.log("   ✓ CreditSyncStatus enum already exists\n");
      }
    } catch (error) {
      // If error is about type already existing, that's OK
      if (error.message.includes('already exists')) {
        console.log("   ✓ CreditSyncStatus enum already exists\n");
      } else {
        throw error;
      }
    }

    // Step 2: Check existing columns in StoreCreditLedger
    console.log("Step 2: Checking existing columns in StoreCreditLedger table...");
    const columnsResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'StoreCreditLedger'`,
      transactionId,
    }));

    const existingColumns = new Set();
    if (columnsResult.records) {
      columnsResult.records.forEach(record => {
        if (record[0] && record[0].stringValue) {
          existingColumns.add(record[0].stringValue);
        }
      });
    }

    console.log(`   Found ${existingColumns.size} existing columns`);

    // Step 3: Add new columns to StoreCreditLedger table (only if they don't exist)
    console.log("\nStep 3: Adding new columns to StoreCreditLedger table...");

    // Add shopifyTransactionId column if it doesn't exist
    if (!existingColumns.has('shopifyTransactionId')) {
      console.log("   Adding shopifyTransactionId column...");
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "StoreCreditLedger"
              ADD COLUMN "shopifyTransactionId" TEXT`,
        transactionId,
      }));
      console.log("   ✓ Added shopifyTransactionId column");
    } else {
      console.log("   ✓ shopifyTransactionId column already exists");
    }

    // Add syncStatus column if it doesn't exist
    if (!existingColumns.has('syncStatus')) {
      console.log("   Adding syncStatus column...");
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "StoreCreditLedger"
              ADD COLUMN "syncStatus" "CreditSyncStatus" DEFAULT 'PENDING'`,
        transactionId,
      }));
      console.log("   ✓ Added syncStatus column");
    } else {
      console.log("   ✓ syncStatus column already exists");
    }

    // Add syncedAt column if it doesn't exist
    if (!existingColumns.has('syncedAt')) {
      console.log("   Adding syncedAt column...");
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "StoreCreditLedger"
              ADD COLUMN "syncedAt" TIMESTAMP`,
        transactionId,
      }));
      console.log("   ✓ Added syncedAt column");
    } else {
      console.log("   ✓ syncedAt column already exists");
    }

    // Step 4: Update existing records
    console.log("\nStep 4: Updating existing records...");

    // Update existing cashback entries to PENDING
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `UPDATE "StoreCreditLedger"
            SET "syncStatus" = 'PENDING'
            WHERE "type" = 'CASHBACK_EARNED'
            AND "syncStatus" IS NULL`,
      transactionId,
    }));
    console.log("   ✓ Updated cashback entries to PENDING");

    // Update non-cashback entries to NOT_APPLICABLE
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
    console.log("   ✓ Updated non-cashback entries to NOT_APPLICABLE");

    // Step 5: Create indexes for performance
    console.log("\nStep 5: Creating indexes for better query performance...");

    // Check if indexes already exist
    const indexResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'StoreCreditLedger'
            AND schemaname = 'public'`,
      transactionId,
    }));

    const existingIndexes = new Set();
    if (indexResult.records) {
      indexResult.records.forEach(record => {
        if (record[0] && record[0].stringValue) {
          existingIndexes.add(record[0].stringValue);
        }
      });
    }

    // Create syncStatus index if it doesn't exist
    if (!existingIndexes.has('StoreCreditLedger_syncStatus_idx')) {
      console.log("   Creating syncStatus index...");
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE INDEX "StoreCreditLedger_syncStatus_idx"
              ON "StoreCreditLedger" ("syncStatus")`,
        transactionId,
      }));
      console.log("   ✓ Created syncStatus index");
    } else {
      console.log("   ✓ syncStatus index already exists");
    }

    // Create shopifyTransactionId index if it doesn't exist
    if (!existingIndexes.has('StoreCreditLedger_shopifyTransactionId_idx')) {
      console.log("   Creating shopifyTransactionId index...");
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE INDEX "StoreCreditLedger_shopifyTransactionId_idx"
              ON "StoreCreditLedger" ("shopifyTransactionId")`,
        transactionId,
      }));
      console.log("   ✓ Created shopifyTransactionId index");
    } else {
      console.log("   ✓ shopifyTransactionId index already exists");
    }

    // Step 6: Record migration in _prisma_migrations table
    console.log("\nStep 6: Recording migration in Prisma migrations table...");
    const migrationName = '20250131_add_credit_sync_fields';
    const migrationId = crypto.randomUUID();

    // Check if migration already exists
    const migrationCheck = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT id FROM "_prisma_migrations"
            WHERE migration_name = :migrationName`,
      parameters: [
        { name: 'migrationName', value: { stringValue: migrationName } }
      ],
      transactionId,
    }));

    if (!migrationCheck.records || migrationCheck.records.length === 0) {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `INSERT INTO "_prisma_migrations"
              (id, checksum, migration_name, started_at, applied_steps_count, finished_at, logs)
              VALUES (:id, :checksum, :migrationName, NOW(), 6, NOW(), :logs)`,
        parameters: [
          { name: 'id', value: { stringValue: migrationId } },
          { name: 'checksum', value: { stringValue: 'custom_data_api_' + Date.now() } },
          { name: 'migrationName', value: { stringValue: migrationName } },
          { name: 'logs', value: { stringValue: 'Applied via custom Data API migration script' } }
        ],
        transactionId,
      }));
      console.log("   ✓ Migration recorded\n");
    } else {
      console.log("   ✓ Migration already recorded\n");
    }

    // Commit the transaction
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");
    console.log("Summary:");
    console.log("  - Created/verified CreditSyncStatus enum type");
    console.log("  - Added shopifyTransactionId column to StoreCreditLedger");
    console.log("  - Added syncStatus column with default value PENDING");
    console.log("  - Added syncedAt timestamp column");
    console.log("  - Created indexes for performance");
    console.log("  - Updated existing records appropriately");
    console.log("  - Recorded migration in Prisma tracking table");

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

// Run the migration
applyCreditSyncMigration().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});