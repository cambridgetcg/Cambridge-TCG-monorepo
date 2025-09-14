import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyMonthlyOrderUsageMigration() {
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

  console.log("🚀 Applying MonthlyOrderUsage Migration to Aurora Database\n");
  console.log("Configuration:");
  console.log(`  Database: ${database}`);
  console.log(`  Region: ${process.env.AWS_REGION || "eu-north-1"}`);
  console.log(`  Resource ARN: ${resourceArn?.substring(0, 50)}...`);
  console.log();

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Step 1: Create the MonthlyOrderUsage table
    console.log("Step 1: Creating MonthlyOrderUsage table...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE TABLE IF NOT EXISTS "MonthlyOrderUsage" (
        "id" TEXT NOT NULL,
        "shop" TEXT NOT NULL,
        "year" INTEGER NOT NULL,
        "month" INTEGER NOT NULL,
        "orderCount" INTEGER NOT NULL DEFAULT 0,
        "planLimit" INTEGER NOT NULL,
        "planName" TEXT NOT NULL,
        "lastOrderDate" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "MonthlyOrderUsage_pkey" PRIMARY KEY ("id")
      )`,
      transactionId,
    }));
    console.log("  ✓ Table created");

    // Step 2: Create unique index for shop/year/month combination
    console.log("Step 2: Creating unique index on shop/year/month...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyOrderUsage_shop_year_month_key" 
            ON "MonthlyOrderUsage"("shop", "year", "month")`,
      transactionId,
    }));
    console.log("  ✓ Unique index created");

    // Step 3: Create index for faster lookups
    console.log("Step 3: Creating index for faster lookups...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `CREATE INDEX IF NOT EXISTS "MonthlyOrderUsage_shop_year_month_idx" 
            ON "MonthlyOrderUsage"("shop", "year", "month")`,
      transactionId,
    }));
    console.log("  ✓ Index created");

    // Step 4: Initialize current month records for existing shops (optional)
    console.log("Step 4: Checking for existing shops to initialize...");
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    // Get unique shops from ShopSettings
    const shopsResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT DISTINCT shop FROM "ShopSettings"`,
      transactionId,
    }));

    if (shopsResult.records && shopsResult.records.length > 0) {
      console.log(`  Found ${shopsResult.records.length} shops to initialize`);
      
      for (const record of shopsResult.records) {
        const shop = record[0]?.stringValue;
        if (shop) {
          const id = crypto.randomBytes(16).toString('hex');
          
          // Insert initial record for free plan
          await client.send(new ExecuteStatementCommand({
            resourceArn,
            secretArn,
            database,
            sql: `INSERT INTO "MonthlyOrderUsage" 
                  ("id", "shop", "year", "month", "orderCount", "planLimit", "planName", "createdAt", "updatedAt")
                  VALUES (:id, :shop, :year, :month, 0, 100, 'RewardsPro Free', NOW(), NOW())
                  ON CONFLICT ("shop", "year", "month") DO NOTHING`,
            parameters: [
              { name: "id", value: { stringValue: id }},
              { name: "shop", value: { stringValue: shop }},
              { name: "year", value: { longValue: currentYear }},
              { name: "month", value: { longValue: currentMonth }},
            ],
            transactionId,
          }));
        }
      }
      console.log("  ✓ Initialized monthly usage records for existing shops");
    } else {
      console.log("  ℹ No existing shops found, skipping initialization");
    }

    // Step 5: Record migration in Prisma's tracking table
    console.log("Step 5: Recording migration in _prisma_migrations...");
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = `20250913_add_monthly_order_usage`;
    const checksum = crypto.createHash('sha256').update(migrationName).digest('hex');
    
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations" 
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 5)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: checksum }},
        { name: "name", value: { stringValue: migrationName }},
      ],
      transactionId,
    }));
    console.log("  ✓ Migration recorded");

    // Commit transaction
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");
    
    // Verify the table was created
    console.log("Verifying migration...");
    const verifyResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT COUNT(*) as count FROM "MonthlyOrderUsage"`,
    }));
    
    const count = verifyResult.records?.[0]?.[0]?.longValue || 0;
    console.log(`  ✓ MonthlyOrderUsage table exists with ${count} records\n`);

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
      console.log("  ✓ Transaction rolled back");
    } catch (rollbackError) {
      console.error("  ❌ Failed to rollback:", rollbackError.message);
    }
    
    throw error;
  }
}

// Run the migration
applyMonthlyOrderUsageMigration().catch(error => {
  console.error("\n🔥 Migration failed:", error);
  process.exit(1);
});