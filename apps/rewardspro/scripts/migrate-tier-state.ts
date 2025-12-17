/**
 * Migration Script: Populate CustomerTierState from Existing Data
 *
 * This script analyzes existing customer data and creates CustomerTierState records
 * to establish the single source of truth for tier state.
 *
 * Run with: npx tsx scripts/migrate-tier-state.ts
 *
 * What it does:
 * 1. For each customer in the database:
 *    - Check for manual override in TierChangeLog (metadata.permanentOverride = true)
 *    - Check for active TierSubscription
 *    - Check for active TierPurchase
 *    - Get current spending-based tier from customer.currentTierId
 *    - Create CustomerTierState record with appropriate source
 */

import { createDataAPIPrismaClient } from "../app/utils/prisma-data-api-adapter";
import { v4 as uuidv4 } from "uuid";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define TierSource enum locally since we can't import from @prisma/client with Data API
type TierSource = 'MANUAL_OVERRIDE' | 'TIER_SUBSCRIPTION' | 'TIER_PURCHASE' | 'SPENDING_BASED' | 'NONE';

const db = createDataAPIPrismaClient();

interface MigrationStats {
  total: number;
  created: number;
  skipped: number;
  errors: number;
  bySource: {
    MANUAL_OVERRIDE: number;
    TIER_SUBSCRIPTION: number;
    TIER_PURCHASE: number;
    SPENDING_BASED: number;
    NONE: number;
  };
}

