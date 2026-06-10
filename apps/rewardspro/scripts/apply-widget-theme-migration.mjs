#!/usr/bin/env node

/**
 * Migration Script for Widget Theme Settings
 * Adds widgetThemeMode enum and widget theme columns to ShopSettings table
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

async function applyWidgetThemeMigration() {
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

  console.log("🚀 Applying Widget Theme Settings Migration to Aurora Database\n");
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
      name: "Create WidgetThemeMode enum if not exists",
      sql: `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WidgetThemeMode') THEN
    CREATE TYPE "WidgetThemeMode" AS ENUM ('LIGHT', 'DARK', 'CUSTOM');
  END IF;
END $$;`
    },
    {
      name: "Add widgetThemeMode column",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "widgetThemeMode" "WidgetThemeMode" DEFAULT 'LIGHT';`
    },
    {
      name: "Add widgetPrimaryColor column",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "widgetPrimaryColor" TEXT DEFAULT '#5C6AC4';`
    },
    {
      name: "Add widgetBackgroundColor column",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "widgetBackgroundColor" TEXT DEFAULT '#FFFFFF';`
    },
    {
      name: "Add widgetTextColor column",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "widgetTextColor" TEXT DEFAULT '#212B36';`
    },
    {
      name: "Add widgetAccentColor column",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "widgetAccentColor" TEXT DEFAULT '#008060';`
    },
    {
      name: "Add widgetBorderRadius column",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "widgetBorderRadius" INTEGER DEFAULT 12;`
    },
    {
      name: "Add widgetFontFamily column",
      sql: `ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "widgetFontFamily" TEXT DEFAULT 'inherit';`
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

    // Record migration in _prisma_migrations table (check if exists first)
    const migrationName = "20251129_add_widget_theme_settings";
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
    console.log("\n🎉 Widget theme settings migration completed!");

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

applyWidgetThemeMigration();
