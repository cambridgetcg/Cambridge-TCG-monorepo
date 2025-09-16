/**
 * Migration Script for Subscription Improvements
 * Adds new tables and columns for enhanced subscription functionality
 * Uses AWS Data API for Aurora Database
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applySubscriptionImprovementsMigration() {
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

  console.log("🚀 Applying Subscription Improvements Migration to Aurora Database\n");
  console.log("   Resource ARN:", resourceArn);
  console.log("   Database:", database);
  console.log("");

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Execute migration in logical steps
    await executeMigrationSteps(client, resourceArn, secretArn, database, transactionId);
    
    // Commit if all successful
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("Rolling back transaction...");
    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
    throw error;
  }
}

async function executeMigrationSteps(client, resourceArn, secretArn, database, transactionId) {
  
  // Step 1: Create WebhookProcess table for idempotency
  console.log("Step 1: Creating WebhookProcess table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "WebhookProcess" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "topic" TEXT NOT NULL,
            "idempotencyKey" TEXT NOT NULL,
            "payload" JSONB NOT NULL,
            "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "WebhookProcess_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "WebhookProcess_idempotencyKey_key" UNIQUE ("idempotencyKey")
          )`,
    transactionId,
  }));
  console.log("  ✓ WebhookProcess table created");

  // Step 2: Create WebhookProcess indexes
  console.log("Step 2: Creating WebhookProcess indexes...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "WebhookProcess_shop_topic_processedAt_idx" 
          ON "WebhookProcess"("shop", "topic", "processedAt" DESC)`,
    transactionId,
  }));
  console.log("  ✓ WebhookProcess indexes created");

  // Step 3: Create WebhookError table for error tracking
  console.log("Step 3: Creating WebhookError table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "WebhookError" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "topic" TEXT NOT NULL,
            "orderId" TEXT,
            "error" TEXT NOT NULL,
            "payload" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "WebhookError_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ WebhookError table created");

  // Step 4: Create WebhookError indexes
  console.log("Step 4: Creating WebhookError indexes...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "WebhookError_shop_createdAt_idx" 
          ON "WebhookError"("shop", "createdAt" DESC)`,
    transactionId,
  }));
  console.log("  ✓ WebhookError indexes created");

  // Step 5: Create PurchaseStatus enum type
  console.log("Step 5: Creating PurchaseStatus enum...");
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE TYPE "PurchaseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'REFUNDED')`,
      transactionId,
    }));
    console.log("  ✓ PurchaseStatus enum created");
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log("  ℹ PurchaseStatus enum already exists");
    } else {
      throw error;
    }
  }

  // Step 6: Create TierPurchase table for one-time purchases
  console.log("Step 6: Creating TierPurchase table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "TierPurchase" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "customerId" TEXT NOT NULL,
            "tierId" TEXT NOT NULL,
            "tierProductId" TEXT NOT NULL,
            "shopifyOrderId" TEXT NOT NULL,
            "shopifyLineItemId" TEXT NOT NULL,
            "purchasePrice" DECIMAL(10,2) NOT NULL,
            "currency" TEXT NOT NULL,
            "startDate" TIMESTAMP(3) NOT NULL,
            "endDate" TIMESTAMP(3),
            "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
            "metadata" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "TierPurchase_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "TierPurchase_shop_shopifyOrderId_shopifyLineItemId_key" 
              UNIQUE ("shop", "shopifyOrderId", "shopifyLineItemId")
          )`,
    transactionId,
  }));
  console.log("  ✓ TierPurchase table created");

  // Step 7: Create TierPurchase indexes
  console.log("Step 7: Creating TierPurchase indexes...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "TierPurchase_customerId_status_idx" 
          ON "TierPurchase"("customerId", "status")`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "TierPurchase_shop_status_endDate_idx" 
          ON "TierPurchase"("shop", "status", "endDate")`,
    transactionId,
  }));
  console.log("  ✓ TierPurchase indexes created");

  // Step 8: Add TierPurchase foreign keys
  console.log("Step 8: Adding TierPurchase foreign keys...");
  
  // Check if constraints already exist before adding
  const constraintChecks = [
    { name: "TierPurchase_customerId_fkey", sql: `ALTER TABLE "TierPurchase" ADD CONSTRAINT "TierPurchase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE` },
    { name: "TierPurchase_tierId_fkey", sql: `ALTER TABLE "TierPurchase" ADD CONSTRAINT "TierPurchase_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE RESTRICT ON UPDATE CASCADE` },
    { name: "TierPurchase_tierProductId_fkey", sql: `ALTER TABLE "TierPurchase" ADD CONSTRAINT "TierPurchase_tierProductId_fkey" FOREIGN KEY ("tierProductId") REFERENCES "TierProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE` }
  ];

  for (const constraint of constraintChecks) {
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: constraint.sql,
        transactionId,
      }));
      console.log(`  ✓ Added ${constraint.name}`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`  ℹ ${constraint.name} already exists`);
      } else {
        throw error;
      }
    }
  }

  // Step 9: Create BulkOperationLog table
  console.log("Step 9: Creating BulkOperationLog table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "BulkOperationLog" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "operationType" TEXT NOT NULL,
            "report" JSONB NOT NULL,
            "successful" INTEGER NOT NULL,
            "failed" INTEGER NOT NULL,
            "total" INTEGER NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "BulkOperationLog_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ BulkOperationLog table created");

  // Step 10: Create BulkOperationLog indexes
  console.log("Step 10: Creating BulkOperationLog indexes...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "BulkOperationLog_shop_operationType_createdAt_idx" 
          ON "BulkOperationLog"("shop", "operationType", "createdAt" DESC)`,
    transactionId,
  }));
  console.log("  ✓ BulkOperationLog indexes created");

  // Step 11: Add new columns to Customer table if they don't exist
  console.log("Step 11: Adding new columns to Customer table...");
  const customerColumns = [
    { name: "totalSpent", sql: `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "totalSpent" DECIMAL(10,2) DEFAULT 0` },
    { name: "ordersCount", sql: `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "ordersCount" INTEGER DEFAULT 0` },
    { name: "lastOrderDate", sql: `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastOrderDate" TIMESTAMP(3)` }
  ];

  for (const column of customerColumns) {
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: column.sql,
        transactionId,
      }));
      console.log(`  ✓ Added ${column.name} column`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`  ℹ ${column.name} column already exists`);
      } else {
        throw error;
      }
    }
  }

  // Step 12: Add new TierTriggerType enum values
  console.log("Step 12: Adding new TierTriggerType enum values...");
  const newTriggerTypes = ['SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_PURCHASE'];
  
  for (const triggerType of newTriggerTypes) {
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TYPE "TierTriggerType" ADD VALUE IF NOT EXISTS '${triggerType}'`,
        transactionId,
      }));
      console.log(`  ✓ Added ${triggerType} to TierTriggerType enum`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`  ℹ ${triggerType} already exists in enum`);
      } else {
        console.log(`  ⚠ Could not add ${triggerType}: ${error.message}`);
      }
    }
  }

  // Step 13: Record migration in Prisma's tracking table
  console.log("Step 13: Recording migration...");
  const migrationId = crypto.randomBytes(18).toString('hex');
  const migrationName = `${new Date().toISOString().slice(0,10).replace(/-/g,'')}_subscription_improvements`;
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `INSERT INTO "_prisma_migrations" 
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 13)`,
    parameters: [
      { name: "id", value: { stringValue: migrationId }},
      { name: "checksum", value: { stringValue: `subscription_improvements_v2_${Date.now()}` }},
      { name: "name", value: { stringValue: migrationName }},
    ],
    transactionId,
  }));
  console.log("  ✓ Migration recorded in _prisma_migrations");

  console.log("\n  ✓ All migration steps completed successfully");
}

// Run the migration
applySubscriptionImprovementsMigration()
  .then(() => {
    console.log("🎉 Migration process completed!");
    process.exit(0);
  })
  .catch(error => {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  });