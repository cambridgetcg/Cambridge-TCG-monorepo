import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

async function applyBillingMigration() {
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

  console.log("🚀 Applying Billing Migration to Aurora Database\n");

  // Start transaction
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Step 1: Alter BillingPlan table
    console.log("Step 1: Updating BillingPlan table...");
    
    // Drop columns that don't exist (safe with IF EXISTS)
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "BillingPlan" 
            DROP COLUMN IF EXISTS "currentPeriodStart",
            DROP COLUMN IF EXISTS "ordersUsed",
            DROP COLUMN IF EXISTS "ordersLimit",
            DROP COLUMN IF EXISTS "overageRate",
            DROP COLUMN IF EXISTS "shopifyChargeId"`,
      transactionId,
    }));

    // Add new columns
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "BillingPlan" 
            ADD COLUMN IF NOT EXISTS "monthlyPrice" DECIMAL(10,2),
            ADD COLUMN IF NOT EXISTS "usageCap" DECIMAL(10,2),
            ADD COLUMN IF NOT EXISTS "cap80AlertSent" BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS "cap90AlertSent" BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS "lastCapAlert" TIMESTAMP(3),
            ADD COLUMN IF NOT EXISTS "metadata" JSONB`,
      transactionId,
    }));

    // Make currentPeriodEnd nullable if it exists
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `DO $$ 
            BEGIN
              IF EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name = 'BillingPlan' 
                         AND column_name = 'currentPeriodEnd') THEN
                ALTER TABLE "BillingPlan" ALTER COLUMN "currentPeriodEnd" DROP NOT NULL;
              END IF;
            END $$`,
      transactionId,
    }));

    console.log("  ✓ BillingPlan table updated");

    // Step 2: Alter UsageRecord table
    console.log("Step 2: Updating UsageRecord table...");
    
    // Drop old columns
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "UsageRecord" 
            DROP COLUMN IF EXISTS "orderId",
            DROP COLUMN IF EXISTS "orderNumber",
            DROP COLUMN IF EXISTS "orderAmount"`,
      transactionId,
    }));

    // Add new columns
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "UsageRecord" 
            ADD COLUMN IF NOT EXISTS "shopifyUsageRecordId" TEXT,
            ADD COLUMN IF NOT EXISTS "description" TEXT,
            ADD COLUMN IF NOT EXISTS "amount" DECIMAL(10,2),
            ADD COLUMN IF NOT EXISTS "currencyCode" TEXT DEFAULT 'USD',
            ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
            ADD COLUMN IF NOT EXISTS "metadata" JSONB,
            ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`,
      transactionId,
    }));

    // Make billingPlanId nullable
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `DO $$ 
            BEGIN
              IF EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name = 'UsageRecord' 
                         AND column_name = 'billingPlanId') THEN
                ALTER TABLE "UsageRecord" ALTER COLUMN "billingPlanId" DROP NOT NULL;
              END IF;
            END $$`,
      transactionId,
    }));

    console.log("  ✓ UsageRecord table updated");

    // Step 3: Create BillingHistory table
    console.log("Step 3: Creating BillingHistory table...");
    
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE TABLE IF NOT EXISTS "BillingHistory" (
              "id" TEXT NOT NULL,
              "shop" TEXT NOT NULL,
              "eventType" TEXT NOT NULL,
              "planName" TEXT NOT NULL,
              "status" TEXT NOT NULL,
              "amount" DECIMAL(10,2),
              "metadata" JSONB,
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "billingPlanId" TEXT,
              CONSTRAINT "BillingHistory_pkey" PRIMARY KEY ("id")
            )`,
      transactionId,
    }));

    // Create indexes
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "BillingHistory_shop_createdAt_idx" ON "BillingHistory"("shop", "createdAt" DESC)`,
      transactionId,
    }));

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "BillingHistory_eventType_idx" ON "BillingHistory"("eventType")`,
      transactionId,
    }));

    console.log("  ✓ BillingHistory table created");

    // Step 4: Create Notification table
    console.log("Step 4: Creating Notification table...");
    
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE TABLE IF NOT EXISTS "Notification" (
              "id" TEXT NOT NULL,
              "shop" TEXT NOT NULL,
              "type" TEXT NOT NULL,
              "title" TEXT NOT NULL,
              "message" TEXT NOT NULL,
              "severity" TEXT NOT NULL,
              "read" BOOLEAN NOT NULL DEFAULT false,
              "metadata" JSONB,
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
            )`,
      transactionId,
    }));

    // Create indexes
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "Notification_shop_read_idx" ON "Notification"("shop", "read")`,
      transactionId,
    }));

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "Notification_shop_createdAt_idx" ON "Notification"("shop", "createdAt" DESC)`,
      transactionId,
    }));

    console.log("  ✓ Notification table created");

    // Step 5: Update UsageRecord indexes
    console.log("Step 5: Updating UsageRecord indexes...");
    
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `DROP INDEX IF EXISTS "UsageRecord_shop_orderId_key"`,
      transactionId,
    }));

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "UsageRecord_shop_idempotencyKey_idx" ON "UsageRecord"("shop", "idempotencyKey")`,
      transactionId,
    }));

    console.log("  ✓ Indexes updated");

    // Step 6: Add foreign key constraint
    console.log("Step 6: Adding foreign key constraints...");
    
    // Check if constraint already exists
    const constraintCheck = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT EXISTS (
              SELECT 1 FROM information_schema.table_constraints 
              WHERE constraint_name = 'BillingHistory_billingPlanId_fkey'
            )`,
      transactionId,
    }));

    const constraintExists = constraintCheck.records?.[0]?.[0]?.booleanValue;

    if (!constraintExists) {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "BillingHistory" 
              ADD CONSTRAINT "BillingHistory_billingPlanId_fkey" 
              FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") 
              ON DELETE SET NULL ON UPDATE CASCADE`,
        transactionId,
      }));
      console.log("  ✓ Foreign key constraint added");
    } else {
      console.log("  ✓ Foreign key constraint already exists");
    }

    // Step 7: Record migration
    console.log("Step 7: Recording migration...");
    
    // Generate a unique ID for the migration
    const migrationId = Array.from(crypto.getRandomValues(new Uint8Array(18)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations" 
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 7)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "billing_migration_v1" }},
        { name: "name", value: { stringValue: "20250911_update_billing_models" }},
      ],
      transactionId,
    }));

    console.log("  ✓ Migration recorded");

    // Commit transaction
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("⏮️  Rolling back transaction...");
    
    try {
      await client.send(new RollbackTransactionCommand({
        resourceArn,
        secretArn,
        transactionId,
      }));
      console.log("✅ Transaction rolled back");
    } catch (rollbackError) {
      console.error(`❌ Failed to rollback: ${rollbackError.message}`);
    }
    
    throw error;
  }
}

// Run the migration
applyBillingMigration().catch(error => {
  console.error("Migration failed:", error);
  process.exit(1);
});