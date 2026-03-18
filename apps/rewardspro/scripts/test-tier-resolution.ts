#!/usr/bin/env npx tsx
/**
 * Test Tier Resolution for Customer
 *
 * Verifies that the tier resolution system correctly identifies
 * the effective tier based on priority (Manual > Subscription > Purchase > Spending)
 */

// Load env vars BEFORE any other imports
import * as dotenv from 'dotenv';
dotenv.config();

const SHOP = '6e824e-a9.myshopify.com';
const CUSTOMER_ID = '8d208c98-9702-44b7-b4b1-764bdb010761';

async function main() {
  // Dynamic imports after dotenv is loaded
  const { default: prisma } = await import("../app/db.server");
  const { resolveEffectiveTier } = await import("../app/services/tier-resolution.server");
  console.log('='.repeat(80));
  console.log('TESTING TIER RESOLUTION');
  console.log('='.repeat(80));
  console.log(`Shop: ${SHOP}`);
  console.log(`Customer ID: ${CUSTOMER_ID}`);
  console.log();

  // 1. Get current customer state
  console.log('1. CURRENT DATABASE STATE');
  console.log('-'.repeat(60));
  const customer = await prisma.customer.findFirst({
    where: { id: CUSTOMER_ID, shop: SHOP },
    include: { currentTier: true }
  });

  if (!customer) {
    console.log('Customer not found!');
    process.exit(1);
  }

  console.log('Current Tier ID:', customer.currentTierId || 'None');
  console.log('Current Tier Name:', customer.currentTier?.name || 'None');
  console.log('Store Credit:', Number(customer.storeCredit));
  console.log();

  // 2. Check active tier purchases
  console.log('2. ACTIVE TIER PURCHASES');
  console.log('-'.repeat(60));
  const purchases = await prisma.tierPurchase.findMany({
    where: {
      customerId: CUSTOMER_ID,
      shop: SHOP,
      status: 'ACTIVE'
    },
    include: { tier: true }
  });

  console.log(`Found ${purchases.length} active purchase(s):`);
  for (const p of purchases) {
    console.log(`  - ${p.tier?.name || 'Unknown Tier'}: ${p.endDate ? `expires ${p.endDate}` : 'LIFETIME'} (status: ${p.status})`);
    console.log(`    Tier ID: ${p.tierId}, Tier object: ${p.tier ? 'loaded' : 'NULL!'}`);
  }
  console.log();

  // 3. Run tier resolution
  console.log('3. TIER RESOLUTION RESULT');
  console.log('-'.repeat(60));
  const resolution = await resolveEffectiveTier(SHOP, CUSTOMER_ID);

  console.log('Effective Tier ID:', resolution.effectiveTierId || 'None');
  console.log('Effective Tier Name:', resolution.effectiveTierName || 'None');
  console.log('Effective Source:', resolution.effectiveSource);
  console.log('Conflict Resolved:', resolution.conflictResolved);
  console.log('Resolution Reason:', resolution.resolutionReason);
  console.log();

  console.log('All Sources:');
  for (const source of resolution.allSources) {
    console.log(`  - ${source.source}: ${source.tierName} (priority: ${source.priority})`);
  }
  console.log();

  // 4. Verify expected result
  console.log('4. VERIFICATION');
  console.log('-'.repeat(60));
  const hasPlatinumPurchase = purchases.some(p => p.tier?.name === 'Platinum' && p.status === 'ACTIVE');
  const resolvedToPlatinum = resolution.effectiveTierName === 'Platinum';
  const sourceIsPurchase = resolution.effectiveSource === 'TIER_PURCHASE';

  if (hasPlatinumPurchase && resolvedToPlatinum && sourceIsPurchase) {
    console.log('✅ SUCCESS: Customer correctly resolves to Platinum tier from purchase');
  } else if (hasPlatinumPurchase && !resolvedToPlatinum) {
    console.log('❌ FAILURE: Customer has Platinum purchase but resolved to:', resolution.effectiveTierName);
    console.log('   Expected: Platinum from TIER_PURCHASE');
    console.log('   Got:', resolution.effectiveTierName, 'from', resolution.effectiveSource);
  } else if (!hasPlatinumPurchase) {
    console.log('⚠️ WARNING: No active Platinum purchase found');
  } else {
    console.log('✅ Tier resolved correctly');
  }

  console.log();
  console.log('='.repeat(80));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error:', e);
  process.exit(1);
});
