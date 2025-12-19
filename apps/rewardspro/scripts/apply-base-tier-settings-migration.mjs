#!/usr/bin/env node

/**
 * Migration Script for Base Tier Settings Fields
 * Adds autoAssignBaseTier and defaultBaseTierId to ShopSettings table
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

async function applyBaseTierSettingsMigration() {
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

  console.log("🚀 Applying Base Tier Settings Migration to Aurora Database\n");
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
      name: "Add autoAssignBaseTier column",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "autoAssignBaseTier" BOOLEAN DEFAULT true;`
    },
    {
      name: "Add defaultBaseTierId column",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "defaultBaseTierId" TEXT;`
    },
    {
      name: "Add foreign key constraint for defaultBaseTierId",
      sql: `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ShopSettings_defaultBaseTierId_fkey'
    AND table_name = 'ShopSettings'
  ) THEN
    ALTER TABLE "ShopSettings"
    ADD CONSTRAINT "ShopSettings_defaultBaseTierId_fkey"
    FOREIGN KEY ("defaultBaseTierId") REFERENCES "Tier"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;`
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
    const migrationName = "20251219_add_base_tier_settings";
    const checksum = crypto.createHash("sha256").update(statements.map(s => s.sql).join("\n")).digest("hex");
    const migrationId = crypto.randomUUID();

    console.log("📝 Recording migration in _prisma_migrations table...");

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), :steps)
            ON CONFLICT (id) DO NOTHING`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: checksum }},
        { name: "name", value: { stringValue: migrationName }},
        { name: "steps", value: { longValue: statements.length }},
      ],
      transactionId,
    }));

    console.log("   ✅ Migration recorded\n");

    // Commit transaction
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Transaction committed successfully!");
    console.log("\n🎉 Base tier settings migration completed!");

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

applyBaseTierSettingsMigration();
