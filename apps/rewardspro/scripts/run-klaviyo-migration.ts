/**
 * One-time migration script for Klaviyo integration tables
 * Run via: npx tsx scripts/run-klaviyo-migration.ts
 */

import {
  RDSDataClient,
  ExecuteStatementCommand,
} from "@aws-sdk/client-rds-data";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment from .env.production
dotenv.config({ path: path.resolve(process.cwd(), ".env.production") });

const region = (process.env.AWS_REGION || "eu-north-1").trim();
const resourceArn = process.env.AURORA_RESOURCE_ARN?.trim() || "";
const secretArn = process.env.AURORA_SECRET_ARN?.trim() || "";
const database = process.env.AURORA_DATABASE_NAME?.trim() || "";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

console.log("Configuration:");
console.log("  Region:", region);
console.log("  Resource ARN:", resourceArn);
console.log("  Database:", database);
console.log("");

if (!resourceArn || !secretArn || !database) {
  console.error("Missing Aurora environment variables");
  process.exit(1);
}

const clientConfig: any = { region };
if (accessKeyId && secretAccessKey) {
  clientConfig.credentials = { accessKeyId, secretAccessKey };
}

const rds = new RDSDataClient(clientConfig);

async function execute(sql: string, description: string): Promise<void> {
  console.log(`Executing: ${description}...`);
  try {
    await rds.send(
      new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql,
      })
    );
    console.log(`  ✓ ${description}`);
  } catch (error: any) {
    if (error.message?.includes("already exists")) {
      console.log(`  ⊘ ${description} (already exists, skipping)`);
    } else {
      throw error;
    }
  }
}

