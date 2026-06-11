#!/usr/bin/env node

/**
 * Migration Script for SendGrid Domain Authentication
 * Uses AWS Data API to add SendGridDomain table and update EmailSettings
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

async function applySendGridDomainMigration() {
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

  console.log("🚀 Applying SendGrid Domain Migration to Aurora Database\n");
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
    // Step 1: Create DomainStatus enum if not exists
    console.log("Step 1: Creating DomainStatus enum...");
    try {
      const enumCheckResult = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT typname FROM pg_type WHERE typname = 'DomainStatus'`,
        transactionId,
      }));

      if (!enumCheckResult.records || enumCheckResult.records.length === 0) {
        await client.send(new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: `CREATE TYPE "DomainStatus" AS ENUM (
            'PENDING',
            'DNS_PENDING',
            'VERIFYING',
            'VERIFIED',
            'FAILED'
          )`,
          transactionId,
        }));
        console.log("   ✅ DomainStatus enum created");
      } else {
        console.log("   ⏭️  DomainStatus enum already exists");
      }
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  DomainStatus enum already exists");
      } else {
        throw error;
      }
    }

    // Step 2: Create SendingMode enum if not exists
    console.log("\nStep 2: Creating SendingMode enum...");
    try {
      const enumCheckResult = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT typname FROM pg_type WHERE typname = 'SendingMode'`,
        transactionId,
      }));

      if (!enumCheckResult.records || enumCheckResult.records.length === 0) {
        await client.send(new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: `CREATE TYPE "SendingMode" AS ENUM (
            'SHARED',
            'CUSTOM_DOMAIN'
          )`,
          transactionId,
        }));
        console.log("   ✅ SendingMode enum created");
      } else {
        console.log("   ⏭️  SendingMode enum already exists");
      }
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  SendingMode enum already exists");
      } else {
        throw error;
      }
    }

    // Step 3: Create SendGridDomain table if not exists
    console.log("\nStep 3: Creating SendGridDomain table...");
    try {
      const tableCheckResult = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT table_name FROM information_schema.tables WHERE table_name = 'SendGridDomain'`,
        transactionId,
      }));

      if (!tableCheckResult.records || tableCheckResult.records.length === 0) {
        await client.send(new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: `CREATE TABLE "SendGridDomain" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "domain" TEXT NOT NULL,
            "subdomain" TEXT,
            "sendgridDomainId" TEXT,
            "sendgridDnsRecords" JSONB,
            "status" "DomainStatus" NOT NULL DEFAULT 'PENDING',
            "verifiedAt" TIMESTAMP(3),
            "lastCheckedAt" TIMESTAMP(3),
            "dkimVerified" BOOLEAN NOT NULL DEFAULT false,
            "spfVerified" BOOLEAN NOT NULL DEFAULT false,
            "dmarcConfigured" BOOLEAN NOT NULL DEFAULT false,
            "lastError" TEXT,
            "errorCount" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT "SendGridDomain_pkey" PRIMARY KEY ("id")
          )`,
          transactionId,
        }));
        console.log("   ✅ SendGridDomain table created");
      } else {
        console.log("   ⏭️  SendGridDomain table already exists");
      }
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  SendGridDomain table already exists");
      } else {
        throw error;
      }
    }

    // Step 4: Create indexes for SendGridDomain
    console.log("\nStep 4: Creating indexes for SendGridDomain...");

    // Unique index on shop + domain
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS "SendGridDomain_shop_domain_key" ON "SendGridDomain"("shop", "domain")`,
        transactionId,
      }));
      console.log("   ✅ Unique index on shop+domain created");
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  Unique index already exists");
      } else {
        throw error;
      }
    }

    // Index on shop + status
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `CREATE INDEX IF NOT EXISTS "SendGridDomain_shop_status_idx" ON "SendGridDomain"("shop", "status")`,
        transactionId,
      }));
      console.log("   ✅ Index on shop+status created");
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  Index already exists");
      } else {
        throw error;
      }
    }

    // Step 5: Add sendingMode column to EmailSettings if not exists
    console.log("\nStep 5: Adding sendingMode to EmailSettings...");
    try {
      const columnCheck = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT column_name FROM information_schema.columns
              WHERE table_name = 'EmailSettings' AND column_name = 'sendingMode'`,
        transactionId,
      }));

      if (!columnCheck.records || columnCheck.records.length === 0) {
        await client.send(new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: `ALTER TABLE "EmailSettings" ADD COLUMN "sendingMode" "SendingMode" NOT NULL DEFAULT 'SHARED'`,
          transactionId,
        }));
        console.log("   ✅ sendingMode column added");
      } else {
        console.log("   ⏭️  sendingMode column already exists");
      }
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  sendingMode column already exists");
      } else {
        throw error;
      }
    }

    // Step 6: Add customDomainId column to EmailSettings if not exists
    console.log("\nStep 6: Adding customDomainId to EmailSettings...");
    try {
      const columnCheck = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT column_name FROM information_schema.columns
              WHERE table_name = 'EmailSettings' AND column_name = 'customDomainId'`,
        transactionId,
      }));

      if (!columnCheck.records || columnCheck.records.length === 0) {
        await client.send(new ExecuteStatementCommand({
          resourceArn,
          secretArn,
          database,
          sql: `ALTER TABLE "EmailSettings" ADD COLUMN "customDomainId" TEXT`,
          transactionId,
        }));
        console.log("   ✅ customDomainId column added");
      } else {
        console.log("   ⏭️  customDomainId column already exists");
      }
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  customDomainId column already exists");
      } else {
        throw error;
      }
    }

    // Step 7: Add foreign key constraint
    console.log("\nStep 7: Adding foreign key constraint...");
    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `ALTER TABLE "EmailSettings"
              ADD CONSTRAINT "EmailSettings_customDomainId_fkey"
              FOREIGN KEY ("customDomainId")
              REFERENCES "SendGridDomain"("id")
              ON DELETE SET NULL
              ON UPDATE CASCADE`,
        transactionId,
      }));
      console.log("   ✅ Foreign key constraint added");
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log("   ⏭️  Foreign key constraint already exists");
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
            WHERE table_name IN ('SendGridDomain', 'EmailSettings')
            ORDER BY table_name, ordinal_position`,
    }));

    console.log("\n📋 SendGridDomain and EmailSettings columns:");
    verifyResult.records?.forEach(record => {
      const col = record[0]?.stringValue;
      const type = record[1]?.stringValue;
      const nullable = record[2]?.stringValue;
      console.log(`   ${col}: ${type} (nullable: ${nullable})`);
    });

    console.log("\n🎉 SendGrid Domain migration completed successfully!");

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

applySendGridDomainMigration();
