import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function createBillingSubscriptionTable() {
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

  console.log("🚀 Creating BillingSubscription Table in Aurora Database\n");
  console.log("Database:", database);
  console.log("Starting migration...\n");

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Step 1: Create BillingSubscription table
    console.log("Step 1: Creating BillingSubscription table...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE TABLE IF NOT EXISTS "BillingSubscription" (
              "id" TEXT NOT NULL,
              "shop" TEXT NOT NULL,
              "subscriptionId" TEXT,
              "subscriptionStatus" TEXT,
              "currentPeriodEnd" TIMESTAMP(3),
              "recurringLineItemId" TEXT,
              "usageLineItemId" TEXT,
              "pendingChargeId" TEXT,
              "pendingChargeCreatedAt" TIMESTAMP(3),
              "confirmationUrl" TEXT,
              "currentPeriodOrders" INTEGER NOT NULL DEFAULT 0,
              "currentPeriodUsageFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
              "lastUsageReset" TIMESTAMP(3),
              "usageCappedAmount" DECIMAL(10,2),
              "billingVersion" TEXT NOT NULL DEFAULT 'graphql',
              "migratedAt" TIMESTAMP(3),
              "planType" TEXT,
              "trialEndsAt" TIMESTAMP(3),
              "planName" TEXT,
              "status" TEXT DEFAULT 'PENDING',
              "isTest" BOOLEAN DEFAULT false,
              "cappedAmount" DECIMAL(10,2),
              "balanceUsed" DECIMAL(10,2) DEFAULT 0,
              "balanceRemaining" DECIMAL(10,2),
              "metadata" JSONB,
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
            )`,
      transactionId,
    }));
    console.log("  ✓ BillingSubscription table created");

    // Step 2: Create unique constraint on shop
    console.log("\nStep 2: Creating unique constraint for shop...");
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "BillingSubscription"
              ADD CONSTRAINT "BillingSubscription_shop_key"
              UNIQUE ("shop")`,
        transactionId,
      }));
      console.log("  ✓ Unique constraint on shop created");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ⚠️ Constraint already exists");
      } else {
        throw error;
      }
    }

    // Step 3: Create indexes
    console.log("\nStep 3: Creating indexes...");

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "BillingSubscription_shop_idx"
            ON "BillingSubscription"("shop")`,
      transactionId,
    }));
    console.log("  ✓ Created shop index");

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "BillingSubscription_subscriptionStatus_idx"
            ON "BillingSubscription"("subscriptionStatus")`,
      transactionId,
    }));
    console.log("  ✓ Created subscriptionStatus index");

    // Step 4: Record migration
    console.log("\nStep 4: Recording migration...");
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = "20250920_create_billing_subscription";

    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `INSERT INTO "_prisma_migrations"
              (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
              VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 4)`,
        parameters: [
          { name: "id", value: { stringValue: migrationId }},
          { name: "checksum", value: { stringValue: "billing_subscription_v1" }},
          { name: "name", value: { stringValue: migrationName }},
        ],
        transactionId,
      }));
      console.log("  ✓ Migration recorded");
    } catch (error) {
      console.log("  ⚠️ Migration record might already exist");
    }

    // Commit transaction
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ BillingSubscription table created successfully!\n");

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("Rolling back transaction...");

    try {
      await client.send(new RollbackTransactionCommand({
        resourceArn,
        secretArn,
        transactionId,
      }));
      console.log("Transaction rolled back.");
    } catch (rollbackError) {
      console.error("Failed to rollback:", rollbackError.message);
    }

    throw error;
  }
}

// Run the migration
createBillingSubscriptionTable()
  .then(() => {
    console.log("🎉 BillingSubscription table is ready!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error.message);
    process.exit(1);
  });