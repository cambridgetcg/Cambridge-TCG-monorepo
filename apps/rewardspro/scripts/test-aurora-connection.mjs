import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

// Load environment variables
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
    // Test basic connection
    console.log("Testing AWS Data API connection...\n");
    
    const result = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
      includeResultMetadata: true,
    }));

    console.log("✅ Connection successful!\n");
    console.log("Tables in database:");
    
    if (result.records) {
      result.records.forEach(record => {
        if (record[0] && record[0].stringValue) {
          console.log(`  - ${record[0].stringValue}`);
        }
      });
    }

    // Check if BillingPlan table exists
    const billingCheck = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'BillingPlan')",
    }));

    const billingPlanExists = billingCheck.records?.[0]?.[0]?.booleanValue;
    console.log(`\nBillingPlan table exists: ${billingPlanExists}`);

    if (!billingPlanExists) {
      console.log("\n⚠️  BillingPlan table does not exist. You may need to run the base migration first.");
    }

  } catch (error) {
    console.error("❌ Connection failed:", error.message);
  }
}

testConnection();