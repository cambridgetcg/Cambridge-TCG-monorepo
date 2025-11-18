/**
 * Backfill Storefront Widget Data
 *
 * This script populates the new columns with data from existing records:
 * 1. Copy storeCredit to pointsBalance for existing customers
 * 2. Calculate lifetimePoints from StoreCreditLedger
 * 3. Set tier threshold to minSpend where null
 *
 * Usage: node scripts/backfill-storefront-data.mjs
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function backfillStorefrontData() {
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

  console.log("🔄 Backfilling Storefront Widget Data\n");
  console.log(`Database: ${database}`);
  console.log(`Region: ${process.env.AWS_REGION}\n`);

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Execute backfill steps
    await executeBackfillSteps(client, resourceArn, secretArn, database, transactionId);

    // Commit if all successful
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Backfill completed successfully!\n");
    console.log("Verify the data:");
    console.log("  node scripts/verify-storefront-data.mjs\n");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("Rolling back transaction...");
    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
    console.log("Transaction rolled back. No changes were made.\n");
    throw error;
  }
}

async function executeBackfillSteps(client, resourceArn, secretArn, database, transactionId) {

  // Step 1: Sync pointsBalance with storeCredit
  console.log("Step 1: Copying storeCredit to pointsBalance...");
  const result1 = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `UPDATE "Customer"
          SET "pointsBalance" = "storeCredit"
          WHERE "pointsBalance" = 0 AND "storeCredit" > 0`,
    transactionId,
  }));
  console.log(`  ✓ Updated ${result1.numberOfRecordsUpdated || 0} customer records`);

  // Step 2: Calculate lifetimePoints from ledger
  console.log("Step 2: Calculating lifetimePoints from StoreCreditLedger...");
  const result2 = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `UPDATE "Customer" c
          SET "lifetimePoints" = COALESCE((
            SELECT SUM(CAST("amount" AS DECIMAL))
            FROM "StoreCreditLedger"
            WHERE "customerId" = c.id
              AND "type" IN ('CASHBACK_EARNED', 'REFUND_CREDIT')
              AND CAST("amount" AS DECIMAL) > 0
          ), 0)
          WHERE "lifetimePoints" = 0`,
    transactionId,
  }));
  console.log(`  ✓ Calculated lifetime points for ${result2.numberOfRecordsUpdated || 0} customers`);

  // Step 3: Set tier threshold to minSpend where null
  console.log("Step 3: Setting tier threshold defaults...");
  const result3 = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `UPDATE "Tier"
          SET "threshold" = "minSpend"
          WHERE "threshold" IS NULL`,
    transactionId,
  }));
  console.log(`  ✓ Updated ${result3.numberOfRecordsUpdated || 0} tier records`);
}

// Run the backfill
backfillStorefrontData().catch(error => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
