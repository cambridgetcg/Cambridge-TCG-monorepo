#!/usr/bin/env npx tsx
/**
 * Check Customer By Email
 *
 * Quick diagnostic for a customer by email address
 * Usage: npx tsx scripts/check-customer-by-email.ts <email>
 */

import * as dotenv from 'dotenv';
dotenv.config();

const EMAIL = process.argv[2];
const SHOP = process.argv[3] || '6e824e-a9.myshopify.com';

if (!EMAIL) {
  console.error('Usage: npx tsx scripts/check-customer-by-email.ts <email> [shop]');
  process.exit(1);
}

async function main() {
  const { default: prisma } = await import("../app/db.server");
  const { resolveEffectiveTier } = await import("../app/services/tier-resolution.server");

  console.log('='.repeat(60));
  console.log('CUSTOMER CHECK');
  console.log('='.repeat(60));
  console.log(`Email: ${EMAIL}`);
  console.log(`Shop: ${SHOP}`);
  console.log();

  // Find customer
  const customer = await prisma.customer.findFirst({
    where: { email: EMAIL, shop: SHOP },
    include: { currentTier: true }
  });

  if (!customer) {
    console.log('❌ Customer NOT FOUND in database');
    console.log();
    console.log('Possible causes:');
    console.log('1. Customer has not been synced yet');
    console.log('2. Email is different from what Shopify has');
    console.log('3. Customer is in a different shop');

    // Check all shops for this email
    const allMatches = await prisma.customer.findMany({
      where: { email: EMAIL },
      select: { shop: true, email: true, shopifyCustomerId: true }
    });

    if (allMatches.length > 0) {
      console.log();
      console.log('Found this email in other shops:');
      for (const m of allMatches) {
        console.log(`  - ${m.shop} (Shopify ID: ${m.shopifyCustomerId})`);
      }
    }

    await prisma.$disconnect();
    return;
  }

  console.log('✅ Customer FOUND');
  console.log();
  console.log('Database Record:');
  console.log(`  Internal ID: ${customer.id}`);
  console.log(`  Shopify ID: ${customer.shopifyCustomerId}`);
  console.log(`  Current Tier: ${customer.currentTier?.name || 'None'} (${customer.currentTierId || 'null'})`);
  console.log(`  Store Credit: $${Number(customer.storeCredit || 0)}`);
  console.log(`  Total Spent: $${Number(customer.totalSpent || 0)}`);
  console.log(`  Net Spent: $${Number(customer.netSpent || 0)}`);
  console.log();

  // Check tier purchases
  const purchases = await prisma.tierPurchase.findMany({
    where: { customerId: customer.id },
    include: { tier: true },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Tier Purchases: ${purchases.length}`);
  if (purchases.length > 0) {
    for (const p of purchases) {
      const statusEmoji = p.status === 'ACTIVE' ? '✅' : '❌';
      console.log(`  ${statusEmoji} ${p.tier?.name || 'Unknown'} - ${p.status} - ${p.endDate ? `expires ${p.endDate.toISOString().split('T')[0]}` : 'LIFETIME'}`);
    }
  }
  console.log();

  // Check tier subscriptions
  const subscriptions = await prisma.tierSubscription.findMany({
    where: { customerId: customer.id },
    include: { tier: true },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Tier Subscriptions: ${subscriptions.length}`);
  if (subscriptions.length > 0) {
    for (const s of subscriptions) {
      const statusEmoji = s.status === 'ACTIVE' ? '✅' : '❌';
      console.log(`  ${statusEmoji} ${s.tier?.name || 'Unknown'} - ${s.status}`);
    }
  }
  console.log();

  // Run tier resolution
  console.log('Tier Resolution:');
  try {
    const resolution = await resolveEffectiveTier(SHOP, customer.id);
    console.log(`  Effective Tier: ${resolution.effectiveTierName || 'None'}`);
    console.log(`  Source: ${resolution.effectiveSource}`);
    console.log(`  Conflict Resolved: ${resolution.conflictResolved}`);

    if (resolution.effectiveTierId !== customer.currentTierId) {
      console.log();
      console.log(`  ⚠️ MISMATCH: DB has ${customer.currentTier?.name || 'None'}, resolution says ${resolution.effectiveTierName || 'None'}`);
    }
  } catch (e: any) {
    console.log(`  Error: ${e.message}`);
  }

  console.log();
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error:', e);
  process.exit(1);
});
