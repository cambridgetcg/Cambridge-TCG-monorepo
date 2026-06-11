#!/usr/bin/env node

/**
 * Test AWS Aurora Data API Connection
 *
 * This script verifies that we can connect to the Aurora database
 * via the Data API and lists all existing tables.
 * Also specifically checks for StoreCreditLedger sync fields.
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  const client = new RDSDataClient({
    region: process.env.AWS_REGION || "eu-north-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    console.log("Testing AWS Data API connection...\n");
    console.log("Configuration:");
    console.log(`  Region: ${process.env.AWS_REGION || "eu-north-1"}`);
    console.log(`  Database: ${process.env.AURORA_DATABASE_NAME || "rewardspro"}`);
    console.log(`  Resource ARN: ${process.env.AURORA_RESOURCE_ARN?.substring(0, 50)}...`);
    console.log("");

    // Test basic connection
    const testResult = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: "SELECT current_database(), current_user, version()",
      includeResultMetadata: true,
    }));

    console.log("✅ Connection successful!\n");

    if (testResult.records && testResult.records[0]) {
      console.log("Database Info:");
      console.log(`  Database: ${testResult.records[0][0]?.stringValue}`);
      console.log(`  User: ${testResult.records[0][1]?.stringValue}`);
      console.log(`  Version: ${testResult.records[0][2]?.stringValue?.split(',')[0]}`);
      console.log("");
    }

    // Get list of tables
    const tablesResult = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
      includeResultMetadata: true,
    }));

    console.log("Tables in database:");

    if (tablesResult.records) {
      tablesResult.records.forEach(record => {
        if (record[0] && record[0].stringValue) {
          console.log(`  - ${record[0].stringValue}`);
        }
      });
      console.log(`\nTotal tables: ${tablesResult.records.length}`);
    }

    // Check for specific tables and issues
    console.log("\nChecking for known issues:");

    // Check if Order table exists
    const orderTableResult = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'Order'",
    }));

    const hasOrderTable = orderTableResult.records?.[0]?.[0]?.longValue > 0;
    console.log(`  Order table exists: ${hasOrderTable ? '✅ Yes' : '❌ No'}`);

    // Check if TierProduct has isActive column
    const isActiveResult = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'TierProduct' AND column_name = 'isActive'",
    }));

    const hasIsActive = isActiveResult.records?.[0]?.[0]?.longValue > 0;
    console.log(`  TierProduct.isActive exists: ${hasIsActive ? '✅ Yes' : '❌ No (needs migration)'}`);

    // Check for OrderFinancialStatus enum
    const enumResult = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: "SELECT COUNT(*) FROM pg_type WHERE typtype = 'e' AND typname = 'OrderFinancialStatus'",
    }));

    const hasOrderEnum = enumResult.records?.[0]?.[0]?.longValue > 0;
    console.log(`  OrderFinancialStatus enum exists: ${hasOrderEnum ? '✅ Yes' : '❌ No (needs migration)'}`);

    // Check TierChangeLog columns
    const tierChangeLogResult = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: "SELECT column_name FROM information_schema.columns WHERE table_name = 'TierChangeLog' AND column_name IN ('fromTierId', 'toTierId', 'previousTierId', 'newTierId')",
    }));

    if (tierChangeLogResult.records && tierChangeLogResult.records.length > 0) {
      console.log("  TierChangeLog columns found:");
      tierChangeLogResult.records.forEach(record => {
        console.log(`    - ${record[0]?.stringValue}`);
      });
    }

    // Check specifically for StoreCreditLedger sync fields
    console.log("\n📊 Checking StoreCreditLedger sync fields...");

    const creditLedgerColumns = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: `SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'StoreCreditLedger'
            AND column_name IN ('shopifyTransactionId', 'syncStatus', 'syncedAt')`,
    }));

    const syncFields = ['shopifyTransactionId', 'syncStatus', 'syncedAt'];
    const foundFields = [];

    if (creditLedgerColumns.records) {
      creditLedgerColumns.records.forEach(record => {
        const field = record[0]?.stringValue;
        if (field) foundFields.push(field);
      });
    }

    const missingFields = syncFields.filter(f => !foundFields.includes(f));

    if (missingFields.length > 0) {
      console.log(`  ❌ Missing sync fields: ${missingFields.join(', ')}`);
      console.log(`     Run: node scripts/apply-credit-sync-migration-data-api.mjs`);
    } else {
      console.log(`  ✅ All sync fields present: ${syncFields.join(', ')}`);
    }

    // Check for CreditSyncStatus enum
    const creditSyncEnumResult = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: "SELECT COUNT(*) FROM pg_type WHERE typtype = 'e' AND typname = 'CreditSyncStatus'",
    }));

    const hasCreditSyncEnum = creditSyncEnumResult.records?.[0]?.[0]?.longValue > 0;
    console.log(`  CreditSyncStatus enum exists: ${hasCreditSyncEnum ? '✅ Yes' : '❌ No (needs migration)'}`);

    console.log("\n✅ Connection test completed successfully!");

  } catch (error) {
    console.error("❌ Connection failed:", error.message);
    console.error("\nPlease check your environment variables:");
    console.error("  - AURORA_RESOURCE_ARN");
    console.error("  - AURORA_SECRET_ARN");
    console.error("  - AURORA_DATABASE_NAME");
    console.error("  - AWS_ACCESS_KEY_ID");
    console.error("  - AWS_SECRET_ACCESS_KEY");
    console.error("  - AWS_REGION");
    process.exit(1);
  }
}

testConnection();