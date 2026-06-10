#!/usr/bin/env node

/**
 * Apply CustomerSyncJob Migration to Production Database via AWS Data API
 *
 * This script creates the CustomerSyncJob table and SyncJobStatus enum:
 * 1. Creates SyncJobStatus enum type
 * 2. Creates CustomerSyncJob table with all columns
 * 3. Creates necessary indexes for performance
 *
 * Run with: node scripts/apply-customer-sync-job-migration.mjs
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyCustomerSyncJobMigration() {
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

  console.log("=".repeat(60));
  console.log("CustomerSyncJob Migration Script");
  console.log("=".repeat(60));
  console.log("");
  console.log(`   Database: ${database}`);
  console.log(`   Region: ${process.env.AWS_REGION || "eu-north-1"}`);
  console.log(`   Resource ARN: ${resourceArn?.substring(0, 50)}...`);
  console.log("");

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));
  console.log(`  ✓ Transaction ID: ${transactionId}\n`);

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

    console.log("✅ CustomerSyncJob migration completed successfully!\n");

    // Verify the changes
    await verifyChanges(client, resourceArn, secretArn, database);

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("🔄 Rolling back transaction...");

    try {
      await client.send(new RollbackTransactionCommand({
        resourceArn,
        secretArn,
        transactionId,
      }));
      console.log("  ✓ Transaction rolled back\n");
    } catch (rollbackError) {
      console.error("  ⚠️  Failed to rollback:", rollbackError.message);
    }

    throw error;
  }
}

async function executeMigrationSteps(client, resourceArn, secretArn, database, transactionId) {
  console.log("Executing migration steps...\n");

  // ============================================================================
  // Step 1: Check if SyncJobStatus enum exists
  // ============================================================================
  console.log("Step 1: Checking for existing SyncJobStatus enum...");

  const enumCheckResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT typname FROM pg_type WHERE typtype = 'e' AND typname = 'SyncJobStatus'`,
    transactionId,
  }));

  const syncJobStatusExists = (enumCheckResult.records || []).length > 0;
  console.log(`  SyncJobStatus enum exists: ${syncJobStatusExists}`);

  // ============================================================================
  // Step 2: Create SyncJobStatus enum if it doesn't exist
  // ============================================================================
  if (!syncJobStatusExists) {
    console.log("\nStep 2: Creating SyncJobStatus enum type...");

    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE TYPE "SyncJobStatus" AS ENUM (
          'PENDING',
          'IN_PROGRESS',
          'COMPLETED',
          'FAILED',
          'CANCELLED'
        )`,
        transactionId,
      }));
      console.log("  ✓ SyncJobStatus enum created");
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("  ⚠️  SyncJobStatus enum already exists (skipping)");
      } else {
        throw error;
      }
    }
  } else {
    console.log("\nStep 2: SyncJobStatus enum already exists (skipping)");
  }

  // ============================================================================
  // Step 3: Check if CustomerSyncJob table exists
  // ============================================================================
  console.log("\nStep 3: Checking for existing CustomerSyncJob table...");

  const tableCheckResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT table_name FROM information_schema.tables
          WHERE table_name = 'CustomerSyncJob' AND table_schema = 'public'`,
    transactionId,
  }));

  const tableExists = (tableCheckResult.records || []).length > 0;
  console.log(`  CustomerSyncJob table exists: ${tableExists}`);

  // ============================================================================
  // Step 4: Create CustomerSyncJob table if it doesn't exist
  // ============================================================================
  if (!tableExists) {
    console.log("\nStep 4: Creating CustomerSyncJob table...");

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `
        CREATE TABLE "CustomerSyncJob" (
          "id" TEXT NOT NULL,
          "shop" TEXT NOT NULL,

          -- Job status
          "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',

          -- Customer counts from Shopify
          "totalCustomers" INTEGER,

          -- Progress tracking
          "processedCount" INTEGER NOT NULL DEFAULT 0,
          "createdCount" INTEGER NOT NULL DEFAULT 0,
          "updatedCount" INTEGER NOT NULL DEFAULT 0,
          "skippedCount" INTEGER NOT NULL DEFAULT 0,
          "errorCount" INTEGER NOT NULL DEFAULT 0,

          -- Pagination for resume
          "lastCursor" TEXT,
          "batchSize" INTEGER NOT NULL DEFAULT 100,

          -- Error tracking
          "lastError" TEXT,
          "errorDetails" JSONB,

          -- Timing
          "startedAt" TIMESTAMP(3),
          "completedAt" TIMESTAMP(3),
          "lastActivityAt" TIMESTAMP(3),

          -- Metadata
          "triggeredBy" TEXT,
          "metadata" JSONB,

          -- Timestamps
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

          CONSTRAINT "CustomerSyncJob_pkey" PRIMARY KEY ("id")
        )
      `,
      transactionId,
    }));
    console.log("  ✓ CustomerSyncJob table created");

  } else {
    console.log("\nStep 4: CustomerSyncJob table already exists (skipping table creation)");
  }

  // ============================================================================
  // Step 5: Create indexes for performance
  // ============================================================================
  console.log("\nStep 5: Creating performance indexes...");

  const indexes = [
    { name: 'CustomerSyncJob_shop_status_idx', columns: '"shop", "status"' },
    { name: 'CustomerSyncJob_shop_createdAt_idx', columns: '"shop", "createdAt" DESC' },
  ];

  for (const index of indexes) {
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE INDEX IF NOT EXISTS "${index.name}" ON "CustomerSyncJob"(${index.columns})`,
        transactionId,
      }));
      console.log(`  ✓ Index ${index.name} created/verified`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`  ⚠️  Index ${index.name} already exists`);
      } else {
        console.log(`  ⚠️  Failed to create ${index.name}: ${error.message}`);
      }
    }
  }

  // ============================================================================
  // Step 6: Record migration in tracking table
  // ============================================================================
  console.log("\nStep 6: Recording migration...");

  const migrationId = crypto.randomBytes(18).toString('hex');
  const migrationName = `20251217_add_customer_sync_job`;

  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, :logs, NULL, NOW(), 5)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "customer_sync_job_v1" }},
        { name: "name", value: { stringValue: migrationName }},
        { name: "logs", value: { stringValue: "Applied CustomerSyncJob migration via Data API" }},
      ],
      transactionId,
    }));
    console.log(`  ✓ Migration recorded: ${migrationName}`);
  } catch (error) {
    console.log(`  ⚠️  Could not record migration: ${error.message}`);
  }

  console.log("\n  ✓ All migration steps completed");
}

async function verifyChanges(client, resourceArn, secretArn, database) {
  console.log("Verifying changes...\n");

  // Check enum types
  console.log("📋 SyncJobStatus Enum Values:");
  try {
    const enumResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT enumlabel FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'SyncJobStatus'
            ORDER BY enumsortorder`,
    }));

    if (enumResult.records) {
      enumResult.records.forEach(record => {
        if (record[0]?.stringValue) {
          console.log(`  - ${record[0].stringValue}`);
        }
      });
    }
  } catch (error) {
    console.log(`  ⚠️  Could not verify enum: ${error.message}`);
  }

  // Check CustomerSyncJob table structure
  console.log("\n📋 CustomerSyncJob Table Columns:");
  try {
    const tableResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'CustomerSyncJob'
            ORDER BY ordinal_position`,
    }));

    if (tableResult.records) {
      tableResult.records.forEach(record => {
        const colName = record[0]?.stringValue;
        const dataType = record[1]?.stringValue;
        const nullable = record[2]?.stringValue;
        const defaultVal = record[3]?.stringValue;
        console.log(`  - ${colName}: ${dataType} ${nullable === 'YES' ? '(nullable)' : '(not null)'}${defaultVal ? ` [default: ${defaultVal.substring(0, 30)}]` : ''}`);
      });
    }
  } catch (error) {
    console.log(`  ⚠️  Could not verify table: ${error.message}`);
  }

  // Check indexes
  console.log("\n📋 CustomerSyncJob Indexes:");
  try {
    const indexResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT indexname FROM pg_indexes
            WHERE tablename = 'CustomerSyncJob'
            ORDER BY indexname`,
    }));

    if (indexResult.records) {
      indexResult.records.forEach(record => {
        if (record[0]?.stringValue) {
          console.log(`  ✓ ${record[0].stringValue}`);
        }
      });
    }
  } catch (error) {
    console.log(`  ⚠️  Could not verify indexes: ${error.message}`);
  }

  // Check row count
  console.log("\n📋 CustomerSyncJob Row Count:");
  try {
    const countResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT COUNT(*) as count FROM "CustomerSyncJob"`,
    }));

    const count = countResult.records?.[0]?.[0]?.longValue || 0;
    console.log(`  Total rows: ${count}`);
  } catch (error) {
    console.log(`  ⚠️  Could not count rows: ${error.message}`);
  }

  console.log("\n✅ Verification complete!");
}

// Run the migration
applyCustomerSyncJobMigration().catch(error => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});
