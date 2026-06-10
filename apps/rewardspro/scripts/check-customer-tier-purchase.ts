/**
 * Diagnostic Script: Check Customer Tier Purchase
 *
 * This script checks why a customer may have been assigned the wrong tier
 * after purchasing a tier product.
 *
 * Usage: npx tsx scripts/check-customer-tier-purchase.ts [shopifyCustomerId] [email]
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createDataAPIPrismaClient } from '../app/utils/prisma-data-api-adapter';

const prisma = createDataAPIPrismaClient();

// Customer to check - using Shopify Customer ID
// Can be passed as command line argument: npx tsx scripts/check-customer-tier-purchase.ts 7891422871817
const SHOPIFY_CUSTOMER_ID = process.argv[2] || '7891422871817';
const CUSTOMER_EMAIL = process.argv[3] || 'aaasiadog@gmail.com';

async function main() {
  console.log('='.repeat(80));
  console.log('TIER PURCHASE DIAGNOSTIC REPORT');
  console.log('='.repeat(80));
  console.log(`\nLooking up customer by Shopify ID: ${SHOPIFY_CUSTOMER_ID}`);
  console.log(`Email: ${CUSTOMER_EMAIL}`);
  console.log('');

  // Step 1: Find the customer
  console.log('─'.repeat(80));
  console.log('STEP 1: CUSTOMER LOOKUP');
  console.log('─'.repeat(80));

  // Search for all customers matching the criteria
  const allMatchingCustomers = await prisma.customer.findMany({
    where: {
      OR: [
        { shopifyCustomerId: SHOPIFY_CUSTOMER_ID },
        { shopifyCustomerId: { contains: SHOPIFY_CUSTOMER_ID } },
        { email: CUSTOMER_EMAIL }
      ]
    },
    include: {
      currentTier: true
    }
  });

  console.log(`Found ${allMatchingCustomers.length} matching customer(s):\n`);
  for (const c of allMatchingCustomers) {
    console.log(`   Shop: ${c.shop}`);
    console.log(`   Email: ${c.email}`);
    console.log(`   Shopify ID: ${c.shopifyCustomerId}`);
    console.log(`   Tier: ${c.currentTier?.name || 'None'}`);
    console.log('');
  }

  // Prefer exact shopify ID match
  const customer = allMatchingCustomers.find(c => c.shopifyCustomerId === SHOPIFY_CUSTOMER_ID)
    || allMatchingCustomers.find(c => c.shopifyCustomerId.includes(SHOPIFY_CUSTOMER_ID))
    || allMatchingCustomers[0];

  if (!customer) {
    console.log('❌ Customer not found in database');
    return;
  }

  console.log('✅ Customer found:');
  console.log(`   ID:               ${customer.id}`);
  console.log(`   Shopify ID:       ${customer.shopifyCustomerId}`);
  console.log(`   Email:            ${customer.email}`);
  console.log(`   Shop:             ${customer.shop}`);
  console.log(`   Current Tier ID:  ${customer.currentTierId || 'null'}`);
  console.log(`   Current Tier:     ${customer.currentTier?.name || 'None'}`);
  console.log(`   Cashback %:       ${customer.currentTier?.cashbackPercent || 0}%`);
  console.log(`   Total Spent:      ${customer.totalSpent}`);
  console.log(`   Store Credit:     ${customer.storeCredit}`);
  console.log('');

  // Step 2: Check all tiers in the shop
  console.log('─'.repeat(80));
  console.log('STEP 2: ALL TIERS IN SHOP');
  console.log('─'.repeat(80));

  const tiers = await prisma.tier.findMany({
    where: { shop: customer.shop },
    orderBy: { minSpend: 'asc' }
  });

  console.log(`Found ${tiers.length} tiers:\n`);
  for (const tier of tiers) {
    const isCurrentTier = tier.id === customer.currentTierId;
    console.log(`   ${isCurrentTier ? '→' : ' '} ${tier.name}`);
    console.log(`     ID:           ${tier.id}`);
    console.log(`     Min Spend:    ${tier.minSpend}`);
    console.log(`     Cashback:     ${tier.cashbackPercent}%`);
    console.log('');
  }

  // Step 3: Check tier purchases for this customer
  console.log('─'.repeat(80));
  console.log('STEP 3: TIER PURCHASES');
  console.log('─'.repeat(80));

  // Also search by shop to find all tier purchases
  const allTierPurchases = await prisma.tierPurchase.findMany({
    where: { shop: customer.shop },
    include: {
      tier: true,
      tierProduct: true,
      customer: true
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  if (allTierPurchases.length > 0) {
    console.log(`\nAll tier purchases in shop (${allTierPurchases.length}):`);
    for (const p of allTierPurchases) {
      console.log(`   ${p.createdAt.toISOString()} - ${p.customer?.email || 'Unknown'} - ${p.tier?.name || 'MISSING'} - ${p.status}`);
    }
    console.log('');
  }

  const tierPurchases = await prisma.tierPurchase.findMany({
    where: { customerId: customer.id },
    include: {
      tier: true,
      tierProduct: true
    },
    orderBy: { createdAt: 'desc' }
  });

  if (tierPurchases.length === 0) {
    console.log('❌ No tier purchases found for this customer');
  } else {
    console.log(`Found ${tierPurchases.length} tier purchase(s):\n`);
    for (const purchase of tierPurchases) {
      console.log(`   Purchase ID: ${purchase.id}`);
      console.log(`     Status:         ${purchase.status}`);
      console.log(`     Tier ID:        ${purchase.tierId}`);
      console.log(`     Tier Name:      ${purchase.tier?.name || 'MISSING TIER!'}`);
      console.log(`     Tier Cashback:  ${purchase.tier?.cashbackPercent || 'N/A'}%`);
      console.log(`     TierProduct ID: ${purchase.tierProductId}`);
      console.log(`     Order ID:       ${purchase.shopifyOrderId}`);
      console.log(`     Price:          ${purchase.purchasePrice} ${purchase.currency}`);
      console.log(`     Start Date:     ${purchase.startDate.toISOString()}`);
      console.log(`     End Date:       ${purchase.endDate?.toISOString() || 'LIFETIME'}`);
      console.log(`     Created:        ${purchase.createdAt.toISOString()}`);
      console.log('');

      // Check if tier exists
      if (!purchase.tier) {
        console.log('     ⚠️  WARNING: This purchase references a non-existent tier!');
        console.log(`     ⚠️  The tier ${purchase.tierId} may have been deleted.`);
      }
    }
  }

  // Step 4: Check tier products in the shop
  console.log('─'.repeat(80));
  console.log('STEP 4: TIER PRODUCTS IN SHOP');
  console.log('─'.repeat(80));

  // First check ALL tier products across all shops
  const allTierProducts = await prisma.tierProduct.findMany({
    include: { tier: true }
  });

  if (allTierProducts.length > 0) {
    console.log(`\nALL tier products in database (${allTierProducts.length}):\n`);
    for (const tp of allTierProducts) {
      console.log(`   Shop: ${tp.shop}`);
      console.log(`   Shopify Product: ${tp.shopifyProductId}`);
      console.log(`   Tier: ${tp.tier?.name || 'MISSING'} (${tp.tierId})`);
      console.log(`   SKU: ${tp.sku || 'none'}`);
      console.log('');
    }
  } else {
    console.log('\n⚠️  No tier products exist in the entire database!\n');
  }

  const tierProducts = await prisma.tierProduct.findMany({
    where: { shop: customer.shop },
    include: { tier: true }
  });

  console.log(`Found ${tierProducts.length} tier product(s):\n`);
  for (const tp of tierProducts) {
    console.log(`   Product ID: ${tp.id}`);
    console.log(`     Shopify Product: ${tp.shopifyProductId}`);
    console.log(`     Tier ID:         ${tp.tierId}`);
    console.log(`     Tier Name:       ${tp.tier?.name || 'MISSING TIER!'}`);
    console.log(`     Tier Cashback:   ${tp.tier?.cashbackPercent || 'N/A'}%`);
    console.log(`     SKU:             ${tp.sku || 'none'}`);
    console.log(`     Duration:        ${tp.duration}`);
    console.log(`     Purchase Type:   ${tp.purchaseType}`);
    console.log(`     Status:          ${tp.status}`);
    console.log('');

    if (!tp.tier) {
      console.log('     ⚠️  WARNING: This tier product references a non-existent tier!');
    }
  }

  // Step 5: Check tier change logs
  console.log('─'.repeat(80));
  console.log('STEP 5: TIER CHANGE HISTORY');
  console.log('─'.repeat(80));

  const tierChangeLogs = await prisma.tierChangeLog.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  if (tierChangeLogs.length === 0) {
    console.log('No tier change logs found');
  } else {
    console.log(`Last ${tierChangeLogs.length} tier changes:\n`);
    for (const log of tierChangeLogs) {
      console.log(`   ${log.createdAt.toISOString()}`);
      console.log(`     Change:      ${log.fromTierName || 'None'} → ${log.toTierName || 'None'}`);
      console.log(`     Type:        ${log.changeType}`);
      console.log(`     Trigger:     ${log.triggerType}`);
      console.log(`     Order ID:    ${log.orderId || 'N/A'}`);
      if (log.metadata) {
        console.log(`     Metadata:    ${JSON.stringify(log.metadata, null, 2)}`);
      }
      console.log('');
    }
  }

  // Step 6: Check CustomerTierState
  console.log('─'.repeat(80));
  console.log('STEP 6: CUSTOMER TIER STATE');
  console.log('─'.repeat(80));

  const tierState = await prisma.customerTierState.findUnique({
    where: { customerId: customer.id }
  });

  if (!tierState) {
    console.log('No CustomerTierState record found');
  } else {
    console.log('Tier State:');
    console.log(`   Tier Source:           ${tierState.tierSource}`);
    console.log(`   Has Manual Override:   ${tierState.hasManualOverride}`);
    console.log(`   Active Purchase ID:    ${tierState.activePurchaseId || 'none'}`);
    console.log(`   Purchase Expires:      ${tierState.purchaseExpiresAt?.toISOString() || 'N/A'}`);
    console.log(`   Active Subscription:   ${tierState.activeSubscriptionId || 'none'}`);
    console.log(`   Spending Tier ID:      ${tierState.spendingBasedTierId || 'none'}`);
    console.log(`   Last Resolved:         ${tierState.lastResolvedAt?.toISOString() || 'never'}`);
    console.log(`   Resolution Reason:     ${tierState.resolutionReason || 'none'}`);
  }

  // Step 7: Analysis
  console.log('');
  console.log('='.repeat(80));
  console.log('ANALYSIS');
  console.log('='.repeat(80));

  // Check if there's a mismatch
  const activePurchases = tierPurchases.filter(p => p.status === 'ACTIVE');
  const validActivePurchases = activePurchases.filter(p => p.tier != null);

  if (activePurchases.length > 0 && validActivePurchases.length === 0) {
    console.log('❌ PROBLEM: Active purchases exist but reference non-existent tiers!');
    console.log('   This is likely causing the customer to fall back to spending-based tier.');
  }

  if (validActivePurchases.length > 0) {
    const bestPurchase = validActivePurchases.sort((a, b) =>
      (b.tier?.minSpend || 0) - (a.tier?.minSpend || 0)
    )[0];

    console.log(`\n✅ Best active purchase: ${bestPurchase.tier?.name}`);
    console.log(`   Cashback: ${bestPurchase.tier?.cashbackPercent}%`);

    if (customer.currentTier && bestPurchase.tier) {
      if (customer.currentTier.id !== bestPurchase.tier.id) {
        console.log(`\n❌ MISMATCH DETECTED!`);
        console.log(`   Customer is on: ${customer.currentTier.name} (${customer.currentTier.cashbackPercent}% cashback)`);
        console.log(`   Should be on:   ${bestPurchase.tier.name} (${bestPurchase.tier.cashbackPercent}% cashback)`);
        console.log(`\n   Possible causes:`);
        console.log(`   1. Tier resolution didn't run after purchase`);
        console.log(`   2. Another tier source (manual, subscription) is overriding`);
        console.log(`   3. The purchase was processed but resolution failed`);
      } else {
        console.log('\n✅ Customer is on the correct purchased tier');
      }
    }
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('END OF REPORT');
  console.log('='.repeat(80));
}

main()
  .catch(console.error)
  .finally(() => {
    // Script cleanup
    process.exit(0);
  });
