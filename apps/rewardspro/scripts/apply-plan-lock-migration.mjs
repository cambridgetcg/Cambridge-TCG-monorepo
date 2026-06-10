/**
 * Migration: Add lock fields to MonthlyOrderUsage table
 * Adds: isLocked, lockedAt, lockReason fields for plan-based access control
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyPlanLockMigration() {
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

  console.log("🚀 Applying Plan Lock Migration to Aurora Database\n");
  console.log("Migration: Add lock fields to MonthlyOrderUsage");
  console.log("Fields: isLocked, lockedAt, lockReason\n");

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Step 1: Add isLocked column (boolean, default false)
    console.log("Step 1: Adding isLocked column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "MonthlyOrderUsage"
            ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false`,
      transactionId,
    }));
    console.log("  ✓ isLocked column added");

    // Step 2: Add lockedAt column (timestamp, nullable)
    console.log("Step 2: Adding lockedAt column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "MonthlyOrderUsage"
            ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3)`,
      transactionId,
    }));
    console.log("  ✓ lockedAt column added");

    // Step 3: Add lockReason column (text, nullable)
    console.log("Step 3: Adding lockReason column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "MonthlyOrderUsage"
            ADD COLUMN IF NOT EXISTS "lockReason" TEXT`,
      transactionId,
    }));
    console.log("  ✓ lockReason column added");

    // Step 4: Create index on (shop, isLocked) for fast access checks
    console.log("Step 4: Creating index on (shop, isLocked)...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "MonthlyOrderUsage_shop_isLocked_idx"
            ON "MonthlyOrderUsage"("shop", "isLocked")`,
      transactionId,
    }));
    console.log("  ✓ Index created");

    // Step 5: Record migration in Prisma's tracking table
    console.log("Step 5: Recording migration in _prisma_migrations...");
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = `${new Date().toISOString().split('T')[0]}_add_lock_fields_to_monthly_order_usage`;

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 4)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "plan_lock_migration_v1" }},
        { name: "name", value: { stringValue: migrationName }},
      ],
      transactionId,
    }));
    console.log(`  ✓ Migration recorded: ${migrationName}`);

    // Commit transaction
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");
    console.log("Summary:");
    console.log("  - Added 3 new columns to MonthlyOrderUsage");
    console.log("  - Created index for fast lock checks");
    console.log("  - All existing records have isLocked = false");
    console.log("\nNext steps:");
    console.log("  1. Deploy new code with plan-access-control utilities");
    console.log("  2. Test lock/unlock functionality");
    console.log("  3. Monitor usage and lock states\n");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Migration failed: ${error.message}\n`);
    console.log("Rolling back transaction...");

    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✓ Transaction rolled back successfully");
    console.error("\nPlease review the error and try again.\n");
    throw error;
  }
}

// Run the migration
applyPlanLockMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
