import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyFeatureTogglesMigration() {
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

  console.log("🚀 Applying Feature Toggles Migration to Aurora Database\n");

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Step 1: Add feature toggle columns to ShopSettings
    console.log("Step 1: Adding feature toggle columns...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "ShopSettings"
            ADD COLUMN IF NOT EXISTS "advancedAnalyticsEnabled" BOOLEAN DEFAULT true,
            ADD COLUMN IF NOT EXISTS "autoCashbackProcessingEnabled" BOOLEAN DEFAULT true,
            ADD COLUMN IF NOT EXISTS "emailMarketingEnabled" BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS "tierProductsEnabled" BOOLEAN DEFAULT true`,
      transactionId,
    }));
    console.log("  ✓ Feature toggle columns added");

    // Step 2: Set default values for existing rows
    console.log("Step 2: Setting default values for existing rows...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `UPDATE "ShopSettings"
            SET "advancedAnalyticsEnabled" = COALESCE("advancedAnalyticsEnabled", true),
                "autoCashbackProcessingEnabled" = COALESCE("autoCashbackProcessingEnabled", true),
                "emailMarketingEnabled" = COALESCE("emailMarketingEnabled", false),
                "tierProductsEnabled" = COALESCE("tierProductsEnabled", true)
            WHERE "advancedAnalyticsEnabled" IS NULL
               OR "autoCashbackProcessingEnabled" IS NULL
               OR "emailMarketingEnabled" IS NULL
               OR "tierProductsEnabled" IS NULL`,
      transactionId,
    }));
    console.log("  ✓ Default values set");

    // Step 3: Record migration in Prisma's tracking table
    console.log("Step 3: Recording migration...");
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = `${new Date().toISOString().split('T')[0].replace(/-/g, '')}_add_feature_toggles`;

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 3)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "feature_toggles_migration_v1" }},
        { name: "name", value: { stringValue: migrationName }},
      ],
      transactionId,
    }));
    console.log("  ✓ Migration recorded");

    // Commit if all successful
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");
    console.log("Added feature toggle columns:");
    console.log("  - advancedAnalyticsEnabled (default: true)");
    console.log("  - autoCashbackProcessingEnabled (default: true)");
    console.log("  - emailMarketingEnabled (default: false)");
    console.log("  - tierProductsEnabled (default: true)\n");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("Rolling back transaction...");
    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
    console.error("❌ Migration rolled back due to error\n");
    throw error;
  }
}

// Run the migration
applyFeatureTogglesMigration()
  .then(() => {
    console.log("🎉 Migration script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Migration script failed:", error);
    process.exit(1);
  });
