#!/usr/bin/env node

/**
 * Marketing Hub Mode Database Migration Script
 *
 * This script adds the marketing hub mode fields to EmailSettings:
 * - New enum: MarketingHubMode (UNCONFIGURED, INHOUSE, KLAVIYO)
 * - New fields: marketingHubMode, marketingModeSetAt, hasSeenMarketingChoice
 *
 * Run with: node scripts/apply-marketing-hub-mode-migration.mjs
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Try .env.local first, then .env
dotenv.config({ path: join(__dirname, '..', '.env.local') });
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
  console.log("🚀 Starting Marketing Hub Mode migration...\n");
  console.log("Database:", DATABASE);
  console.log("Resource ARN:", RESOURCE_ARN ? "✓ Set" : "✗ Missing");
  console.log("Secret ARN:", SECRET_ARN ? "✓ Set" : "✗ Missing");

  if (!RESOURCE_ARN || !SECRET_ARN) {
    console.error("\n❌ Missing required environment variables!");
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: Create MarketingHubMode Enum
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 1: Creating MarketingHubMode Enum");
  console.log("═══════════════════════════════════════════════════════════════");

  await executeSql(`
    DO $$ BEGIN
      CREATE TYPE "MarketingHubMode" AS ENUM ('UNCONFIGURED', 'INHOUSE', 'KLAVIYO');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `, "Create MarketingHubMode enum");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Add columns to EmailSettings table
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 2: Adding columns to EmailSettings table");
  console.log("═══════════════════════════════════════════════════════════════");

  await executeSql(
    `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "marketingHubMode" "MarketingHubMode" DEFAULT 'UNCONFIGURED'`,
    "Add marketingHubMode column"
  );

  await executeSql(
    `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "marketingModeSetAt" TIMESTAMP`,
    "Add marketingModeSetAt column"
  );

  await executeSql(
    `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "hasSeenMarketingChoice" BOOLEAN DEFAULT false`,
    "Add hasSeenMarketingChoice column"
  );

  // ═══════════════════════════════════════════════════════════════════════
  // COMPLETE
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("✅ Marketing Hub Mode migration complete!");
  console.log("═══════════════════════════════════════════════════════════════");

  console.log("\nNew enum created:");
  console.log("  - MarketingHubMode (UNCONFIGURED, INHOUSE, KLAVIYO)");

  console.log("\nEmailSettings columns added:");
  console.log("  - marketingHubMode: Which marketing UI to show");
  console.log("  - marketingModeSetAt: When merchant chose their mode");
  console.log("  - hasSeenMarketingChoice: Has seen the choice modal");
}

main().catch((error) => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});
