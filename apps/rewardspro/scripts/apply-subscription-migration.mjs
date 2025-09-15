#!/usr/bin/env node

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applySubscriptionMigration() {
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

  console.log("🚀 Applying Subscription System Migration to Aurora Database\n");
  console.log(`Database: ${database}`);
  console.log(`Region: ${process.env.AWS_REGION || "eu-north-1"}\n`);

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  async function executeSQL(sql, description) {
    console.log(`  ▶ ${description}...`);
    try {
      const result = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        transactionId,
        sql,
      }));
      console.log(`    ✓ ${description} completed`);
      return result;
    } catch (error) {
      console.error(`    ✗ ${description} failed: ${error.message}`);
      throw error;
    }
  }

  try {
    console.log("\n📦 Creating Subscription System Tables and Enums...\n");

    // Step 1: Create enums if they don't exist
    console.log("Step 1: Creating enums...");
    
    // Check if enums already exist first
    const enumCheck = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      transactionId,
      sql: `SELECT typname FROM pg_type WHERE typname IN ('SubscriptionStatus', 'BillingInterval', 'BillingStatus', 'DiscountType')`,
    }));

    const existingEnums = enumCheck.records?.map(r => r[0]?.stringValue) || [];
    
    if (!existingEnums.includes('SubscriptionStatus')) {
      await executeSQL(`
        CREATE TYPE "SubscriptionStatus" AS ENUM (
          'PENDING',
          'ACTIVE',
          'PAUSED',
          'CANCELLED',
          'EXPIRED',
          'FAILED'
        )
      `, "Creating SubscriptionStatus enum");
    }

    if (!existingEnums.includes('BillingInterval')) {
      await executeSQL(`
        CREATE TYPE "BillingInterval" AS ENUM (
          'WEEKLY',
          'MONTHLY',
          'QUARTERLY',
          'SEMIANNUAL',
          'ANNUAL'
        )
      `, "Creating BillingInterval enum");
    }

    if (!existingEnums.includes('BillingStatus')) {
      await executeSQL(`
        CREATE TYPE "BillingStatus" AS ENUM (
          'PENDING',
          'PROCESSING',
          'SUCCESS',
          'FAILED',
          'CANCELLED',
          'REQUIRES_ACTION'
        )
      `, "Creating BillingStatus enum");
    }

    if (!existingEnums.includes('DiscountType')) {
      await executeSQL(`
        CREATE TYPE "DiscountType" AS ENUM (
          'PERCENTAGE',
          'FIXED_AMOUNT'
        )
      `, "Creating DiscountType enum");
    }

    // Step 2: Create TierSubscription table
    console.log("\nStep 2: Creating TierSubscription table...");
    await executeSQL(`
      CREATE TABLE IF NOT EXISTS "TierSubscription" (
        "id" TEXT NOT NULL,
        "shop" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "tierId" TEXT NOT NULL,
        "subscriptionContractId" TEXT NOT NULL,
        "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
        "billingInterval" "BillingInterval" NOT NULL,
        "monthlyPrice" DECIMAL(10,2) NOT NULL,
        "currentPrice" DECIMAL(10,2) NOT NULL,
        "discountType" "DiscountType",
        "discountValue" DECIMAL(10,2),
        "startDate" TIMESTAMP(3) NOT NULL,
        "endDate" TIMESTAMP(3),
        "nextBillingDate" TIMESTAMP(3),
        "lastBillingDate" TIMESTAMP(3),
        "pausedAt" TIMESTAMP(3),
        "pausedReason" TEXT,
        "cancelledAt" TIMESTAMP(3),
        "cancellationReason" TEXT,
        "failureCount" INTEGER NOT NULL DEFAULT 0,
        "lastFailureReason" TEXT,
        "totalBilled" DECIMAL(12,2) DEFAULT 0,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT "TierSubscription_pkey" PRIMARY KEY ("id")
      )
    `, "Creating TierSubscription table");

    // Step 3: Create SubscriptionBillingAttempt table
    console.log("\nStep 3: Creating SubscriptionBillingAttempt table...");
    await executeSQL(`
      CREATE TABLE IF NOT EXISTS "SubscriptionBillingAttempt" (
        "id" TEXT NOT NULL,
        "subscriptionId" TEXT NOT NULL,
        "status" "BillingStatus" NOT NULL DEFAULT 'PENDING',
        "amount" DECIMAL(10,2) NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'USD',
        "billingDate" TIMESTAMP(3) NOT NULL,
        "processedAt" TIMESTAMP(3),
        "shopifyOrderId" TEXT,
        "shopifyInvoiceId" TEXT,
        "shopifyBillingAttemptId" TEXT,
        "errorCode" TEXT,
        "errorMessage" TEXT,
        "retryCount" INTEGER NOT NULL DEFAULT 0,
        "nextRetryAt" TIMESTAMP(3),
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT "SubscriptionBillingAttempt_pkey" PRIMARY KEY ("id")
      )
    `, "Creating SubscriptionBillingAttempt table");

    // Step 4: Create SellingPlanGroup table
    console.log("\nStep 4: Creating SellingPlanGroup table...");
    await executeSQL(`
      CREATE TABLE IF NOT EXISTS "SellingPlanGroup" (
        "id" TEXT NOT NULL,
        "shop" TEXT NOT NULL,
        "shopifySellingPlanGroupId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "merchantCode" TEXT,
        "options" JSONB,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT "SellingPlanGroup_pkey" PRIMARY KEY ("id")
      )
    `, "Creating SellingPlanGroup table");

    // Step 5: Create SellingPlan table
    console.log("\nStep 5: Creating SellingPlan table...");
    await executeSQL(`
      CREATE TABLE IF NOT EXISTS "SellingPlan" (
        "id" TEXT NOT NULL,
        "sellingPlanGroupId" TEXT NOT NULL,
        "shopifySellingPlanId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "billingInterval" "BillingInterval" NOT NULL,
        "intervalCount" INTEGER NOT NULL DEFAULT 1,
        "discountType" "DiscountType",
        "discountValue" DECIMAL(10,2),
        "deliveryInterval" "BillingInterval",
        "deliveryIntervalCount" INTEGER,
        "maxCycles" INTEGER,
        "minCycles" INTEGER,
        "pricingPolicies" JSONB,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT "SellingPlan_pkey" PRIMARY KEY ("id")
      )
    `, "Creating SellingPlan table");

    // Step 6: Add indexes
    console.log("\nStep 6: Creating indexes...");
    await executeSQL(`
      CREATE UNIQUE INDEX IF NOT EXISTS "TierSubscription_subscriptionContractId_key" 
      ON "TierSubscription"("subscriptionContractId")
    `, "Creating unique index on subscriptionContractId");

    await executeSQL(`
      CREATE INDEX IF NOT EXISTS "TierSubscription_shop_idx" 
      ON "TierSubscription"("shop")
    `, "Creating index on shop");

    await executeSQL(`
      CREATE INDEX IF NOT EXISTS "TierSubscription_customerId_idx" 
      ON "TierSubscription"("customerId")
    `, "Creating index on customerId");

    await executeSQL(`
      CREATE INDEX IF NOT EXISTS "TierSubscription_status_idx" 
      ON "TierSubscription"("status")
    `, "Creating index on status");

    await executeSQL(`
      CREATE INDEX IF NOT EXISTS "SubscriptionBillingAttempt_subscriptionId_idx" 
      ON "SubscriptionBillingAttempt"("subscriptionId")
    `, "Creating index on subscriptionId");

    await executeSQL(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SellingPlanGroup_shop_shopifySellingPlanGroupId_key" 
      ON "SellingPlanGroup"("shop", "shopifySellingPlanGroupId")
    `, "Creating unique index on shop and shopifySellingPlanGroupId");

    await executeSQL(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SellingPlan_shopifySellingPlanId_key" 
      ON "SellingPlan"("shopifySellingPlanId")
    `, "Creating unique index on shopifySellingPlanId");

    // Step 7: Add foreign key constraints
    console.log("\nStep 7: Adding foreign key constraints...");
    await executeSQL(`
      ALTER TABLE "TierSubscription" 
      ADD CONSTRAINT "TierSubscription_customerId_fkey" 
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE
    `, "Adding foreign key to Customer");

    await executeSQL(`
      ALTER TABLE "TierSubscription" 
      ADD CONSTRAINT "TierSubscription_tierId_fkey" 
      FOREIGN KEY ("tierId") REFERENCES "Tier"("id") 
      ON DELETE RESTRICT ON UPDATE CASCADE
    `, "Adding foreign key to Tier");

    await executeSQL(`
      ALTER TABLE "SubscriptionBillingAttempt" 
      ADD CONSTRAINT "SubscriptionBillingAttempt_subscriptionId_fkey" 
      FOREIGN KEY ("subscriptionId") REFERENCES "TierSubscription"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE
    `, "Adding foreign key to TierSubscription");

    await executeSQL(`
      ALTER TABLE "SellingPlan" 
      ADD CONSTRAINT "SellingPlan_sellingPlanGroupId_fkey" 
      FOREIGN KEY ("sellingPlanGroupId") REFERENCES "SellingPlanGroup"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE
    `, "Adding foreign key to SellingPlanGroup");

    // Step 8: Update _prisma_migrations table
    console.log("\nStep 8: Recording migration in _prisma_migrations...");
    const migrationId = crypto.randomBytes(12).toString('hex');
    const migrationName = `20250115_add_subscription_system`;
    
    await executeSQL(`
      INSERT INTO "_prisma_migrations" (
        "id", 
        "checksum", 
        "finished_at", 
        "migration_name", 
        "logs", 
        "rolled_back_at", 
        "started_at", 
        "applied_steps_count"
      ) VALUES (
        '${migrationId}',
        '${crypto.randomBytes(32).toString('hex')}',
        NOW(),
        '${migrationName}',
        NULL,
        NULL,
        NOW(),
        1
      )
    `, "Recording migration");

    // Commit transaction
    console.log("\n📝 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("\n✅ Subscription System Migration completed successfully!\n");

    // Verify the tables were created
    console.log("🔍 Verifying created tables...\n");
    const verifyResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('TierSubscription', 'SubscriptionBillingAttempt', 'SellingPlanGroup', 'SellingPlan')
        ORDER BY table_name
      `,
    }));

    if (verifyResult.records) {
      console.log("Created tables:");
      verifyResult.records.forEach(record => {
        if (record[0] && record[0].stringValue) {
          console.log(`  ✓ ${record[0].stringValue}`);
        }
      });
    }

  } catch (error) {
    console.error(`\n❌ Migration failed: ${error.message}\n`);
    
    // Rollback transaction
    console.log("⏪ Rolling back transaction...");
    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
    
    console.log("Transaction rolled back.\n");
    process.exit(1);
  }
}

// Run the migration
applySubscriptionMigration().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});