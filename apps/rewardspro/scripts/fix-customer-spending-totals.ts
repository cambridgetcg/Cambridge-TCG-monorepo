/**
 * Fix Customer Spending Totals
 *
 * Recalculates totalSpent, totalRefunded, and netSpent for all customers
 * by aggregating from the Order table (source of truth).
 *
 * Usage:
 *   npx tsx scripts/fix-customer-spending-totals.ts <shop-domain>
 *
 * Example:
 *   npx tsx scripts/fix-customer-spending-totals.ts mystore.myshopify.com
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CustomerStats {
  before: {
    totalSpent: number;
    totalRefunded: number;
    netSpent: number;
    orderCount: number;
  };
  after: {
    totalSpent: number;
    totalRefunded: number;
    netSpent: number;
    orderCount: number;
  };
  changed: boolean;
}

async function fixCustomerSpendingTotals(shop: string) {
  console.log(`\n🔧 Fixing customer spending totals for shop: ${shop}\n`);

  const customers = await prisma.customer.findMany({
    where: { shop },
    select: {
      id: true,
      email: true,
      totalSpent: true,
      totalRefunded: true,
      netSpent: true,
      orderCount: true
    }
  });

  console.log(`📊 Found ${customers.length} customers\n`);

  let fixed = 0;
  let unchanged = 0;
  let errors = 0;
  const stats: Map<string, CustomerStats> = new Map();

  for (const customer of customers) {
    try {
      // Store before values
      const before = {
        totalSpent: Number(customer.totalSpent || 0),
        totalRefunded: Number(customer.totalRefunded || 0),
        netSpent: Number(customer.netSpent || 0),
        orderCount: customer.orderCount || 0
      };

      // Aggregate from Order table (source of truth)
      const orderStats = await prisma.order.aggregate({
        where: {
          customerId: customer.id,
          shop: shop
        },
        _sum: {
          totalPrice: true,
          totalRefunded: true
        },
        _count: {
          id: true
        },
        _max: {
          shopifyCreatedAt: true
        }
      });

      const totalSpent = Number(orderStats._sum.totalPrice || 0);
      const totalRefunded = Number(orderStats._sum.totalRefunded || 0);
      const netSpent = totalSpent - totalRefunded;
      const orderCount = orderStats._count.id || 0;

      // Check if update needed
      const needsUpdate =
        Math.abs(before.totalSpent - totalSpent) > 0.01 ||
        Math.abs(before.totalRefunded - totalRefunded) > 0.01 ||
        Math.abs(before.netSpent - netSpent) > 0.01 ||
        before.orderCount !== orderCount;

      if (needsUpdate) {
        // Update customer
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            totalSpent,
            totalRefunded,
            netSpent,
            orderCount,
            lastOrderDate: orderStats._max.shopifyCreatedAt || null,
            updatedAt: new Date()
          }
        });

        stats.set(customer.email, {
          before,
          after: { totalSpent, totalRefunded, netSpent, orderCount },
          changed: true
        });

        console.log(`✅ Fixed ${customer.email}:`);
        console.log(`   Before: $${before.totalSpent.toFixed(2)} - $${before.totalRefunded.toFixed(2)} = $${before.netSpent.toFixed(2)} (${before.orderCount} orders)`);
        console.log(`   After:  $${totalSpent.toFixed(2)} - $${totalRefunded.toFixed(2)} = $${netSpent.toFixed(2)} (${orderCount} orders)`);
        console.log(``);
        fixed++;
      } else {
        stats.set(customer.email, {
          before,
          after: { totalSpent, totalRefunded, netSpent, orderCount },
          changed: false
        });
        unchanged++;
      }
    } catch (error) {
      console.error(`❌ Error fixing ${customer.email}:`, error);
      errors++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Fixed:     ${fixed} customers`);
  console.log(`⚪ Unchanged: ${unchanged} customers`);
  console.log(`❌ Errors:    ${errors} customers`);
  console.log(`📋 Total:     ${customers.length} customers`);
  console.log(`${'='.repeat(60)}\n`);

  if (fixed > 0) {
    console.log(`\n📝 DETAILED CHANGES:\n`);
    for (const [email, stat] of stats.entries()) {
      if (stat.changed) {
        const spentDiff = stat.after.totalSpent - stat.before.totalSpent;
        const refundedDiff = stat.after.totalRefunded - stat.before.totalRefunded;
        const netDiff = stat.after.netSpent - stat.before.netSpent;
        const orderDiff = stat.after.orderCount - stat.before.orderCount;

        console.log(`${email}:`);
        console.log(`  totalSpent:    ${spentDiff >= 0 ? '+' : ''}${spentDiff.toFixed(2)} ($${stat.before.totalSpent.toFixed(2)} → $${stat.after.totalSpent.toFixed(2)})`);
        console.log(`  totalRefunded: ${refundedDiff >= 0 ? '+' : ''}${refundedDiff.toFixed(2)} ($${stat.before.totalRefunded.toFixed(2)} → $${stat.after.totalRefunded.toFixed(2)})`);
        console.log(`  netSpent:      ${netDiff >= 0 ? '+' : ''}${netDiff.toFixed(2)} ($${stat.before.netSpent.toFixed(2)} → $${stat.after.netSpent.toFixed(2)})`);
        console.log(`  orderCount:    ${orderDiff >= 0 ? '+' : ''}${orderDiff} (${stat.before.orderCount} → ${stat.after.orderCount})`);
        console.log(``);
      }
    }
  }

  return { fixed, unchanged, errors };
}

// Main execution
const shop = process.argv[2];

if (!shop) {
  console.error(`
❌ ERROR: Shop domain required

Usage:
  npx tsx scripts/fix-customer-spending-totals.ts <shop-domain>

Example:
  npx tsx scripts/fix-customer-spending-totals.ts mystore.myshopify.com
`);
  process.exit(1);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`🔧 Customer Spending Totals Repair Script`);
console.log(`${'='.repeat(60)}`);
console.log(`Shop: ${shop}`);
console.log(`Time: ${new Date().toISOString()}`);
console.log(`${'='.repeat(60)}\n`);

fixCustomerSpendingTotals(shop)
  .then(({ fixed, unchanged, errors }) => {
    if (errors > 0) {
      console.error(`\n⚠️  Warning: ${errors} customers had errors during processing\n`);
      process.exit(1);
    } else {
      console.log(`\n✅ Success! All customer spending totals are now accurate.\n`);
      process.exit(0);
    }
  })
  .catch((error) => {
    console.error(`\n❌ Fatal error:`, error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
