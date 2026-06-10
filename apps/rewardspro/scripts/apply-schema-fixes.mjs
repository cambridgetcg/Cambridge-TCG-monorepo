#!/usr/bin/env node

/**
 * Apply Schema Fixes to Production Database via AWS Data API
 *
 * This script fixes the production database schema mismatches:
 * 1. Creates missing enum types (OrderFinancialStatus, TierTriggerType)
 * 2. Adds missing columns (TierProduct.isActive)
 * 3. Ensures proper indexes exist
 *
 * Based on successful migration method documented in:
 * /docs/03-deployment/successful-migration-method-guide.md
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applySchemaFixes() {
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

  console.log("🚀 Applying Schema Fixes to Aurora Database\n");
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

    console.log("✅ Schema fixes completed successfully!\n");

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
  // Step 1: Check existing enum types
  // ============================================================================
  console.log("Step 1: Checking existing enum types...");

  const enumCheckResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT typname FROM pg_type WHERE typtype = 'e' AND typname IN ('OrderFinancialStatus', 'TierTriggerType')`,
    transactionId,
  }));

  const existingEnums = (enumCheckResult.records || []).map(r => r[0]?.stringValue);
  console.log(`  Found existing enums: ${existingEnums.length > 0 ? existingEnums.join(', ') : 'none'}`);

  // ============================================================================
  // Step 2: Create OrderFinancialStatus enum if it doesn't exist
  // ============================================================================
  if (!existingEnums.includes('OrderFinancialStatus')) {
    console.log("\nStep 2: Creating OrderFinancialStatus enum type...");

    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE TYPE "OrderFinancialStatus" AS ENUM (
          'PENDING',
          'AUTHORIZED',
          'PARTIALLY_PAID',
          'PAID',
          'PARTIALLY_REFUNDED',
          'REFUNDED',
          'VOIDED'
        )`,
        transactionId,
      }));
      console.log("  ✓ OrderFinancialStatus enum created");
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("  ⚠️  OrderFinancialStatus enum already exists (skipping)");
      } else {
        throw error;
      }
    }
  } else {
    console.log("\nStep 2: OrderFinancialStatus enum already exists (skipping)");
  }

  // ============================================================================
  // Step 3: Create TierTriggerType enum if it doesn't exist
  // ============================================================================
  if (!existingEnums.includes('TierTriggerType')) {
    console.log("\nStep 3: Creating TierTriggerType enum type...");

    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE TYPE "TierTriggerType" AS ENUM (
          'MANUAL',
          'ORDER',
          'REFUND',
          'SCHEDULED',
          'ANNUAL_REVIEW',
          'ADMIN_ACTION',
          'SUBSCRIPTION',
          'SYSTEM'
        )`,
        transactionId,
      }));
      console.log("  ✓ TierTriggerType enum created");
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("  ⚠️  TierTriggerType enum already exists (skipping)");
      } else {
        throw error;
      }
    }
  } else {
    console.log("\nStep 3: TierTriggerType enum already exists (skipping)");
  }

  // ============================================================================
  // Step 4: Add isActive column to TierProduct table if it doesn't exist
  // ============================================================================
  console.log("\nStep 4: Checking TierProduct table columns...");

  const columnCheckResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'TierProduct' AND column_name = 'isActive'`,
    transactionId,
  }));

  if (!columnCheckResult.records || columnCheckResult.records.length === 0) {
    console.log("  Adding isActive column to TierProduct table...");

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct" ADD COLUMN "isActive" BOOLEAN DEFAULT true`,
      transactionId,
    }));
    console.log("  ✓ isActive column added");
  } else {
    console.log("  ⚠️  isActive column already exists (skipping)");
  }

  // ============================================================================
  // Step 5: Fix Order table financialStatus column type if needed
  // ============================================================================
  console.log("\nStep 5: Checking Order.financialStatus column type...");

  const orderColResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT data_type, udt_name
          FROM information_schema.columns
          WHERE table_name = 'Order' AND column_name = 'financialStatus'`,
    transactionId,
  }));

  if (orderColResult.records && orderColResult.records.length > 0) {
    const dataType = orderColResult.records[0][0]?.stringValue;
    const udtName = orderColResult.records[0][1]?.stringValue;

    console.log(`  Current type: ${dataType} (${udtName})`);

    // Only try to convert if it's not already using the enum
    if (udtName !== 'OrderFinancialStatus' && dataType === 'character varying') {
      console.log("  Converting financialStatus to enum type...");

      // First, ensure all existing values are valid enum values
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `UPDATE "Order"
              SET "financialStatus" = 'PENDING'
              WHERE "financialStatus" IS NULL OR "financialStatus" = ''`,
        transactionId,
      }));

      // Then alter the column type
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "Order"
              ALTER COLUMN "financialStatus"
              TYPE "OrderFinancialStatus"
              USING "financialStatus"::"OrderFinancialStatus"`,
        transactionId,
      }));
      console.log("  ✓ financialStatus column converted to enum");
    } else if (udtName === 'OrderFinancialStatus') {
      console.log("  ⚠️  financialStatus already uses enum type (skipping)");
    }
  } else {
    console.log("  ⚠️  Order table or financialStatus column not found");
  }

  // ============================================================================
  // Step 6: Create indexes for performance
  // ============================================================================
  console.log("\nStep 6: Creating performance indexes...");

  const indexes = [
    { table: 'Order', column: 'shop', name: 'Order_shop_idx' },
    { table: 'Order', column: 'customerId', name: 'Order_customerId_idx' },
    { table: 'TierChangeLog', column: 'customerId', name: 'TierChangeLog_customerId_idx' },
    { table: 'TierChangeLog', column: 'shop', name: 'TierChangeLog_shop_idx' },
  ];

  for (const index of indexes) {
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE INDEX IF NOT EXISTS "${index.name}" ON "${index.table}"("${index.column}")`,
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
  // Step 7: Record migration in tracking table
  // ============================================================================
  console.log("\nStep 7: Recording migration...");

  const migrationId = crypto.randomBytes(18).toString('hex');
  const migrationName = `20250929_fix_schema_mismatches_${Date.now()}`;

  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, :logs, NULL, NOW(), 7)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "schema_fixes_v1" }},
        { name: "name", value: { stringValue: migrationName }},
        { name: "logs", value: { stringValue: "Applied schema fixes via Data API" }},
      ],
      transactionId,
    }));
    console.log(`  ✓ Migration recorded: ${migrationName}`);
  } catch (error) {
    console.log(`  ⚠️  Could not record migration (may not have _prisma_migrations table)`);
  }

  console.log("\n  ✓ All migration steps completed");
}

async function verifyChanges(client, resourceArn, secretArn, database) {
  console.log("Verifying changes...\n");

  // Check enum types
  console.log("📋 Enum Types:");
  const enumResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT typname FROM pg_type
          WHERE typtype = 'e'
          AND typname IN ('OrderFinancialStatus', 'TierTriggerType', 'Currency', 'TierChangeType', 'LedgerEntryType')
          ORDER BY typname`,
  }));

  if (enumResult.records) {
    enumResult.records.forEach(record => {
      if (record[0]?.stringValue) {
        console.log(`  ✓ ${record[0].stringValue}`);
      }
    });
  }

  // Check TierProduct columns
  console.log("\n📋 TierProduct Table Structure (selected columns):");
  const tierProductResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = 'TierProduct'
          AND column_name IN ('id', 'shop', 'isActive', 'purchaseType')
          ORDER BY ordinal_position`,
  }));

  if (tierProductResult.records) {
    tierProductResult.records.forEach(record => {
      const colName = record[0]?.stringValue;
      const dataType = record[1]?.stringValue;
      const nullable = record[2]?.stringValue;
      console.log(`  - ${colName}: ${dataType} ${nullable === 'YES' ? '(nullable)' : '(not null)'}`);
    });
  }

  // Check Order table
  console.log("\n📋 Order Table Financial Status:");
  const orderResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT column_name, data_type, udt_name
          FROM information_schema.columns
          WHERE table_name = 'Order'
          AND column_name = 'financialStatus'`,
  }));

  if (orderResult.records && orderResult.records.length > 0) {
    const colName = orderResult.records[0][0]?.stringValue;
    const dataType = orderResult.records[0][1]?.stringValue;
    const udtName = orderResult.records[0][2]?.stringValue;
    console.log(`  - ${colName}: ${dataType} (${udtName})`);
  }

  console.log("\n✅ Verification complete!");
}

// Run the migration
applySchemaFixes().catch(error => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});