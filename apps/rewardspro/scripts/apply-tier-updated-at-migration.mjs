import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyTierUpdatedAtMigration() {
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

  console.log("🚀 Applying Tier updatedAt Migration to Aurora Database\n");

  // Start transaction for atomicity
  let transactionId;
  try {
    const transactionResponse = await client.send(new BeginTransactionCommand({
      resourceArn,
      secretArn,
      database,
    }));
    transactionId = transactionResponse.transactionId;
    console.log("✅ Transaction started\n");
  } catch (error) {
    console.error("❌ Failed to start transaction:", error.message);
    throw error;
  }

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
    console.error(`\n❌ Error during migration: ${error.message}\n`);
    console.log("🔄 Rolling back transaction...");

    try {
      await client.send(new RollbackTransactionCommand({
        resourceArn,
        secretArn,
        transactionId,
      }));
      console.log("✅ Rollback successful\n");
    } catch (rollbackError) {
      console.error("❌ Rollback failed:", rollbackError.message);
    }

    throw error;
  }
}

async function executeMigrationSteps(client, resourceArn, secretArn, database, transactionId) {
  console.log("📋 Migration Plan: Add updatedAt column to Tier table\n");

  // Step 1: Check if column already exists
  console.log("Step 1: Checking if updatedAt column exists...");
  try {
    const checkResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'Tier'
            AND column_name = 'updatedAt'`,
      transactionId,
    }));

    if (checkResult.records && checkResult.records.length > 0) {
      console.log("  ⚠️  Column 'updatedAt' already exists, skipping creation");
      return;
    }
    console.log("  ✓ Column does not exist, proceeding with creation");
  } catch (error) {
    console.error("  ❌ Error checking column existence:", error.message);
    throw error;
  }

  // Step 2: Add updatedAt column to Tier table
  console.log("\nStep 2: Adding updatedAt column to Tier table...");
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "Tier"
            ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      transactionId,
    }));
    console.log("  ✓ Column added successfully");
  } catch (error) {
    // Check if it's a "column already exists" error
    if (error.message && error.message.includes("already exists")) {
      console.log("  ⚠️  Column already exists (caught in ALTER TABLE)");
    } else {
      console.error("  ❌ Error adding column:", error.message);
      throw error;
    }
  }

  // Step 3: Create an index on updatedAt for better query performance
  console.log("\nStep 3: Creating index on updatedAt column...");
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "Tier_updatedAt_idx"
            ON "Tier"("updatedAt")`,
      transactionId,
    }));
    console.log("  ✓ Index created successfully");
  } catch (error) {
    console.error("  ❌ Error creating index:", error.message);
    // Index creation failure is not critical, continue
    console.log("  ⚠️  Continuing despite index creation failure");
  }

  // Step 4: Update existing rows to set updatedAt to current time
  console.log("\nStep 4: Updating existing rows with current timestamp...");
  try {
    const updateResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `UPDATE "Tier"
            SET "updatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
            WHERE "updatedAt" IS NULL`,
      transactionId,
    }));

    const rowsUpdated = updateResult.numberOfRecordsUpdated || 0;
    console.log(`  ✓ Updated ${rowsUpdated} rows`);
  } catch (error) {
    console.error("  ❌ Error updating rows:", error.message);
    // This might fail if column already has values, which is fine
    console.log("  ⚠️  Continuing despite update failure");
  }

  // Step 5: Record migration in Prisma's tracking table
  console.log("\nStep 5: Recording migration in _prisma_migrations table...");
  try {
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = `20250929_add_tier_updated_at_${Date.now()}`;
    const checksum = crypto.createHash('sha256')
      .update('ALTER TABLE Tier ADD COLUMN updatedAt')
      .digest('hex');

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, :logs, NULL, NOW(), 5)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: checksum }},
        { name: "name", value: { stringValue: migrationName }},
        { name: "logs", value: { stringValue: "Added updatedAt column to Tier table via Data API" }},
      ],
      transactionId,
    }));
    console.log(`  ✓ Migration recorded with ID: ${migrationId}`);
  } catch (error) {
    console.error("  ❌ Error recording migration:", error.message);
    // Check if _prisma_migrations table exists
    if (error.message && error.message.includes("does not exist")) {
      console.log("  ⚠️  _prisma_migrations table not found, skipping recording");
    } else {
      throw error;
    }
  }

  console.log("\n✅ All migration steps completed successfully");
}

// Run the migration
applyTierUpdatedAtMigration()
  .then(() => {
    console.log("🎉 Migration script finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Migration script failed:", error.message);
    process.exit(1);
  });