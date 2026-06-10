#!/usr/bin/env node

/**
 * Migration Script for Tier Subscription Trial Abuse Prevention
 *
 * Adds trial tracking fields to Customer model:
 * - hasUsedTierTrial, firstTierTrialStartedAt, totalTierTrialDaysUsed,
 *   lastTierTrialTierId, tierTrialHistory
 *
 * Creates TierTrialAuditLog table for tracking tier trial grant attempts
 *
 * Date: 2025-01-07
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

async function applyTierTrialAbusePreventionMigration() {
  const client = new RDSDataClient({
    region: process.env.AWS_REGION || "eu-north-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const resourceArn = process.env.AURORA_RESOURCE_ARN;
  const secretArn = process.env.AURORA_SECRET_ARN;
  const database = process.env.AURORA_DATABASE_NAME || "rewardspro";

  console.log("🚀 Applying Tier Subscription Trial Abuse Prevention Migration to Aurora Database\n");
  console.log("   Resource ARN:", resourceArn);
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
    // Customer tier trial tracking fields
    {
      name: "Add hasUsedTierTrial column to Customer",
      sql: `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "hasUsedTierTrial" BOOLEAN NOT NULL DEFAULT false;`
    },
    {
      name: "Add firstTierTrialStartedAt column to Customer",
      sql: `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "firstTierTrialStartedAt" TIMESTAMPTZ;`
    },
    {
      name: "Add totalTierTrialDaysUsed column to Customer",
      sql: `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "totalTierTrialDaysUsed" INTEGER NOT NULL DEFAULT 0;`
    },
    {
      name: "Add lastTierTrialTierId column to Customer",
      sql: `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastTierTrialTierId" TEXT;`
    },
    {
      name: "Add tierTrialHistory column to Customer",
      sql: `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tierTrialHistory" JSONB;`
    },
    // Create TierTrialAuditLog table
    {
      name: "Create TierTrialAuditLog table",
      sql: `CREATE TABLE IF NOT EXISTS "TierTrialAuditLog" (
        "id" TEXT NOT NULL,
        "shop" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "tierId" TEXT NOT NULL,
        "tierName" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "wasBlocked" BOOLEAN NOT NULL DEFAULT false,
        "blockReason" TEXT,
        "trialDaysRequested" INTEGER NOT NULL,
        "trialDaysGranted" INTEGER NOT NULL DEFAULT 0,
        "previousTierId" TEXT,
        "previousTierName" TEXT,
        "wasInTrial" BOOLEAN NOT NULL DEFAULT false,
        "subscriptionId" TEXT,
        "requestSource" TEXT,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT "TierTrialAuditLog_pkey" PRIMARY KEY ("id")
      );`
    },
    // Add foreign key constraint to Customer
    {
      name: "Add foreign key constraint from TierTrialAuditLog to Customer",
      sql: `DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'TierTrialAuditLog_customerId_fkey'
          ) THEN
            ALTER TABLE "TierTrialAuditLog"
            ADD CONSTRAINT "TierTrialAuditLog_customerId_fkey"
            FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;`
    },
    // Create indexes
    {
      name: "Add index for shop on TierTrialAuditLog",
      sql: `CREATE INDEX IF NOT EXISTS "TierTrialAuditLog_shop_idx" ON "TierTrialAuditLog"("shop");`
    },
    {
      name: "Add index for customerId on TierTrialAuditLog",
      sql: `CREATE INDEX IF NOT EXISTS "TierTrialAuditLog_customerId_idx" ON "TierTrialAuditLog"("customerId");`
    },
    {
      name: "Add index for shop + customerId on TierTrialAuditLog",
      sql: `CREATE INDEX IF NOT EXISTS "TierTrialAuditLog_shop_customerId_idx" ON "TierTrialAuditLog"("shop", "customerId");`
    },
    {
      name: "Add index for shop + createdAt on TierTrialAuditLog",
      sql: `CREATE INDEX IF NOT EXISTS "TierTrialAuditLog_shop_createdAt_idx" ON "TierTrialAuditLog"("shop", "createdAt");`
    },
    {
      name: "Add index for wasBlocked on TierTrialAuditLog",
      sql: `CREATE INDEX IF NOT EXISTS "TierTrialAuditLog_wasBlocked_idx" ON "TierTrialAuditLog"("wasBlocked");`
    },
    {
      name: "Add index for createdAt on TierTrialAuditLog",
      sql: `CREATE INDEX IF NOT EXISTS "TierTrialAuditLog_createdAt_idx" ON "TierTrialAuditLog"("createdAt");`
    },
    // Backfill existing customers with tier subscriptions that had trials
    {
      name: "Backfill hasUsedTierTrial for existing customers with trial data",
      sql: `UPDATE "Customer" c
            SET "hasUsedTierTrial" = true,
                "firstTierTrialStartedAt" = ts."startDate",
                "totalTierTrialDaysUsed" = COALESCE(
                  EXTRACT(DAY FROM (COALESCE(ts."trialEndsAt", ts."startDate") - ts."startDate"))::INTEGER,
                  0
                )
            FROM "TierSubscription" ts
            WHERE ts."customerId" = c.id
              AND ts."trialEndsAt" IS NOT NULL
              AND c."hasUsedTierTrial" = false;`
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
    const migrationName = "20250107_add_tier_trial_abuse_prevention";
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
    console.log("\n🎉 Tier Subscription Trial Abuse Prevention migration completed!");
    console.log("\nSummary:");
    console.log("  - Added hasUsedTierTrial, firstTierTrialStartedAt, totalTierTrialDaysUsed,");
    console.log("    lastTierTrialTierId, tierTrialHistory to Customer table");
    console.log("  - Created TierTrialAuditLog table with indexes");
    console.log("  - Backfilled existing customers with tier trial data");

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

applyTierTrialAbusePreventionMigration();
