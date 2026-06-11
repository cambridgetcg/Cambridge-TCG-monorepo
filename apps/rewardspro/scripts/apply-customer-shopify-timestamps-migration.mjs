#!/usr/bin/env node

/**
 * Apply Shopify Timestamps Migration to Customer Table via AWS Data API
 *
 * This script adds shopifyCreatedAt and shopifyUpdatedAt columns to the Customer table:
 * 1. Adds shopifyCreatedAt column (nullable timestamp)
 * 2. Adds shopifyUpdatedAt column (nullable timestamp)
 *
 * These columns track when the customer was created/updated in Shopify,
 * separate from when they were created/updated in our database.
 *
 * Run with: node scripts/apply-customer-shopify-timestamps-migration.mjs
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyShopifyTimestampsMigration() {
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
  console.log("Customer Shopify Timestamps Migration Script");
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

    console.log("✅ Shopify timestamps migration completed successfully!\n");

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
  // Step 1: Check if columns already exist
  // ============================================================================
  console.log("Step 1: Checking for existing columns...");

  const columnCheckResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'Customer'
          AND column_name IN ('shopifyCreatedAt', 'shopifyUpdatedAt')`,
    transactionId,
  }));

  const existingColumns = (columnCheckResult.records || []).map(r => r[0]?.stringValue);
  console.log(`  Existing columns: ${existingColumns.length > 0 ? existingColumns.join(', ') : 'none'}`);

  // ============================================================================
  // Step 2: Add shopifyCreatedAt column if it doesn't exist
  // ============================================================================
  if (!existingColumns.includes('shopifyCreatedAt')) {
    console.log("\nStep 2: Adding shopifyCreatedAt column...");

    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "Customer" ADD COLUMN "shopifyCreatedAt" TIMESTAMP(3)`,
        transactionId,
      }));
      console.log("  ✓ shopifyCreatedAt column added");
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("  ⚠️  shopifyCreatedAt column already exists (skipping)");
      } else {
        throw error;
      }
    }
  } else {
    console.log("\nStep 2: shopifyCreatedAt column already exists (skipping)");
  }

  // ============================================================================
  // Step 3: Add shopifyUpdatedAt column if it doesn't exist
  // ============================================================================
  if (!existingColumns.includes('shopifyUpdatedAt')) {
    console.log("\nStep 3: Adding shopifyUpdatedAt column...");

    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "Customer" ADD COLUMN "shopifyUpdatedAt" TIMESTAMP(3)`,
        transactionId,
      }));
      console.log("  ✓ shopifyUpdatedAt column added");
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("  ⚠️  shopifyUpdatedAt column already exists (skipping)");
      } else {
        throw error;
      }
    }
  } else {
    console.log("\nStep 3: shopifyUpdatedAt column already exists (skipping)");
  }

  // ============================================================================
  // Step 4: Record migration in tracking table
  // ============================================================================
  console.log("\nStep 4: Recording migration...");

  const migrationId = crypto.randomBytes(18).toString('hex');
  const migrationName = `20251231_add_shopify_timestamps_to_customer`;

  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, :logs, NULL, NOW(), 2)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "customer_shopify_timestamps_v1" }},
        { name: "name", value: { stringValue: migrationName }},
        { name: "logs", value: { stringValue: "Applied shopifyCreatedAt/shopifyUpdatedAt columns to Customer table via Data API" }},
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

  // Check Customer table structure for new columns
  console.log("📋 Customer Table - Shopify Timestamp Columns:");
  try {
    const tableResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'Customer'
            AND column_name IN ('shopifyCreatedAt', 'shopifyUpdatedAt')
            ORDER BY column_name`,
    }));

    if (tableResult.records && tableResult.records.length > 0) {
      tableResult.records.forEach(record => {
        const colName = record[0]?.stringValue;
        const dataType = record[1]?.stringValue;
        const nullable = record[2]?.stringValue;
        console.log(`  ✓ ${colName}: ${dataType} ${nullable === 'YES' ? '(nullable)' : '(not null)'}`);
      });
    } else {
      console.log("  ❌ Columns not found!");
    }
  } catch (error) {
    console.log(`  ⚠️  Could not verify columns: ${error.message}`);
  }

  // Check Customer row count
  console.log("\n📋 Customer Table Stats:");
  try {
    const countResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT
              COUNT(*) as total,
              COUNT("shopifyCreatedAt") as with_created,
              COUNT("shopifyUpdatedAt") as with_updated
            FROM "Customer"`,
    }));

    const total = countResult.records?.[0]?.[0]?.longValue || 0;
    const withCreated = countResult.records?.[0]?.[1]?.longValue || 0;
    const withUpdated = countResult.records?.[0]?.[2]?.longValue || 0;
    console.log(`  Total customers: ${total}`);
    console.log(`  With shopifyCreatedAt: ${withCreated}`);
    console.log(`  With shopifyUpdatedAt: ${withUpdated}`);

    if (total > 0 && withCreated === 0) {
      console.log("\n💡 Tip: Run the following SQL to backfill existing customers:");
      console.log(`   UPDATE "Customer" SET "shopifyCreatedAt" = "createdAt", "shopifyUpdatedAt" = "updatedAt" WHERE "shopifyCreatedAt" IS NULL;`);
    }
  } catch (error) {
    console.log(`  ⚠️  Could not count rows: ${error.message}`);
  }

  console.log("\n✅ Verification complete!");
}

// Run the migration
applyShopifyTimestampsMigration().catch(error => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});
