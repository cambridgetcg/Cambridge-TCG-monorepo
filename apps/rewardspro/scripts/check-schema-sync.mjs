#!/usr/bin/env node

/**
 * Script to check if database schema matches Prisma schema
 */

import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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

// Create RDS Data API client
const client = new RDSDataClient({
  region: AWS_REGION || 'eu-north-1',
  credentials: AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

async function executeSQL(sql) {
  const command = new ExecuteStatementCommand({
    resourceArn: AURORA_RESOURCE_ARN,
    secretArn: AURORA_SECRET_ARN,
    database: AURORA_DATABASE_NAME,
    sql,
  });
  return await client.send(command);
}

async function checkSchemaSync() {
  console.log('🔍 Checking Database Schema Synchronization...\n');

  try {
    // Get all tables from database
    const tablesResult = await executeSQL(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const dbTables = tablesResult.records.map(r => r[0].stringValue);
    
    // Expected tables from Prisma schema
    const expectedTables = [
      'Session',
      'ShopSettings',
      'Tier',
      'Customer',
      'StoreCreditLedger',
      'TierChangeLog',
      'TierProduct',
      'TierSubscription',
      'TierPurchase',
      'WebhookProcess',
      'WebhookError',
      'BulkOperationLog',
      'SubscriptionBillingAttempt',
      'SellingPlanGroup',
      'SellingPlan',
      'BillingPlan'
    ];

    console.log('📊 Table Comparison:\n');
    console.log('Expected Tables from Prisma Schema:');
    expectedTables.forEach(table => {
      const exists = dbTables.includes(table);
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    });

    console.log('\nActual Tables in Database:');
    dbTables.forEach(table => {
      const expected = expectedTables.includes(table);
      console.log(`  ${expected ? '✅' : '⚠️'} ${table}`);
    });

    // Check for missing tables
    const missingTables = expectedTables.filter(t => !dbTables.includes(t));
    const extraTables = dbTables.filter(t => !expectedTables.includes(t) && t !== '_prisma_migrations');

    if (missingTables.length > 0) {
      console.log('\n❌ Missing Tables:');
      missingTables.forEach(table => console.log(`   - ${table}`));
    }

    if (extraTables.length > 0) {
      console.log('\n⚠️  Extra Tables (not in Prisma schema):');
      extraTables.forEach(table => console.log(`   - ${table}`));
    }

    // Check specific table columns for critical tables
    console.log('\n🔍 Checking Column Structure for Key Tables:\n');

    // Check TierSubscription columns
    const tierSubColumns = await executeSQL(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'TierSubscription'
      ORDER BY ordinal_position
    `);

    if (tierSubColumns.records && tierSubColumns.records.length > 0) {
      console.log('TierSubscription Table Structure:');
      const expectedColumns = [
        'id', 'shop', 'customerId', 'tierId', 'shopifyContractId', 
        'shopifyOrderId', 'sellingPlanId', 'status', 'startDate', 
        'endDate', 'nextBillingDate', 'billingInterval', 'currentPrice',
        'metadata', 'createdAt', 'updatedAt', 'pausedAt', 'cancelledAt',
        'failureCount', 'lastFailureReason'
      ];
      
      const actualColumns = tierSubColumns.records.map(r => r[0].stringValue);
      expectedColumns.forEach(col => {
        const exists = actualColumns.includes(col);
        console.log(`  ${exists ? '✅' : '❌'} ${col}`);
      });
    } else {
      console.log('❌ TierSubscription table not found or empty');
    }

    // Check WebhookProcess columns
    const webhookColumns = await executeSQL(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'WebhookProcess'
      ORDER BY ordinal_position
    `);

    if (webhookColumns.records && webhookColumns.records.length > 0) {
      console.log('\nWebhookProcess Table Structure:');
      const expectedColumns = [
        'id', 'shop', 'topic', 'idempotencyKey', 'payload', 'processedAt'
      ];
      
      const actualColumns = webhookColumns.records.map(r => r[0].stringValue);
      expectedColumns.forEach(col => {
        const exists = actualColumns.includes(col);
        console.log(`  ${exists ? '✅' : '❌'} ${col}`);
      });
    } else {
      console.log('\n❌ WebhookProcess table not found');
    }

    // Check for enums
    console.log('\n🔍 Checking Enums:\n');
    
    const enumsResult = await executeSQL(`
      SELECT typname 
      FROM pg_type 
      WHERE typtype = 'e' 
        AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY typname
    `);

    const dbEnums = enumsResult.records.map(r => r[0].stringValue);
    const expectedEnums = [
      'BillingInterval',
      'Currency',
      'CurrencyDisplayType',
      'EvaluationPeriod',
      'LedgerEntryType',
      'TierChangeType',
      'TierTriggerType',
      'SubscriptionStatus',
      'PurchaseType',
      'PurchaseStatus',
      'BulkOperationType',
      'BulkOperationStatus'
    ];

    console.log('Expected Enums:');
    expectedEnums.forEach(enumType => {
      const exists = dbEnums.includes(enumType);
      console.log(`  ${exists ? '✅' : '❌'} ${enumType}`);
    });

    // Check constraints and indexes
    console.log('\n🔍 Checking Key Constraints:\n');
    
    const constraintsResult = await executeSQL(`
      SELECT 
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
      ORDER BY tc.table_name, tc.constraint_type
    `);

    const constraints = {};
    constraintsResult.records.forEach(r => {
      const tableName = r[0].stringValue;
      const constraintName = r[1].stringValue;
      const constraintType = r[2].stringValue;
      
      if (!constraints[tableName]) {
        constraints[tableName] = [];
      }
      constraints[tableName].push(`${constraintType}: ${constraintName}`);
    });

    // Show constraints for key tables
    const keyTables = ['Customer', 'TierSubscription', 'WebhookProcess'];
    keyTables.forEach(table => {
      if (constraints[table]) {
        console.log(`${table} constraints:`);
        constraints[table].forEach(c => console.log(`  - ${c}`));
      }
    });

    // Summary
    console.log('\n📋 Summary:\n');
    
    const isInSync = missingTables.length === 0;
    
    if (isInSync) {
      console.log('✅ Database schema appears to be in sync with Prisma schema!');
    } else {
      console.log('❌ Database schema is NOT in sync with Prisma schema!');
      console.log(`   Missing ${missingTables.length} tables`);
      console.log('\n🔧 Recommended Actions:');
      console.log('   1. Run: npx prisma migrate dev --name sync_schema');
      console.log('   2. Or apply the migration script manually');
    }

    // Check if migrations are pending
    const migrationsResult = await executeSQL(`
      SELECT migration_name, finished_at 
      FROM _prisma_migrations 
      ORDER BY finished_at DESC 
      LIMIT 5
    `);

    if (migrationsResult.records && migrationsResult.records.length > 0) {
      console.log('\n📜 Recent Migrations:');
      migrationsResult.records.forEach(r => {
        const name = r[0].stringValue;
        const finishedAt = r[1].stringValue;
        console.log(`   - ${name} (${finishedAt ? 'Applied' : 'Pending'})`);
      });
    }

  } catch (error) {
    console.error('❌ Error checking schema sync:', error.message);
    
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      console.error('\n⚠️  Some tables are missing. You may need to run migrations.');
    }
    
    process.exit(1);
  }
}

// Run the check
checkSchemaSync();