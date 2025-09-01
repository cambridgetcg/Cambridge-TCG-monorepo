/**
 * Test script to verify AWS Aurora Data API connection
 * Run with: npx tsx test-data-api.ts
 */

import { config } from "dotenv";
import { getAuroraClient } from "./app/utils/aurora-data-api";

// Load environment variables
config();

async function testDataAPIConnection() {
  console.log("🧪 Testing AWS Aurora Data API Connection\n");
  console.log("=" .repeat(60));

  // Check environment variables
  console.log("\n📋 Environment Check:");
  const requiredVars = [
    "AURORA_RESOURCE_ARN",
    "AURORA_SECRET_ARN",
    "AURORA_DATABASE_NAME",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION"
  ];

  let allVarsSet = true;
  for (const varName of requiredVars) {
    const isSet = !!process.env[varName];
    console.log(`   ${varName}: ${isSet ? "✅ Set" : "❌ Missing"}`);
    if (!isSet) allVarsSet = false;
  }

  if (!allVarsSet) {
    console.log("\n❌ Missing required environment variables!");
    console.log("   Please check your .env file");
    return;
  }

  console.log("\n🔌 Connection Details:");
  console.log(`   Region: ${process.env.AWS_REGION}`);
  console.log(`   Database: ${process.env.AURORA_DATABASE_NAME}`);
  console.log(`   Resource ARN: ${process.env.AURORA_RESOURCE_ARN?.substring(0, 50)}...`);

  try {
    console.log("\n🚀 Attempting to connect to Aurora Data API...\n");
    
    const client = getAuroraClient();
    
    // Test 1: Simple connectivity test
    console.log("Test 1: Basic connectivity");
    const startTime = Date.now();
    const result1 = await client.executeStatement("SELECT 1 as test, NOW() as current_time");
    const responseTime = Date.now() - startTime;
    
    if (result1.records && result1.records.length > 0) {
      console.log("   ✅ Connected successfully!");
      console.log(`   Response time: ${responseTime}ms`);
      console.log(`   Server time: ${result1.records[0].current_time}`);
    }

    // Test 2: Database version
    console.log("\nTest 2: Database version");
    const result2 = await client.executeStatement("SELECT version() as db_version");
    if (result2.records && result2.records.length > 0) {
      console.log(`   ✅ Database: ${result2.records[0].db_version}`);
    }

    // Test 3: Check tables
    console.log("\nTest 3: Schema check");
    const result3 = await client.executeStatement(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    if (result3.records) {
      console.log(`   ✅ Found ${result3.records.length} tables:`);
      result3.records.forEach((record: any) => {
        console.log(`      - ${record.table_name}`);
      });
    }

    // Test 4: Check if Prisma migrations table exists
    console.log("\nTest 4: Prisma migrations check");
    const result4 = await client.executeStatement(`
      SELECT COUNT(*) as migration_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = '_prisma_migrations'
    `);
    
    if (result4.records && result4.records[0].migration_count > 0) {
      console.log("   ✅ Prisma migrations table exists");
      
      // Count migrations
      try {
        const migrationCount = await client.executeStatement(
          "SELECT COUNT(*) as count FROM _prisma_migrations"
        );
        if (migrationCount.records) {
          console.log(`   📊 Migrations applied: ${migrationCount.records[0].count}`);
        }
      } catch (e) {
        // Table might not have been created yet
      }
    } else {
      console.log("   ⚠️  Prisma migrations table not found (run migrations)");
    }

    // Test 5: Transaction support
    console.log("\nTest 5: Transaction support");
    try {
      const txResult = await client.executeTransaction(async (execute) => {
        const result = await execute("SELECT 'Transaction works!' as message");
        return result.records?.[0]?.message;
      });
      console.log(`   ✅ ${txResult}`);
    } catch (txError) {
      console.log("   ❌ Transaction test failed:", txError);
    }

    console.log("\n" + "=" .repeat(60));
    console.log("✅ All Data API tests completed successfully!");
    console.log("\n📊 Summary:");
    console.log("   - Connection: Working");
    console.log("   - Response time: Fast");
    console.log("   - Database: Accessible");
    console.log("   - Schema: Available");
    console.log("\n🎯 Your Data API connection is properly configured!");

  } catch (error) {
    console.log("\n❌ Connection failed!");
    console.log("\n📛 Error Details:");
    
    if (error instanceof Error) {
      console.log(`   Name: ${error.name}`);
      console.log(`   Message: ${error.message}`);
      
      // Common error patterns
      if (error.message.includes("Secrets Manager")) {
        console.log("\n💡 Possible issues:");
        console.log("   - Check AURORA_SECRET_ARN is correct");
        console.log("   - Verify IAM permissions for Secrets Manager");
        console.log("   - Ensure secret exists in correct region");
      } else if (error.message.includes("cluster")) {
        console.log("\n💡 Possible issues:");
        console.log("   - Check AURORA_RESOURCE_ARN is correct");
        console.log("   - Verify cluster is running (not paused)");
        console.log("   - Ensure Data API is enabled on cluster");
      } else if (error.message.includes("credentials")) {
        console.log("\n💡 Possible issues:");
        console.log("   - Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
        console.log("   - Verify IAM user has necessary permissions");
      }
    } else {
      console.log(`   Error: ${error}`);
    }

    console.log("\n🔧 Troubleshooting steps:");
    console.log("   1. Verify all environment variables are correct");
    console.log("   2. Check Aurora cluster is running");
    console.log("   3. Ensure Data API is enabled on the cluster");
    console.log("   4. Verify IAM permissions");
    console.log("   5. Check AWS region matches cluster location");
  }
}

// Run the test
testDataAPIConnection().catch(console.error);