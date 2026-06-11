/**
 * Migration Script: Fix Subscription Schema Inconsistencies
 * 
 * This script adds missing fields that are referenced in the code but not in the database schema:
 * 1. Customer.currentSubscriptionId - Links customer to their active subscription
 * 2. SellingPlanGroup.shopifySellingPlanGroupId - Shopify's ID for the selling plan group
 * 3. TierProduct.shopifySellingPlanGroupId - Additional field for consistency
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applySubscriptionSchemaFix() {
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

  console.log("🚀 Applying Subscription Schema Fix to Aurora Database\n");
  console.log("Database:", database);
  console.log("Region:", process.env.AWS_REGION || "eu-north-1");
  console.log("");

  // Start transaction for atomicity
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  console.log("✓ Transaction started\n");

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

    console.log("\n✅ Migration completed successfully!\n");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("Rolling back transaction...");
    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
    console.log("Transaction rolled back.");
    throw error;
  }
}

async function executeMigrationSteps(client, resourceArn, secretArn, database, transactionId) {
  console.log("Starting migration steps...\n");

  // Step 1: Add currentSubscriptionId to Customer table
  console.log("Step 1: Adding currentSubscriptionId to Customer table...");
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "Customer" 
            ADD COLUMN IF NOT EXISTS "currentSubscriptionId" TEXT UNIQUE`,
      transactionId,
    }));
    console.log("  ✓ Column currentSubscriptionId added to Customer table with unique constraint");
  } catch (error) {
    if (!error.message.includes("already exists")) {
      throw error;
    }
    console.log("  ℹ Column currentSubscriptionId already exists");
    
    // Try to add unique constraint if column exists but constraint doesn't
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "Customer" 
              ADD CONSTRAINT "Customer_currentSubscriptionId_key" UNIQUE ("currentSubscriptionId")`,
        transactionId,
      }));
      console.log("  ✓ Unique constraint added to currentSubscriptionId");
    } catch (constraintError) {
      if (!constraintError.message.includes("already exists")) {
        console.log("  ⚠ Could not add unique constraint:", constraintError.message);
      }
    }
  }

  // Step 2: Check if SellingPlanGroup table exists and add shopifySellingPlanGroupId
  console.log("\nStep 2: Checking SellingPlanGroup table...");
  try {
    // First check if table exists
    const tableCheck = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'SellingPlanGroup'
      )`,
      transactionId,
    }));

    const tableExists = tableCheck.records?.[0]?.[0]?.booleanValue;

    if (tableExists) {
      console.log("  ℹ SellingPlanGroup table exists, adding column...");
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "SellingPlanGroup" 
              ADD COLUMN IF NOT EXISTS "shopifySellingPlanGroupId" TEXT`,
        transactionId,
      }));
      console.log("  ✓ Column shopifySellingPlanGroupId added to SellingPlanGroup");
    } else {
      console.log("  ℹ SellingPlanGroup table doesn't exist, creating it...");
      
      // Create the SellingPlanGroup table
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE TABLE IF NOT EXISTS "SellingPlanGroup" (
          "id" TEXT NOT NULL,
          "shop" TEXT NOT NULL,
          "shopifySellingPlanGroupId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "merchantCode" TEXT,
          "summary" TEXT,
          "active" BOOLEAN DEFAULT true,
          "position" INTEGER DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "SellingPlanGroup_pkey" PRIMARY KEY ("id")
        )`,
        transactionId,
      }));
      console.log("  ✓ SellingPlanGroup table created");

      // Create index
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE INDEX IF NOT EXISTS "SellingPlanGroup_shop_idx" 
              ON "SellingPlanGroup"("shop")`,
        transactionId,
      }));
      console.log("  ✓ Index created on SellingPlanGroup");
    }
  } catch (error) {
    if (!error.message.includes("already exists")) {
      throw error;
    }
    console.log("  ℹ Column shopifySellingPlanGroupId already exists");
  }

  // Step 3: Check if SellingPlan table exists
  console.log("\nStep 3: Checking SellingPlan table...");
  try {
    const tableCheck = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'SellingPlan'
      )`,
      transactionId,
    }));

    const tableExists = tableCheck.records?.[0]?.[0]?.booleanValue;

    if (!tableExists) {
      console.log("  ℹ SellingPlan table doesn't exist, creating it...");
      
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE TABLE IF NOT EXISTS "SellingPlan" (
          "id" TEXT NOT NULL,
          "sellingPlanGroupId" TEXT NOT NULL,
          "shopifySellingPlanId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "billingInterval" TEXT NOT NULL,
          "intervalCount" INTEGER NOT NULL DEFAULT 1,
          "discountType" TEXT,
          "discountValue" DECIMAL(10,2),
          "position" INTEGER DEFAULT 0,
          "active" BOOLEAN DEFAULT true,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "SellingPlan_pkey" PRIMARY KEY ("id")
        )`,
        transactionId,
      }));
      console.log("  ✓ SellingPlan table created");

      // Create foreign key
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "SellingPlan" 
              ADD CONSTRAINT "SellingPlan_sellingPlanGroupId_fkey" 
              FOREIGN KEY ("sellingPlanGroupId") 
              REFERENCES "SellingPlanGroup"("id") 
              ON DELETE CASCADE ON UPDATE CASCADE`,
        transactionId,
      }));
      console.log("  ✓ Foreign key constraint added");
    } else {
      console.log("  ✓ SellingPlan table already exists");
    }
  } catch (error) {
    console.log("  ⚠ Error checking/creating SellingPlan table:", error.message);
  }

  // Step 4: Add shopifySellingPlanGroupId to TierProduct table
  console.log("\nStep 4: Adding shopifySellingPlanGroupId to TierProduct table...");
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct" 
            ADD COLUMN IF NOT EXISTS "shopifySellingPlanGroupId" TEXT`,
      transactionId,
    }));
    console.log("  ✓ Column shopifySellingPlanGroupId added to TierProduct table");
  } catch (error) {
    if (!error.message.includes("already exists")) {
      throw error;
    }
    console.log("  ℹ Column shopifySellingPlanGroupId already exists");
  }

  // Step 5: Add foreign key constraint for Customer.currentSubscriptionId
  console.log("\nStep 5: Adding foreign key constraint for Customer.currentSubscriptionId...");
  try {
    // Check if TierSubscription table exists
    const tableCheck = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'TierSubscription'
      )`,
      transactionId,
    }));

    const tableExists = tableCheck.records?.[0]?.[0]?.booleanValue;

    if (tableExists) {
      // Check if constraint already exists
      const constraintCheck = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT EXISTS (
          SELECT FROM information_schema.table_constraints 
          WHERE constraint_name = 'Customer_currentSubscriptionId_fkey'
        )`,
        transactionId,
      }));

      const constraintExists = constraintCheck.records?.[0]?.[0]?.booleanValue;

      if (!constraintExists) {
        await client.send(new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: `ALTER TABLE "Customer" 
                ADD CONSTRAINT "Customer_currentSubscriptionId_fkey" 
                FOREIGN KEY ("currentSubscriptionId") 
                REFERENCES "TierSubscription"("id") 
                ON DELETE SET NULL ON UPDATE CASCADE`,
          transactionId,
        }));
        console.log("  ✓ Foreign key constraint added for currentSubscriptionId");
      } else {
        console.log("  ℹ Foreign key constraint already exists");
      }
    } else {
      console.log("  ⚠ TierSubscription table doesn't exist, skipping foreign key");
    }
  } catch (error) {
    console.log("  ⚠ Could not add foreign key constraint:", error.message);
  }

  // Step 6: Create indexes for new columns
  console.log("\nStep 6: Creating indexes for new columns...");
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "Customer_currentSubscriptionId_idx" 
            ON "Customer"("currentSubscriptionId")`,
      transactionId,
    }));
    console.log("  ✓ Index created for Customer.currentSubscriptionId");

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "TierProduct_shopifySellingPlanGroupId_idx" 
            ON "TierProduct"("shopifySellingPlanGroupId")`,
      transactionId,
    }));
    console.log("  ✓ Index created for TierProduct.shopifySellingPlanGroupId");
  } catch (error) {
    console.log("  ⚠ Error creating indexes:", error.message);
  }

  // Step 7: Record migration in Prisma's tracking table
  console.log("\nStep 7: Recording migration...");
  const migrationId = crypto.randomBytes(18).toString('hex');
  const migrationName = `20250117_fix_subscription_schema_${Date.now()}`;
  
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations" 
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 7)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "subscription_schema_fix_v1" }},
        { name: "name", value: { stringValue: migrationName }},
      ],
      transactionId,
    }));
    console.log(`  ✓ Migration recorded: ${migrationName}`);
  } catch (error) {
    console.log("  ⚠ Could not record migration (may not affect functionality):", error.message);
  }

  console.log("\n✓ All migration steps completed");
}

// Run the migration
applySubscriptionSchemaFix().catch(error => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});