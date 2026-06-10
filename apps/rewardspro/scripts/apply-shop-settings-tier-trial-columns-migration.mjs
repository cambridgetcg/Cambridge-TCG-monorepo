#!/usr/bin/env node

/**
 * Migration Script for ShopSettings Tier Trial Settings
 *
 * Adds configurable tier trial abuse prevention settings to ShopSettings:
 * - maxLifetimeTrialDays (default: 30)
 * - minDaysBetweenTrials (default: 30)
 * - allowMultipleTierTrials (default: false)
 *
 * Date: 2025-01-22
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try multiple env file locations
const envPaths = [
  join(__dirname, '..', '.env.production'),
  join(__dirname, '..', '.env.local'),
  join(__dirname, '..', '.env'),
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log(`Loaded env from: ${envPath}`);
    break;
  }
}

async function applyShopSettingsTierTrialColumnsMigration() {
  // Extract region from resource ARN to ensure consistency
  const resourceArn = process.env.AURORA_RESOURCE_ARN;
  const arnRegionMatch = resourceArn?.match(/arn:aws:rds:([^:]+):/);
  const region = arnRegionMatch ? arnRegionMatch[1] : (process.env.AWS_REGION || "eu-north-1");

  console.log("   AWS Region:", region);

  const client = new RDSDataClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const secretArn = process.env.AURORA_SECRET_ARN;
  const database = process.env.AURORA_DATABASE_NAME || "rewardspro";

  console.log("🚀 Applying ShopSettings Tier Trial Settings Migration to Aurora Database\n");
  console.log("   Resource ARN:", resourceArn);
  console.log("   Secret ARN:", secretArn ? secretArn.substring(0, 50) + "..." : "undefined");
  console.log("   Database:", database);
  console.log("");

  // Start transaction for atomicity
  let transactionId;
  try {
    const txResult = await client.send(new BeginTransactionCommand({
      resourceArn,
      secretArn,
      database,
    }));
    transactionId = txResult.transactionId;
    console.log("✅ Transaction started\n");
  } catch (error) {
    console.error("❌ Failed to start transaction:", error.message);
    process.exit(1);
  }

  const statements = [
    // ShopSettings tier trial configuration columns
    {
      name: "Add maxLifetimeTrialDays column to ShopSettings",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "maxLifetimeTrialDays" INTEGER DEFAULT 30;`
    },
    {
      name: "Add minDaysBetweenTrials column to ShopSettings",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "minDaysBetweenTrials" INTEGER DEFAULT 30;`
    },
    {
      name: "Add allowMultipleTierTrials column to ShopSettings",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "allowMultipleTierTrials" BOOLEAN DEFAULT false;`
    },
    // Set NOT NULL with default for existing records
    {
      name: "Backfill maxLifetimeTrialDays for existing records",
      sql: `UPDATE "ShopSettings" SET "maxLifetimeTrialDays" = 30 WHERE "maxLifetimeTrialDays" IS NULL;`
    },
    {
      name: "Backfill minDaysBetweenTrials for existing records",
      sql: `UPDATE "ShopSettings" SET "minDaysBetweenTrials" = 30 WHERE "minDaysBetweenTrials" IS NULL;`
    },
    {
      name: "Backfill allowMultipleTierTrials for existing records",
      sql: `UPDATE "ShopSettings" SET "allowMultipleTierTrials" = false WHERE "allowMultipleTierTrials" IS NULL;`
    },
    // Add comments for documentation
    {
      name: "Add comment to maxLifetimeTrialDays column",
      sql: `COMMENT ON COLUMN "ShopSettings"."maxLifetimeTrialDays" IS 'Maximum total trial days a customer can use across all tiers';`
    },
    {
      name: "Add comment to minDaysBetweenTrials column",
      sql: `COMMENT ON COLUMN "ShopSettings"."minDaysBetweenTrials" IS 'Minimum days between trial attempts (prevents rapid switching)';`
    },
    {
      name: "Add comment to allowMultipleTierTrials column",
      sql: `COMMENT ON COLUMN "ShopSettings"."allowMultipleTierTrials" IS 'Whether to allow trials on different tiers after using one';`
    }
  ];

  try {
    for (const statement of statements) {
      console.log(`📝 ${statement.name}...`);

      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: statement.sql,
        transactionId,
      }));

      console.log(`   ✅ Done\n`);
    }

    // Record migration in _prisma_migrations table
    const migrationName = "20250118_add_tier_trial_settings";
    const checksum = crypto.createHash("sha256").update(statements.map(s => s.sql).join("\n")).digest("hex");
    const migrationId = crypto.randomUUID();

    console.log("📝 Recording migration in _prisma_migrations table...");

    // Check if migration already recorded
    const checkResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT COUNT(*) as count FROM "_prisma_migrations" WHERE migration_name = :name`,
      parameters: [
        { name: "name", value: { stringValue: migrationName }},
      ],
      transactionId,
    }));

    const count = checkResult.records?.[0]?.[0]?.longValue || 0;

    if (count === 0) {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `INSERT INTO "_prisma_migrations"
              (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
              VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), :steps)`,
        parameters: [
          { name: "id", value: { stringValue: migrationId }},
          { name: "checksum", value: { stringValue: checksum }},
          { name: "name", value: { stringValue: migrationName }},
          { name: "steps", value: { longValue: statements.length }},
        ],
        transactionId,
      }));
      console.log("   ✅ Migration recorded\n");
    } else {
      console.log("   ⏭️  Migration already recorded, skipping\n");
    }

    // Commit transaction
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Transaction committed successfully!");
    console.log("\n🎉 ShopSettings Tier Trial Settings migration completed!");
    console.log("\nSummary:");
    console.log("  - Added maxLifetimeTrialDays (INTEGER, default 30)");
    console.log("  - Added minDaysBetweenTrials (INTEGER, default 30)");
    console.log("  - Added allowMultipleTierTrials (BOOLEAN, default false)");
    console.log("  - Backfilled existing records with default values");

  } catch (error) {
    console.error("❌ Error during migration:", error.message);
    console.log("\n⏮️  Rolling back transaction...");

    try {
      await client.send(new RollbackTransactionCommand({
        resourceArn,
        secretArn,
        transactionId,
      }));
      console.log("✅ Transaction rolled back");
    } catch (rollbackError) {
      console.error("❌ Rollback failed:", rollbackError.message);
    }

    process.exit(1);
  }
}

applyShopSettingsTierTrialColumnsMigration();
