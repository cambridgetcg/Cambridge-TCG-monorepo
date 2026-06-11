/**
 * One-time migration script for gift card tables
 * Run via: npx ts-node scripts/run-gift-card-migration.ts
 *
 * Requires environment variables:
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_REGION
 * - AURORA_RESOURCE_ARN
 * - AURORA_SECRET_ARN
 * - AURORA_DATABASE_NAME
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
console.log("  Secret ARN:", secretArn?.substring(0, 50) + "...");
console.log("  Database:", database);
console.log("  Access Key:", accessKeyId?.substring(0, 8) + "...");
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
  console.log("Running Gift Card System Migration...\n");

  // Create enums
  await execute(
    `CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'DEACTIVATED', 'EXPIRED')`,
    "Create GiftCardStatus enum"
  );

  await execute(
    `CREATE TYPE "GiftCardBundleType" AS ENUM ('VALUE_ONLY', 'MEMBERSHIP_ONLY', 'VALUE_PLUS_MEMBERSHIP')`,
    "Create GiftCardBundleType enum"
  );

  // Create GiftCardConfig table
  await execute(
    `CREATE TABLE "GiftCardConfig" (
      "id" TEXT NOT NULL,
      "shop" TEXT NOT NULL,
      "enableTierBranding" BOOLEAN NOT NULL DEFAULT true,
      "enableTierBonuses" BOOLEAN NOT NULL DEFAULT false,
      "enableMembershipGifts" BOOLEAN NOT NULL DEFAULT true,
      "defaultTemplateSuffix" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "GiftCardConfig_pkey" PRIMARY KEY ("id")
    )`,
    "Create GiftCardConfig table"
  );

  await execute(
    `CREATE UNIQUE INDEX "GiftCardConfig_shop_key" ON "GiftCardConfig"("shop")`,
    "Create GiftCardConfig shop index"
  );

  // Create TierGiftCardSettings table
  await execute(
    `CREATE TABLE "TierGiftCardSettings" (
      "id" TEXT NOT NULL,
      "shop" TEXT NOT NULL,
      "tierId" TEXT NOT NULL,
      "templateSuffix" TEXT,
      "bonusPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
      "canBundleWithCard" BOOLEAN NOT NULL DEFAULT true,
      "bundlePrice" DECIMAL(10,2),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "TierGiftCardSettings_pkey" PRIMARY KEY ("id")
    )`,
    "Create TierGiftCardSettings table"
  );

  await execute(
    `CREATE UNIQUE INDEX "TierGiftCardSettings_tierId_key" ON "TierGiftCardSettings"("tierId")`,
    "Create TierGiftCardSettings tierId unique index"
  );

  await execute(
    `CREATE INDEX "TierGiftCardSettings_shop_idx" ON "TierGiftCardSettings"("shop")`,
    "Create TierGiftCardSettings shop index"
  );

  await execute(
    `ALTER TABLE "TierGiftCardSettings" ADD CONSTRAINT "TierGiftCardSettings_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    "Create TierGiftCardSettings tier foreign key"
  );

  // Create IssuedGiftCard table
  await execute(
    `CREATE TABLE "IssuedGiftCard" (
      "id" TEXT NOT NULL,
      "shop" TEXT NOT NULL,
      "shopifyGiftCardId" TEXT NOT NULL,
      "lastFourDigits" TEXT,
      "initialValue" DECIMAL(10,2) NOT NULL,
      "bonusValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "totalValue" DECIMAL(10,2) NOT NULL,
      "templateSuffix" TEXT,
      "purchaserTierId" TEXT,
      "purchaserTierName" TEXT,
      "bundleType" "GiftCardBundleType" NOT NULL DEFAULT 'VALUE_ONLY',
      "bundledTierId" TEXT,
      "bundledTierName" TEXT,
      "bundledDuration" TEXT,
      "purchasedByCustomerId" TEXT,
      "purchasedByEmail" TEXT,
      "recipientCustomerId" TEXT,
      "recipientEmail" TEXT,
      "recipientName" TEXT,
      "personalMessage" TEXT,
      "scheduledSendAt" TIMESTAMP(3),
      "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
      "redeemedAt" TIMESTAMP(3),
      "tierActivatedAt" TIMESTAMP(3),
      "convertedFromLedgerId" TEXT,
      "shopifyOrderId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "IssuedGiftCard_pkey" PRIMARY KEY ("id")
    )`,
    "Create IssuedGiftCard table"
  );

  await execute(
    `CREATE UNIQUE INDEX "IssuedGiftCard_shopifyGiftCardId_key" ON "IssuedGiftCard"("shopifyGiftCardId")`,
    "Create IssuedGiftCard shopifyGiftCardId unique index"
  );

  await execute(
    `CREATE INDEX "IssuedGiftCard_shop_status_idx" ON "IssuedGiftCard"("shop", "status")`,
    "Create IssuedGiftCard shop/status index"
  );

  await execute(
    `CREATE INDEX "IssuedGiftCard_recipientCustomerId_idx" ON "IssuedGiftCard"("recipientCustomerId")`,
    "Create IssuedGiftCard recipientCustomerId index"
  );

  await execute(
    `CREATE INDEX "IssuedGiftCard_purchasedByCustomerId_idx" ON "IssuedGiftCard"("purchasedByCustomerId")`,
    "Create IssuedGiftCard purchasedByCustomerId index"
  );

  await execute(
    `CREATE INDEX "IssuedGiftCard_shopifyOrderId_idx" ON "IssuedGiftCard"("shopifyOrderId")`,
    "Create IssuedGiftCard shopifyOrderId index"
  );

  // Create GiftCardBundle table
  await execute(
    `CREATE TABLE "GiftCardBundle" (
      "id" TEXT NOT NULL,
      "shop" TEXT NOT NULL,
      "tierId" TEXT,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "bundleType" "GiftCardBundleType" NOT NULL,
      "giftCardValue" DECIMAL(10,2) NOT NULL,
      "price" DECIMAL(10,2) NOT NULL,
      "membershipDuration" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "GiftCardBundle_pkey" PRIMARY KEY ("id")
    )`,
    "Create GiftCardBundle table"
  );

  await execute(
    `CREATE INDEX "GiftCardBundle_shop_isActive_idx" ON "GiftCardBundle"("shop", "isActive")`,
    "Create GiftCardBundle shop/isActive index"
  );

  await execute(
    `ALTER TABLE "GiftCardBundle" ADD CONSTRAINT "GiftCardBundle_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    "Create GiftCardBundle tier foreign key"
  );

  // Record migration in _prisma_migrations table
  const migrationId = "20250122_add_gift_card_system";
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
