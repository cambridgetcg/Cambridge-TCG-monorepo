#!/usr/bin/env node

/**
 * Migration Script for EmailTemplate columns
 * Adds missing columns: previewText, bodyHtml, bodyText, htmlContent
 * to align with code expectations
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

async function applyEmailTemplateColumnsMigration() {
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

  console.log("🚀 Applying EmailTemplate Columns Migration to Aurora Database\n");
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

  try {
    // Step 1: Add previewText column if not exists
    console.log("Step 1: Adding previewText column...");
    try {
      const columnCheck = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT column_name FROM information_schema.columns
              WHERE table_name = 'EmailTemplate' AND column_name = 'previewText'`,
        transactionId,
      }));

      if (!columnCheck.records || columnCheck.records.length === 0) {
        await client.send(new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: `ALTER TABLE "EmailTemplate" ADD COLUMN "previewText" TEXT`,
          transactionId,
        }));
        console.log("   ✅ previewText column added");
      } else {
        console.log("   ⏭️  previewText column already exists");
      }
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  previewText column already exists");
      } else {
        throw error;
      }
    }

    // Step 2: Add bodyHtml column if not exists
    console.log("\nStep 2: Adding bodyHtml column...");
    try {
      const columnCheck = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT column_name FROM information_schema.columns
              WHERE table_name = 'EmailTemplate' AND column_name = 'bodyHtml'`,
        transactionId,
      }));

      if (!columnCheck.records || columnCheck.records.length === 0) {
        await client.send(new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: `ALTER TABLE "EmailTemplate" ADD COLUMN "bodyHtml" TEXT`,
          transactionId,
        }));
        console.log("   ✅ bodyHtml column added");
      } else {
        console.log("   ⏭️  bodyHtml column already exists");
      }
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  bodyHtml column already exists");
      } else {
        throw error;
      }
    }

    // Step 3: Add bodyText column if not exists
    console.log("\nStep 3: Adding bodyText column...");
    try {
      const columnCheck = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT column_name FROM information_schema.columns
              WHERE table_name = 'EmailTemplate' AND column_name = 'bodyText'`,
        transactionId,
      }));

      if (!columnCheck.records || columnCheck.records.length === 0) {
        await client.send(new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: `ALTER TABLE "EmailTemplate" ADD COLUMN "bodyText" TEXT`,
          transactionId,
        }));
        console.log("   ✅ bodyText column added");
      } else {
        console.log("   ⏭️  bodyText column already exists");
      }
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  bodyText column already exists");
      } else {
        throw error;
      }
    }

    // Step 4: Add htmlContent column if not exists (used in campaigns)
    console.log("\nStep 4: Adding htmlContent column...");
    try {
      const columnCheck = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT column_name FROM information_schema.columns
              WHERE table_name = 'EmailTemplate' AND column_name = 'htmlContent'`,
        transactionId,
      }));

      if (!columnCheck.records || columnCheck.records.length === 0) {
        await client.send(new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: `ALTER TABLE "EmailTemplate" ADD COLUMN "htmlContent" TEXT`,
          transactionId,
        }));
        console.log("   ✅ htmlContent column added");
      } else {
        console.log("   ⏭️  htmlContent column already exists");
      }
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  htmlContent column already exists");
      } else {
        throw error;
      }
    }

    // Commit transaction
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
    console.log("\n✅ Migration committed successfully!\n");

    // Verify the migration
    console.log("Verifying migration...");
    const verifyResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'EmailTemplate'
            ORDER BY ordinal_position`,
    }));

    console.log("\n📋 EmailTemplate columns:");
    verifyResult.records?.forEach(record => {
      const col = record[0]?.stringValue;
      const type = record[1]?.stringValue;
      const nullable = record[2]?.stringValue;
      console.log(`   ${col}: ${type} (nullable: ${nullable})`);
    });

    console.log("\n🎉 EmailTemplate columns migration completed successfully!");

  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    console.error("Full error:", error);

    // Rollback transaction
    try {
      await client.send(new RollbackTransactionCommand({
        resourceArn,
        secretArn,
        transactionId,
      }));
      console.log("🔄 Transaction rolled back");
    } catch (rollbackError) {
      console.error("Failed to rollback:", rollbackError.message);
    }

    process.exit(1);
  }
}

applyEmailTemplateColumnsMigration();
