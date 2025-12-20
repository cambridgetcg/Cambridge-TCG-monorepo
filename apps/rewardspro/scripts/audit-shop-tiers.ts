#!/usr/bin/env npx tsx
/**
 * Audit Shop Tiers
 *
 * Lists all customers in a shop with their tier data, purchases, and subscriptions
 * to help identify tier discrepancies
 */

import * as dotenv from 'dotenv';
dotenv.config();

const SHOP = '6e824e-a9.myshopify.com';

async function main() {
  const { default: prisma } = await import("../app/db.server");
  const { resolveEffectiveTier } = await import("../app/services/tier-resolution.server");

  console.log('='.repeat(80));
  console.log('SHOP TIER AUDIT');
  console.log('='.repeat(80));
  console.log(`Shop: ${SHOP}`);
  console.log();

  // 1. Get all tiers for the shop
  console.log('1. AVAILABLE TIERS');
  console.log('-'.repeat(60));
  const tiers = await prisma.tier.findMany({
    where: { shop: SHOP },
    orderBy: { minSpend: 'asc' }
  });

  for (const t of tiers) {
    console.log(`  ${t.name}: minSpend=$${t.minSpend}, cashback=${t.cashbackPercent}% (ID: ${t.id})`);
  }
  console.log();

  // 2. Get all customers with their current tier
  console.log('2. ALL CUSTOMERS');
  console.log('-'.repeat(60));
  const customers = await prisma.customer.findMany({
    where: { shop: SHOP },
    include: { currentTier: true },
    orderBy: { updatedAt: 'desc' }
  });

  console.log(`Found ${customers.length} customer(s):\n`);

  for (const c of customers) {
    console.log(`Customer: ${c.email}`);
    console.log(`  Shopify ID: ${c.shopifyCustomerId}`);
    console.log(`  Internal ID: ${c.id}`);
    console.log(`  DB Tier: ${c.currentTier?.name || 'None'} (${c.currentTierId || 'null'})`);
    console.log(`  Store Credit: $${Number(c.storeCredit || 0)}`);
    console.log(`  Total Spent: $${Number(c.totalSpent || 0)}`);
    console.log(`  Net Spent: $${Number(c.netSpent || 0)}`);

    // Check for tier purchases
    const purchases = await prisma.tierPurchase.findMany({
      where: { customerId: c.id, status: 'ACTIVE' },
      include: { tier: true }
    });

    if (purchases.length > 0) {
      console.log(`  Active Purchases: ${purchases.length}`);
      for (const p of purchases) {
        console.log(`    - ${p.tier?.name || 'Unknown'}: ${p.endDate ? `expires ${p.endDate.toISOString().split('T')[0]}` : 'LIFETIME'}`);
      }
    } else {
      console.log(`  Active Purchases: 0`);
    }

    // Check for tier subscriptions
    const subscriptions = await prisma.tierSubscription.findMany({
      where: { customerId: c.id, status: 'ACTIVE' },
      include: { tier: true }
    });

    if (subscriptions.length > 0) {
      console.log(`  Active Subscriptions: ${subscriptions.length}`);
      for (const s of subscriptions) {
        console.log(`    - ${s.tier?.name || 'Unknown'}`);
      }
    } else {
      console.log(`  Active Subscriptions: 0`);
    }

    // Run tier resolution to see what it returns
    try {
      const resolution = await resolveEffectiveTier(SHOP, c.id);
      console.log(`  Resolved Tier: ${resolution.effectiveTierName || 'None'} (source: ${resolution.effectiveSource})`);

      if (resolution.effectiveTierId !== c.currentTierId) {
        console.log(`  ⚠️ MISMATCH: DB has ${c.currentTier?.name || 'None'}, should be ${resolution.effectiveTierName || 'None'}`);
      }
    } catch (e: any) {
      console.log(`  Resolution Error: ${e.message}`);
    }

    console.log();
  }

  console.log('='.repeat(80));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error:', e);
  process.exit(1);
});
