import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function testSubscriptionMigration() {
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

  try {
    console.log("📊 Checking subscription migration status...\n");
    
    // Check if migration has been applied
    const migrationResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT migration_name, finished_at 
            FROM "_prisma_migrations" 
            WHERE migration_name LIKE '%subscription%'
            ORDER BY finished_at DESC LIMIT 1`,
      includeResultMetadata: true,
    }));

    if (migrationResult.records && migrationResult.records.length > 0) {
      const record = migrationResult.records[0];
      console.log("✅ Subscription migration applied");
      console.log(`   Name: ${record[0]?.stringValue}`);
      console.log(`   Date: ${record[1]?.stringValue}\n`);
    } else {
      console.log("⚠️  Subscription migration not yet applied\n");
    }

    // Check for subscription tables
    console.log("📋 Checking subscription tables...\n");
    
    const tables = [
      'TierSubscription',
      'SubscriptionBillingAttempt',
      'SellingPlanGroup',
      'SellingPlan'
    ];

    for (const tableName of tables) {
      const result = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT COUNT(*) FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = :tableName`,
        parameters: [
          { name: "tableName", value: { stringValue: tableName }}
        ],
      }));

      const exists = result.records?.[0]?.[0]?.longValue > 0;
      console.log(`   ${tableName}... ${exists ? '✅ found' : '❌ not found'}`);
    }

    // Check for subscription enums
    console.log("\n📋 Checking subscription enums...\n");
    
    const enums = [
      'SubscriptionStatus',
      'BillingInterval',
      'BillingStatus',
      'DiscountType'
    ];

    for (const enumName of enums) {
      const result = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT COUNT(*) FROM pg_type 
              WHERE typname = :enumName`,
        parameters: [
          { name: "enumName", value: { stringValue: enumName }}
        ],
      }));

      const exists = result.records?.[0]?.[0]?.longValue > 0;
      console.log(`   ${enumName}... ${exists ? '✅ found' : '❌ not found'}`);
    }

    // Check if existing tables have been modified
    console.log("\n📋 Checking modifications to existing tables...\n");

    // Check Tier table columns
    const tierColumns = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'Tier' 
            AND column_name IN ('billingInterval', 'discountPercentage')`,
    }));

    console.log(`   Tier.billingInterval... ${
      tierColumns.records?.some(r => r[0]?.stringValue === 'billingInterval') 
        ? '✅ found' : '❌ not found'
    }`);
    console.log(`   Tier.discountPercentage... ${
      tierColumns.records?.some(r => r[0]?.stringValue === 'discountPercentage') 
        ? '✅ found' : '❌ not found'
    }`);

    // Check Customer table columns
    const customerColumns = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'Customer' 
            AND column_name = 'currentSubscriptionId'`,
    }));

    console.log(`   Customer.currentSubscriptionId... ${
      customerColumns.records?.length > 0 ? '✅ found' : '❌ not found'
    }`);

    // Check TierChangeLog table columns
    const tierChangeLogColumns = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'TierChangeLog' 
            AND column_name = 'subscriptionId'`,
    }));

    console.log(`   TierChangeLog.subscriptionId... ${
      tierChangeLogColumns.records?.length > 0 ? '✅ found' : '❌ not found'
    }`);

    console.log("\n✅ Status check complete!");

  } catch (error) {
    console.error("❌ Error checking migration status:", error.message);
    process.exit(1);
  }
}

// Run the test
testSubscriptionMigration();