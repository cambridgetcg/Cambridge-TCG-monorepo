import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function verifySchema() {
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

  console.log("🔍 Verifying TierProduct table schema\n");

  try {
    // Get table column information
    const result = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'TierProduct'
            ORDER BY ordinal_position`,
    }));

    if (!result.records || result.records.length === 0) {
      console.log("❌ TierProduct table not found\n");
      return;
    }

    console.log(`✅ TierProduct table has ${result.records.length} columns:\n`);

    result.records.forEach((record) => {
      const columnName = record[0].stringValue;
      const dataType = record[1].stringValue;
      const isNullable = record[2].stringValue;
      const columnDefault = record[3].stringValue || 'NULL';

      console.log(`  ${columnName.padEnd(30)} ${dataType.padEnd(20)} ${isNullable === 'YES' ? 'NULL' : 'NOT NULL'}  ${columnDefault !== 'NULL' ? `(default: ${columnDefault})` : ''}`);
    });

    console.log("\n✅ Schema verification complete!");

  } catch (error) {
    console.error("❌ Error verifying schema:", error.message);
  }
}

verifySchema()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Failed:", error);
    process.exit(1);
  });
