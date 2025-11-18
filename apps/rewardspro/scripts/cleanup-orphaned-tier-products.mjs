/**
 * Cleanup Orphaned Tier Products
 *
 * Fixes tier products that reference non-existent tiers.
 *
 * This prevents webhook crashes in tier resolution when:
 * - Legacy tiers were deleted but tier products still reference them
 * - Typos in tierId during tier product creation
 * - Database inconsistencies after migrations
 *
 * Usage:
 *   node scripts/cleanup-orphaned-tier-products.mjs [--fix] [--shop=store.myshopify.com]
 *
 * Options:
 *   --fix: Actually fix the issues (dry-run by default)
 *   --shop: Only check/fix specific shop (all shops by default)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--fix');
const shopFilter = args.find(arg => arg.startsWith('--shop='))?.split('=')[1];

console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
console.log('║  ORPHANED TIER PRODUCTS CLEANUP                                    ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (use --fix to apply changes)' : '🔧 FIX MODE'}`);
console.log(`Scope: ${shopFilter ? `Shop: ${shopFilter}` : 'All shops'}\n`);

/**
 * Generate tier ID using the canonical slug format
 * Matches the logic from app/routes/app.customers.tsx:320-420
 */
function generateTierId(shop, tierName) {
  const storeName = shop.split('.')[0];
  const slug = tierName.trim().toLowerCase().replace(/\s+/g, '-');
  return `${storeName}-${slug}`;
}

/**
 * Find tier products with missing tier references
 */
