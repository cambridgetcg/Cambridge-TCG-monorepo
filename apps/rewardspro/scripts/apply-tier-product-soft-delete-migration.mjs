#!/usr/bin/env node

/**
 * Migration Script for Tier Product Soft Delete
 * Adds deletedAt, deletedBy, deletionReason columns to TierProduct table
 * Creates TierProductAuditLog table for tracking changes
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

async function applyTierProductSoftDeleteMigration() {
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

  console.log("🚀 Applying Tier Product Soft Delete Migration to Aurora Database\n");
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
    {
      name: "Add deletedAt column to TierProduct",
      sql: `ALTER TABLE "TierProduct" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;`
    },
    {
      name: "Add deletedBy column to TierProduct",
      sql: `ALTER TABLE "TierProduct" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;`
    },
    {
      name: "Add deletionReason column to TierProduct",
      sql: `ALTER TABLE "TierProduct" ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;`
    },
    {
      name: "Add index for soft delete queries",
      sql: `CREATE INDEX IF NOT EXISTS "TierProduct_shop_deletedAt_idx" ON "TierProduct"("shop", "deletedAt");`
    },
    {
      name: "Create TierProductAuditLog table",
      sql: `CREATE TABLE IF NOT EXISTS "TierProductAuditLog" (
        "id" TEXT NOT NULL,
        "shop" TEXT NOT NULL,
        "tierProductId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "performedBy" TEXT,
        "previousState" JSONB,
        "newState" JSONB,
        "metadata" JSONB,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT "TierProductAuditLog_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "TierProductAuditLog_tierProductId_fkey"
          FOREIGN KEY ("tierProductId")
          REFERENCES "TierProduct"("id")
          ON DELETE CASCADE
          ON UPDATE CASCADE
      );`
    },
    {
      name: "Add index for shop + tierProductId queries on audit log",
      sql: `CREATE INDEX IF NOT EXISTS "TierProductAuditLog_shop_tierProductId_idx" ON "TierProductAuditLog"("shop", "tierProductId");`
    },
    {
      name: "Add index for shop + action queries on audit log",
      sql: `CREATE INDEX IF NOT EXISTS "TierProductAuditLog_shop_action_idx" ON "TierProductAuditLog"("shop", "action");`
    },
    {
      name: "Add index for createdAt queries on audit log",
      sql: `CREATE INDEX IF NOT EXISTS "TierProductAuditLog_createdAt_idx" ON "TierProductAuditLog"("createdAt");`
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
    const migrationName = "20251223_add_tier_product_soft_delete";
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
    console.log("\n🎉 Tier Product Soft Delete migration completed!");

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

applyTierProductSoftDeleteMigration();
