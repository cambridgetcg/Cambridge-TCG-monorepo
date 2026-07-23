/**
 * Fix Customer Tier Script
 *
 * Re-runs tier resolution for a customer to fix incorrect tier assignment.
 * This script is useful when a customer's tier was corrupted by the old
 * calculateCustomerTierFromDB bug that didn't respect tier resolution priority.
 *
 * Usage: npx tsx scripts/fix-customer-tier.ts <shopifyCustomerId>
 * Example: npx tsx scripts/fix-customer-tier.ts 7891422871817
 */

import 'dotenv/config';

import { createDataAPIPrismaClient } from '../app/utils/prisma-data-api-adapter';

const prisma = createDataAPIPrismaClient();

// Get Shopify Customer ID from command line
const SHOPIFY_CUSTOMER_ID = process.argv[2];

if (!SHOPIFY_CUSTOMER_ID) {
  console.error('Usage: npx tsx scripts/fix-customer-tier.ts <shopifyCustomerId>');
  process.exit(1);
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIX CUSTOMER TIER');
  console.log('='.repeat(60));
  console.log(`\nLooking up customer with Shopify ID: ${SHOPIFY_CUSTOMER_ID}`);

  // Find the customer
  const customer = await prisma.customer.findFirst({
    where: { shopifyCustomerId: SHOPIFY_CUSTOMER_ID },
    include: { currentTier: true }
  });

  if (!customer) {
    console.error('\nCustomer not found in database');
    return;
  }

  console.log(`\nFound customer:`);
  console.log(`  ID: ${customer.id}`);
  console.log(`  Email: ${customer.email}`);
  console.log(`  Shop: ${customer.shop}`);
  console.log(`  Current Tier: ${customer.currentTier?.name || 'None'} (${customer.currentTierId})`);
  console.log(`  Cashback: ${customer.currentTier?.cashbackPercent || 0}%`);

  // Find active tier purchases
  const now = new Date();
  const activePurchases = await prisma.tierPurchase.findMany({
    where: {
      customerId: customer.id,
      status: 'ACTIVE',
      OR: [
        { endDate: null },           // Lifetime
        { endDate: { gte: now } }    // Not expired
      ]
    },
    include: { tier: true },
  });

  // Filter out purchases with missing tier records
  const validPurchases = activePurchases.filter(p => p.tier != null);

  console.log(`\nActive tier purchases: ${validPurchases.length}`);

  if (validPurchases.length === 0) {
    console.log('\nNo active tier purchases found - cannot fix tier');
    return;
  }

  // Sort by tier minSpend (highest first)
  validPurchases.sort((a, b) => (b.tier?.minSpend ?? 0) - (a.tier?.minSpend ?? 0));

  const bestPurchase = validPurchases[0];
  console.log(`\nBest tier purchase:`);
  console.log(`  Tier: ${bestPurchase.tier?.name} (${bestPurchase.tierId})`);
  console.log(`  Cashback: ${bestPurchase.tier?.cashbackPercent}%`);
  console.log(`  End Date: ${bestPurchase.endDate?.toISOString() || 'LIFETIME'}`);

  // Check if customer is already on the correct tier
  if (customer.currentTierId === bestPurchase.tierId) {
    console.log('\nCustomer is already on the correct tier!');
    return;
  }

  console.log(`\nMISMATCH DETECTED:`);
  console.log(`  Current: ${customer.currentTier?.name} (${customer.currentTier?.cashbackPercent}% cashback)`);
  console.log(`  Should be: ${bestPurchase.tier?.name} (${bestPurchase.tier?.cashbackPercent}% cashback)`);

  // Fix the tier
  console.log('\nFixing customer tier...');

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      currentTierId: bestPurchase.tierId,
      updatedAt: new Date()
    }
  });

  // Log the fix
  await prisma.tierChangeLog.create({
    data: {
      id: crypto.randomUUID(),
      customerId: customer.id,
      shop: customer.shop,
      fromTierId: customer.currentTierId,
      fromTierName: customer.currentTier?.name || null,
      toTierId: bestPurchase.tierId,
      toTierName: bestPurchase.tier?.name || null,
      changeType: 'UPGRADE',
      triggerType: 'TIER_RECALCULATION',
      metadata: {
        fixedBy: 'fix-customer-tier.ts',
        reason: 'Correcting tier after calculateCustomerTierFromDB bug fix',
        purchaseId: bestPurchase.id,
        fixedAt: new Date().toISOString()
      },
      createdAt: new Date()
    }
  });

  // Update CustomerTierState if it exists
  const tierState = await prisma.customerTierState.findUnique({
    where: { customerId: customer.id }
  });

  if (tierState) {
    await prisma.customerTierState.update({
      where: { customerId: customer.id },
      data: {
        tierSource: 'TIER_PURCHASE',
        activePurchaseId: bestPurchase.id,
        purchaseExpiresAt: bestPurchase.endDate,
        lastResolvedAt: new Date(),
        resolutionReason: 'Fixed by fix-customer-tier.ts script',
        updatedAt: new Date()
      }
    });
    console.log('Updated CustomerTierState');
  } else {
    await prisma.customerTierState.create({
      data: {
        id: crypto.randomUUID(),
        customerId: customer.id,
        tierSource: 'TIER_PURCHASE',
        hasManualOverride: false,
        activePurchaseId: bestPurchase.id,
        purchaseExpiresAt: bestPurchase.endDate,
        lastResolvedAt: new Date(),
        resolutionReason: 'Created by fix-customer-tier.ts script',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    console.log('Created CustomerTierState');
  }

  console.log('\nCustomer tier fixed successfully!');
  console.log(`  New Tier: ${bestPurchase.tier?.name}`);
  console.log(`  New Cashback: ${bestPurchase.tier?.cashbackPercent}%`);

  console.log('\n' + '='.repeat(60));
  console.log('DONE');
  console.log('='.repeat(60));
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
