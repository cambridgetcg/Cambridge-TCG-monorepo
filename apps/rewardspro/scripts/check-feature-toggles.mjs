import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function checkFeatureToggles() {
  const client = new RDSDataClient({
    region: process.env.AWS_REGION || "eu-north-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    console.log("🔍 Checking ShopSettings table for feature toggle columns...\n");

    const result = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: `SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'ShopSettings'
            AND column_name IN ('advancedAnalyticsEnabled', 'autoCashbackProcessingEnabled', 'emailMarketingEnabled', 'tierProductsEnabled')
            ORDER BY column_name`,
      includeResultMetadata: true,
    }));

    if (result.records && result.records.length > 0) {
      console.log("✅ Feature toggle columns found:\n");
      result.records.forEach(record => {
        const colName = record[0]?.stringValue || 'N/A';
        const dataType = record[1]?.stringValue || 'N/A';
        const defaultVal = record[2]?.stringValue || 'N/A';
        console.log(`  - ${colName} (${dataType}) DEFAULT ${defaultVal}`);
      });
      console.log("\n✅ Migration has already been applied!");
    } else {
      console.log("❌ Feature toggle columns NOT found");
      console.log("\n⚠️  Migration needs to be applied. Run:");
      console.log("   npm run migrate:feature-toggles");
    }
  } catch (error) {
    console.error("❌ Error checking columns:", error.message);
    process.exit(1);
  }
}

checkFeatureToggles();
