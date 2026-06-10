import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function verifyBillingTables() {
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

  console.log("🔍 Verifying Billing Tables in Aurora Database\n");

  try {
    // Check for all billing-related tables
    const billingTables = [
      'BillingPlan',
      'BillingSubscription',
      'BillingHistory',
      'UsageRecord',
      'UsageSummary',
      'Notification'
    ];

    console.log("Checking for billing tables:");
    for (const tableName of billingTables) {
      const result = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = :tableName
              )`,
        parameters: [
          { name: "tableName", value: { stringValue: tableName }}
        ],
      }));

      const exists = result.records?.[0]?.[0]?.booleanValue;
      console.log(`  ${exists ? '✅' : '❌'} ${tableName}`);
    }

    // Check ShopSettings has billingStatus column
    console.log("\nChecking ShopSettings columns:");
    const shopSettingsResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'ShopSettings'
            AND column_name = 'billingStatus'`,
    }));

    const hasBillingStatus = shopSettingsResult.records && shopSettingsResult.records.length > 0;
    console.log(`  ${hasBillingStatus ? '✅' : '❌'} billingStatus column in ShopSettings`);

    // Check Session has isActive column
    const sessionResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'Session'
            AND column_name = 'isActive'`,
    }));

    const hasIsActive = sessionResult.records && sessionResult.records.length > 0;
    console.log(`  ${hasIsActive ? '✅' : '❌'} isActive column in Session`);

    // Get UsageSummary table structure
    console.log("\nUsageSummary table structure:");
    const usageSummaryStructure = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'UsageSummary'
            ORDER BY ordinal_position`,
    }));

    if (usageSummaryStructure.records) {
      for (const record of usageSummaryStructure.records) {
        const columnName = record[0]?.stringValue;
        const dataType = record[1]?.stringValue;
        const isNullable = record[2]?.stringValue;
        const defaultValue = record[3]?.stringValue || 'none';
        console.log(`  - ${columnName}: ${dataType} ${isNullable === 'NO' ? 'NOT NULL' : 'NULL'} (default: ${defaultValue})`);
      }
    } else {
      console.log("  ❌ Table not found");
    }

    // Get BillingSubscription table structure
    console.log("\nBillingSubscription table structure:");
    const billingSubStructure = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'BillingSubscription'
            ORDER BY ordinal_position
            LIMIT 10`,
    }));

    if (billingSubStructure.records) {
      for (const record of billingSubStructure.records) {
        const columnName = record[0]?.stringValue;
        const dataType = record[1]?.stringValue;
        const isNullable = record[2]?.stringValue;
        console.log(`  - ${columnName}: ${dataType} ${isNullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      }
      console.log("  ... and more columns");
    } else {
      console.log("  ❌ Table not found");
    }

    console.log("\n✅ Billing system database verification complete!");

  } catch (error) {
    console.error("❌ Verification failed:", error.message);
  }
}

verifyBillingTables();