async function migrateTierState() {
  console.log("=".repeat(60));
  console.log("CustomerTierState Migration Script");
  console.log("=".repeat(60));
  console.log("");

  const stats: MigrationStats = {
    total: 0,
    created: 0,
    skipped: 0,
    errors: 0,
    bySource: {
      MANUAL_OVERRIDE: 0,
      TIER_SUBSCRIPTION: 0,
      TIER_PURCHASE: 0,
      SPENDING_BASED: 0,
      NONE: 0,
    },
  };

  try {
    // Get all customers
    const customers = await db.customer.findMany({
      select: {
        id: true,
        shop: true,
        currentTierId: true,
        netSpent: true,
      },
    });

    console.log(`Found ${customers.length} customers to process\n`);
    stats.total = customers.length;

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(customers.length / batchSize)}...`);

      for (const customer of batch) {
        try {
          await processCustomer(customer, stats);
        } catch (error) {
          console.error(`Error processing customer ${customer.id}:`, error);
          stats.errors++;
        }
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("Migration Complete");
    console.log("=".repeat(60));
    console.log(`Total customers: ${stats.total}`);
    console.log(`Created: ${stats.created}`);
    console.log(`Skipped (already exists): ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log("\nBy Source:");
    console.log(`  MANUAL_OVERRIDE: ${stats.bySource.MANUAL_OVERRIDE}`);
    console.log(`  TIER_SUBSCRIPTION: ${stats.bySource.TIER_SUBSCRIPTION}`);
    console.log(`  TIER_PURCHASE: ${stats.bySource.TIER_PURCHASE}`);
    console.log(`  SPENDING_BASED: ${stats.bySource.SPENDING_BASED}`);
    console.log(`  NONE: ${stats.bySource.NONE}`);

  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

async function processCustomer(
  customer: {
    id: string;
    shop: string;
    currentTierId: string | null;
    netSpent: any;
  },
  stats: MigrationStats
): Promise<void> {
  // Check if CustomerTierState already exists
  const existing = await db.customerTierState.findUnique({
    where: { customerId: customer.id },
  });

  if (existing) {
    stats.skipped++;
    return;
  }

  const now = new Date();

  // Determine tier source by checking each possibility

  // 1. Check for manual override in TierChangeLog
  const manualOverride = await db.tierChangeLog.findFirst({
    where: {
      customerId: customer.id,
      triggerType: "MANUAL_ADMIN",
    },
    orderBy: { createdAt: "desc" },
  });

  let hasManualOverride = false;
  let manualOverrideAt: Date | null = null;
  let manualOverrideBy: string | null = null;
  let manualOverrideExpiry: Date | null = null;
  let manualOverrideNote: string | null = null;

  if (manualOverride) {
    // Parse metadata (may be string in Aurora Data API)
    let metadata = manualOverride.metadata as any;
    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = null;
      }
    }

    if (metadata?.permanentOverride === true) {
      hasManualOverride = true;
      manualOverrideAt = manualOverride.createdAt;
      manualOverrideBy = manualOverride.processedBy || null;
      manualOverrideNote = manualOverride.note || null;
    } else if (metadata?.overrideDuration) {
      // Check if temporary override is still active
      const expiryDate = new Date(manualOverride.createdAt);
      expiryDate.setDate(expiryDate.getDate() + metadata.overrideDuration);

      if (expiryDate > now) {
        hasManualOverride = true;
        manualOverrideAt = manualOverride.createdAt;
        manualOverrideBy = manualOverride.processedBy || null;
        manualOverrideExpiry = expiryDate;
        manualOverrideNote = manualOverride.note || null;
      }
    }
  }

  // 2. Check for active subscription
  const activeSubscription = await db.tierSubscription.findFirst({
    where: {
      customerId: customer.id,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });

  // 3. Check for active purchase
  const activePurchase = await db.tierPurchase.findFirst({
    where: {
      customerId: customer.id,
      status: "ACTIVE",
      OR: [
        { endDate: null },
        { endDate: { gte: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  // Determine effective source and tier
  let tierSource: TierSource;
  let effectiveTierId: string | null = null;
  let tierSourceId: string | null = null;
  let activePurchaseId: string | null = null;
  let purchaseExpiresAt: Date | null = null;
  let activeSubscriptionId: string | null = null;
  let subscriptionExpiresAt: Date | null = null;

  if (hasManualOverride && manualOverride) {
    tierSource = "MANUAL_OVERRIDE";
    effectiveTierId = manualOverride.toTierId;
  } else if (activeSubscription) {
    tierSource = "TIER_SUBSCRIPTION";
    effectiveTierId = activeSubscription.tierId;
    tierSourceId = activeSubscription.id;
    activeSubscriptionId = activeSubscription.id;
    subscriptionExpiresAt = activeSubscription.nextBillingDate;
  } else if (activePurchase) {
    tierSource = "TIER_PURCHASE";
    effectiveTierId = activePurchase.tierId;
    tierSourceId = activePurchase.id;
    activePurchaseId = activePurchase.id;
    purchaseExpiresAt = activePurchase.endDate;
  } else if (customer.currentTierId) {
    tierSource = "SPENDING_BASED";
    effectiveTierId = customer.currentTierId;
  } else {
    tierSource = "NONE";
  }

  // Create CustomerTierState record
  await db.customerTierState.create({
    data: {
      id: uuidv4(),
      shop: customer.shop,
      customerId: customer.id,
      effectiveTierId,
      tierSource,
      tierSourceId,
      hasManualOverride,
      manualOverrideAt,
      manualOverrideBy,
      manualOverrideExpiry,
      manualOverrideNote,
      activePurchaseId,
      purchaseExpiresAt,
      activeSubscriptionId,
      subscriptionExpiresAt,
      spendingBasedTierId: tierSource === "SPENDING_BASED" ? effectiveTierId : null,
      spendingLastCalculated: tierSource === "SPENDING_BASED" ? now : null,
      lastResolvedAt: now,
      resolutionReason: `Migrated from legacy system: ${tierSource}`,
      createdAt: now,
      updatedAt: now,
    },
  });

  stats.created++;
  stats.bySource[tierSource]++;
}

// Run the migration
migrateTierState()
  .then(() => {
    console.log("\nMigration completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration failed:", error);
    process.exit(1);
  });
