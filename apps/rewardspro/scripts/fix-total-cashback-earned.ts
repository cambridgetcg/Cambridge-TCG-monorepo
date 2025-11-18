/**
 * Migration Script: Fix totalCashbackEarned for All Customers
 *
 * This script recalculates totalCashbackEarned for all customers based on:
 * 1. Sum of all CASHBACK_EARNED ledger entries (positive amounts only)
 * 2. Excludes manual adjustments, syncs, and other non-cashback transactions
 *
 * Run with: npx tsx scripts/fix-total-cashback-earned.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface FixStats {
  customersProcessed: number;
  customersFixed: number;
  customersSkipped: number;
  errors: Array<{ customerId: string; error: string }>;
  details: Array<{
    customerId: string;
    email: string;
    oldValue: number;
    newValue: number;
    difference: number;
  }>;
}

async function fixTotalCashbackEarned(): Promise<FixStats> {
  console.log('[Fix TotalCashbackEarned] 🚀 Starting migration...\n');

  const stats: FixStats = {
    customersProcessed: 0,
    customersFixed: 0,
    customersSkipped: 0,
    errors: [],
    details: []
  };

  try {
    // Get all customers
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        email: true,
        shopifyCustomerId: true,
        shop: true,
        storeCredit: true,
        totalCashbackEarned: true
      }
    });

    console.log(`[Fix TotalCashbackEarned] Found ${customers.length} customers\n`);

    for (const customer of customers) {
      stats.customersProcessed++;

      try {
        // Calculate correct totalCashbackEarned from ledger
        // Sum all CASHBACK_EARNED entries (these are positive amounts when earned)
        const cashbackSum = await prisma.storeCreditLedger.aggregate({
          where: {
            customerId: customer.id,
            shop: customer.shop,
            type: 'CASHBACK_EARNED'
          },
          _sum: {
            amount: true
          }
        });

        const correctTotalEarned = cashbackSum._sum.amount
          ? Number(cashbackSum._sum.amount)
          : 0;

        const currentTotalEarned = customer.totalCashbackEarned
          ? Number(customer.totalCashbackEarned)
          : 0;

        // Check if there's a discrepancy (allow 1 cent tolerance for rounding)
        const difference = Math.abs(correctTotalEarned - currentTotalEarned);

        if (difference > 0.01) {
          console.log(`[Fix TotalCashbackEarned] 🔧 Fixing customer ${customer.email}:`);
          console.log(`  Old value: $${currentTotalEarned.toFixed(2)}`);
          console.log(`  New value: $${correctTotalEarned.toFixed(2)}`);
          console.log(`  Difference: $${difference.toFixed(2)}\n`);

          // Update the customer
          await prisma.customer.update({
            where: { id: customer.id },
            data: {
              totalCashbackEarned: correctTotalEarned,
              updatedAt: new Date()
            }
          });

          stats.customersFixed++;
          stats.details.push({
            customerId: customer.id,
            email: customer.email || 'no-email',
            oldValue: currentTotalEarned,
            newValue: correctTotalEarned,
            difference: correctTotalEarned - currentTotalEarned
          });
        } else {
          stats.customersSkipped++;
          console.log(`[Fix TotalCashbackEarned] ✅ Customer ${customer.email} already correct ($${correctTotalEarned.toFixed(2)})`);
        }

      } catch (error) {
        console.error(`[Fix TotalCashbackEarned] ❌ Error processing customer ${customer.id}:`, error);
        stats.errors.push({
          customerId: customer.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('[Fix TotalCashbackEarned] 📊 MIGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total customers processed: ${stats.customersProcessed}`);
    console.log(`Customers fixed: ${stats.customersFixed}`);
    console.log(`Customers skipped (already correct): ${stats.customersSkipped}`);
    console.log(`Errors: ${stats.errors.length}`);

    if (stats.customersFixed > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('Fixed Customers Details:');
      console.log('-'.repeat(60));
      for (const detail of stats.details) {
        console.log(`${detail.email}:`);
        console.log(`  Old: $${detail.oldValue.toFixed(2)} → New: $${detail.newValue.toFixed(2)} (${detail.difference >= 0 ? '+' : ''}$${detail.difference.toFixed(2)})`);
      }
    }

    if (stats.errors.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('Errors:');
      console.log('-'.repeat(60));
      for (const error of stats.errors) {
        console.log(`Customer ${error.customerId}: ${error.error}`);
      }
    }

    console.log('\n✅ Migration completed successfully!\n');

  } catch (error) {
    console.error('[Fix TotalCashbackEarned] ❌ Fatal error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }

  return stats;
}

// Run the migration
fixTotalCashbackEarned()
  .then((stats) => {
    process.exit(stats.errors.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