async function runMigration() {
  console.log("Running Klaviyo Integration Migration...\n");

  // Create enums
  await execute(
    `CREATE TYPE "KlaviyoSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'SYNCING', 'STALE', 'ERROR', 'UNSUBSCRIBED')`,
    "Create KlaviyoSyncStatus enum"
  );

  await execute(
    `CREATE TYPE "KlaviyoConsentStatus" AS ENUM ('UNKNOWN', 'SUBSCRIBED', 'NEVER_SUBSCRIBED', 'UNSUBSCRIBED', 'SUPPRESSED')`,
    "Create KlaviyoConsentStatus enum"
  );

  await execute(
    `CREATE TYPE "KlaviyoEventStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'ABANDONED')`,
    "Create KlaviyoEventStatus enum"
  );

  // Create KlaviyoProfile table
  await execute(
    `CREATE TABLE "KlaviyoProfile" (
      "id" TEXT NOT NULL,
      "shop" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "klaviyoProfileId" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "shopifyCustomerId" TEXT,
      "syncStatus" "KlaviyoSyncStatus" NOT NULL DEFAULT 'PENDING',
      "syncedAt" TIMESTAMP(3),
      "syncVersion" INTEGER NOT NULL DEFAULT 1,
      "lastSyncError" TEXT,
      "syncRetryCount" INTEGER NOT NULL DEFAULT 0,
      "profileDataHash" TEXT,
      "lastEventAt" TIMESTAMP(3),
      "lastEventType" TEXT,
      "lastKnownSegment" TEXT,
      "emailConsent" "KlaviyoConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
      "smsConsent" "KlaviyoConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
      "consentUpdatedAt" TIMESTAMP(3),
      "listIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
      "segmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "KlaviyoProfile_pkey" PRIMARY KEY ("id")
    )`,
    "Create KlaviyoProfile table"
  );

  await execute(
    `CREATE UNIQUE INDEX "KlaviyoProfile_shop_customerId_key" ON "KlaviyoProfile"("shop", "customerId")`,
    "Create KlaviyoProfile shop_customerId unique index"
  );

  await execute(
    `CREATE UNIQUE INDEX "KlaviyoProfile_shop_klaviyoProfileId_key" ON "KlaviyoProfile"("shop", "klaviyoProfileId")`,
    "Create KlaviyoProfile shop_klaviyoProfileId unique index"
  );

  await execute(
    `CREATE INDEX "KlaviyoProfile_shop_email_idx" ON "KlaviyoProfile"("shop", "email")`,
    "Create KlaviyoProfile shop_email index"
  );

  await execute(
    `CREATE INDEX "KlaviyoProfile_shop_syncStatus_idx" ON "KlaviyoProfile"("shop", "syncStatus")`,
    "Create KlaviyoProfile shop_syncStatus index"
  );

  await execute(
    `CREATE INDEX "KlaviyoProfile_shop_syncedAt_idx" ON "KlaviyoProfile"("shop", "syncedAt")`,
    "Create KlaviyoProfile shop_syncedAt index"
  );

  await execute(
    `CREATE INDEX "KlaviyoProfile_shop_emailConsent_idx" ON "KlaviyoProfile"("shop", "emailConsent")`,
    "Create KlaviyoProfile shop_emailConsent index"
  );

  await execute(
    `CREATE INDEX "KlaviyoProfile_shopifyCustomerId_idx" ON "KlaviyoProfile"("shopifyCustomerId")`,
    "Create KlaviyoProfile shopifyCustomerId index"
  );

  // Create KlaviyoEvent table
  await execute(
    `CREATE TABLE "KlaviyoEvent" (
      "id" TEXT NOT NULL,
      "shop" TEXT NOT NULL,
      "eventType" TEXT NOT NULL,
      "uniqueId" TEXT NOT NULL,
      "metricName" TEXT NOT NULL,
      "customerId" TEXT,
      "klaviyoProfileId" TEXT,
      "customerEmail" TEXT NOT NULL,
      "eventValue" DECIMAL(10,2),
      "eventProperties" JSONB NOT NULL,
      "eventTime" TIMESTAMP(3) NOT NULL,
      "orderId" TEXT,
      "orderRefundId" TEXT,
      "tierChangeLogId" TEXT,
      "status" "KlaviyoEventStatus" NOT NULL DEFAULT 'PENDING',
      "sentAt" TIMESTAMP(3),
      "errorMessage" TEXT,
      "retryCount" INTEGER NOT NULL DEFAULT 0,
      "nextRetryAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "KlaviyoEvent_pkey" PRIMARY KEY ("id")
    )`,
    "Create KlaviyoEvent table"
  );

  await execute(
    `CREATE UNIQUE INDEX "KlaviyoEvent_shop_uniqueId_key" ON "KlaviyoEvent"("shop", "uniqueId")`,
    "Create KlaviyoEvent shop_uniqueId unique index"
  );

  await execute(
    `CREATE INDEX "KlaviyoEvent_shop_eventType_createdAt_idx" ON "KlaviyoEvent"("shop", "eventType", "createdAt" DESC)`,
    "Create KlaviyoEvent shop_eventType_createdAt index"
  );

  await execute(
    `CREATE INDEX "KlaviyoEvent_shop_status_idx" ON "KlaviyoEvent"("shop", "status")`,
    "Create KlaviyoEvent shop_status index"
  );

  await execute(
    `CREATE INDEX "KlaviyoEvent_customerId_eventType_idx" ON "KlaviyoEvent"("customerId", "eventType")`,
    "Create KlaviyoEvent customerId_eventType index"
  );

  await execute(
    `CREATE INDEX "KlaviyoEvent_orderId_idx" ON "KlaviyoEvent"("orderId")`,
    "Create KlaviyoEvent orderId index"
  );

  await execute(
    `CREATE INDEX "KlaviyoEvent_nextRetryAt_idx" ON "KlaviyoEvent"("nextRetryAt")`,
    "Create KlaviyoEvent nextRetryAt index"
  );

  // Create KlaviyoList table
  await execute(
    `CREATE TABLE "KlaviyoList" (
      "id" TEXT NOT NULL,
      "shop" TEXT NOT NULL,
      "klaviyoListId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "listType" TEXT NOT NULL DEFAULT 'list',
      "purpose" TEXT,
      "segmentRules" JSONB,
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "isManaged" BOOLEAN NOT NULL DEFAULT false,
      "profileCount" INTEGER NOT NULL DEFAULT 0,
      "lastSyncedAt" TIMESTAMP(3),
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "KlaviyoList_pkey" PRIMARY KEY ("id")
    )`,
    "Create KlaviyoList table"
  );

  await execute(
    `CREATE UNIQUE INDEX "KlaviyoList_shop_klaviyoListId_key" ON "KlaviyoList"("shop", "klaviyoListId")`,
    "Create KlaviyoList shop_klaviyoListId unique index"
  );

  await execute(
    `CREATE INDEX "KlaviyoList_shop_isDefault_idx" ON "KlaviyoList"("shop", "isDefault")`,
    "Create KlaviyoList shop_isDefault index"
  );

  await execute(
    `CREATE INDEX "KlaviyoList_shop_purpose_idx" ON "KlaviyoList"("shop", "purpose")`,
    "Create KlaviyoList shop_purpose index"
  );

  // Create KlaviyoAutomationSettings table
  await execute(
    `CREATE TABLE "KlaviyoAutomationSettings" (
      "id" TEXT NOT NULL,
      "shop" TEXT NOT NULL,
      "automationsEnabled" BOOLEAN NOT NULL DEFAULT false,
      "sendCustomerEnrolled" BOOLEAN NOT NULL DEFAULT true,
      "sendCustomerBirthday" BOOLEAN NOT NULL DEFAULT true,
      "sendCustomerAnniversary" BOOLEAN NOT NULL DEFAULT true,
      "sendOrderPlaced" BOOLEAN NOT NULL DEFAULT true,
      "sendCashbackEarned" BOOLEAN NOT NULL DEFAULT true,
      "sendCashbackRedeemed" BOOLEAN NOT NULL DEFAULT true,
      "sendTierUpgraded" BOOLEAN NOT NULL DEFAULT true,
      "sendTierDowngraded" BOOLEAN NOT NULL DEFAULT true,
      "sendTierUpgradeNear" BOOLEAN NOT NULL DEFAULT true,
      "sendVipAchieved" BOOLEAN NOT NULL DEFAULT true,
      "sendPointsExpiring" BOOLEAN NOT NULL DEFAULT true,
      "sendBalanceReminder" BOOLEAN NOT NULL DEFAULT true,
      "sendWinBack" BOOLEAN NOT NULL DEFAULT true,
      "sendCashbackAdjusted" BOOLEAN NOT NULL DEFAULT true,
      "sendCustomerBecameChampion" BOOLEAN NOT NULL DEFAULT true,
      "sendCustomerBecameLoyal" BOOLEAN NOT NULL DEFAULT true,
      "pointsExpiryWarningDays" INTEGER[] DEFAULT ARRAY[30, 7, 1]::INTEGER[],
      "balanceReminderDays" INTEGER NOT NULL DEFAULT 30,
      "winBackTriggerDays" INTEGER[] DEFAULT ARRAY[60, 90]::INTEGER[],
      "tierNudgeThreshold" INTEGER NOT NULL DEFAULT 80,
      "expiryReminderCooldownDays" INTEGER NOT NULL DEFAULT 7,
      "balanceReminderCooldownDays" INTEGER NOT NULL DEFAULT 14,
      "winBackCooldownDays" INTEGER NOT NULL DEFAULT 30,
      "tierNudgeCooldownDays" INTEGER NOT NULL DEFAULT 14,
      "scheduledJobTime" TEXT NOT NULL DEFAULT '06:00',
      "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "KlaviyoAutomationSettings_pkey" PRIMARY KEY ("id")
    )`,
    "Create KlaviyoAutomationSettings table"
  );

  await execute(
    `CREATE UNIQUE INDEX "KlaviyoAutomationSettings_shop_key" ON "KlaviyoAutomationSettings"("shop")`,
    "Create KlaviyoAutomationSettings shop unique index"
  );

  // Record migration in _prisma_migrations table
  const migrationId = "20250122_add_klaviyo_integration";
  await execute(
    `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "started_at", "applied_steps_count")
     VALUES (gen_random_uuid(), 'manual-migration', '${migrationId}', NOW(), NOW(), 1)
     ON CONFLICT DO NOTHING`,
    "Record migration in Prisma migrations table"
  );

  console.log("\n✓ Migration completed successfully!");
}

runMigration().catch((err) => {
  console.error("\n✗ Migration failed:", err.message);
  process.exit(1);
});
