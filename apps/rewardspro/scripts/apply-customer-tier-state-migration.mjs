#!/usr/bin/env node

/**
 * Apply CustomerTierState Migration to Production Database via AWS Data API
 *
 * This script creates the CustomerTierState table and TierSource enum:
 * 1. Creates TierSource enum type
 * 2. Creates CustomerTierState table with all columns
 * 3. Creates necessary indexes for performance
 * 4. Adds foreign key constraints
 *
 * Run with: node scripts/apply-customer-tier-state-migration.mjs
 *
 * Based on successful migration method documented in:
 * /docs/03-deployment/successful-migration-method-guide.md
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyCustomerTierStateMigration() {
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
  console.log("CustomerTierState Migration Script");
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

    console.log("✅ CustomerTierState migration completed successfully!\n");

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
  // Step 1: Check if TierSource enum exists
  // ============================================================================
  console.log("Step 1: Checking for existing TierSource enum...");

  const enumCheckResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT typname FROM pg_type WHERE typtype = 'e' AND typname = 'TierSource'`,
    transactionId,
  }));

  const tierSourceExists = (enumCheckResult.records || []).length > 0;
  console.log(`  TierSource enum exists: ${tierSourceExists}`);

  // ============================================================================
  // Step 2: Create TierSource enum if it doesn't exist
  // ============================================================================
  if (!tierSourceExists) {
    console.log("\nStep 2: Creating TierSource enum type...");

    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE TYPE "TierSource" AS ENUM (
          'MANUAL_OVERRIDE',
          'TIER_SUBSCRIPTION',
          'TIER_PURCHASE',
          'SPENDING_BASED',
          'NONE'
        )`,
        transactionId,
      }));
      console.log("  ✓ TierSource enum created");
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("  ⚠️  TierSource enum already exists (skipping)");
      } else {
        throw error;
      }
    }
  } else {
    console.log("\nStep 2: TierSource enum already exists (skipping)");
  }

  // ============================================================================
  // Step 3: Check if CustomerTierState table exists
  // ============================================================================
  console.log("\nStep 3: Checking for existing CustomerTierState table...");

  const tableCheckResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT table_name FROM information_schema.tables
          WHERE table_name = 'CustomerTierState' AND table_schema = 'public'`,
    transactionId,
  }));

  const tableExists = (tableCheckResult.records || []).length > 0;
  console.log(`  CustomerTierState table exists: ${tableExists}`);

  // ============================================================================
  // Step 4: Create CustomerTierState table if it doesn't exist
  // ============================================================================
  if (!tableExists) {
    console.log("\nStep 4: Creating CustomerTierState table...");

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `
        CREATE TABLE "CustomerTierState" (
          "id" TEXT NOT NULL,
          "shop" TEXT NOT NULL,
          "customerId" TEXT NOT NULL,

          -- Current effective tier
          "effectiveTierId" TEXT,
          "tierSource" "TierSource" NOT NULL DEFAULT 'NONE',
          "tierSourceId" TEXT,

          -- Manual override tracking (explicit, no TierChangeLog scanning)
          "hasManualOverride" BOOLEAN NOT NULL DEFAULT false,
          "manualOverrideAt" TIMESTAMP(3),
          "manualOverrideBy" TEXT,
          "manualOverrideExpiry" TIMESTAMP(3),
          "manualOverrideNote" TEXT,

          -- Active purchase tracking
          "activePurchaseId" TEXT,
          "purchaseExpiresAt" TIMESTAMP(3),

          -- Active subscription tracking
          "activeSubscriptionId" TEXT,
          "subscriptionExpiresAt" TIMESTAMP(3),

          -- Spending-based tier (cached)
          "spendingBasedTierId" TEXT,
          "spendingLastCalculated" TIMESTAMP(3),

          -- Resolution tracking
          "lastResolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "resolutionReason" TEXT,

          -- Timestamps
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

          CONSTRAINT "CustomerTierState_pkey" PRIMARY KEY ("id")
        )
      `,
      transactionId,
    }));
    console.log("  ✓ CustomerTierState table created");

    // ============================================================================
    // Step 5: Create unique constraint on customerId
    // ============================================================================
    console.log("\nStep 5: Creating unique constraint on customerId...");

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "CustomerTierState" ADD CONSTRAINT "CustomerTierState_customerId_key" UNIQUE ("customerId")`,
      transactionId,
    }));
    console.log("  ✓ Unique constraint created");

    // ============================================================================
    // Step 6: Create foreign key constraints
    // ============================================================================
    console.log("\nStep 6: Creating foreign key constraints...");

    // FK to Customer
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "CustomerTierState"
              ADD CONSTRAINT "CustomerTierState_customerId_fkey"
              FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        transactionId,
      }));
      console.log("  ✓ Foreign key to Customer created");
    } catch (error) {
      console.log(`  ⚠️  FK to Customer: ${error.message.includes('already exists') ? 'already exists' : error.message}`);
    }

    // FK to Tier (effectiveTierId)
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "CustomerTierState"
              ADD CONSTRAINT "CustomerTierState_effectiveTierId_fkey"
              FOREIGN KEY ("effectiveTierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        transactionId,
      }));
      console.log("  ✓ Foreign key to Tier (effectiveTierId) created");
    } catch (error) {
      console.log(`  ⚠️  FK to Tier (effectiveTierId): ${error.message.includes('already exists') ? 'already exists' : error.message}`);
    }

    // FK to Tier (spendingBasedTierId)
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "CustomerTierState"
              ADD CONSTRAINT "CustomerTierState_spendingBasedTierId_fkey"
              FOREIGN KEY ("spendingBasedTierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        transactionId,
      }));
      console.log("  ✓ Foreign key to Tier (spendingBasedTierId) created");
    } catch (error) {
      console.log(`  ⚠️  FK to Tier (spendingBasedTierId): ${error.message.includes('already exists') ? 'already exists' : error.message}`);
    }

  } else {
    console.log("\nStep 4-6: CustomerTierState table already exists (skipping table creation)");
  }

  // ============================================================================
  // Step 7: Create indexes for performance
  // ============================================================================
  console.log("\nStep 7: Creating performance indexes...");

  const indexes = [
    { name: 'CustomerTierState_shop_effectiveTierId_idx', columns: '"shop", "effectiveTierId"' },
    { name: 'CustomerTierState_shop_tierSource_idx', columns: '"shop", "tierSource"' },
    { name: 'CustomerTierState_hasManualOverride_idx', columns: '"hasManualOverride"' },
    { name: 'CustomerTierState_purchaseExpiresAt_idx', columns: '"purchaseExpiresAt"' },
    { name: 'CustomerTierState_subscriptionExpiresAt_idx', columns: '"subscriptionExpiresAt"' },
  ];

  for (const index of indexes) {
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE INDEX IF NOT EXISTS "${index.name}" ON "CustomerTierState"(${index.columns})`,
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
  // Step 8: Record migration in tracking table
  // ============================================================================
  console.log("\nStep 8: Recording migration...");

  const migrationId = crypto.randomBytes(18).toString('hex');
  const migrationName = `20241217_add_customer_tier_state_${Date.now()}`;

  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, :logs, NULL, NOW(), 8)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "customer_tier_state_v1" }},
        { name: "name", value: { stringValue: migrationName }},
        { name: "logs", value: { stringValue: "Applied CustomerTierState migration via Data API" }},
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
  console.log("📋 TierSource Enum Values:");
  try {
    const enumResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT enumlabel FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'TierSource'
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

  // Check CustomerTierState table structure
  console.log("\n📋 CustomerTierState Table Columns:");
  try {
    const tableResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'CustomerTierState'
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
  console.log("\n📋 CustomerTierState Indexes:");
  try {
    const indexResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT indexname FROM pg_indexes
            WHERE tablename = 'CustomerTierState'
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
  console.log("\n📋 CustomerTierState Row Count:");
  try {
    const countResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT COUNT(*) as count FROM "CustomerTierState"`,
    }));

    const count = countResult.records?.[0]?.[0]?.longValue || 0;
    console.log(`  Total rows: ${count}`);
  } catch (error) {
    console.log(`  ⚠️  Could not count rows: ${error.message}`);
  }

  console.log("\n✅ Verification complete!");
}

// Run the migration
applyCustomerTierStateMigration().catch(error => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});
