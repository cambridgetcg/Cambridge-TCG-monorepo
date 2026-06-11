/**
 * Migration: Add ShopEntitlements table and EntitlementSource enum
 *
 * Creates a unified entitlements table as single source of truth for
 * feature access and plan limits.
 *
 * Usage: npx tsx scripts/migrate-add-shop-entitlements.ts
 */

import { createDataAPIPrismaClient } from '../app/utils/prisma-data-api-adapter';
import { getAuroraClient } from '../app/utils/aurora-data-api';
import crypto from 'crypto';
import 'dotenv/config';

const prisma = createDataAPIPrismaClient();
const aurora = getAuroraClient();

async function main() {
  console.log('🔄 Starting migration: Add ShopEntitlements table');
  console.log('==================================================\n');

  try {
    // Execute migration in a transaction for atomicity
    await aurora.executeTransaction(async (execute) => {
      // Step 1: Create EntitlementSource enum
      console.log('Step 1: Creating EntitlementSource enum...');
      await execute(`
        DO $$ BEGIN
          CREATE TYPE "EntitlementSource" AS ENUM ('DEFAULT', 'SUBSCRIPTION', 'OVERRIDE', 'LEGACY');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log('  ✓ EntitlementSource enum created (or already exists)\n');

      // Step 2: Create ShopEntitlements table
      console.log('Step 2: Creating ShopEntitlements table...');
      await execute(`
        CREATE TABLE IF NOT EXISTS "ShopEntitlements" (
          "id" TEXT NOT NULL,
          "shop" TEXT NOT NULL,

          -- Effective plan (single source of truth)
          "effectivePlan" TEXT NOT NULL DEFAULT 'RewardsPro Free',
          "planSource" "EntitlementSource" NOT NULL DEFAULT 'DEFAULT',

          -- Feature flags (boolean)
          "featureApiAccess" BOOLEAN NOT NULL DEFAULT false,
          "featureWebhooks" BOOLEAN NOT NULL DEFAULT false,
          "featureWhiteLabel" BOOLEAN NOT NULL DEFAULT false,
          "featureAdvancedReport" BOOLEAN NOT NULL DEFAULT true,
          "featureCustomEmail" BOOLEAN NOT NULL DEFAULT false,
          "featureAnnualEval" BOOLEAN NOT NULL DEFAULT false,
          "featureBulkOps" BOOLEAN NOT NULL DEFAULT false,
          "featureCustomBranding" BOOLEAN NOT NULL DEFAULT false,
          "featurePrioritySupport" BOOLEAN NOT NULL DEFAULT false,
          "featureSubscriptionTiers" BOOLEAN NOT NULL DEFAULT false,
          "featurePurchasableTiers" BOOLEAN NOT NULL DEFAULT false,
          "featureExportData" BOOLEAN NOT NULL DEFAULT false,
          "featureCustomRewards" BOOLEAN NOT NULL DEFAULT false,

          -- Numeric limits
          "limitMaxTiers" INTEGER NOT NULL DEFAULT 2,
          "limitMaxOrders" INTEGER NOT NULL DEFAULT 50,
          "limitMaxEmails" INTEGER NOT NULL DEFAULT 0,

          -- Override support (for custom deals)
          "hasOverride" BOOLEAN NOT NULL DEFAULT false,
          "overrideExpiry" TIMESTAMP(3),
          "overrideNote" TEXT,
          "overrideBy" TEXT,

          -- Resolution tracking
          "lastResolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "resolvedFrom" TEXT,

          -- Timestamps
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "ShopEntitlements_pkey" PRIMARY KEY ("id")
        );
      `);
      console.log('  ✓ ShopEntitlements table created (or already exists)\n');

      // Step 3: Create unique index on shop
      console.log('Step 3: Creating unique index on shop column...');
      await execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ShopEntitlements_shop_key" ON "ShopEntitlements"("shop");
      `);
      console.log('  ✓ Unique index on shop created\n');

      // Step 4: Create additional indexes for query performance
      console.log('Step 4: Creating additional indexes...');
      await execute(`
        CREATE INDEX IF NOT EXISTS "ShopEntitlements_effectivePlan_idx" ON "ShopEntitlements"("effectivePlan");
      `);
      await execute(`
        CREATE INDEX IF NOT EXISTS "ShopEntitlements_hasOverride_idx" ON "ShopEntitlements"("hasOverride");
      `);
      console.log('  ✓ Additional indexes created\n');

      // Step 5: Record migration in Prisma's tracking table
      console.log('Step 5: Recording migration in _prisma_migrations...');
      const migrationId = crypto.randomBytes(18).toString('hex');
      const migrationName = '20251217_add_shop_entitlements';
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
          VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 5);
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

    // Check table exists
    const tableCheck = await aurora.executeStatement(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'ShopEntitlements'
      ) as exists;
    `, []);

    if (tableCheck.records[0]?.exists) {
      console.log('✅ ShopEntitlements table exists!\n');
    } else {
      console.error('❌ ShopEntitlements table not found!\n');
      process.exit(1);
    }

    // Check enum exists
    const enumCheck = await aurora.executeStatement(`
      SELECT EXISTS (
        SELECT FROM pg_type
        WHERE typname = 'EntitlementSource'
      ) as exists;
    `, []);

    if (enumCheck.records[0]?.exists) {
      console.log('✅ EntitlementSource enum exists!\n');
    } else {
      console.error('❌ EntitlementSource enum not found!\n');
    }

    // Show column details
    console.log('📋 Table columns:');
    const columnsResult = await aurora.executeStatement(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'ShopEntitlements'
      ORDER BY ordinal_position;
    `, []);

    columnsResult.records.forEach((col: any) => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default.substring(0, 30)}` : '';
      console.log(`  - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
    });

    // Show indexes
    console.log('\n📊 Indexes:');
    const indexResult = await aurora.executeStatement(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'ShopEntitlements';
    `, []);

    indexResult.records.forEach((idx: any) => {
      console.log(`  - ${idx.indexname}`);
    });

    console.log('\n==================================================');
    console.log('✨ Migration completed successfully!');
    console.log('\nNew objects created:');
    console.log('  • EntitlementSource enum (DEFAULT, SUBSCRIPTION, OVERRIDE, LEGACY)');
    console.log('  • ShopEntitlements table with:');
    console.log('    - 13 feature flags (boolean)');
    console.log('    - 3 numeric limits (integer)');
    console.log('    - Override support fields');
    console.log('    - Resolution tracking');
    console.log('\nNext steps:');
    console.log('  1. Run: npx tsx scripts/migrate-entitlements.ts');
    console.log('     (to backfill existing shops)');

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
