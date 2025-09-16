#!/usr/bin/env node

/**
 * Comprehensive Schema Alignment Script
 * Ensures all database tables match Prisma schema exactly
 * Handles missing columns, indexes, and constraints
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from '@aws-sdk/client-rds-data';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const client = new RDSDataClient({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const resourceArn = process.env.AURORA_RESOURCE_ARN;
const secretArn = process.env.AURORA_SECRET_ARN;
const database = process.env.AURORA_DATABASE_NAME || 'rewardspro';

async function executeSQL(sql, transactionId = undefined) {
  console.log(`Executing: ${sql.substring(0, 100)}...`);
  
  const params = {
    resourceArn,
    secretArn,
    database,
    sql,
    ...(transactionId && { transactionId })
  };
  
  try {
    const command = new ExecuteStatementCommand(params);
    const response = await client.send(command);
    console.log('✓ Success');
    return response;
  } catch (error) {
    console.error('✗ Failed:', error.message);
    throw error;
  }
}

async function checkTableExists(tableName, transactionId) {
  const result = await executeSQL(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = '${tableName}'
    );
  `, transactionId);
  
  return result.records?.[0]?.[0]?.booleanValue || false;
}

async function checkColumnExists(tableName, columnName, transactionId) {
  const result = await executeSQL(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = '${tableName}' 
      AND column_name = '${columnName}'
    );
  `, transactionId);
  
  return result.records?.[0]?.[0]?.booleanValue || false;
}

async function main() {
  console.log('=========================================');
  console.log('Comprehensive Schema Alignment Migration');
  console.log('=========================================\n');

  let transactionId;
  
  try {
    // Start transaction
    const beginCommand = new BeginTransactionCommand({ resourceArn, secretArn, database });
    const { transactionId: txId } = await client.send(beginCommand);
    transactionId = txId;
    console.log('✓ Transaction started\n');

    // 1. Fix MonthlyOrderUsage table
    console.log('=== Checking MonthlyOrderUsage Table ===');
    const monthlyOrderUsageExists = await checkTableExists('MonthlyOrderUsage', transactionId);
    
    if (!monthlyOrderUsageExists) {
      console.log('Creating MonthlyOrderUsage table...');
      await executeSQL(`
        CREATE TABLE "MonthlyOrderUsage" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
          "shop" TEXT NOT NULL,
          "year" INTEGER NOT NULL,
          "month" INTEGER NOT NULL,
          "orderCount" INTEGER DEFAULT 0,
          "planLimit" INTEGER NOT NULL,
          "planName" TEXT NOT NULL,
          "lastOrderDate" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MonthlyOrderUsage_pkey" PRIMARY KEY ("id")
        );
      `, transactionId);
    }

    // Add unique constraint if missing
    await executeSQL(`
      CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyOrderUsage_shop_year_month_key" 
      ON "MonthlyOrderUsage"("shop", "year", "month");
    `, transactionId);

    // Add regular index if missing
    await executeSQL(`
      CREATE INDEX IF NOT EXISTS "MonthlyOrderUsage_shop_year_month_idx" 
      ON "MonthlyOrderUsage"("shop", "year", "month");
    `, transactionId);

    // 2. Fix TierSubscription table
    console.log('\n=== Checking TierSubscription Table ===');
    const tierSubscriptionExists = await checkTableExists('TierSubscription', transactionId);
    
    if (tierSubscriptionExists) {
      // Check for the correct column name (subscriptionContractId)
      const hasSubscriptionContractId = await checkColumnExists('TierSubscription', 'subscriptionContractId', transactionId);
      const hasShopifyContractId = await checkColumnExists('TierSubscription', 'shopifyContractId', transactionId);
      
      if (!hasSubscriptionContractId && !hasShopifyContractId) {
        console.log('Adding subscriptionContractId column...');
        await executeSQL(`
          ALTER TABLE "TierSubscription" 
          ADD COLUMN "subscriptionContractId" TEXT;
        `, transactionId);
      } else if (hasShopifyContractId && !hasSubscriptionContractId) {
        console.log('Renaming shopifyContractId to subscriptionContractId...');
        await executeSQL(`
          ALTER TABLE "TierSubscription" 
          RENAME COLUMN "shopifyContractId" TO "subscriptionContractId";
        `, transactionId);
      }

      // Ensure unique constraint
      await executeSQL(`
        CREATE UNIQUE INDEX IF NOT EXISTS "TierSubscription_subscriptionContractId_key" 
        ON "TierSubscription"("subscriptionContractId");
      `, transactionId);

      // Check for missing columns
      const columnChecks = [
        { name: 'tierProductId', type: 'TEXT' },
        { name: 'sellingPlanId', type: 'TEXT' },
        { name: 'sellingPlanGroupId', type: 'TEXT' },
        { name: 'productVariantId', type: 'TEXT' },
        { name: 'failedPaymentCount', type: 'INTEGER DEFAULT 0' },
        { name: 'basePrice', type: 'DECIMAL(10, 2)' },
        { name: 'discountPercentage', type: 'INTEGER DEFAULT 0' },
        { name: 'finalPrice', type: 'DECIMAL(10, 2)' },
        { name: 'currency', type: 'TEXT DEFAULT \'USD\'' },
        { name: 'currentPeriodStart', type: 'TIMESTAMP(3)' },
        { name: 'currentPeriodEnd', type: 'TIMESTAMP(3)' },
        { name: 'nextBillingDate', type: 'TIMESTAMP(3)' },
        { name: 'lastBillingDate', type: 'TIMESTAMP(3)' },
        { name: 'trialEndsAt', type: 'TIMESTAMP(3)' },
        { name: 'startedAt', type: 'TIMESTAMP(3)' },
        { name: 'pausedAt', type: 'TIMESTAMP(3)' },
        { name: 'resumedAt', type: 'TIMESTAMP(3)' },
        { name: 'cancelledAt', type: 'TIMESTAMP(3)' },
        { name: 'cancellationReason', type: 'TEXT' },
        { name: 'metadata', type: 'JSONB' }
      ];

      for (const column of columnChecks) {
        const exists = await checkColumnExists('TierSubscription', column.name, transactionId);
        if (!exists) {
          console.log(`Adding ${column.name} column...`);
          await executeSQL(`
            ALTER TABLE "TierSubscription" 
            ADD COLUMN "${column.name}" ${column.type};
          `, transactionId);
        }
      }
    }

    // 3. Fix SubscriptionBillingAttempt table
    console.log('\n=== Checking SubscriptionBillingAttempt Table ===');
    const billingAttemptExists = await checkTableExists('SubscriptionBillingAttempt', transactionId);
    
    if (billingAttemptExists) {
      // Check for missing columns
      const billingColumns = [
        { name: 'idempotencyKey', type: 'TEXT' },
        { name: 'attemptNumber', type: 'INTEGER DEFAULT 1' },
        { name: 'status', type: 'TEXT DEFAULT \'PENDING\'' },
        { name: 'amount', type: 'DECIMAL(10, 2)' },
        { name: 'currency', type: 'TEXT DEFAULT \'USD\'' },
        { name: 'shopifyOrderId', type: 'TEXT' },
        { name: 'shopifyBillingAttemptId', type: 'TEXT' },
        { name: 'shopifyInvoiceUrl', type: 'TEXT' },
        { name: 'errorCode', type: 'TEXT' },
        { name: 'errorMessage', type: 'TEXT' },
        { name: 'errorDetails', type: 'JSONB' },
        { name: 'scheduledFor', type: 'TIMESTAMP(3)' },
        { name: 'attemptedAt', type: 'TIMESTAMP(3)' },
        { name: 'succeededAt', type: 'TIMESTAMP(3)' },
        { name: 'failedAt', type: 'TIMESTAMP(3)' }
      ];

      for (const column of billingColumns) {
        const exists = await checkColumnExists('SubscriptionBillingAttempt', column.name, transactionId);
        if (!exists) {
          console.log(`Adding ${column.name} column...`);
          await executeSQL(`
            ALTER TABLE "SubscriptionBillingAttempt" 
            ADD COLUMN "${column.name}" ${column.type};
          `, transactionId);
        }
      }

      // Add unique constraint for idempotency
      await executeSQL(`
        CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionBillingAttempt_idempotencyKey_key" 
        ON "SubscriptionBillingAttempt"("idempotencyKey");
      `, transactionId);
    }

    // 4. Ensure TierChangeLog has subscription-related fields
    console.log('\n=== Checking TierChangeLog Table ===');
    const tierChangeLogExists = await checkTableExists('TierChangeLog', transactionId);
    
    if (tierChangeLogExists) {
      const hasSubscriptionId = await checkColumnExists('TierChangeLog', 'subscriptionId', transactionId);
      if (!hasSubscriptionId) {
        console.log('Adding subscriptionId column to TierChangeLog...');
        await executeSQL(`
          ALTER TABLE "TierChangeLog" 
          ADD COLUMN "subscriptionId" TEXT;
        `, transactionId);
      }
    }

    // 5. Check for proper indexes
    console.log('\n=== Creating Missing Indexes ===');
    
    // TierSubscription indexes
    await executeSQL(`
      CREATE INDEX IF NOT EXISTS "TierSubscription_shop_customerId_idx" 
      ON "TierSubscription"("shop", "customerId");
    `, transactionId);
    
    await executeSQL(`
      CREATE INDEX IF NOT EXISTS "TierSubscription_shop_status_idx" 
      ON "TierSubscription"("shop", "status");
    `, transactionId);
    
    await executeSQL(`
      CREATE INDEX IF NOT EXISTS "TierSubscription_status_nextBillingDate_idx" 
      ON "TierSubscription"("status", "nextBillingDate");
    `, transactionId);

    // SubscriptionBillingAttempt indexes
    if (billingAttemptExists) {
      await executeSQL(`
        CREATE INDEX IF NOT EXISTS "SubscriptionBillingAttempt_subscriptionId_status_idx" 
        ON "SubscriptionBillingAttempt"("subscriptionId", "status");
      `, transactionId);
      
      await executeSQL(`
        CREATE INDEX IF NOT EXISTS "SubscriptionBillingAttempt_scheduledFor_idx" 
        ON "SubscriptionBillingAttempt"("scheduledFor");
      `, transactionId);
    }

    // 6. Ensure proper foreign key constraints
    console.log('\n=== Checking Foreign Key Constraints ===');
    
    // Add foreign key for TierSubscription -> TierProduct if missing
    if (tierSubscriptionExists) {
      await executeSQL(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'TierSubscription' 
            AND constraint_name = 'TierSubscription_tierProductId_fkey'
          ) THEN
            ALTER TABLE "TierSubscription"
            ADD CONSTRAINT "TierSubscription_tierProductId_fkey"
            FOREIGN KEY ("tierProductId") REFERENCES "TierProduct"("id") ON DELETE SET NULL;
          END IF;
        END $$;
      `, transactionId);
    }

    // Commit transaction
    const commitCommand = new CommitTransactionCommand({ resourceArn, secretArn, transactionId });
    await client.send(commitCommand);
    console.log('\n✓ Transaction committed');

    console.log('\n=========================================');
    console.log('✅ Schema alignment completed successfully!');
    console.log('=========================================');
    
  } catch (error) {
    console.error('\n❌ Error during migration:', error);
    
    // Rollback transaction if it exists
    if (transactionId) {
      try {
        const rollbackCommand = new RollbackTransactionCommand({ resourceArn, secretArn, transactionId });
        await client.send(rollbackCommand);
        console.log('✓ Transaction rolled back');
      } catch (rollbackError) {
        console.error('Failed to rollback transaction:', rollbackError);
      }
    }
    
    process.exit(1);
  }
}

// Run the migration
main().catch(console.error);