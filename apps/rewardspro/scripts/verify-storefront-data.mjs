/**
 * Verify Storefront Widget Data
 *
 * This script checks that the migration and backfill were successful
 *
 * Usage: node scripts/verify-storefront-data.mjs
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function verifyStorefrontData() {
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

  console.log("🔍 Verifying Storefront Widget Data\n");

  try {
    // Check 1: Verify Customer columns exist
    console.log("Check 1: Customer table columns...");
    const customerCols = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'Customer'
            AND column_name IN ('shopifyCustomerMetafieldId', 'pointsBalance', 'lifetimePoints')
            ORDER BY column_name`,
      includeResultMetadata: true,
    }));

    if (customerCols.records && customerCols.records.length === 3) {
      console.log("  ✅ All Customer columns exist");
      customerCols.records.forEach(record => {
        const colName = record[0]?.stringValue;
        const dataType = record[1]?.stringValue;
        console.log(`     - ${colName}: ${dataType}`);
      });
    } else {
      console.log("  ❌ Missing Customer columns");
    }

    // Check 2: Verify Tier columns exist
    console.log("\nCheck 2: Tier table columns...");
    const tierCols = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'Tier'
            AND column_name IN ('icon', 'color', 'threshold')
            ORDER BY column_name`,
      includeResultMetadata: true,
    }));

    if (tierCols.records && tierCols.records.length === 3) {
      console.log("  ✅ All Tier columns exist");
      tierCols.records.forEach(record => {
        const colName = record[0]?.stringValue;
        const dataType = record[1]?.stringValue;
        console.log(`     - ${colName}: ${dataType}`);
      });
    } else {
      console.log("  ❌ Missing Tier columns");
    }

    // Check 3: Verify StoreCreditLedger expiresAt
    console.log("\nCheck 3: StoreCreditLedger expiresAt column...");
    const ledgerCols = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'StoreCreditLedger'
            AND column_name = 'expiresAt'`,
      includeResultMetadata: true,
    }));

    if (ledgerCols.records && ledgerCols.records.length === 1) {
      console.log("  ✅ StoreCreditLedger expiresAt column exists");
    } else {
      console.log("  ❌ Missing StoreCreditLedger expiresAt column");
    }

    // Check 4: Verify indexes exist
    console.log("\nCheck 4: Indexes...");
    const indexes = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT indexname
            FROM pg_indexes
            WHERE tablename IN ('Customer', 'StoreCreditLedger')
            AND indexname IN ('Customer_shop_shopifyCustomerMetafieldId_idx', 'StoreCreditLedger_customerId_expiresAt_idx')
            ORDER BY indexname`,
      includeResultMetadata: true,
    }));

    if (indexes.records && indexes.records.length === 2) {
      console.log("  ✅ All indexes exist");
      indexes.records.forEach(record => {
        console.log(`     - ${record[0]?.stringValue}`);
      });
    } else {
      console.log("  ❌ Missing indexes");
    }

    // Check 5: Sample customer data
    console.log("\nCheck 5: Sample customer data...");
    const sampleData = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT id, email, "pointsBalance", "lifetimePoints", "shopifyCustomerMetafieldId"
            FROM "Customer"
            LIMIT 3`,
      includeResultMetadata: true,
    }));

    if (sampleData.records && sampleData.records.length > 0) {
      console.log(`  ✅ Found ${sampleData.records.length} sample customers`);
      sampleData.records.forEach((record, i) => {
        const email = record[1]?.stringValue || 'N/A';
        const points = record[2]?.doubleValue || record[2]?.longValue || 0;
        const lifetime = record[3]?.doubleValue || record[3]?.longValue || 0;
        const metafieldId = record[4]?.stringValue || 'null';
        console.log(`     ${i+1}. ${email}`);
        console.log(`        Points: ${points}, Lifetime: ${lifetime}`);
        console.log(`        Metafield: ${metafieldId}`);
      });
    } else {
      console.log("  ⚠️  No customer data found (database might be empty)");
    }

    // Check 6: Verify migration was recorded
    console.log("\nCheck 6: Migration record...");
    const migration = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT migration_name, finished_at
            FROM "_prisma_migrations"
            WHERE migration_name LIKE '%storefront_widget%'
            ORDER BY finished_at DESC
            LIMIT 1`,
      includeResultMetadata: true,
    }));

    if (migration.records && migration.records.length > 0) {
      const name = migration.records[0][0]?.stringValue;
      const finishedAt = migration.records[0][1]?.stringValue;
      console.log("  ✅ Migration recorded");
      console.log(`     Name: ${name}`);
      console.log(`     Finished: ${finishedAt}`);
    } else {
      console.log("  ❌ Migration not recorded in _prisma_migrations");
    }

    console.log("\n✅ Verification complete!\n");

  } catch (error) {
    console.error("\n❌ Verification failed:", error.message);
    process.exit(1);
  }
}

verifyStorefrontData();
