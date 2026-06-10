#!/usr/bin/env node

/**
 * Fix MonthlyOrderUsage table - add missing composite unique constraint
 * The Prisma schema defines @@unique([shop, year, month]) but the column lookup is failing
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

async function main() {
  console.log('=========================================');
  console.log('Fixing MonthlyOrderUsage Table');
  console.log('=========================================\n');

  let transactionId;
  
  try {
    // Start transaction
    const beginCommand = new BeginTransactionCommand({ resourceArn, secretArn, database });
    const { transactionId: txId } = await client.send(beginCommand);
    transactionId = txId;
    console.log('✓ Transaction started\n');

    // Check if the table exists
    const checkTable = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'MonthlyOrderUsage'
      );
    `;
    
    const tableResult = await executeSQL(checkTable, transactionId);
    const tableExists = tableResult.records?.[0]?.[0]?.booleanValue;
    
    if (!tableExists) {
      console.log('MonthlyOrderUsage table does not exist, creating it...\n');
      
      // Create the table
      await executeSQL(`
        CREATE TABLE IF NOT EXISTS "MonthlyOrderUsage" (
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
      
      // Add unique constraint
      await executeSQL(`
        CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyOrderUsage_shop_year_month_key" 
        ON "MonthlyOrderUsage"("shop", "year", "month");
      `, transactionId);
      
      // Add regular indexes
      await executeSQL(`
        CREATE INDEX IF NOT EXISTS "MonthlyOrderUsage_shop_year_month_idx" 
        ON "MonthlyOrderUsage"("shop", "year", "month");
      `, transactionId);
      
      console.log('✓ Table created with indexes\n');
    } else {
      console.log('Table exists, checking for missing indexes...\n');
      
      // Check if the unique constraint exists
      const checkConstraint = `
        SELECT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE tablename = 'MonthlyOrderUsage' 
          AND indexname = 'MonthlyOrderUsage_shop_year_month_key'
        );
      `;
      
      const constraintResult = await executeSQL(checkConstraint, transactionId);
      const constraintExists = constraintResult.records?.[0]?.[0]?.booleanValue;
      
      if (!constraintExists) {
        console.log('Adding missing unique constraint...');
        
        // Add unique constraint
        await executeSQL(`
          CREATE UNIQUE INDEX "MonthlyOrderUsage_shop_year_month_key" 
          ON "MonthlyOrderUsage"("shop", "year", "month");
        `, transactionId);
        
        console.log('✓ Unique constraint added\n');
      } else {
        console.log('✓ Unique constraint already exists\n');
      }
      
      // Ensure regular index exists too
      await executeSQL(`
        CREATE INDEX IF NOT EXISTS "MonthlyOrderUsage_shop_year_month_idx" 
        ON "MonthlyOrderUsage"("shop", "year", "month");
      `, transactionId);
    }

    // Commit transaction
    const commitCommand = new CommitTransactionCommand({ resourceArn, secretArn, transactionId });
    await client.send(commitCommand);
    console.log('✓ Transaction committed\n');

    console.log('=========================================');
    console.log('✅ MonthlyOrderUsage table fixed successfully!');
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