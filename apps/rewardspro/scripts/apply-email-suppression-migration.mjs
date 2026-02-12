#!/usr/bin/env node

/**
 * Migration Script for Email Suppression + PendingAutomation
 * Uses AWS Data API to:
 * 1. Add acceptsMarketing, emailSuppressed, suppressedAt, suppressionReason to Customer
 * 2. Create PendingAutomation table for delayed automation executions
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

async function applyEmailSuppressionMigration() {
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

  console.log("🚀 Applying Email Suppression + PendingAutomation Migration\n");
  console.log("   Resource ARN:", resourceArn);
  console.log("   Database:", database);
  console.log("");

  // Start transaction
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

  async function exec(sql) {
    return client.send(new ExecuteStatementCommand({
      resourceArn, secretArn, database, sql, transactionId,
    }));
  }

  async function columnExists(table, column) {
    const result = await client.send(new ExecuteStatementCommand({
      resourceArn, secretArn, database, transactionId,
      sql: `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}'`,
    }));
    return result.records && result.records.length > 0;
  }

  async function tableExists(table) {
    const result = await client.send(new ExecuteStatementCommand({
      resourceArn, secretArn, database, transactionId,
      sql: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}'`,
    }));
    return result.records && result.records.length > 0;
  }

  try {
    // Step 1: Add acceptsMarketing to Customer
    console.log("Step 1: Adding acceptsMarketing to Customer...");
    if (await columnExists("Customer", "acceptsMarketing")) {
      console.log("   ⏭️  acceptsMarketing already exists");
    } else {
      await exec(`ALTER TABLE "Customer" ADD COLUMN "acceptsMarketing" BOOLEAN NOT NULL DEFAULT true`);
      console.log("   ✅ acceptsMarketing added (default: true)");
    }

    // Step 2: Add emailSuppressed to Customer
    console.log("\nStep 2: Adding emailSuppressed to Customer...");
    if (await columnExists("Customer", "emailSuppressed")) {
      console.log("   ⏭️  emailSuppressed already exists");
    } else {
      await exec(`ALTER TABLE "Customer" ADD COLUMN "emailSuppressed" BOOLEAN NOT NULL DEFAULT false`);
      console.log("   ✅ emailSuppressed added (default: false)");
    }

    // Step 3: Add suppressedAt to Customer
    console.log("\nStep 3: Adding suppressedAt to Customer...");
    if (await columnExists("Customer", "suppressedAt")) {
      console.log("   ⏭️  suppressedAt already exists");
    } else {
      await exec(`ALTER TABLE "Customer" ADD COLUMN "suppressedAt" TIMESTAMP(3)`);
      console.log("   ✅ suppressedAt added (nullable)");
    }

    // Step 4: Add suppressionReason to Customer
    console.log("\nStep 4: Adding suppressionReason to Customer...");
    if (await columnExists("Customer", "suppressionReason")) {
      console.log("   ⏭️  suppressionReason already exists");
    } else {
      await exec(`ALTER TABLE "Customer" ADD COLUMN "suppressionReason" VARCHAR(255)`);
      console.log("   ✅ suppressionReason added (nullable, varchar(255))");
    }

    // Step 5: Create PendingAutomation table
    console.log("\nStep 5: Creating PendingAutomation table...");
    if (await tableExists("PendingAutomation")) {
      console.log("   ⏭️  PendingAutomation table already exists");
    } else {
      await exec(`CREATE TABLE "PendingAutomation" (
        "id" TEXT NOT NULL,
        "shop" TEXT NOT NULL,
        "automationId" TEXT NOT NULL,
        "automationName" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "recipientEmail" VARCHAR(255) NOT NULL,
        "recipientFirstName" VARCHAR(255),
        "recipientLastName" VARCHAR(255),
        "triggerType" TEXT NOT NULL,
        "triggerData" JSONB,
        "executeAt" TIMESTAMP(3) NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "sentAt" TIMESTAMP(3),
        "error" TEXT,
        CONSTRAINT "PendingAutomation_pkey" PRIMARY KEY ("id")
      )`);
      console.log("   ✅ PendingAutomation table created");
    }

    // Step 6: Create indexes for PendingAutomation
    console.log("\nStep 6: Creating indexes for PendingAutomation...");
    try {
      await exec(`CREATE INDEX IF NOT EXISTS "PendingAutomation_status_executeAt_idx" ON "PendingAutomation"("status", "executeAt")`);
      console.log("   ✅ Index on status+executeAt created");
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  Index already exists");
      } else {
        throw error;
      }
    }

    try {
      await exec(`CREATE INDEX IF NOT EXISTS "PendingAutomation_shop_idx" ON "PendingAutomation"("shop")`);
      console.log("   ✅ Index on shop created");
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  Index already exists");
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

    // Verify
    console.log("Verifying Customer columns...");
    const verifyCustomer = await client.send(new ExecuteStatementCommand({
      resourceArn, secretArn, database,
      sql: `SELECT column_name, data_type, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'Customer'
            AND column_name IN ('acceptsMarketing', 'emailSuppressed', 'suppressedAt', 'suppressionReason')
            ORDER BY column_name`,
    }));
    verifyCustomer.records?.forEach(record => {
      const col = record[0]?.stringValue;
      const type = record[1]?.stringValue;
      const def = record[2]?.stringValue || 'null';
      const nullable = record[3]?.stringValue;
      console.log(`   ${col}: ${type} (default: ${def}, nullable: ${nullable})`);
    });

    console.log("\nVerifying PendingAutomation table...");
    const verifyPA = await client.send(new ExecuteStatementCommand({
      resourceArn, secretArn, database,
      sql: `SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'PendingAutomation'
            ORDER BY ordinal_position`,
    }));
    verifyPA.records?.forEach(record => {
      const col = record[0]?.stringValue;
      const type = record[1]?.stringValue;
      const nullable = record[2]?.stringValue;
      console.log(`   ${col}: ${type} (nullable: ${nullable})`);
    });

    console.log("\n🎉 Email Suppression + PendingAutomation migration completed!");

  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);

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

applyEmailSuppressionMigration();
