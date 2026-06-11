/**
 * Migration: Add customer sync status fields to ShopSettings
 *
 * Adds two new boolean fields to track customer sync status:
 * - customersInitialSynced: Has initial customer sync completed
 * - customersSyncInProgress: Is customer sync currently running
 *
 * Usage: npx ts-node scripts/migrate-add-customer-sync-fields.ts
 */

import { createDataAPIPrismaClient } from '../app/utils/prisma-data-api-adapter';
import { getAuroraClient } from '../app/utils/aurora-data-api';
import crypto from 'crypto';
import 'dotenv/config';

const prisma = createDataAPIPrismaClient();
const aurora = getAuroraClient();

async function main() {
  console.log('🔄 Starting migration: Add customer sync status fields to ShopSettings');
  console.log('==================================================================\n');

  try {
    // Execute migration in a transaction for atomicity
    await aurora.executeTransaction(async (execute) => {
      // Step 1: Add customersInitialSynced column
      console.log('Step 1: Adding customersInitialSynced column...');
      await execute(`
        ALTER TABLE "ShopSettings"
        ADD COLUMN IF NOT EXISTS "customersInitialSynced" BOOLEAN NOT NULL DEFAULT false;
      `);
      console.log('  ✓ customersInitialSynced column added\n');

      // Step 2: Add customersSyncInProgress column
      console.log('Step 2: Adding customersSyncInProgress column...');
      await execute(`
        ALTER TABLE "ShopSettings"
        ADD COLUMN IF NOT EXISTS "customersSyncInProgress" BOOLEAN NOT NULL DEFAULT false;
      `);
      console.log('  ✓ customersSyncInProgress column added\n');

      // Step 3: Record migration in Prisma's tracking table
      console.log('Step 3: Recording migration in _prisma_migrations...');
      const migrationId = crypto.randomBytes(18).toString('hex');
      const migrationName = '20251009_add_customer_sync_fields';
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
          VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 2);
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
      WHERE table_name = 'ShopSettings'
        AND column_name IN ('customersInitialSynced', 'customersSyncInProgress')
      ORDER BY column_name;
    `, []);

    if (result.records.length === 2) {
      console.log('✅ Migration verified successfully!\n');
      console.log('Column details:');
      result.records.forEach((col: any) => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default})`);
      });
    } else {
      console.warn('⚠️  Warning: Expected 2 columns but found', result.records.length);
    }

    // Show sample data
    console.log('\n📊 Sample ShopSettings records:');
    const shops = await prisma.shopSettings.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    if (shops.length > 0) {
      console.log(`Found ${shops.length} shop(s):`);
      shops.forEach((shop: any) => {
        console.log(`  - ${shop.shop}: customersInitialSynced=${shop.customersInitialSynced}, customersSyncInProgress=${shop.customersSyncInProgress}`);
      });
    } else {
      console.log('  No shops found in database');
    }

    console.log('\n==================================================================');
    console.log('✨ Migration completed successfully!');
    console.log('\nNew fields added:');
    console.log('  • customersInitialSynced (Boolean, default: false)');
    console.log('  • customersSyncInProgress (Boolean, default: false)');
    console.log('\nThese fields track customer sync status after app installation.');

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
