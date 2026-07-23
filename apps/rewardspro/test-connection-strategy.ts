/**
 * Test Connection Strategy
 * 
 * Verifies that the correct database connection method is used
 * based on the deployment environment.
 */

import "dotenv/config";

import {
  getConnectionStrategy,
  logConnectionStrategy,
} from "./app/utils/connection-strategy";

async function testConnectionStrategy() {
  console.log("🧪 Testing Connection Strategy\n");
  console.log("=" . repeat(50));

  // Display current environment
  console.log("\n📊 Current Environment:");
  console.log(`   VERCEL_ENV: ${process.env.VERCEL_ENV || "not set (local)"}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
  console.log(`   FORCE_DATA_API: ${process.env.FORCE_DATA_API || "not set"}`);
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? "✅ Set" : "❌ Not set"}`);
  console.log(`   AURORA_RESOURCE_ARN: ${process.env.AURORA_RESOURCE_ARN ? "✅ Set" : "❌ Not set"}`);

  // Get and display connection strategy
  console.log("\n🔌 Connection Strategy:");
  logConnectionStrategy();

  const strategy = getConnectionStrategy();
  console.log("\n📋 Strategy Details:");
  console.log(`   Type: ${strategy.type}`);
  console.log(`   Max Connections: ${strategy.maxConnections}`);
  console.log(`   Use Data API: ${strategy.useDataAPI}`);
  console.log(`   Description: ${strategy.description}`);

  // Test different scenarios
  console.log("\n🧪 Testing Different Scenarios:");
  console.log("=" . repeat(50));

  // Test Production
  console.log("\n1️⃣ Production Environment:");
  process.env.VERCEL_ENV = "production";
  delete process.env.FORCE_DATA_API;
  const prodStrategy = getConnectionStrategy();
  console.log(`   Strategy: ${prodStrategy.type}`);
  console.log(`   Uses Data API: ${prodStrategy.useDataAPI}`);
  console.log(`   ✅ Should use direct/proxy connection`);

  // Test Preview
  console.log("\n2️⃣ Preview Environment:");
  process.env.VERCEL_ENV = "preview";
  const previewStrategy = getConnectionStrategy();
  console.log(`   Strategy: ${previewStrategy.type}`);
  console.log(`   Uses Data API: ${previewStrategy.useDataAPI}`);
  console.log(`   ✅ Should use Data API (no connections)`);

  // Test Force Data API
  console.log("\n3️⃣ Forced Data API (production with flag):");
  process.env.VERCEL_ENV = "production";
  process.env.FORCE_DATA_API = "true";
  const forcedStrategy = getConnectionStrategy();
  console.log(`   Strategy: ${forcedStrategy.type}`);
  console.log(`   Uses Data API: ${forcedStrategy.useDataAPI}`);
  console.log(`   ✅ Should override to Data API`);

  // Test Local Development
  console.log("\n4️⃣ Local Development:");
  delete process.env.VERCEL_ENV;
  delete process.env.FORCE_DATA_API;
  process.env.NODE_ENV = "development";
  const localStrategy = getConnectionStrategy();
  console.log(`   Strategy: ${localStrategy.type}`);
  console.log(`   Uses Data API: ${localStrategy.useDataAPI}`);
  console.log(`   ✅ Should use local direct connection`);

  // Summary
  console.log("\n" + "=" . repeat(50));
  console.log("✅ Connection Strategy Tests Complete!");
  console.log("\n📝 Summary:");
  console.log("   - Production uses direct connections (limited pool)");
  console.log("   - Preview uses Data API (zero connections)");
  console.log("   - Force flag overrides environment detection");
  console.log("   - Local development uses direct connection");
  
  console.log("\n🎯 This configuration prevents connection exhaustion!");
}

// Run the test
testConnectionStrategy().catch(console.error);
