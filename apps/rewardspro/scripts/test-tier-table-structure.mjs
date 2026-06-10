import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function testTierTableStructure() {
  const client = new RDSDataClient({
    region: process.env.AWS_REGION || "eu-north-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    console.log("🔍 Checking Tier table structure in Aurora Database\n");
    console.log("Database:", process.env.AURORA_DATABASE_NAME || "rewardspro");
    console.log("Region:", process.env.AWS_REGION || "eu-north-1");
    console.log("\n" + "=".repeat(60) + "\n");

    // Get column information for Tier table
    const result = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: `SELECT
              column_name,
              data_type,
              is_nullable,
              column_default
            FROM information_schema.columns
            WHERE table_name = 'Tier'
            ORDER BY ordinal_position`,
      includeResultMetadata: true,
    }));

    console.log("📊 Current Tier table columns:\n");

    if (result.records && result.records.length > 0) {
      // Format output as a table
      console.log("Column Name".padEnd(20) + " | " +
                  "Type".padEnd(15) + " | " +
                  "Nullable".padEnd(10) + " | " +
                  "Default");
      console.log("-".repeat(70));

      let hasUpdatedAt = false;

      result.records.forEach(record => {
        const columnName = record[0]?.stringValue || '';
        const dataType = record[1]?.stringValue || '';
        const isNullable = record[2]?.stringValue || '';
        const defaultValue = record[3]?.stringValue || 'none';

        console.log(
          columnName.padEnd(20) + " | " +
          dataType.padEnd(15) + " | " +
          isNullable.padEnd(10) + " | " +
          defaultValue
        );

        if (columnName === 'updatedAt') {
          hasUpdatedAt = true;
        }
      });

      console.log("\n" + "=".repeat(60) + "\n");

      // Check for updatedAt column
      if (hasUpdatedAt) {
        console.log("✅ The 'updatedAt' column already exists in the Tier table");
        console.log("   No migration needed!");
      } else {
        console.log("⚠️  The 'updatedAt' column is missing from the Tier table");
        console.log("   Run the migration script to add it:");
        console.log("   node scripts/apply-tier-updated-at-migration.mjs");
      }

    } else {
      console.log("❌ No column information found. The Tier table might not exist.");
    }

    // Count records in Tier table
    console.log("\n" + "=".repeat(60) + "\n");
    const countResult = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: `SELECT COUNT(*) as count FROM "Tier"`,
    }));

    if (countResult.records && countResult.records.length > 0) {
      const count = countResult.records[0][0]?.longValue || 0;
      console.log(`📈 Total tiers in database: ${count}`);
    }

    // Get sample tier data
    const sampleResult = await client.send(new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      sql: `SELECT id, name, "minSpend", "cashbackPercent", "evaluationPeriod", "createdAt"
            FROM "Tier"
            LIMIT 3`,
    }));

    if (sampleResult.records && sampleResult.records.length > 0) {
      console.log("\n📝 Sample tier records:\n");
      sampleResult.records.forEach((record, index) => {
        console.log(`  Tier ${index + 1}:`);
        console.log(`    ID: ${record[0]?.stringValue || 'N/A'}`);
        console.log(`    Name: ${record[1]?.stringValue || 'N/A'}`);
        console.log(`    Min Spend: ${record[2]?.longValue || 0}`);
        console.log(`    Cashback: ${record[3]?.longValue || 0}%`);
        console.log(`    Period: ${record[4]?.stringValue || 'N/A'}`);
        console.log(`    Created: ${record[5]?.stringValue || 'N/A'}`);
        console.log("");
      });
    }

  } catch (error) {
    console.error("❌ Connection failed:", error.message);

    if (error.message.includes("Signature")) {
      console.error("\n⚠️  AWS credentials issue detected!");
      console.error("   Check that AWS_SECRET_ACCESS_KEY is exactly 40 characters");
    } else if (error.message.includes("not exist")) {
      console.error("\n⚠️  The Tier table might not exist in the database");
    }
  }
}

// Run the test
testTierTableStructure()
  .then(() => {
    console.log("\n✅ Test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Test failed:", error.message);
    process.exit(1);
  });