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

  // Start transaction for atomicity
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  console.log("Starting transaction...\n");

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
  // Helper function for executing statements
  const executeStep = async (stepName, sql) => {
    console.log(`  ${stepName}...`);
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql,
        transactionId,
      }));
      console.log(`    ✓ ${stepName} completed`);
    } catch (error) {
      console.error(`    ✗ ${stepName} failed: ${error.message}`);
      throw error;
    }
  };

  // Step 1: Create Enums
  console.log("Step 1: Creating enums...");
  
  await executeStep("Creating SubscriptionStatus enum",
    `DO $$ BEGIN
      CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'FAILED');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`
  );

  await executeStep("Creating BillingInterval enum",
    `DO $$ BEGIN
      CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`
  );

  await executeStep("Creating BillingStatus enum",
    `DO $$ BEGIN
      CREATE TYPE "BillingStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRY');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`
  );

  await executeStep("Creating DiscountType enum",
    `DO $$ BEGIN
      CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`
  );

  // Step 2: Create SellingPlanGroup table
  console.log("\nStep 2: Creating SellingPlanGroup table...");
  await executeStep("Creating SellingPlanGroup table",
    `CREATE TABLE IF NOT EXISTS "SellingPlanGroup" (
      "id" TEXT NOT NULL,
      "shop" TEXT NOT NULL,
      "shopifySellingPlanGroupId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "merchantCode" TEXT NOT NULL,
      "summary" TEXT,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "position" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "SellingPlanGroup_pkey" PRIMARY KEY ("id")
    )`
  );

  // Step 3: Create SellingPlan table
  console.log("\nStep 3: Creating SellingPlan table...");
  await executeStep("Creating SellingPlan table",
    `CREATE TABLE IF NOT EXISTS "SellingPlan" (
      "id" TEXT NOT NULL,
      "sellingPlanGroupId" TEXT NOT NULL,
      "shopifySellingPlanId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "billingInterval" "BillingInterval" NOT NULL,
      "intervalCount" INTEGER NOT NULL DEFAULT 1,
      "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
      "discountValue" DECIMAL(10,2) NOT NULL,
      "position" INTEGER,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "SellingPlan_pkey" PRIMARY KEY ("id")
    )`
  );

  // Step 4: Create TierSubscription table
  console.log("\nStep 4: Creating TierSubscription table...");
  await executeStep("Creating TierSubscription table",
    `CREATE TABLE IF NOT EXISTS "TierSubscription" (
      "id" TEXT NOT NULL,
      "shop" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "tierId" TEXT NOT NULL,
      "subscriptionContractId" TEXT NOT NULL,
      "sellingPlanId" TEXT NOT NULL,
      "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
      "billingInterval" "BillingInterval" NOT NULL,
      "nextBillingDate" TIMESTAMP(3),
      "currentPeriodStart" TIMESTAMP(3),
      "currentPeriodEnd" TIMESTAMP(3),
      "discountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
      "monthlyPrice" DECIMAL(10,2) NOT NULL,
      "lastBillingAmount" DECIMAL(10,2),
      "lastBillingDate" TIMESTAMP(3),
      "activatedAt" TIMESTAMP(3),
      "pausedAt" TIMESTAMP(3),
      "cancelledAt" TIMESTAMP(3),
      "cancellationReason" TEXT,
      "failureCount" INTEGER NOT NULL DEFAULT 0,
      "lastFailureReason" TEXT,
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "TierSubscription_pkey" PRIMARY KEY ("id")
    )`
  );

  // Step 5: Create SubscriptionBillingAttempt table
  console.log("\nStep 5: Creating SubscriptionBillingAttempt table...");
  await executeStep("Creating SubscriptionBillingAttempt table",
    `CREATE TABLE IF NOT EXISTS "SubscriptionBillingAttempt" (
      "id" TEXT NOT NULL,
      "subscriptionId" TEXT NOT NULL,
      "idempotencyKey" TEXT NOT NULL,
      "status" "BillingStatus" NOT NULL DEFAULT 'PENDING',
      "amount" DECIMAL(10,2) NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'USD',
      "billingDate" TIMESTAMP(3) NOT NULL,
      "shopifyChargeId" TEXT,
      "shopifyInvoiceId" TEXT,
      "attemptNumber" INTEGER NOT NULL DEFAULT 1,
      "errorMessage" TEXT,
      "errorCode" TEXT,
      "processedAt" TIMESTAMP(3),
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "SubscriptionBillingAttempt_pkey" PRIMARY KEY ("id")
    )`
  );

  // Step 6: Add unique constraints
  console.log("\nStep 6: Adding unique constraints...");
  await executeStep("Adding unique constraint to SellingPlanGroup",
    `ALTER TABLE "SellingPlanGroup" 
     ADD CONSTRAINT "SellingPlanGroup_shop_shopifySellingPlanGroupId_key" 
     UNIQUE ("shop", "shopifySellingPlanGroupId")`
  );

  await executeStep("Adding unique constraint to SellingPlan",
    `ALTER TABLE "SellingPlan" 
     ADD CONSTRAINT "SellingPlan_shopifySellingPlanId_key" 
     UNIQUE ("shopifySellingPlanId")`
  );

  await executeStep("Adding unique constraint to TierSubscription",
    `ALTER TABLE "TierSubscription" 
     ADD CONSTRAINT "TierSubscription_subscriptionContractId_key" 
     UNIQUE ("subscriptionContractId")`
  );

  await executeStep("Adding unique constraint to SubscriptionBillingAttempt",
    `ALTER TABLE "SubscriptionBillingAttempt" 
     ADD CONSTRAINT "SubscriptionBillingAttempt_idempotencyKey_key" 
     UNIQUE ("idempotencyKey")`
  );

  // Step 7: Create indexes
  console.log("\nStep 7: Creating indexes...");
  await executeStep("Creating index on SellingPlanGroup",
    `CREATE INDEX IF NOT EXISTS "SellingPlanGroup_shop_idx" 
     ON "SellingPlanGroup"("shop")`
  );

  await executeStep("Creating index on SellingPlan",
    `CREATE INDEX IF NOT EXISTS "SellingPlan_sellingPlanGroupId_idx" 
     ON "SellingPlan"("sellingPlanGroupId")`
  );

  await executeStep("Creating indexes on TierSubscription",
    `CREATE INDEX IF NOT EXISTS "TierSubscription_shop_customerId_idx" 
     ON "TierSubscription"("shop", "customerId")`
  );

  await executeStep("Creating index on TierSubscription status",
    `CREATE INDEX IF NOT EXISTS "TierSubscription_status_nextBillingDate_idx" 
     ON "TierSubscription"("status", "nextBillingDate")`
  );

  await executeStep("Creating index on SubscriptionBillingAttempt",
    `CREATE INDEX IF NOT EXISTS "SubscriptionBillingAttempt_subscriptionId_idx" 
     ON "SubscriptionBillingAttempt"("subscriptionId")`
  );

  // Step 8: Add foreign key constraints
  console.log("\nStep 8: Adding foreign key constraints...");
  await executeStep("Adding foreign key to SellingPlan",
    `ALTER TABLE "SellingPlan" 
     ADD CONSTRAINT "SellingPlan_sellingPlanGroupId_fkey" 
     FOREIGN KEY ("sellingPlanGroupId") REFERENCES "SellingPlanGroup"("id") 
     ON DELETE CASCADE ON UPDATE CASCADE`
  );

  await executeStep("Adding foreign keys to TierSubscription",
    `ALTER TABLE "TierSubscription" 
     ADD CONSTRAINT "TierSubscription_customerId_fkey" 
     FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
     ON DELETE CASCADE ON UPDATE CASCADE`
  );

  await executeStep("Adding tier foreign key to TierSubscription",
    `ALTER TABLE "TierSubscription" 
     ADD CONSTRAINT "TierSubscription_tierId_fkey" 
     FOREIGN KEY ("tierId") REFERENCES "Tier"("id") 
     ON DELETE RESTRICT ON UPDATE CASCADE`
  );

  await executeStep("Adding selling plan foreign key to TierSubscription",
    `ALTER TABLE "TierSubscription" 
     ADD CONSTRAINT "TierSubscription_sellingPlanId_fkey" 
     FOREIGN KEY ("sellingPlanId") REFERENCES "SellingPlan"("id") 
     ON DELETE RESTRICT ON UPDATE CASCADE`
  );

  await executeStep("Adding foreign key to SubscriptionBillingAttempt",
    `ALTER TABLE "SubscriptionBillingAttempt" 
     ADD CONSTRAINT "SubscriptionBillingAttempt_subscriptionId_fkey" 
     FOREIGN KEY ("subscriptionId") REFERENCES "TierSubscription"("id") 
     ON DELETE CASCADE ON UPDATE CASCADE`
  );

  // Step 9: Alter existing tables
  console.log("\nStep 9: Updating existing tables...");
  await executeStep("Adding subscription fields to Tier table",
    `ALTER TABLE "Tier" 
     ADD COLUMN IF NOT EXISTS "billingInterval" "BillingInterval",
     ADD COLUMN IF NOT EXISTS "discountPercentage" DECIMAL(5,2) DEFAULT 0`
  );

  await executeStep("Adding subscription field to Customer table",
    `ALTER TABLE "Customer" 
     ADD COLUMN IF NOT EXISTS "currentSubscriptionId" TEXT`
  );

  await executeStep("Adding subscription field to TierChangeLog table",
    `ALTER TABLE "TierChangeLog" 
     ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT`
  );

  // Step 10: Extend TierTriggerType enum
  console.log("\nStep 10: Extending TierTriggerType enum...");
  await executeStep("Adding subscription triggers to TierTriggerType",
    `ALTER TYPE "TierTriggerType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CREATED'`
  );

  await executeStep("Adding subscription activated trigger",
    `ALTER TYPE "TierTriggerType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_ACTIVATED'`
  );

  await executeStep("Adding subscription cancelled trigger",
    `ALTER TYPE "TierTriggerType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CANCELLED'`
  );

  await executeStep("Adding subscription expired trigger",
    `ALTER TYPE "TierTriggerType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_EXPIRED'`
  );

  // Step 11: Record migration in Prisma's tracking table
  console.log("\nStep 11: Recording migration...");
  const migrationId = crypto.randomBytes(18).toString('hex');
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `INSERT INTO "_prisma_migrations" 
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 11)`,
    parameters: [
      { name: "id", value: { stringValue: migrationId }},
      { name: "checksum", value: { stringValue: "subscription_system_v1" }},
      { name: "name", value: { stringValue: "20250115_add_subscription_system" }},
    ],
    transactionId,
  }));
  console.log("    ✓ Migration recorded");

  console.log("\n  ✓ All migration steps completed successfully");
}

// Run the migration
applySubscriptionMigration().catch(error => {
  console.error("Migration failed:", error);
  process.exit(1);
});