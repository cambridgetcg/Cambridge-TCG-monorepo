/**
 * Migration: Add composite index for optimized customer pagination
 *
 * This index dramatically speeds up the common query pattern:
 * WHERE shop = X AND currentTierId = Y ORDER BY createdAt DESC LIMIT N
 *
 * Run with: npx tsx scripts/migrate-add-customer-pagination-index.ts
 */

import { createDataAPIPrismaClient } from '../app/utils/prisma-data-api-adapter';
import { getAuroraClient } from '../app/utils/aurora-data-api';
import crypto from 'crypto';
import 'dotenv/config';

const prisma = createDataAPIPrismaClient();
const aurora = getAuroraClient();

async function main() {
  console.log('🔄 Starting migration: Add Customer Pagination Index');
  console.log('==================================================================\n');

  try {
    // Step 1: Check if index already exists
    console.log('Step 1: Checking if index already exists...');
    const checkResult = await aurora.executeStatement(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'Customer'
      AND indexname = 'Customer_shop_currentTierId_createdAt_idx'
    `, []);

    if (checkResult.records.length > 0) {
      console.log('  ✓ Index already exists, skipping creation\n');
      console.log('==================================================================');
      console.log('✨ Migration already applied - no changes needed');
      return;
    }

    console.log('  ℹ Index does not exist, will create\n');

    // Step 2: Create the composite index
    // Note: Cannot use CONCURRENTLY inside a transaction, so we run it outside
    console.log('Step 2: Creating composite index...');
    console.log('  Index: Customer_shop_currentTierId_createdAt_idx');
    console.log('  Columns: (shop, currentTierId, createdAt DESC)\n');

    await aurora.executeStatement(`
      CREATE INDEX IF NOT EXISTS
      "Customer_shop_currentTierId_createdAt_idx"
      ON "Customer" ("shop", "currentTierId", "createdAt" DESC)
    `, []);

    console.log('  ✓ Index created successfully\n');

    // Step 3: Record migration in Prisma's tracking table
    console.log('Step 3: Recording migration in _prisma_migrations...');
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = '20251126_add_customer_pagination_index';
    const checksum = crypto.createHash('md5').update(migrationName).digest('hex');

    // Check if migration already recorded
    const existingMigration = await aurora.executeStatement(`
      SELECT id FROM "_prisma_migrations"
      WHERE migration_name = :name
      LIMIT 1;
    `, [
      { name: 'name', value: { stringValue: migrationName }},
    ]);

    if (existingMigration.records.length === 0) {
      await aurora.executeStatement(`
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

    // Step 4: Verify the migration
    console.log('Step 4: Verifying migration...');
    const verifyResult = await aurora.executeStatement(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'Customer'
      AND indexname = 'Customer_shop_currentTierId_createdAt_idx'
    `, []);

    if (verifyResult.records.length > 0) {
      console.log('  ✓ Index verified successfully!\n');
      console.log('  Index definition:');
      console.log(`    ${verifyResult.records[0].indexdef}\n`);
    } else {
      console.warn('  ⚠ Warning: Index not found after creation\n');
    }

    // Step 5: Show existing indexes on Customer table
    console.log('Step 5: All indexes on Customer table:');
    const allIndexes = await aurora.executeStatement(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'Customer'
      ORDER BY indexname;
    `, []);

    allIndexes.records.forEach((idx: any) => {
      console.log(`  - ${idx.indexname}`);
    });

    console.log('\n==================================================================');
    console.log('✨ Migration completed successfully!');
    console.log('\nNew index added:');
    console.log('  • Customer_shop_currentTierId_createdAt_idx');
    console.log('\nThis index optimizes paginated customer queries with tier filtering.');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
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
