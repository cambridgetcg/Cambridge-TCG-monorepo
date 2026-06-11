/**
 * Migration: Add annualSpent field to Customer
 *
 * Adds a new Decimal field to track spending in the last 12 months:
 * - annualSpent: Spending in last 12 months (for fast tier calculation)
 *
 * Usage: npx tsx scripts/migrate-add-annual-spent.ts
 */

import { createDataAPIPrismaClient } from '../app/utils/prisma-data-api-adapter';
import { getAuroraClient } from '../app/utils/aurora-data-api';
import crypto from 'crypto';
import 'dotenv/config';

const prisma = createDataAPIPrismaClient();
const aurora = getAuroraClient();

async function main() {
  console.log('🔄 Starting migration: Add annualSpent field to Customer');
  console.log('==================================================================\n');

  try {
    // Execute migration in a transaction for atomicity
    await aurora.executeTransaction(async (execute) => {
      // Step 1: Add annualSpent column
      console.log('Step 1: Adding annualSpent column to Customer table...');
      await execute(`
        ALTER TABLE "Customer"
        ADD COLUMN IF NOT EXISTS "annualSpent" DECIMAL(10, 2) NOT NULL DEFAULT 0;
      `);
      console.log('  ✓ annualSpent column added\n');

      // Step 2: Record migration in Prisma's tracking table
      console.log('Step 2: Recording migration in _prisma_migrations...');
      const migrationId = crypto.randomBytes(18).toString('hex');
      const migrationName = '20251110_add_annual_spent_to_customer';
      const checksum = crypto.createHash('md5').update(migrationName).digest('hex');

      // Check if migration already recorded
      const existingMigration = await execute(`
        SELECT id FROM "_prisma_migrations"
        WHERE migration_name = :name
        LIMIT 1;
      `, [
        { name: 'name', value: { stringValue: migrationName }},
      ]);

      if (existingMigration.records.length === 0) {
        await execute(`
          INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 1);
        `, [
          { name: 'id', value: { stringValue: migrationId }},
          { name: 'checksum', value: { stringValue: checksum }},
          { name: 'name', value: { stringValue: migrationName }},
        ]);
        console.log('  ✓ Migration recorded\n');
      } else {
        console.log('  ℹ Migration already recorded (skipping)\n');
      }
    });

    console.log('💾 Transaction committed successfully\n');

    // Verify the migration
    console.log('🔍 Verifying migration...');
    const result = await aurora.executeStatement(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'Customer'
        AND column_name = 'annualSpent'
      ORDER BY column_name;
    `, []);

    if (result.records.length === 1) {
      console.log('✅ Migration verified successfully!\n');
      console.log('Column details:');
      result.records.forEach((col: any) => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default})`);
      });
    } else {
      console.warn('⚠️  Warning: Expected 1 column but found', result.records.length);
    }

    // Show sample data
    console.log('\n📊 Sample Customer records:');
    const customers = await prisma.customer.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        totalSpent: true,
        annualSpent: true,
        orderCount: true,
      }
    });

    if (customers.length > 0) {
      console.log(`Found ${customers.length} customer(s):`);
      customers.forEach((customer: any) => {
        console.log(`  - ${customer.email}: totalSpent=${customer.totalSpent}, annualSpent=${customer.annualSpent}, orders=${customer.orderCount}`);
      });
    } else {
      console.log('  No customers found in database');
    }

    console.log('\n==================================================================');
    console.log('✨ Migration completed successfully!');
    console.log('\nNew field added:');
    console.log('  • annualSpent (Decimal(10,2), default: 0)');
    console.log('\nThis field tracks spending in the last 12 months for fast tier calculations.');
    console.log('\n⚠️  NEXT STEPS:');
    console.log('  1. Run a backfill script to calculate annualSpent for existing customers');
    console.log('  2. Update order processing code to maintain this field');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    console.error('\n⚠️  Transaction rolled back - no changes were applied to the database.');
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('\n📡 Database connection closed');
  });