async function findOrphanedTierProducts() {
  console.log('[Step 1] Finding tier products with missing tier references...\n');

  const whereClause = shopFilter ? { shop: shopFilter } : {};

  // Get all tier products
  const allTierProducts = await prisma.tierProduct.findMany({
    where: whereClause,
    include: {
      tier: true
    },
    orderBy: [
      { shop: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  // Find orphaned ones (tier is null)
  const orphaned = allTierProducts.filter(tp => tp.tier === null);

  console.log(`Total tier products: ${allTierProducts.length}`);
  console.log(`Orphaned tier products: ${orphaned.length}`);

  if (orphaned.length === 0) {
    console.log('\n✅ No orphaned tier products found!\n');
    return [];
  }

  console.log(`\n⚠️  Found ${orphaned.length} orphaned tier product(s):\n`);

  // Group by shop for reporting
  const byShop = orphaned.reduce((acc, tp) => {
    if (!acc[tp.shop]) acc[tp.shop] = [];
    acc[tp.shop].push(tp);
    return acc;
  }, {});

  for (const [shop, products] of Object.entries(byShop)) {
    console.log(`\n📍 Shop: ${shop}`);
    console.log(`   Orphaned products: ${products.length}`);

    for (const tp of products) {
      console.log(`\n   - Tier Product ID: ${tp.id}`);
      console.log(`     Referenced Tier ID: ${tp.tierId} (❌ NOT FOUND)`);
      console.log(`     Shopify Product ID: ${tp.shopifyProductId || 'N/A'}`);
      console.log(`     SKU: ${tp.sku || 'N/A'}`);
      console.log(`     Price: ${tp.price} ${tp.currency}`);
      console.log(`     Created: ${tp.createdAt.toISOString()}`);
    }
  }

  return orphaned;
}

/**
 * Get all tiers for a shop
 */
async function getTiersForShop(shop) {
  return await prisma.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'asc' }
  });
}

/**
 * Suggest tier based on tier product's referenced tierId
 */
function suggestTierMatch(tierProduct, availableTiers) {
  const referencedTierId = tierProduct.tierId;

  // Try to find a tier that matches the slug pattern
  // e.g., "teststore-gold" should match a tier with name "Gold"
  const parts = referencedTierId.split('-');
  const tierSlug = parts.slice(1).join('-'); // Remove shop prefix

  // Try exact match first
  const exactMatch = availableTiers.find(t => t.id === referencedTierId);
  if (exactMatch) return exactMatch;

  // Try slug-based match (compare normalized names)
  const slugMatch = availableTiers.find(t => {
    const expectedId = generateTierId(tierProduct.shop, t.name);
    return expectedId === referencedTierId;
  });
  if (slugMatch) return slugMatch;

  // Try name similarity match
  const nameMatch = availableTiers.find(t => {
    const tierNameSlug = t.name.toLowerCase().replace(/\s+/g, '-');
    return tierSlug === tierNameSlug;
  });
  if (nameMatch) return nameMatch;

  // Fall back to lowest tier (most conservative)
  return availableTiers[0];
}

/**
 * Fix orphaned tier products
 */
async function fixOrphanedTierProducts(orphaned) {
  console.log('\n\n[Step 2] Fixing orphaned tier products...\n');

  let fixed = 0;
  let errors = 0;

  for (const tp of orphaned) {
    try {
      // Get available tiers for this shop
      const tiers = await getTiersForShop(tp.shop);

      if (tiers.length === 0) {
        console.log(`\n❌ [${tp.id}] No tiers found for shop ${tp.shop}. Cannot fix.`);
        errors++;
        continue;
      }

      // Suggest the best matching tier
      const suggestedTier = suggestTierMatch(tp, tiers);

      console.log(`\n🔧 [${tp.id}]`);
      console.log(`   Current (invalid) tier ID: ${tp.tierId}`);
      console.log(`   Suggested tier: ${suggestedTier.name} (${suggestedTier.id})`);
      console.log(`   Tier minSpend: ${suggestedTier.minSpend} ${suggestedTier.evaluationPeriod}`);

      if (isDryRun) {
        console.log(`   ⏭️  DRY RUN: Would update tierId to ${suggestedTier.id}`);
      } else {
        // Actually update the tier product
        await prisma.tierProduct.update({
          where: { id: tp.id },
          data: {
            tierId: suggestedTier.id,
            updatedAt: new Date()
          }
        });

        console.log(`   ✅ Updated tierId to ${suggestedTier.id}`);
        fixed++;
      }

    } catch (error) {
      console.error(`\n❌ [${tp.id}] Error fixing tier product:`, error.message);
      errors++;
    }
  }

  return { fixed, errors };
}

/**
 * Check for tier purchases that might also be affected
 */
async function checkRelatedTierPurchases(orphaned) {
  console.log('\n\n[Step 3] Checking related tier purchases...\n');

  const tierProductIds = orphaned.map(tp => tp.id);

  if (tierProductIds.length === 0) {
    console.log('No orphaned tier products to check.\n');
    return;
  }

  const affectedPurchases = await prisma.tierPurchase.findMany({
    where: {
      tierProductId: {
        in: tierProductIds
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  console.log(`Found ${affectedPurchases.length} tier purchase(s) linked to orphaned tier products.`);

  if (affectedPurchases.length > 0) {
    console.log('\n⚠️  These purchases may have failed during webhook processing:\n');

    for (const purchase of affectedPurchases) {
      console.log(`   - Purchase ID: ${purchase.id}`);
      console.log(`     Customer ID: ${purchase.customerId}`);
      console.log(`     Tier ID: ${purchase.tierId}`);
      console.log(`     Shopify Order ID: ${purchase.shopifyOrderId}`);
      console.log(`     Status: ${purchase.status}`);
      console.log(`     Created: ${purchase.createdAt.toISOString()}\n`);
    }
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Step 1: Find orphaned tier products
    const orphaned = await findOrphanedTierProducts();

    if (orphaned.length === 0) {
      await prisma.$disconnect();
      return;
    }

    // Step 2: Fix them (or show what would be fixed)
    const { fixed, errors } = await fixOrphanedTierProducts(orphaned);

    // Step 3: Check related tier purchases
    await checkRelatedTierPurchases(orphaned);

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║  SUMMARY                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    console.log(`Orphaned tier products found: ${orphaned.length}`);

    if (isDryRun) {
      console.log(`\n⏭️  This was a DRY RUN. No changes were made.`);
      console.log(`\n💡 To apply fixes, run: node scripts/cleanup-orphaned-tier-products.mjs --fix`);
    } else {
      console.log(`\n✅ Fixed: ${fixed}`);
      console.log(`❌ Errors: ${errors}`);

      if (fixed > 0) {
        console.log(`\n🎉 Successfully fixed ${fixed} tier product(s)!`);
        console.log(`\n💡 Next steps:`);
        console.log(`   1. Test tier product purchases to ensure they work`);
        console.log(`   2. Review webhook logs to confirm no more crashes`);
        console.log(`   3. Monitor tier resolution for any warnings`);
      }
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main();
