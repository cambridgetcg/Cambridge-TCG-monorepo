#!/usr/bin/env node

/**
 * Klaviyo Gap Fill - Phase 1 Database Migration Script
 *
 * This script adds new columns for Phase 1 gap fill features:
 * - Customer.birthday - Birthday field for birthday flows
 * - Customer.phone - Phone number for SMS
 * - KlaviyoProfile.lastKnownSegment - Segment tracking for change detection
 * - KlaviyoAutomationSettings.sendCashbackAdjusted - Adjustment event toggle
 * - KlaviyoAutomationSettings.sendCustomerBecameChampion - Champion event toggle
 * - KlaviyoAutomationSettings.sendCustomerBecameLoyal - Loyal event toggle
 *
 * Run with: node scripts/apply-klaviyo-gap-migration.mjs
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const client = new RDSDataClient({
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const RESOURCE_ARN = process.env.AURORA_RESOURCE_ARN;
const SECRET_ARN = process.env.AURORA_SECRET_ARN;
const DATABASE = process.env.AURORA_DATABASE_NAME || "rewardspro";

async function executeSql(sql, description) {
  console.log(`\n📝 ${description}...`);
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn: RESOURCE_ARN,
      secretArn: SECRET_ARN,
      database: DATABASE,
      sql: sql.trim(),
    }));
    console.log(`✅ ${description} - Success`);
    return true;
  } catch (error) {
    if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
      console.log(`⏭️  ${description} - Already exists, skipping`);
      return true;
    }
    console.error(`❌ ${description} - Failed:`, error.message);
    return false;
  }
}

async function main() {
  console.log("🚀 Starting Klaviyo Gap Fill Phase 1 migration...\n");
  console.log("Database:", DATABASE);
  console.log("Resource ARN:", RESOURCE_ARN ? "✓ Set" : "✗ Missing");
  console.log("Secret ARN:", SECRET_ARN ? "✓ Set" : "✗ Missing");

  if (!RESOURCE_ARN || !SECRET_ARN) {
    console.error("\n❌ Missing required environment variables!");
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: Add birthday and phone to Customer table
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 1: Adding birthday and phone to Customer table");
  console.log("═══════════════════════════════════════════════════════════════");

  await executeSql(
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(50)`,
    "Add phone column to Customer"
  );

  await executeSql(
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "birthday" TIMESTAMP`,
    "Add birthday column to Customer"
  );

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Add lastKnownSegment to KlaviyoProfile table
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 2: Adding lastKnownSegment to KlaviyoProfile table");
  console.log("═══════════════════════════════════════════════════════════════");

  await executeSql(
    `ALTER TABLE "KlaviyoProfile" ADD COLUMN IF NOT EXISTS "lastKnownSegment" VARCHAR(20)`,
    "Add lastKnownSegment column to KlaviyoProfile"
  );

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: Add new event toggles to KlaviyoAutomationSettings
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 3: Adding new event toggles to KlaviyoAutomationSettings");
  console.log("═══════════════════════════════════════════════════════════════");

  await executeSql(
    `ALTER TABLE "KlaviyoAutomationSettings" ADD COLUMN IF NOT EXISTS "sendCashbackAdjusted" BOOLEAN DEFAULT true`,
    "Add sendCashbackAdjusted column"
  );

  await executeSql(
    `ALTER TABLE "KlaviyoAutomationSettings" ADD COLUMN IF NOT EXISTS "sendCustomerBecameChampion" BOOLEAN DEFAULT true`,
    "Add sendCustomerBecameChampion column"
  );

  await executeSql(
    `ALTER TABLE "KlaviyoAutomationSettings" ADD COLUMN IF NOT EXISTS "sendCustomerBecameLoyal" BOOLEAN DEFAULT true`,
    "Add sendCustomerBecameLoyal column"
  );

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: Add OAuth fields to EmailSettings
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 4: Adding OAuth fields to EmailSettings");
  console.log("═══════════════════════════════════════════════════════════════");

  await executeSql(
    `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoOAuthConnected" BOOLEAN DEFAULT false`,
    "Add klaviyoOAuthConnected column"
  );

  await executeSql(
    `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoAccessToken" TEXT`,
    "Add klaviyoAccessToken column"
  );

  await executeSql(
    `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoRefreshToken" TEXT`,
    "Add klaviyoRefreshToken column"
  );

  await executeSql(
    `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoTokenExpiresAt" TIMESTAMP`,
    "Add klaviyoTokenExpiresAt column"
  );

  // ═══════════════════════════════════════════════════════════════════════
  // COMPLETE
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("✅ Klaviyo Gap Fill Phase 1 migration complete!");
  console.log("═══════════════════════════════════════════════════════════════");

  console.log("\nChanges applied:");
  console.log("  Customer table:");
  console.log("    - phone (VARCHAR(50)) - Customer phone number");
  console.log("    - birthday (TIMESTAMP) - Customer birthday for flows");
  console.log("");
  console.log("  KlaviyoProfile table:");
  console.log("    - lastKnownSegment (VARCHAR(20)) - Segment change tracking");
  console.log("");
  console.log("  KlaviyoAutomationSettings table:");
  console.log("    - sendCashbackAdjusted (BOOLEAN) - Manual adjustment events");
  console.log("    - sendCustomerBecameChampion (BOOLEAN) - Champion segment events");
  console.log("    - sendCustomerBecameLoyal (BOOLEAN) - Loyal segment events");
  console.log("");
  console.log("New Klaviyo events available:");
  console.log("  - RewardsPro Cashback Adjusted");
  console.log("  - RewardsPro Customer Became Champion");
  console.log("  - RewardsPro Customer Became Loyal");
  console.log("  - RewardsPro Customer At Risk");
  console.log("");
  console.log("New Klaviyo profile properties:");
  console.log("  - rewardspro_customer_segment");
  console.log("  - rewardspro_birthday");
  console.log("  - rewardspro_birthday_month");
  console.log("  - rewardspro_birthday_day");
}

main().catch((error) => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});
