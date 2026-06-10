#!/usr/bin/env node

/**
 * Migration Script to Sync Prisma Schema with Aurora Database
 * Following the successful method documented in docs/03-deployment/successful-migration-method-guide.md
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from '@aws-sdk/client-rds-data';
import * as dotenv from 'dotenv';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const {
  AURORA_RESOURCE_ARN,
  AURORA_SECRET_ARN,
  AURORA_DATABASE_NAME,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
} = process.env;

// Validate environment variables
if (!AURORA_RESOURCE_ARN || !AURORA_SECRET_ARN || !AURORA_DATABASE_NAME) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Create RDS Data API client
const client = new RDSDataClient({
  region: AWS_REGION || 'eu-north-1',
  credentials: AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

async function applySchemaSyncMigration() {
  console.log('🚀 Applying Schema Sync Migration to Aurora Database\n');
  console.log(`   Resource ARN: ${AURORA_RESOURCE_ARN}`);
  console.log(`   Database: ${AURORA_DATABASE_NAME}`);
  console.log(`   Region: ${AWS_REGION || 'eu-north-1'}\n`);

  let transactionId = null;

  try {
    // Start transaction
    console.log('Starting transaction...');
    const beginResult = await client.send(new BeginTransactionCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
    }));
    transactionId = beginResult.transactionId;
    console.log('  ✓ Transaction started\n');

    // Execute migration steps
    await executeMigrationSteps(client, AURORA_RESOURCE_ARN, AURORA_SECRET_ARN, AURORA_DATABASE_NAME, transactionId);

    // Commit transaction
    console.log('\nCommitting transaction...');
    await client.send(new CommitTransactionCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      transactionId,
    }));
    console.log('  ✓ Transaction committed\n');

    console.log('✅ Migration completed successfully!\n');

    // Verify the changes
    await verifyMigration();

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);

    if (transactionId) {
      console.log('Rolling back transaction...');
      try {
        await client.send(new RollbackTransactionCommand({
          resourceArn: AURORA_RESOURCE_ARN,
          secretArn: AURORA_SECRET_ARN,
          transactionId,
        }));
        console.log('  ✓ Transaction rolled back\n');
      } catch (rollbackError) {
        console.error('Failed to rollback:', rollbackError.message);
      }
    }

    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

async function executeMigrationSteps(client, resourceArn, secretArn, database, transactionId) {
  console.log('Executing migration steps...\n');

  // Step 1: Create missing enums
  console.log('Step 1: Creating missing enums...');
  
  // PurchaseType enum
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `DO $$ 
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseType') THEN
              CREATE TYPE "PurchaseType" AS ENUM ('ONE_TIME', 'SUBSCRIPTION', 'BOTH');
            END IF;
          END $$`,
    transactionId,
  }));
  console.log('  ✓ PurchaseType enum created/verified');

  // PurchaseStatus enum
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `DO $$ 
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseStatus') THEN
              CREATE TYPE "PurchaseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');
            END IF;
          END $$`,
    transactionId,
  }));
  console.log('  ✓ PurchaseStatus enum created/verified');

  // BulkOperationType enum
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `DO $$ 
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BulkOperationType') THEN
              CREATE TYPE "BulkOperationType" AS ENUM ('PRICE_UPDATE', 'TIER_MIGRATION', 'STATUS_CHANGE', 'BULK_CANCEL');
            END IF;
          END $$`,
    transactionId,
  }));
  console.log('  ✓ BulkOperationType enum created/verified');

  // BulkOperationStatus enum
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `DO $$ 
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BulkOperationStatus') THEN
              CREATE TYPE "BulkOperationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL');
            END IF;
          END $$`,
    transactionId,
  }));
  console.log('  ✓ BulkOperationStatus enum created/verified\n');

  // Step 2: Create TierProduct table
  console.log('Step 2: Creating TierProduct table...');
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "TierProduct" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "shop" TEXT NOT NULL,
            "tierId" TEXT NOT NULL,
            "shopifyProductId" TEXT NOT NULL,
            "shopifyVariantId" TEXT,
            "sku" TEXT NOT NULL,
            "price" DECIMAL(10,2) NOT NULL,
            "purchaseType" "PurchaseType" NOT NULL DEFAULT 'ONE_TIME',
            "duration" "BillingInterval",
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "TierProduct_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log('  ✓ TierProduct table created');

  // Step 3: Add TierProduct constraints
  console.log('Step 3: Adding TierProduct constraints...');
  
  // Unique constraint
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `DO $$ 
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'TierProduct_shop_shopifyProductId_key'
            ) THEN
              ALTER TABLE "TierProduct" ADD CONSTRAINT "TierProduct_shop_shopifyProductId_key" 
                UNIQUE ("shop", "shopifyProductId");
            END IF;
          END $$`,
    transactionId,
  }));
  
  // Foreign key constraint
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `DO $$ 
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'TierProduct_tierId_fkey'
            ) THEN
              ALTER TABLE "TierProduct" ADD CONSTRAINT "TierProduct_tierId_fkey" 
                FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
            END IF;
          END $$`,
    transactionId,
  }));
  console.log('  ✓ TierProduct constraints added\n');

  // Step 4: Create TierProduct indexes
  console.log('Step 4: Creating TierProduct indexes...');
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "TierProduct_shop_tierId_idx" ON "TierProduct"("shop", "tierId")`,
    transactionId,
  }));
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "TierProduct_shopifyProductId_idx" ON "TierProduct"("shopifyProductId")`,
    transactionId,
  }));
  console.log('  ✓ TierProduct indexes created\n');

  // Step 5: Create TierPurchase table
  console.log('Step 5: Creating TierPurchase table...');
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "TierPurchase" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "shop" TEXT NOT NULL,
            "customerId" TEXT NOT NULL,
            "tierId" TEXT NOT NULL,
            "tierProductId" TEXT,
            "shopifyOrderId" TEXT NOT NULL,
            "shopifyLineItemId" TEXT,
            "purchasePrice" DECIMAL(10,2) NOT NULL,
            "currency" "Currency" NOT NULL DEFAULT 'USD',
            "startDate" TIMESTAMP(3) NOT NULL,
            "endDate" TIMESTAMP(3),
            "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
            "metadata" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "TierPurchase_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log('  ✓ TierPurchase table created');

  // Step 6: Add TierPurchase foreign keys
  console.log('Step 6: Adding TierPurchase foreign keys...');
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `DO $$ 
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'TierPurchase_customerId_fkey'
            ) THEN
              ALTER TABLE "TierPurchase" ADD CONSTRAINT "TierPurchase_customerId_fkey" 
                FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
            END IF;
          END $$`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `DO $$ 
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'TierPurchase_tierId_fkey'
            ) THEN
              ALTER TABLE "TierPurchase" ADD CONSTRAINT "TierPurchase_tierId_fkey" 
                FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
            END IF;
          END $$`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `DO $$ 
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'TierPurchase_tierProductId_fkey'
            ) THEN
              ALTER TABLE "TierPurchase" ADD CONSTRAINT "TierPurchase_tierProductId_fkey" 
                FOREIGN KEY ("tierProductId") REFERENCES "TierProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
            END IF;
          END $$`,
    transactionId,
  }));
  console.log('  ✓ TierPurchase foreign keys added\n');

  // Step 7: Create WebhookProcess table
  console.log('Step 7: Creating WebhookProcess table...');
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "WebhookProcess" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "shop" TEXT NOT NULL,
            "topic" TEXT NOT NULL,
            "idempotencyKey" TEXT NOT NULL,
            "payload" JSONB NOT NULL,
            "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "WebhookProcess_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `DO $$ 
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'WebhookProcess_idempotencyKey_key'
            ) THEN
              ALTER TABLE "WebhookProcess" ADD CONSTRAINT "WebhookProcess_idempotencyKey_key" 
                UNIQUE ("idempotencyKey");
            END IF;
          END $$`,
    transactionId,
  }));
  console.log('  ✓ WebhookProcess table created\n');

  // Step 8: Create WebhookError table
  console.log('Step 8: Creating WebhookError table...');
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "WebhookError" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "shop" TEXT NOT NULL,
            "topic" TEXT NOT NULL,
            "orderId" TEXT,
            "error" TEXT NOT NULL,
            "payload" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "WebhookError_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log('  ✓ WebhookError table created\n');

  // Step 9: Create BulkOperationLog table
  console.log('Step 9: Creating BulkOperationLog table...');
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "BulkOperationLog" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "shop" TEXT NOT NULL,
            "operationType" "BulkOperationType" NOT NULL,
            "status" "BulkOperationStatus" NOT NULL DEFAULT 'PENDING',
            "totalCount" INTEGER NOT NULL,
            "successCount" INTEGER NOT NULL DEFAULT 0,
            "failureCount" INTEGER NOT NULL DEFAULT 0,
            "parameters" JSONB NOT NULL,
            "results" JSONB,
            "startedAt" TIMESTAMP(3),
            "completedAt" TIMESTAMP(3),
            "createdBy" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "BulkOperationLog_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log('  ✓ BulkOperationLog table created\n');

  // Step 10: Add missing columns to TierSubscription
  console.log('Step 10: Adding missing columns to TierSubscription...');
  
  // Add shopifyContractId
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "TierSubscription" ADD COLUMN IF NOT EXISTS "shopifyContractId" TEXT`,
    transactionId,
  }));
  console.log('  ✓ Added shopifyContractId column');
  
  // Add shopifyOrderId
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "TierSubscription" ADD COLUMN IF NOT EXISTS "shopifyOrderId" TEXT`,
    transactionId,
  }));
  console.log('  ✓ Added shopifyOrderId column');
  
  // Add startDate
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "TierSubscription" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3)`,
    transactionId,
  }));
  console.log('  ✓ Added startDate column');
  
  // Add endDate
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "TierSubscription" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3)`,
    transactionId,
  }));
  console.log('  ✓ Added endDate column');
  
  // Add currentPrice
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "TierSubscription" ADD COLUMN IF NOT EXISTS "currentPrice" DECIMAL(10,2)`,
    transactionId,
  }));
  console.log('  ✓ Added currentPrice column\n');

  // Step 11: Create indexes for new tables
  console.log('Step 11: Creating indexes for new tables...');
  
  // TierPurchase indexes
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "TierPurchase_shop_customerId_idx" ON "TierPurchase"("shop", "customerId")`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "TierPurchase_shopifyOrderId_idx" ON "TierPurchase"("shopifyOrderId")`,
    transactionId,
  }));
  
  // WebhookProcess indexes
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "WebhookProcess_shop_topic_idx" ON "WebhookProcess"("shop", "topic")`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "WebhookProcess_idempotencyKey_idx" ON "WebhookProcess"("idempotencyKey")`,
    transactionId,
  }));
  
  // WebhookError indexes
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "WebhookError_shop_topic_idx" ON "WebhookError"("shop", "topic")`,
    transactionId,
  }));
  
  // BulkOperationLog indexes
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "BulkOperationLog_shop_operationType_idx" ON "BulkOperationLog"("shop", "operationType")`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "BulkOperationLog_status_idx" ON "BulkOperationLog"("status")`,
    transactionId,
  }));
  console.log('  ✓ All indexes created\n');

  // Step 12: Record migration
  console.log('Step 12: Recording migration in Prisma migrations table...');
  const migrationId = crypto.randomBytes(18).toString('hex');
  const migrationName = `20250116_sync_schema_improvements`;
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `INSERT INTO "_prisma_migrations" 
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 12)`,
    parameters: [
      { name: "id", value: { stringValue: migrationId }},
      { name: "checksum", value: { stringValue: crypto.randomBytes(16).toString('hex') }},
      { name: "name", value: { stringValue: migrationName }},
    ],
    transactionId,
  }));
  console.log(`  ✓ Migration "${migrationName}" recorded`);
}

async function verifyMigration() {
  console.log('Verifying migration...\n');
  
  try {
    // Check tables
    const tablesResult = await client.send(new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
      sql: `SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name IN ('TierProduct', 'TierPurchase', 'WebhookProcess', 'WebhookError', 'BulkOperationLog')
            ORDER BY table_name`,
    }));
    
    console.log('📊 New tables created:');
    if (tablesResult.records && tablesResult.records.length > 0) {
      tablesResult.records.forEach(record => {
        console.log(`  ✅ ${record[0].stringValue}`);
      });
    }
    
    // Check enums
    const enumsResult = await client.send(new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
      sql: `SELECT typname 
            FROM pg_type 
            WHERE typtype = 'e' 
              AND typname IN ('PurchaseType', 'PurchaseStatus', 'BulkOperationType', 'BulkOperationStatus')
            ORDER BY typname`,
    }));
    
    console.log('\n🔧 New enums created:');
    if (enumsResult.records && enumsResult.records.length > 0) {
      enumsResult.records.forEach(record => {
        console.log(`  ✅ ${record[0].stringValue}`);
      });
    }
    
    // Check TierSubscription columns
    const columnsResult = await client.send(new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
      sql: `SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'TierSubscription'
              AND column_name IN ('shopifyContractId', 'shopifyOrderId', 'startDate', 'endDate', 'currentPrice')
            ORDER BY column_name`,
    }));
    
    console.log('\n📝 New columns added to TierSubscription:');
    if (columnsResult.records && columnsResult.records.length > 0) {
      columnsResult.records.forEach(record => {
        console.log(`  ✅ ${record[0].stringValue}`);
      });
    }
    
    console.log('\n✨ Schema is now in sync with Prisma!');
    
  } catch (error) {
    console.error('Error verifying migration:', error.message);
  }
}

// Run the migration
applySchemaSyncMigration();