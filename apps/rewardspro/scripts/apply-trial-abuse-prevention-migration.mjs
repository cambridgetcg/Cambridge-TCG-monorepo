#!/usr/bin/env node

/**
 * Migration Script for Trial Abuse Prevention
 *
 * Adds trial tracking fields to AppSubscription:
 * - hasUsedTrial, firstTrialStartedAt, totalTrialDaysUsed, lastTrialPlanId
 *
 * Creates TrialAuditLog table for tracking trial grant attempts
 *
 * Date: 2024-12-23
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

async function applyTrialAbusePreventionMigration() {
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

  console.log("🚀 Applying Trial Abuse Prevention Migration to Aurora Database\n");
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
    // AppSubscription trial tracking fields
    {
      name: "Add hasUsedTrial column to AppSubscription",
      sql: `ALTER TABLE "AppSubscription" ADD COLUMN IF NOT EXISTS "hasUsedTrial" BOOLEAN NOT NULL DEFAULT false;`
    },
    {
      name: "Add firstTrialStartedAt column to AppSubscription",
      sql: `ALTER TABLE "AppSubscription" ADD COLUMN IF NOT EXISTS "firstTrialStartedAt" TIMESTAMPTZ;`
    },
    {
      name: "Add totalTrialDaysUsed column to AppSubscription",
      sql: `ALTER TABLE "AppSubscription" ADD COLUMN IF NOT EXISTS "totalTrialDaysUsed" INTEGER NOT NULL DEFAULT 0;`
    },
    {
      name: "Add lastTrialPlanId column to AppSubscription",
      sql: `ALTER TABLE "AppSubscription" ADD COLUMN IF NOT EXISTS "lastTrialPlanId" TEXT;`
    },
    // Backfill existing subscriptions that have used trials
    {
      name: "Backfill hasUsedTrial for existing subscriptions with trial data",
      sql: `UPDATE "AppSubscription" SET "hasUsedTrial" = true, "firstTrialStartedAt" = "createdAt", "totalTrialDaysUsed" = COALESCE("trialDays", 0) WHERE "trialDays" IS NOT NULL AND "trialDays" > 0;`
    },
    // Create TrialAuditLog table
    {
      name: "Create TrialAuditLog table",
      sql: `CREATE TABLE IF NOT EXISTS "TrialAuditLog" (
        "id" TEXT NOT NULL,
        "shop" TEXT NOT NULL,
        "planId" TEXT NOT NULL,
        "planName" TEXT,
        "trialDaysRequested" INTEGER NOT NULL,
        "trialDaysGranted" INTEGER NOT NULL DEFAULT 0,
        "previousPlanId" TEXT,
        "previousPlanName" TEXT,
        "wasInTrial" BOOLEAN NOT NULL DEFAULT false,
        "wasBlocked" BOOLEAN NOT NULL DEFAULT false,
        "blockReason" TEXT,
        "eligibilityCheck" JSONB,
        "requestSource" TEXT,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT "TrialAuditLog_pkey" PRIMARY KEY ("id")
      );`
    },
    {
      name: "Add index for shop on TrialAuditLog",
      sql: `CREATE INDEX IF NOT EXISTS "TrialAuditLog_shop_idx" ON "TrialAuditLog"("shop");`
    },
    {
      name: "Add index for shop + createdAt on TrialAuditLog",
      sql: `CREATE INDEX IF NOT EXISTS "TrialAuditLog_shop_createdAt_idx" ON "TrialAuditLog"("shop", "createdAt");`
    },
    {
      name: "Add index for wasBlocked on TrialAuditLog",
      sql: `CREATE INDEX IF NOT EXISTS "TrialAuditLog_wasBlocked_idx" ON "TrialAuditLog"("wasBlocked");`
    },
    {
      name: "Add index for createdAt on TrialAuditLog",
      sql: `CREATE INDEX IF NOT EXISTS "TrialAuditLog_createdAt_idx" ON "TrialAuditLog"("createdAt");`
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
    const migrationName = "20251223_add_trial_abuse_prevention";
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
    console.log("\n🎉 Trial Abuse Prevention migration completed!");
    console.log("\nSummary:");
    console.log("  - Added hasUsedTrial, firstTrialStartedAt, totalTrialDaysUsed, lastTrialPlanId to AppSubscription");
    console.log("  - Created TrialAuditLog table with indexes");
    console.log("  - Backfilled existing subscriptions with trial data");

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

applyTrialAbusePreventionMigration();
