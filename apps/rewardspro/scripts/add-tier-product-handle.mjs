import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function addProductHandleColumn() {
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

  console.log("🚀 Adding productHandle column to TierProduct table\n");
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
    // Step 1: Add productHandle column
    console.log("Step 1: Adding productHandle column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct"
            ADD COLUMN IF NOT EXISTS "productHandle" TEXT`,
      transactionId,
    }));
    console.log("  ✓ Column added");

    // Step 2: Create index on productHandle for faster lookups
    console.log("Step 2: Creating index on productHandle...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "TierProduct_shop_productHandle_idx"
            ON "TierProduct"("shop", "productHandle")`,
      transactionId,
    }));
    console.log("  ✓ Index created");

    // Step 3: Record migration in Prisma's tracking table
    console.log("Step 3: Recording migration...");
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = "20251003_add_tier_product_handle";

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 2)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "add_product_handle_v1" }},
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
    console.log("  - Added productHandle column to TierProduct table");
    console.log("  - Created index for faster lookups");
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
addProductHandleColumn()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error);
    process.exit(1);
  });
