import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyAutoCashbackDefaultChange() {
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

  console.log("🚀 Applying Auto Cashback Default Change Migration to Aurora Database\n");

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Step 1: Change the default value for autoCashbackProcessingEnabled column
    console.log("Step 1: Changing default value for autoCashbackProcessingEnabled...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "ShopSettings"
            ALTER COLUMN "autoCashbackProcessingEnabled" SET DEFAULT false`,
      transactionId,
    }));
    console.log("  ✓ Default value changed to false");

    // Step 2: Record migration in Prisma's tracking table
    console.log("Step 2: Recording migration...");
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = `${new Date().toISOString().split('T')[0].replace(/-/g, '')}_change_auto_cashback_default`;

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 1)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "auto_cashback_default_change_v1" }},
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
    console.log("Changed default value:");
    console.log("  - autoCashbackProcessingEnabled: true → false");
    console.log("\nNote: Existing shops retain their current settings.");
    console.log("Only new shops created after this migration will have autoCashbackProcessingEnabled=false by default.\n");

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
applyAutoCashbackDefaultChange()
  .then(() => {
    console.log("🎉 Migration script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Migration script failed:", error);
    process.exit(1);
  });
