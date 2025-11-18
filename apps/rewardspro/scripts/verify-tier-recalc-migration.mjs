import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function verifyMigration() {
  const client = new RDSDataClient({
    region: process.env.AWS_REGION || "eu-north-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    console.log("Verifying tier recalculation columns...\n");

    const result = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: `SELECT
              column_name,
              data_type,
              column_default
            FROM information_schema.columns
            WHERE table_name = 'ShopSettings'
              AND column_name IN (
                'tierRecalculationFrequency',
                'tierRecalculationEnabled',
                'tierRecalculationLastRun'
              )
            ORDER BY column_name`,
      includeResultMetadata: true,
    }));

    console.log("✅ New columns in ShopSettings table:\n");

    if (result.records && result.records.length > 0) {
      result.records.forEach(record => {
        const colName = record[0]?.stringValue || 'N/A';
        const dataType = record[1]?.stringValue || 'N/A';
        const defaultVal = record[2]?.stringValue || 'NULL';
        console.log(`  - ${colName}: ${dataType} (default: ${defaultVal})`);
      });

      if (result.records.length === 3) {
        console.log("\n✅ All columns successfully added!");

        // Check if index exists
        console.log("\nVerifying index...\n");
        const indexResult = await client.send(new ExecuteStatementCommand({
          resourceArn: process.env.AURORA_RESOURCE_ARN,
          secretArn: process.env.AURORA_SECRET_ARN,
          database: process.env.AURORA_DATABASE_NAME || "rewardspro",
          sql: `SELECT indexname
                FROM pg_indexes
                WHERE tablename = 'ShopSettings'
                  AND indexname = 'ShopSettings_tierRecalc_enabled_lastRun_idx'`,
        }));

        if (indexResult.records && indexResult.records.length > 0) {
          console.log("✅ Index 'ShopSettings_tierRecalc_enabled_lastRun_idx' exists");
        } else {
          console.log("⚠️  Index not found");
        }

        // Check enum type
        console.log("\nVerifying enum type...\n");
        const enumResult = await client.send(new ExecuteStatementCommand({
          resourceArn: process.env.AURORA_RESOURCE_ARN,
          secretArn: process.env.AURORA_SECRET_ARN,
          database: process.env.AURORA_DATABASE_NAME || "rewardspro",
          sql: `SELECT enumlabel
                FROM pg_enum
                WHERE enumtypid = (
                  SELECT oid FROM pg_type WHERE typname = 'RecalculationFrequency'
                )
                ORDER BY enumsortorder`,
        }));

        if (enumResult.records && enumResult.records.length > 0) {
          console.log("✅ RecalculationFrequency enum values:");
          enumResult.records.forEach(record => {
            console.log(`  - ${record[0]?.stringValue}`);
          });
        } else {
          console.log("⚠️  Enum type not found");
        }

      } else {
        console.log(`\n⚠️  Expected 3 columns, found ${result.records.length}`);
      }
    } else {
      console.log("❌ No columns found - migration may have failed");
    }
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    process.exit(1);
  }
}

verifyMigration()
  .then(() => {
    console.log("\n✅ Verification completed");
    process.exit(0);
  })
  .catch(error => {
    console.error("\n❌ Verification failed:", error);
    process.exit(1);
  });
