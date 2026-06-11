import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function addPricingColumns() {
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

  console.log("🚀 Adding pricing columns to TierProduct table\n");
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
    // Step 1: Add currency column
    console.log("Step 1: Adding currency column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct"
            ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD'`,
      transactionId,
    }));
    console.log("  ✓ Currency column added");

    // Step 2: Add oneTimePrice column
    console.log("Step 2: Adding oneTimePrice column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct"
            ADD COLUMN IF NOT EXISTS "oneTimePrice" DECIMAL(10, 2)`,
      transactionId,
    }));
    console.log("  ✓ oneTimePrice column added");

    // Step 3: Add monthlyPrice column
    console.log("Step 3: Adding monthlyPrice column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct"
            ADD COLUMN IF NOT EXISTS "monthlyPrice" DECIMAL(10, 2)`,
      transactionId,
    }));
    console.log("  ✓ monthlyPrice column added");

    // Step 4: Add quarterlyPrice column
    console.log("Step 4: Adding quarterlyPrice column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct"
            ADD COLUMN IF NOT EXISTS "quarterlyPrice" DECIMAL(10, 2)`,
      transactionId,
    }));
    console.log("  ✓ quarterlyPrice column added");

    // Step 5: Add annualPrice column
    console.log("Step 5: Adding annualPrice column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct"
            ADD COLUMN IF NOT EXISTS "annualPrice" DECIMAL(10, 2)`,
      transactionId,
    }));
    console.log("  ✓ annualPrice column added");

    // Step 6: Add features column
    console.log("Step 6: Adding features column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct"
            ADD COLUMN IF NOT EXISTS "features" JSONB`,
      transactionId,
    }));
    console.log("  ✓ features column added");

    // Step 7: Add description column
    console.log("Step 7: Adding description column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct"
            ADD COLUMN IF NOT EXISTS "description" TEXT`,
      transactionId,
    }));
    console.log("  ✓ description column added");

    // Step 8: Add sellingPlanGroupId column
    console.log("Step 8: Adding sellingPlanGroupId column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct"
            ADD COLUMN IF NOT EXISTS "sellingPlanGroupId" TEXT`,
      transactionId,
    }));
    console.log("  ✓ sellingPlanGroupId column added");

    // Step 9: Add shopifySellingPlanGroupId column
    console.log("Step 9: Adding shopifySellingPlanGroupId column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct"
            ADD COLUMN IF NOT EXISTS "shopifySellingPlanGroupId" TEXT`,
      transactionId,
    }));
    console.log("  ✓ shopifySellingPlanGroupId column added");

    // Step 10: Add subscriptionPlanIds column
    console.log("Step 10: Adding subscriptionPlanIds column...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "TierProduct"
            ADD COLUMN IF NOT EXISTS "subscriptionPlanIds" JSONB`,
      transactionId,
    }));
    console.log("  ✓ subscriptionPlanIds column added");

    // Step 11: Record migration in Prisma's tracking table
    console.log("Step 11: Recording migration...");
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = "20251003_add_tier_product_pricing_columns";

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 10)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "add_pricing_columns_v1" }},
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
    console.log("  - Added currency column (default: USD)");
    console.log("  - Added oneTimePrice, monthlyPrice, quarterlyPrice, annualPrice columns");
    console.log("  - Added features and description columns");
    console.log("  - Added subscription-related columns");
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
addPricingColumns()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error);
    process.exit(1);
  });
