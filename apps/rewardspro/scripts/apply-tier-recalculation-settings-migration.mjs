import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyTierRecalculationSettingsMigration() {
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

  console.log("🚀 Applying Tier Recalculation Settings Migration to Aurora Database\n");

  // Start transaction for atomicity
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Step 1: Create enum type if it doesn't exist
    console.log("Step 1: Creating RecalculationFrequency enum...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `DO $$ BEGIN
              CREATE TYPE "RecalculationFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY');
            EXCEPTION
              WHEN duplicate_object THEN null;
            END $$;`,
      transactionId,
    }));
    console.log("  ✓ Enum type created/verified");

    // Step 2: Add tierRecalculationFrequency column
    console.log("Step 2: Adding tierRecalculationFrequency column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "ShopSettings"
            ADD COLUMN IF NOT EXISTS "tierRecalculationFrequency" "RecalculationFrequency" DEFAULT 'WEEKLY'`,
      transactionId,
    }));
    console.log("  ✓ tierRecalculationFrequency column added");

    // Step 3: Add tierRecalculationEnabled column
    console.log("Step 3: Adding tierRecalculationEnabled column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "ShopSettings"
            ADD COLUMN IF NOT EXISTS "tierRecalculationEnabled" BOOLEAN DEFAULT true`,
      transactionId,
    }));
    console.log("  ✓ tierRecalculationEnabled column added");

    // Step 4: Add tierRecalculationLastRun column
    console.log("Step 4: Adding tierRecalculationLastRun column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "ShopSettings"
            ADD COLUMN IF NOT EXISTS "tierRecalculationLastRun" TIMESTAMP(3)`,
      transactionId,
    }));
    console.log("  ✓ tierRecalculationLastRun column added");

    // Step 5: Backfill existing shops with default values
    console.log("Step 5: Backfilling existing shops with default values...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `UPDATE "ShopSettings"
            SET "tierRecalculationFrequency" = 'WEEKLY',
                "tierRecalculationEnabled" = true
            WHERE "tierRecalculationFrequency" IS NULL`,
      transactionId,
    }));
    console.log("  ✓ Existing shops updated with defaults");

    // Step 6: Create index for efficient cron job queries
    console.log("Step 6: Creating index for cron job queries...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "ShopSettings_tierRecalc_enabled_lastRun_idx"
            ON "ShopSettings"("tierRecalculationEnabled", "tierRecalculationLastRun")
            WHERE "tierRecalculationEnabled" = true`,
      transactionId,
    }));
    console.log("  ✓ Index created");

    // Step 7: Record migration in Prisma's tracking table
    console.log("Step 7: Recording migration...");
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = "20250121_add_tier_recalculation_settings";

    // Check if migration already recorded
    const checkResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT id FROM "_prisma_migrations" WHERE migration_name = :name`,
      parameters: [
        { name: "name", value: { stringValue: migrationName }},
      ],
      transactionId,
    }));

    if (!checkResult.records || checkResult.records.length === 0) {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `INSERT INTO "_prisma_migrations"
              (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
              VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 6)`,
        parameters: [
          { name: "id", value: { stringValue: migrationId }},
          { name: "checksum", value: { stringValue: "tier_recalc_settings_v1" }},
          { name: "name", value: { stringValue: migrationName }},
        ],
        transactionId,
      }));
      console.log("  ✓ Migration recorded");
    } else {
      console.log("  ✓ Migration already recorded (skipped)");
    }

    // Commit transaction
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("\n✅ Migration completed successfully!\n");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Error: ${error.message}\n`);
    console.error("Stack trace:", error.stack);

    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("🔄 Transaction rolled back");
    throw error;
  }
}

// Run the migration
applyTierRecalculationSettingsMigration()
  .then(() => {
    console.log("Migration script completed");
    process.exit(0);
  })
  .catch(error => {
    console.error("Migration script failed:", error);
    process.exit(1);
  });
