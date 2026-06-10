/**
 * Test Aurora Data API Connection
 * Run with: npx tsx test-aurora-connection.ts
 */

import { config } from "dotenv";
import { getAuroraClient, AuroraDataAPI } from "./app/utils/aurora-data-api";

// Load environment variables
config();

async function testConnection() {
  console.log("🔧 Testing Aurora Data API Connection...\n");

  // Check environment variables
  const requiredEnvVars = [
    "AURORA_RESOURCE_ARN",
    "AURORA_SECRET_ARN",
    "AURORA_DATABASE_NAME",
    "AWS_REGION",
  ];

  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error("❌ Missing required environment variables:");
    missingVars.forEach((varName) => {
      console.error(`   - ${varName}`);
    });
    console.log("\n📝 Please set these in your .env file:");
    console.log("   Copy from .env.aurora template\n");
    process.exit(1);
  }

  console.log("✅ Environment variables configured:");
  console.log(`   Region: ${process.env.AWS_REGION}`);
  console.log(`   Database: ${process.env.AURORA_DATABASE_NAME}`);
  console.log(`   Resource ARN: ${process.env.AURORA_RESOURCE_ARN?.substring(0, 50)}...`);
  console.log(`   Secret ARN: ${process.env.AURORA_SECRET_ARN?.substring(0, 50)}...\n`);

  try {
    const client = getAuroraClient();
    console.log("📊 Running test queries...\n");

    // Test 1: Simple SELECT
    console.log("1️⃣ Testing simple SELECT...");
    const result1 = await client.executeStatement("SELECT 1 as test, NOW() as current_time");
    console.log("   Result:", result1.records[0]);
    console.log("   ✅ Basic query successful\n");

    // Test 2: Check database version
    console.log("2️⃣ Checking PostgreSQL version...");
    const result2 = await client.executeStatement("SELECT version()");
    console.log("   Version:", result2.records[0]?.version);
    console.log("   ✅ Version check successful\n");

    // Test 3: List tables
    console.log("3️⃣ Listing database tables...");
    const result3 = await client.executeStatement(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    if (result3.records.length === 0) {
      console.log("   ⚠️ No tables found. Run migrations first:");
      console.log("   npx prisma migrate deploy\n");
    } else {
      console.log("   Found tables:");
      result3.records.forEach((record: any) => {
        console.log(`   - ${record.tablename}`);
      });
      console.log("   ✅ Table listing successful\n");
    }

    // Test 4: Test parameterized query
    console.log("4️⃣ Testing parameterized query...");
    const params = [
      AuroraDataAPI.buildParameter("test_value", "Hello Aurora"),
      AuroraDataAPI.buildParameter("test_number", 42),
    ];
    const result4 = await client.executeStatement(
      "SELECT :test_value::text as message, :test_number::int as answer",
      params
    );
    console.log("   Result:", result4.records[0]);
    console.log("   ✅ Parameterized query successful\n");

    // Test 5: Test transaction
    console.log("5️⃣ Testing transaction support...");
    try {
      await client.executeTransaction(async (execute) => {
        const result = await execute("SELECT 'Transaction Test' as status");
        return result.records[0];
      });
      console.log("   ✅ Transaction support verified\n");
    } catch (error) {
      console.log("   ⚠️ Transaction test failed:", error);
    }

    console.log("🎉 Aurora Data API connection successful!");
    console.log("\n📝 Next steps:");
    console.log("1. Run database migrations: npx prisma migrate deploy");
    console.log("2. Update .env with the Aurora environment variables");
    console.log("3. Deploy to Vercel with these environment variables\n");

  } catch (error) {
    console.error("❌ Connection failed:", error);
    console.error("\n🔍 Troubleshooting:");
    console.error("1. Verify Aurora cluster is running (not paused)");
    console.error("2. Check Data API is enabled on the cluster");
    console.error("3. Verify IAM permissions for Data API access");
    console.error("4. Check secret exists in Secrets Manager");
    console.error("5. Ensure secret contains 'username' and 'password' fields\n");
    process.exit(1);
  }
}

// Run the test
testConnection().catch(console.error);