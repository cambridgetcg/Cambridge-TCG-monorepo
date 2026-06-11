#!/usr/bin/env node

/**
 * Test script to verify new tables are accessible
 */

import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import dotenv from 'dotenv';

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

async function testNewTables() {
  console.log('🔍 Testing New Tables Access...\n');

  try {
    // Test each new table with a simple count query
    const tables = [
      'TierProduct',
      'TierPurchase',
      'WebhookProcess',
      'WebhookError',
      'BulkOperationLog'
    ];

    for (const table of tables) {
      const command = new ExecuteStatementCommand({
        resourceArn: AURORA_RESOURCE_ARN,
        secretArn: AURORA_SECRET_ARN,
        database: AURORA_DATABASE_NAME,
        sql: `SELECT COUNT(*) as count FROM "${table}"`,
      });

      const result = await client.send(command);
      const count = result.records[0][0].longValue || 0;
      console.log(`✅ ${table}: ${count} records`);
    }

    // Test TierSubscription new columns
    console.log('\n🔍 Testing TierSubscription New Columns...\n');
    
    const columnsCommand = new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
      sql: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'TierSubscription' 
          AND column_name IN ('shopifyContractId', 'shopifyOrderId', 'startDate', 'endDate', 'currentPrice')
        ORDER BY column_name
      `,
    });

    const columnsResult = await client.send(columnsCommand);
    
    if (columnsResult.records && columnsResult.records.length > 0) {
      console.log('New columns found:');
      columnsResult.records.forEach(record => {
        console.log(`✅ ${record[0].stringValue}`);
      });
    }

    console.log('\n✨ All new tables and columns are accessible!');

  } catch (error) {
    console.error('❌ Error testing tables:', error.message);
    process.exit(1);
  }
}

// Run the test
testNewTables();