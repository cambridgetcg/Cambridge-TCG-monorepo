import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function verifyMonthlyUsage() {
  const client = new RDSDataClient({
    region: process.env.AWS_REGION || "eu-north-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  console.log("Verifying MonthlyOrderUsage table...\n");
  
  // Check table structure
  const result = await client.send(new ExecuteStatementCommand({
    resourceArn: process.env.AURORA_RESOURCE_ARN,
    secretArn: process.env.AURORA_SECRET_ARN,
    database: process.env.AURORA_DATABASE_NAME || "rewardspro",
    sql: "SELECT * FROM \"MonthlyOrderUsage\" ORDER BY shop, year, month",
    includeResultMetadata: true,
  }));

  console.log("Table columns:");
  result.columnMetadata?.forEach(col => {
    console.log(`  - ${col.name} (${col.typeName})`);
  });

  console.log("\nCurrent records:");
  if (result.records && result.records.length > 0) {
    result.records.forEach(record => {
      const shop = record[1]?.stringValue;
      const year = record[2]?.longValue;
      const month = record[3]?.longValue;
      const orderCount = record[4]?.longValue;
      const planLimit = record[5]?.longValue;
      const planName = record[6]?.stringValue;
      console.log(`  Shop: ${shop}, Period: ${year}/${month}, Orders: ${orderCount}/${planLimit}, Plan: ${planName}`);
    });
  } else {
    console.log("  No records found");
  }
}

verifyMonthlyUsage().catch(console.error);
