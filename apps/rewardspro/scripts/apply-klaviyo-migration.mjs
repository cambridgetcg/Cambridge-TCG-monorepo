#!/usr/bin/env node

/**
 * Klaviyo Integration Database Migration Script
 *
 * This script creates the necessary database schema for Klaviyo integration:
 * - New enums: EmailProvider, KlaviyoSyncStatus, KlaviyoConsentStatus, KlaviyoEventStatus
 * - Updates to EmailSettings table with Klaviyo fields
 * - New tables: KlaviyoProfile, KlaviyoEvent, KlaviyoList, KlaviyoAutomationSettings
 *
 * Run with: node scripts/apply-klaviyo-migration.mjs
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
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
  console.log("🚀 Starting Klaviyo schema migration...\n");
  console.log("Database:", DATABASE);
  console.log("Resource ARN:", RESOURCE_ARN ? "✓ Set" : "✗ Missing");
  console.log("Secret ARN:", SECRET_ARN ? "✓ Set" : "✗ Missing");

  if (!RESOURCE_ARN || !SECRET_ARN) {
    console.error("\n❌ Missing required environment variables!");
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: Create Enums
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 1: Creating Enums");
  console.log("═══════════════════════════════════════════════════════════════");

  await executeSql(`
    DO $$ BEGIN
      CREATE TYPE "EmailProvider" AS ENUM ('SENDGRID', 'KLAVIYO', 'HYBRID');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `, "Create EmailProvider enum");

  await executeSql(`
    DO $$ BEGIN
      CREATE TYPE "KlaviyoSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'SYNCING', 'STALE', 'ERROR', 'UNSUBSCRIBED');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `, "Create KlaviyoSyncStatus enum");

  await executeSql(`
    DO $$ BEGIN
      CREATE TYPE "KlaviyoConsentStatus" AS ENUM ('UNKNOWN', 'SUBSCRIBED', 'NEVER_SUBSCRIBED', 'UNSUBSCRIBED', 'SUPPRESSED');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `, "Create KlaviyoConsentStatus enum");

  await executeSql(`
    DO $$ BEGIN
      CREATE TYPE "KlaviyoEventStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'ABANDONED');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `, "Create KlaviyoEventStatus enum");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Update EmailSettings table
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 2: Updating EmailSettings table");
  console.log("═══════════════════════════════════════════════════════════════");

  const emailSettingsColumns = [
    { name: "emailProvider", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "emailProvider" "EmailProvider" DEFAULT 'SENDGRID'` },
    { name: "klaviyoEnabled", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoEnabled" BOOLEAN DEFAULT false` },
    { name: "klaviyoApiKey", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoApiKey" TEXT` },
    { name: "klaviyoPublicKey", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoPublicKey" VARCHAR(10)` },
    { name: "klaviyoDefaultListId", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoDefaultListId" TEXT` },
    { name: "klaviyoIntegrationId", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoIntegrationId" TEXT` },
    { name: "klaviyoSyncProfiles", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoSyncProfiles" BOOLEAN DEFAULT true` },
    { name: "klaviyoSyncEvents", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoSyncEvents" BOOLEAN DEFAULT true` },
    { name: "klaviyoSyncConsent", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoSyncConsent" VARCHAR(20) DEFAULT 'EXPLICIT'` },
    { name: "klaviyoLastSyncAt", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoLastSyncAt" TIMESTAMP` },
    { name: "klaviyoSyncStatus", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoSyncStatus" VARCHAR(20)` },
    { name: "klaviyoSyncError", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoSyncError" TEXT` },
    { name: "klaviyoWebhookSecret", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoWebhookSecret" TEXT` },
    { name: "klaviyoWebhookId", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoWebhookId" TEXT` },
    { name: "klaviyoWebhookEnabled", sql: `ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "klaviyoWebhookEnabled" BOOLEAN DEFAULT false` },
  ];

  for (const col of emailSettingsColumns) {
    await executeSql(col.sql, `Add ${col.name} column to EmailSettings`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: Create KlaviyoProfile table
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 3: Creating KlaviyoProfile table");
  console.log("═══════════════════════════════════════════════════════════════");

  await executeSql(`
    CREATE TABLE IF NOT EXISTS "KlaviyoProfile" (
      "id" TEXT PRIMARY KEY,
      "shop" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "klaviyoProfileId" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "shopifyCustomerId" TEXT,
      "syncStatus" "KlaviyoSyncStatus" DEFAULT 'PENDING',
      "syncedAt" TIMESTAMP,
      "syncVersion" INTEGER DEFAULT 1,
      "lastSyncError" TEXT,
      "syncRetryCount" INTEGER DEFAULT 0,
      "profileDataHash" TEXT,
      "lastEventAt" TIMESTAMP,
      "lastEventType" TEXT,
      "emailConsent" "KlaviyoConsentStatus" DEFAULT 'UNKNOWN',
      "smsConsent" "KlaviyoConsentStatus" DEFAULT 'UNKNOWN',
      "consentUpdatedAt" TIMESTAMP,
      "listIds" TEXT[] DEFAULT '{}',
      "segmentIds" TEXT[] DEFAULT '{}',
      "metadata" JSONB,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `, "Create KlaviyoProfile table");

  // KlaviyoProfile indexes
  await executeSql(`CREATE UNIQUE INDEX IF NOT EXISTS "KlaviyoProfile_shop_customerId_key" ON "KlaviyoProfile" ("shop", "customerId")`, "Create unique index on shop+customerId");
  await executeSql(`CREATE UNIQUE INDEX IF NOT EXISTS "KlaviyoProfile_shop_klaviyoProfileId_key" ON "KlaviyoProfile" ("shop", "klaviyoProfileId")`, "Create unique index on shop+klaviyoProfileId");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoProfile_shop_email_idx" ON "KlaviyoProfile" ("shop", "email")`, "Create index on shop+email");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoProfile_shop_syncStatus_idx" ON "KlaviyoProfile" ("shop", "syncStatus")`, "Create index on shop+syncStatus");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoProfile_shop_syncedAt_idx" ON "KlaviyoProfile" ("shop", "syncedAt")`, "Create index on shop+syncedAt");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoProfile_shop_emailConsent_idx" ON "KlaviyoProfile" ("shop", "emailConsent")`, "Create index on shop+emailConsent");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoProfile_shopifyCustomerId_idx" ON "KlaviyoProfile" ("shopifyCustomerId")`, "Create index on shopifyCustomerId");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: Create KlaviyoEvent table
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 4: Creating KlaviyoEvent table");
  console.log("═══════════════════════════════════════════════════════════════");

  await executeSql(`
    CREATE TABLE IF NOT EXISTS "KlaviyoEvent" (
      "id" TEXT PRIMARY KEY,
      "shop" TEXT NOT NULL,
      "eventType" TEXT NOT NULL,
      "uniqueId" TEXT NOT NULL,
      "metricName" TEXT NOT NULL,
      "customerId" TEXT,
      "klaviyoProfileId" TEXT,
      "customerEmail" TEXT NOT NULL,
      "eventValue" DECIMAL(10,2),
      "eventProperties" JSONB NOT NULL,
      "eventTime" TIMESTAMP NOT NULL,
      "orderId" TEXT,
      "orderRefundId" TEXT,
      "tierChangeLogId" TEXT,
      "status" "KlaviyoEventStatus" DEFAULT 'PENDING',
      "sentAt" TIMESTAMP,
      "errorMessage" TEXT,
      "retryCount" INTEGER DEFAULT 0,
      "nextRetryAt" TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `, "Create KlaviyoEvent table");

  // KlaviyoEvent indexes
  await executeSql(`CREATE UNIQUE INDEX IF NOT EXISTS "KlaviyoEvent_shop_uniqueId_key" ON "KlaviyoEvent" ("shop", "uniqueId")`, "Create unique index on shop+uniqueId");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoEvent_shop_eventType_createdAt_idx" ON "KlaviyoEvent" ("shop", "eventType", "createdAt" DESC)`, "Create index on shop+eventType+createdAt");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoEvent_shop_status_idx" ON "KlaviyoEvent" ("shop", "status")`, "Create index on shop+status");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoEvent_customerId_eventType_idx" ON "KlaviyoEvent" ("customerId", "eventType")`, "Create index on customerId+eventType");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoEvent_orderId_idx" ON "KlaviyoEvent" ("orderId")`, "Create index on orderId");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoEvent_nextRetryAt_idx" ON "KlaviyoEvent" ("nextRetryAt")`, "Create index on nextRetryAt");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5: Create KlaviyoList table
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 5: Creating KlaviyoList table");
  console.log("═══════════════════════════════════════════════════════════════");

  await executeSql(`
    CREATE TABLE IF NOT EXISTS "KlaviyoList" (
      "id" TEXT PRIMARY KEY,
      "shop" TEXT NOT NULL,
      "klaviyoListId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "listType" TEXT DEFAULT 'list',
      "purpose" TEXT,
      "segmentRules" JSONB,
      "isDefault" BOOLEAN DEFAULT false,
      "isManaged" BOOLEAN DEFAULT false,
      "profileCount" INTEGER DEFAULT 0,
      "lastSyncedAt" TIMESTAMP,
      "metadata" JSONB,
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `, "Create KlaviyoList table");

  // KlaviyoList indexes
  await executeSql(`CREATE UNIQUE INDEX IF NOT EXISTS "KlaviyoList_shop_klaviyoListId_key" ON "KlaviyoList" ("shop", "klaviyoListId")`, "Create unique index on shop+klaviyoListId");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoList_shop_isDefault_idx" ON "KlaviyoList" ("shop", "isDefault")`, "Create index on shop+isDefault");
  await executeSql(`CREATE INDEX IF NOT EXISTS "KlaviyoList_shop_purpose_idx" ON "KlaviyoList" ("shop", "purpose")`, "Create index on shop+purpose");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 6: Create KlaviyoAutomationSettings table
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("STEP 6: Creating KlaviyoAutomationSettings table");
  console.log("═══════════════════════════════════════════════════════════════");

  await executeSql(`
    CREATE TABLE IF NOT EXISTS "KlaviyoAutomationSettings" (
      "id" TEXT PRIMARY KEY,
      "shop" TEXT NOT NULL UNIQUE,
      "automationsEnabled" BOOLEAN DEFAULT false,
      "sendCustomerEnrolled" BOOLEAN DEFAULT true,
      "sendCustomerBirthday" BOOLEAN DEFAULT true,
      "sendCustomerAnniversary" BOOLEAN DEFAULT true,
      "sendOrderPlaced" BOOLEAN DEFAULT true,
      "sendCashbackEarned" BOOLEAN DEFAULT true,
      "sendCashbackRedeemed" BOOLEAN DEFAULT true,
      "sendTierUpgraded" BOOLEAN DEFAULT true,
      "sendTierDowngraded" BOOLEAN DEFAULT true,
      "sendTierUpgradeNear" BOOLEAN DEFAULT true,
      "sendVipAchieved" BOOLEAN DEFAULT true,
      "sendPointsExpiring" BOOLEAN DEFAULT true,
      "sendBalanceReminder" BOOLEAN DEFAULT true,
      "sendWinBack" BOOLEAN DEFAULT true,
      "pointsExpiryWarningDays" INTEGER[] DEFAULT '{30, 7, 1}',
      "balanceReminderDays" INTEGER DEFAULT 30,
      "winBackTriggerDays" INTEGER[] DEFAULT '{60, 90}',
      "tierNudgeThreshold" INTEGER DEFAULT 80,
      "expiryReminderCooldownDays" INTEGER DEFAULT 7,
      "balanceReminderCooldownDays" INTEGER DEFAULT 14,
      "winBackCooldownDays" INTEGER DEFAULT 30,
      "tierNudgeCooldownDays" INTEGER DEFAULT 14,
      "scheduledJobTime" TEXT DEFAULT '06:00',
      "timezone" TEXT DEFAULT 'America/New_York',
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `, "Create KlaviyoAutomationSettings table");

  // ═══════════════════════════════════════════════════════════════════════
  // COMPLETE
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("✅ Klaviyo schema migration complete!");
  console.log("═══════════════════════════════════════════════════════════════");

  console.log("\nNew tables created:");
  console.log("  - KlaviyoProfile (customer sync tracking)");
  console.log("  - KlaviyoEvent (event tracking & retry)");
  console.log("  - KlaviyoList (list cache)");
  console.log("  - KlaviyoAutomationSettings (merchant config)");

  console.log("\nEmailSettings updated with Klaviyo fields:");
  console.log("  - emailProvider, klaviyoEnabled, klaviyoApiKey, etc.");

  console.log("\nNew enums created:");
  console.log("  - EmailProvider, KlaviyoSyncStatus, KlaviyoConsentStatus, KlaviyoEventStatus");
}

main().catch((error) => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});
