#!/usr/bin/env npx tsx
/**
 * Diagnose Cashback Mismatch
 *
 * Traces the complete data flow to find where tier name and cashback might diverge.
 * Usage: npx tsx scripts/diagnose-cashback-mismatch.ts <shopifyCustomerId> [shop]
 */

import * as dotenv from 'dotenv';
dotenv.config();

const SHOPIFY_CUSTOMER_ID = process.argv[2];
const SHOP = process.argv[3] || '6e824e-a9.myshopify.com';

if (!SHOPIFY_CUSTOMER_ID) {
  console.error('Usage: npx tsx scripts/diagnose-cashback-mismatch.ts <shopifyCustomerId> [shop]');
  process.exit(1);
}

async function main() {
  const { default: prisma } = await import("../app/db.server");
  const { resolveEffectiveTier } = await import("../app/services/tier-resolution.server");
  const { getAuroraClient } = await import("../app/utils/aurora-data-api");

  console.log('='.repeat(80));
  console.log('CASHBACK MISMATCH DIAGNOSTIC');
  console.log('='.repeat(80));
  console.log(`Shop: ${SHOP}`);
  console.log(`Shopify Customer ID: ${SHOPIFY_CUSTOMER_ID}`);
  console.log();

  // ============================================
  // STEP 1: Get all tiers for the shop
  // ============================================
  console.log('1. ALL TIERS IN SHOP');
  console.log('-'.repeat(60));
  const allTiers = await prisma.tier.findMany({
    where: { shop: SHOP },
    orderBy: { minSpend: 'asc' }
  });

  console.log(`Found ${allTiers.length} tiers:`);
  for (const t of allTiers) {
    console.log(`  ${t.name}: minSpend=$${t.minSpend}, cashback=${t.cashbackPercent}% (ID: ${t.id})`);
  }
  console.log();

  // ============================================
  // STEP 2: Query customer via Prisma
  // ============================================
  console.log('2. CUSTOMER DATA (Prisma)');
  console.log('-'.repeat(60));
  const customer = await prisma.customer.findFirst({
    where: { shop: SHOP, shopifyCustomerId: SHOPIFY_CUSTOMER_ID },
    include: { currentTier: true }
  });

  if (!customer) {
    console.log('❌ Customer NOT FOUND');
    await prisma.$disconnect();
    return;
  }

  console.log(`Customer ID: ${customer.id}`);
  console.log(`Email: ${customer.email}`);
  console.log(`currentTierId: ${customer.currentTierId || 'null'}`);
  console.log(`currentTier.name: ${customer.currentTier?.name || 'null'}`);
  console.log(`currentTier.cashbackPercent: ${customer.currentTier?.cashbackPercent ?? 'null'}`);
  console.log();

  // ============================================
  // STEP 3: Query via Aurora Data API (same as api.proxy.$.tsx)
  // ============================================
  console.log('3. CUSTOMER DATA (Aurora Data API - same as widget)');
  console.log('-'.repeat(60));
  const dataApi = getAuroraClient();
  const sql = `
    SELECT
      c.id,
      c."shopifyCustomerId",
      c.email,
      c."currentTierId",
      t.id as "tier_id",
      t.name as "tier_name",
      t."minSpend" as "tier_minSpend",
      t."cashbackPercent" as "tier_cashbackPercent"
    FROM "Customer" c
    LEFT JOIN "Tier" t ON t.id = c."currentTierId"
    WHERE c.shop = :shop AND c."shopifyCustomerId" = :customerId
    LIMIT 1
  `;

  const result = await dataApi.executeStatement(sql, [
    { name: 'shop', value: { stringValue: SHOP } },
    { name: 'customerId', value: { stringValue: SHOPIFY_CUSTOMER_ID } }
  ]);

  if (result.records && result.records.length > 0) {
    const row = result.records[0];
    console.log(`Customer ID: ${row.id}`);
    console.log(`currentTierId: ${row.currentTierId || 'null'}`);
    console.log(`tier_id: ${row.tier_id || 'null'}`);
    console.log(`tier_name: ${row.tier_name || 'null'}`);
    console.log(`tier_cashbackPercent: ${row.tier_cashbackPercent ?? 'null'} (type: ${typeof row.tier_cashbackPercent})`);
  }
  console.log();

  // ============================================
  // STEP 4: Run tier resolution
  // ============================================
  console.log('4. TIER RESOLUTION');
  console.log('-'.repeat(60));
  const resolution = await resolveEffectiveTier(SHOP, customer.id);

  console.log(`effectiveTierId: ${resolution.effectiveTierId || 'null'}`);
  console.log(`effectiveTierName: ${resolution.effectiveTierName || 'null'}`);
  console.log(`effectiveSource: ${resolution.effectiveSource}`);
  console.log(`conflictResolved: ${resolution.conflictResolved}`);
  console.log(`resolutionReason: ${resolution.resolutionReason || 'none'}`);
  console.log();
  console.log('All sources found:');
  for (const src of resolution.allSources) {
    console.log(`  - ${src.source}: ${src.tierName} (ID: ${src.tierId}, priority: ${src.priority})`);
  }
  console.log();

  // ============================================
  // STEP 5: Fetch the resolved tier
  // ============================================
  console.log('5. RESOLVED TIER DATA');
  console.log('-'.repeat(60));
  if (resolution.effectiveTierId) {
    const resolvedTier = await prisma.tier.findUnique({
      where: { id: resolution.effectiveTierId }
    });

    if (resolvedTier) {
      console.log(`Tier ID: ${resolvedTier.id}`);
      console.log(`Tier Name: ${resolvedTier.name}`);
      console.log(`Tier Cashback: ${resolvedTier.cashbackPercent}%`);
      console.log(`Tier MinSpend: $${resolvedTier.minSpend}`);
    } else {
      console.log(`⚠️ Tier ${resolution.effectiveTierId} NOT FOUND in database!`);
    }
  } else {
    console.log('No effective tier resolved');
  }
  console.log();

  // ============================================
  // STEP 6: Check tier purchases
  // ============================================
  console.log('6. TIER PURCHASES');
  console.log('-'.repeat(60));
  const purchases = await prisma.tierPurchase.findMany({
    where: { customerId: customer.id },
    include: { tier: true, tierProduct: true },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Found ${purchases.length} tier purchase(s):`);
  for (const p of purchases) {
    const status = p.status === 'ACTIVE' ? '✅' : '❌';
    console.log(`  ${status} ${p.tier?.name || 'MISSING TIER'} - ${p.status}`);
    console.log(`      tierId: ${p.tierId}`);
    console.log(`      tier.cashbackPercent: ${p.tier?.cashbackPercent ?? 'N/A'}`);
    console.log(`      tierProduct: ${p.tierProduct?.name || 'N/A'}`);
    console.log(`      endDate: ${p.endDate?.toISOString() || 'LIFETIME'}`);
  }
  console.log();

  // ============================================
  // STEP 7: Check tier subscriptions
  // ============================================
  console.log('7. TIER SUBSCRIPTIONS');
  console.log('-'.repeat(60));
  const subscriptions = await prisma.tierSubscription.findMany({
    where: { customerId: customer.id },
    include: { tier: true },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Found ${subscriptions.length} tier subscription(s):`);
  for (const s of subscriptions) {
    const status = s.status === 'ACTIVE' ? '✅' : '❌';
    console.log(`  ${status} ${s.tier?.name || 'MISSING TIER'} - ${s.status}`);
    console.log(`      tierId: ${s.tierId}`);
    console.log(`      tier.cashbackPercent: ${s.tier?.cashbackPercent ?? 'N/A'}`);
  }
  console.log();

  // ============================================
  // STEP 8: Simulate API response
  // ============================================
  console.log('8. SIMULATED API RESPONSE');
  console.log('-'.repeat(60));

  // Simulate what api.proxy.$.tsx would do
  let currentTier = customer.currentTier;
  let tierSource = 'database';

  if (resolution.effectiveTierId && resolution.effectiveTierId !== customer.currentTierId) {
    console.log(`⚠️ Resolution tier differs from database tier!`);
    console.log(`   Database: ${customer.currentTierId} (${customer.currentTier?.name})`);
    console.log(`   Resolved: ${resolution.effectiveTierId} (${resolution.effectiveTierName})`);

    currentTier = await prisma.tier.findUnique({
      where: { id: resolution.effectiveTierId }
    });
    tierSource = resolution.effectiveSource;
  } else if (resolution.effectiveTierId === customer.currentTierId) {
    console.log(`✅ Resolution matches database tier`);
    tierSource = resolution.effectiveSource;
  } else {
    console.log(`⚠️ Resolution returned no tier`);
  }

  console.log();
  console.log('Widget would display:');
  console.log(`  Tier Name: ${currentTier?.name || 'null'}`);
  console.log(`  Cashback: ${currentTier?.cashbackPercent ?? 'null'}%`);
  console.log(`  Source: ${tierSource}`);
  console.log();

  // ============================================
  // STEP 9: Check for mismatches
  // ============================================
  console.log('9. MISMATCH ANALYSIS');
  console.log('-'.repeat(60));

  const dbTier = customer.currentTier;
  const resolvedTier = resolution.effectiveTierId
    ? await prisma.tier.findUnique({ where: { id: resolution.effectiveTierId } })
    : null;

  if (dbTier && resolvedTier) {
    if (dbTier.id !== resolvedTier.id) {
      console.log('⚠️ TIER ID MISMATCH');
      console.log(`   Database tier: ${dbTier.name} (${dbTier.id})`);
      console.log(`   Resolved tier: ${resolvedTier.name} (${resolvedTier.id})`);
    } else if (dbTier.name !== resolvedTier.name) {
      console.log('⚠️ TIER NAME MISMATCH (same ID, different name?)');
      console.log(`   Database tier name: ${dbTier.name}`);
      console.log(`   Resolved tier name: ${resolvedTier.name}`);
    } else if (dbTier.cashbackPercent !== resolvedTier.cashbackPercent) {
      console.log('⚠️ CASHBACK MISMATCH (same ID, different cashback?)');
      console.log(`   Database cashback: ${dbTier.cashbackPercent}%`);
      console.log(`   Resolved cashback: ${resolvedTier.cashbackPercent}%`);
    } else {
      console.log('✅ No mismatch detected between database and resolved tier');
    }
  } else if (!dbTier && resolvedTier) {
    console.log('⚠️ Database has no tier, but resolution found one');
    console.log(`   Resolved: ${resolvedTier.name} (${resolvedTier.cashbackPercent}%)`);
  } else if (dbTier && !resolvedTier) {
    console.log('⚠️ Database has tier, but resolution returned none');
    console.log(`   Database: ${dbTier.name} (${dbTier.cashbackPercent}%)`);
  } else {
    console.log('✅ Both database and resolution have no tier');
  }

  // Check if tier name in resolution matches actual tier
  if (resolution.effectiveTierName && resolvedTier) {
    if (resolution.effectiveTierName !== resolvedTier.name) {
      console.log();
      console.log('🚨 CRITICAL: Resolution tierName does not match actual tier!');
      console.log(`   Resolution returned name: ${resolution.effectiveTierName}`);
      console.log(`   Actual tier name in DB: ${resolvedTier.name}`);
      console.log('   This could cause display issues!');
    }
  }

  console.log();
  console.log('='.repeat(80));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error:', e);
  process.exit(1);
});
