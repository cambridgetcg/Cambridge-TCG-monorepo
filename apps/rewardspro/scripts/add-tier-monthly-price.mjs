import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function addMonthlyPriceField() {
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

  console.log("🚀 Adding monthlyPrice field to Tier table\n");

  try {
    // Check if column already exists
    const checkResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'Tier' AND column_name = 'monthlyPrice'`,
    }));

    if (checkResult.records?.length > 0) {
      console.log("✅ monthlyPrice column already exists");
      return;
    }

    // Add the column
    console.log("Adding monthlyPrice column to Tier table...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `ALTER TABLE "Tier" 
            ADD COLUMN IF NOT EXISTS "monthlyPrice" DECIMAL(10,2)`,
    }));

    console.log("✅ monthlyPrice column added successfully!");

  } catch (error) {
    console.error("❌ Error adding monthlyPrice field:", error.message);
    process.exit(1);
  }
}

// Run the migration
addMonthlyPriceField();