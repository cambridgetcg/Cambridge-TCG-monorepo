import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function fixDurationColumnType() {
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

  console.log("🚀 Fixing duration column type in TierProduct table\n");
  console.log(`Database: ${database}`);
  console.log(`Region: ${process.env.AWS_REGION || "eu-north-1"}\n`);

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Step 1: Drop the existing duration column
    console.log("Step 1: Dropping existing duration column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct" DROP COLUMN IF EXISTS "duration"`,
      transactionId,
    }));
    console.log("  ✓ Column dropped");

    // Step 2: Add duration column with correct ProductDuration type
    console.log("Step 2: Adding duration column with ProductDuration type...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct" ADD COLUMN "duration" "ProductDuration"`,
      transactionId,
    }));
    console.log("  ✓ Column added with correct type");

    // Step 3: Record migration in Prisma's tracking table
    console.log("Step 3: Recording migration...");
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = "20251003_fix_duration_column_type";

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 2)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "fix_duration_type_v1" }},
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
    console.log("Summary:");
    console.log("  - Dropped duration column (BillingInterval type)");
    console.log("  - Added duration column (ProductDuration type)");
    console.log("  - Migration recorded in _prisma_migrations");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("Rolling back transaction...");
    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
    console.log("✗ Transaction rolled back");
    throw error;
  }
}

// Run the migration
fixDurationColumnType()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error);
    process.exit(1);
  });
