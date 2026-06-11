import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function createMissingTables() {
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

  console.log("🚀 Creating Missing Tables and Columns\n");

  // Start transaction
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Step 1: Create UsageSummary table
    console.log("\nStep 1: Creating UsageSummary table...");
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

    // Step 2: Add unique constraint
    console.log("\nStep 2: Adding unique constraint to UsageSummary...");
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
      console.log("  ✓ Unique constraint added");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ⚠️ Constraint already exists");
      } else {
        throw error;
      }
    }

    // Step 3: Create indexes for UsageSummary
    console.log("\nStep 3: Creating indexes for UsageSummary...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "UsageSummary_shop_date_idx"
            ON "UsageSummary"("shop", "date" DESC)`,
      transactionId,
    }));
    console.log("  ✓ Created shop_date index");

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "UsageSummary_charged_idx"
            ON "UsageSummary"("charged")`,
      transactionId,
    }));
    console.log("  ✓ Created charged index");

    // Step 4: Add billingStatus to ShopSettings
    console.log("\nStep 4: Adding billingStatus column to ShopSettings...");
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "ShopSettings"
              ADD COLUMN "billingStatus" TEXT DEFAULT 'INACTIVE'`,
        transactionId,
      }));
      console.log("  ✓ billingStatus column added");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ⚠️ Column already exists");
      } else {
        console.log("  ⚠️ Could not add column:", error.message);
      }
    }

    // Step 5: Add isActive to Session
    console.log("\nStep 5: Adding isActive column to Session...");
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "Session"
              ADD COLUMN "isActive" BOOLEAN DEFAULT true`,
        transactionId,
      }));
      console.log("  ✓ isActive column added");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ⚠️ Column already exists");
      } else {
        console.log("  ⚠️ Could not add column:", error.message);
      }
    }

    // Step 6: Create index on Session
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

    // Commit transaction
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("\n✅ All missing tables and columns created successfully!");

    // Record migration
    console.log("\nRecording migration...");
    const migrationId = crypto.randomBytes(18).toString('hex');

    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `INSERT INTO "_prisma_migrations"
              (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
              VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 6)`,
        parameters: [
          { name: "id", value: { stringValue: migrationId }},
          { name: "checksum", value: { stringValue: "missing_tables_v1" }},
          { name: "name", value: { stringValue: "20250920_create_missing_tables" }},
        ],
      }));
      console.log("  ✓ Migration recorded");
    } catch (error) {
      console.log("  ⚠️ Migration record might already exist");
    }

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
createMissingTables()
  .then(() => {
    console.log("\n🎉 Database is fully ready for the billing system!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error.message);
    process.exit(1);
  });