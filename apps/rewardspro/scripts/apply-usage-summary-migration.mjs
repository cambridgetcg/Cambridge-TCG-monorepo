import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyUsageSummaryMigration() {
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

  console.log("🚀 Applying UsageSummary Migration to Aurora Database\n");
  console.log("Database:", database);
  console.log("Region:", process.env.AWS_REGION || "eu-north-1");
  console.log("Starting migration...\n");

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

    try {
      await client.send(new RollbackTransactionCommand({
        resourceArn,
        secretArn,
        transactionId,
      }));
      console.log("Transaction rolled back successfully.");
    } catch (rollbackError) {
      console.error("Failed to rollback transaction:", rollbackError.message);
    }

    throw error;
  }
}

async function executeMigrationSteps(client, resourceArn, secretArn, database, transactionId) {
  // Step 1: Add billingStatus column to ShopSettings if it doesn't exist
  console.log("Step 1: Adding billingStatus to ShopSettings...");
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "ShopSettings"
            ADD COLUMN IF NOT EXISTS "billingStatus" TEXT DEFAULT 'INACTIVE'`,
      transactionId,
    }));
    console.log("  ✓ billingStatus column added (or already exists)");
  } catch (error) {
    console.log("  ⚠️ Column might already exist:", error.message);
  }

  // Step 2: Create UsageSummary table
  console.log("\nStep 2: Creating UsageSummary table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "UsageSummary" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "date" TIMESTAMP(3) NOT NULL,
            "ordersProcessed" INTEGER NOT NULL,
            "cashbackIssued" DECIMAL(10,2) NOT NULL,
            "customersActive" INTEGER NOT NULL,
            "chargeAmount" DECIMAL(10,2) NOT NULL,
            "chargeId" TEXT,
            "charged" BOOLEAN NOT NULL DEFAULT false,
            "metadata" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "UsageSummary_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ UsageSummary table created");

  // Step 3: Create unique constraint on shop and date
  console.log("\nStep 3: Creating unique constraint for UsageSummary...");
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "UsageSummary"
            ADD CONSTRAINT "UsageSummary_shop_date_key"
            UNIQUE ("shop", "date")`,
      transactionId,
    }));
    console.log("  ✓ Unique constraint created");
  } catch (error) {
    if (error.message.includes("already exists")) {
      console.log("  ⚠️ Constraint already exists");
    } else {
      throw error;
    }
  }

  // Step 4: Create indexes for UsageSummary
  console.log("\nStep 4: Creating indexes for UsageSummary...");

  // Index for shop and date queries
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "UsageSummary_shop_date_idx"
          ON "UsageSummary"("shop", "date" DESC)`,
    transactionId,
  }));
  console.log("  ✓ Created shop_date index");

  // Index for charged status
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "UsageSummary_charged_idx"
          ON "UsageSummary"("charged")`,
    transactionId,
  }));
  console.log("  ✓ Created charged index");

  // Step 5: Add isActive column to Session if it doesn't exist
  console.log("\nStep 5: Ensuring Session table has isActive column...");
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "Session"
            ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true`,
      transactionId,
    }));
    console.log("  ✓ isActive column added (or already exists)");
  } catch (error) {
    console.log("  ⚠️ Column might already exist:", error.message);
  }

  // Step 6: Create index on Session for shop and isActive
  console.log("\nStep 6: Creating Session index...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "Session_shop_isActive_idx"
          ON "Session"("shop", "isActive")`,
    transactionId,
  }));
  console.log("  ✓ Created Session shop_isActive index");

  // Step 7: Ensure BillingSubscription table has required columns
  console.log("\nStep 7: Updating BillingSubscription table...");

  // Add planName column if it doesn't exist
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "BillingSubscription"
            ADD COLUMN IF NOT EXISTS "planName" TEXT`,
      transactionId,
    }));
    console.log("  ✓ planName column added (or already exists)");
  } catch (error) {
    console.log("  ⚠️ Column might already exist:", error.message);
  }

  // Add status column if it doesn't exist
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "BillingSubscription"
            ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'PENDING'`,
      transactionId,
    }));
    console.log("  ✓ status column added (or already exists)");
  } catch (error) {
    console.log("  ⚠️ Column might already exist:", error.message);
  }

  // Add isTest column if it doesn't exist
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "BillingSubscription"
            ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN DEFAULT false`,
      transactionId,
    }));
    console.log("  ✓ isTest column added (or already exists)");
  } catch (error) {
    console.log("  ⚠️ Column might already exist:", error.message);
  }

  // Add cappedAmount column if it doesn't exist
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "BillingSubscription"
            ADD COLUMN IF NOT EXISTS "cappedAmount" DECIMAL(10,2)`,
      transactionId,
    }));
    console.log("  ✓ cappedAmount column added (or already exists)");
  } catch (error) {
    console.log("  ⚠️ Column might already exist:", error.message);
  }

  // Add balanceUsed column if it doesn't exist
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "BillingSubscription"
            ADD COLUMN IF NOT EXISTS "balanceUsed" DECIMAL(10,2) DEFAULT 0`,
      transactionId,
    }));
    console.log("  ✓ balanceUsed column added (or already exists)");
  } catch (error) {
    console.log("  ⚠️ Column might already exist:", error.message);
  }

  // Add balanceRemaining column if it doesn't exist
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "BillingSubscription"
            ADD COLUMN IF NOT EXISTS "balanceRemaining" DECIMAL(10,2)`,
      transactionId,
    }));
    console.log("  ✓ balanceRemaining column added (or already exists)");
  } catch (error) {
    console.log("  ⚠️ Column might already exist:", error.message);
  }

  // Step 8: Record migration in Prisma's tracking table
  console.log("\nStep 8: Recording migration...");
  const migrationId = crypto.randomBytes(18).toString('hex');
  const migrationName = "20250920_add_usage_summary_billing";

  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 8)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "usage_summary_migration_v1" }},
        { name: "name", value: { stringValue: migrationName }},
      ],
      transactionId,
    }));
    console.log("  ✓ Migration recorded in _prisma_migrations");
  } catch (error) {
    console.log("  ⚠️ Migration record might already exist:", error.message);
  }

  console.log("\n  ✓ All migration steps completed successfully");
}

// Run the migration
applyUsageSummaryMigration()
  .then(() => {
    console.log("📋 Migration Summary:");
    console.log("  - Added billingStatus to ShopSettings");
    console.log("  - Created UsageSummary table with indexes");
    console.log("  - Ensured Session table has isActive column");
    console.log("  - Updated BillingSubscription table columns");
    console.log("\n🎉 Database is ready for the new billing system!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error.message);
    console.error("\nPlease check the error above and try again.");
    process.exit(1);
  });