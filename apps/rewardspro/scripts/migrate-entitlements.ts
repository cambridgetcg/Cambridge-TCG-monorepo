/**
 * Migration Script: Backfill ShopEntitlements from existing subscription data
 *
 * This script:
 * 1. Reads all shops from ShopSettings
 * 2. Resolves their current plan from BillingSubscription or ShopSettings
 * 3. Creates ShopEntitlements records with appropriate features/limits
 *
 * Run with: npx tsx scripts/migrate-entitlements.ts
 */

import { getAuroraClient } from '../app/utils/aurora-data-api';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

const aurora = getAuroraClient();

// Plan constants
const FREE_PLAN = "RewardsPro Free";
const STARTER_PLAN = "RewardsPro Starter";
const PRO_PLAN = "RewardsPro Pro";
const GROWTH_PLAN = "RewardsPro Growth";
const MAX_PLAN = "RewardsPro Max";
const ULTRA_PLAN = "RewardsPro Ultra";
const ENTERPRISE_PLAN = "RewardsPro Enterprise";

// Feature definitions per plan
interface PlanFeatures {
  featureApiAccess: boolean;
  featureWebhooks: boolean;
  featureWhiteLabel: boolean;
  featureAdvancedReport: boolean;
  featureCustomEmail: boolean;
  featureAnnualEval: boolean;
  featureBulkOps: boolean;
  featureCustomBranding: boolean;
  featurePrioritySupport: boolean;
  featureSubscriptionTiers: boolean;
  featurePurchasableTiers: boolean;
  featureExportData: boolean;
  featureCustomRewards: boolean;
  limitMaxTiers: number;
  limitMaxOrders: number;
  limitMaxEmails: number;
}

const PLAN_FEATURES: Record<string, PlanFeatures> = {
  [FREE_PLAN]: {
    featureApiAccess: false,
    featureWebhooks: false,
    featureWhiteLabel: false,
    featureAdvancedReport: false,
    featureCustomEmail: false,
    featureAnnualEval: false,
    featureBulkOps: false,
    featureCustomBranding: false,
    featurePrioritySupport: false,
    featureSubscriptionTiers: false,
    featurePurchasableTiers: false,
    featureExportData: false,
    featureCustomRewards: false,
    limitMaxTiers: 2,
    limitMaxOrders: 50,
    limitMaxEmails: 0,
  },
  [PRO_PLAN]: {
    featureApiAccess: false,
    featureWebhooks: false,
    featureWhiteLabel: false,
    featureAdvancedReport: true,
    featureCustomEmail: false,
    featureAnnualEval: false,
    featureBulkOps: true,
    featureCustomBranding: false,
    featurePrioritySupport: false,
    featureSubscriptionTiers: true,
    featurePurchasableTiers: true,
    featureExportData: true,
    featureCustomRewards: true,
    limitMaxTiers: 5,
    limitMaxOrders: 500,
    limitMaxEmails: 100,
  },
  [MAX_PLAN]: {
    featureApiAccess: false,
    featureWebhooks: true,
    featureWhiteLabel: true,
    featureAdvancedReport: true,
    featureCustomEmail: true,
    featureAnnualEval: false,
    featureBulkOps: true,
    featureCustomBranding: true,
    featurePrioritySupport: true,
    featureSubscriptionTiers: true,
    featurePurchasableTiers: true,
    featureExportData: true,
    featureCustomRewards: true,
    limitMaxTiers: 10,
    limitMaxOrders: 5000,
    limitMaxEmails: 500,
  },
  [ULTRA_PLAN]: {
    featureApiAccess: true,
    featureWebhooks: true,
    featureWhiteLabel: true,
    featureAdvancedReport: true,
    featureCustomEmail: true,
    featureAnnualEval: true,
    featureBulkOps: true,
    featureCustomBranding: true,
    featurePrioritySupport: true,
    featureSubscriptionTiers: true,
    featurePurchasableTiers: true,
    featureExportData: true,
    featureCustomRewards: true,
    limitMaxTiers: 999999,
    limitMaxOrders: 999999,
    limitMaxEmails: 999999,
  },
  [ENTERPRISE_PLAN]: {
    featureApiAccess: true,
    featureWebhooks: true,
    featureWhiteLabel: true,
    featureAdvancedReport: true,
    featureCustomEmail: true,
    featureAnnualEval: true,
    featureBulkOps: true,
    featureCustomBranding: true,
    featurePrioritySupport: true,
    featureSubscriptionTiers: true,
    featurePurchasableTiers: true,
    featureExportData: true,
    featureCustomRewards: true,
    limitMaxTiers: 999999,
    limitMaxOrders: 999999,
    limitMaxEmails: 999999,
  },
  // Legacy plans
  [STARTER_PLAN]: {
    featureApiAccess: false,
    featureWebhooks: false,
    featureWhiteLabel: false,
    featureAdvancedReport: true,
    featureCustomEmail: false,
    featureAnnualEval: false,
    featureBulkOps: true,
    featureCustomBranding: false,
    featurePrioritySupport: false,
    featureSubscriptionTiers: true,
    featurePurchasableTiers: true,
    featureExportData: true,
    featureCustomRewards: true,
    limitMaxTiers: 5,
    limitMaxOrders: 500,
    limitMaxEmails: 100,
  },
  [GROWTH_PLAN]: {
    featureApiAccess: false,
    featureWebhooks: true,
    featureWhiteLabel: true,
    featureAdvancedReport: true,
    featureCustomEmail: true,
    featureAnnualEval: false,
    featureBulkOps: true,
    featureCustomBranding: true,
    featurePrioritySupport: true,
    featureSubscriptionTiers: true,
    featurePurchasableTiers: true,
    featureExportData: true,
    featureCustomRewards: true,
    limitMaxTiers: 10,
    limitMaxOrders: 5000,
    limitMaxEmails: 500,
  },
};

function normalizePlanName(planName: string): string {
  const lower = planName.toLowerCase();

  if (lower === 'free' || lower.includes('free')) return FREE_PLAN;
  if (lower === 'starter' || lower.includes('starter')) return STARTER_PLAN;
  if (lower === 'pro' || lower.includes('pro')) return PRO_PLAN;
  if (lower === 'growth' || lower.includes('growth')) return GROWTH_PLAN;
  if (lower === 'max' || lower.includes('max')) return MAX_PLAN;
  if (lower === 'ultra' || lower.includes('ultra')) return ULTRA_PLAN;
  if (lower === 'enterprise' || lower.includes('enterprise')) return ENTERPRISE_PLAN;

  // If it's already a valid plan constant, return as-is
  if (Object.keys(PLAN_FEATURES).includes(planName)) {
    return planName;
  }

  return FREE_PLAN;
}

async function migrate() {
  console.log("Starting entitlements migration...\n");

  // Get all shops from ShopSettings
  const shopsResult = await aurora.executeStatement(`
    SELECT shop, id
    FROM "ShopSettings"
  `, []);

  const shops = shopsResult.records;
  console.log(`Found ${shops.length} shops to process\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const shopRow of shops) {
    const shop = shopRow.shop;
    const shopSettingsId = shopRow.id;

    try {
      // Check if entitlements already exist
      const existingResult = await aurora.executeStatement(`
        SELECT id FROM "ShopEntitlements" WHERE shop = :shop LIMIT 1
      `, [
        { name: 'shop', value: { stringValue: shop } },
      ]);

      if (existingResult.records.length > 0) {
        console.log(`[SKIP] ${shop} - already has entitlements`);
        skipped++;
        continue;
      }

      // Get active billing subscription
      const subscriptionResult = await aurora.executeStatement(`
        SELECT id, "planType"
        FROM "BillingSubscription"
        WHERE shop = :shop AND status = 'ACTIVE'
        ORDER BY "createdAt" DESC
        LIMIT 1
      `, [
        { name: 'shop', value: { stringValue: shop } },
      ]);

      const billingSubscription = subscriptionResult.records[0];

      // Determine effective plan
      let effectivePlan = FREE_PLAN;
      let planSource = 'DEFAULT';
      let resolvedFrom: string | null = null;

      if (billingSubscription?.planType) {
        effectivePlan = normalizePlanName(billingSubscription.planType);
        planSource = 'SUBSCRIPTION';
        resolvedFrom = `BillingSubscription:${billingSubscription.id}`;
      } else {
        // Default to FREE plan
        resolvedFrom = `ShopSettings:${shopSettingsId}`;
      }

      // Get features for plan
      const features = PLAN_FEATURES[effectivePlan] || PLAN_FEATURES[FREE_PLAN];

      // Create entitlements record using raw SQL
      const id = uuidv4();
      await aurora.executeStatement(`
        INSERT INTO "ShopEntitlements" (
          id, shop, "effectivePlan", "planSource",
          "featureApiAccess", "featureWebhooks", "featureWhiteLabel", "featureAdvancedReport",
          "featureCustomEmail", "featureAnnualEval", "featureBulkOps", "featureCustomBranding",
          "featurePrioritySupport", "featureSubscriptionTiers", "featurePurchasableTiers",
          "featureExportData", "featureCustomRewards",
          "limitMaxTiers", "limitMaxOrders", "limitMaxEmails",
          "hasOverride", "lastResolvedAt", "resolvedFrom", "createdAt", "updatedAt"
        ) VALUES (
          :id, :shop, :effectivePlan, :planSource::"EntitlementSource",
          :featureApiAccess, :featureWebhooks, :featureWhiteLabel, :featureAdvancedReport,
          :featureCustomEmail, :featureAnnualEval, :featureBulkOps, :featureCustomBranding,
          :featurePrioritySupport, :featureSubscriptionTiers, :featurePurchasableTiers,
          :featureExportData, :featureCustomRewards,
          :limitMaxTiers, :limitMaxOrders, :limitMaxEmails,
          false, NOW(), :resolvedFrom, NOW(), NOW()
        )
      `, [
        { name: 'id', value: { stringValue: id } },
        { name: 'shop', value: { stringValue: shop } },
        { name: 'effectivePlan', value: { stringValue: effectivePlan } },
        { name: 'planSource', value: { stringValue: planSource } },
        { name: 'featureApiAccess', value: { booleanValue: features.featureApiAccess } },
        { name: 'featureWebhooks', value: { booleanValue: features.featureWebhooks } },
        { name: 'featureWhiteLabel', value: { booleanValue: features.featureWhiteLabel } },
        { name: 'featureAdvancedReport', value: { booleanValue: features.featureAdvancedReport } },
        { name: 'featureCustomEmail', value: { booleanValue: features.featureCustomEmail } },
        { name: 'featureAnnualEval', value: { booleanValue: features.featureAnnualEval } },
        { name: 'featureBulkOps', value: { booleanValue: features.featureBulkOps } },
        { name: 'featureCustomBranding', value: { booleanValue: features.featureCustomBranding } },
        { name: 'featurePrioritySupport', value: { booleanValue: features.featurePrioritySupport } },
        { name: 'featureSubscriptionTiers', value: { booleanValue: features.featureSubscriptionTiers } },
        { name: 'featurePurchasableTiers', value: { booleanValue: features.featurePurchasableTiers } },
        { name: 'featureExportData', value: { booleanValue: features.featureExportData } },
        { name: 'featureCustomRewards', value: { booleanValue: features.featureCustomRewards } },
        { name: 'limitMaxTiers', value: { longValue: features.limitMaxTiers } },
        { name: 'limitMaxOrders', value: { longValue: features.limitMaxOrders } },
        { name: 'limitMaxEmails', value: { longValue: features.limitMaxEmails } },
        { name: 'resolvedFrom', value: resolvedFrom ? { stringValue: resolvedFrom } : { isNull: true } },
      ]);

      console.log(`[CREATED] ${shop} -> ${effectivePlan} (source: ${planSource})`);
      created++;

    } catch (error) {
      console.error(`[ERROR] ${shop}:`, error);
      errors++;
    }
  }

  console.log("\n=== Migration Complete ===");
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${shops.length}`);
}

// Run migration
migrate()
  .then(() => {
    console.log("\nMigration finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration failed:", error);
    process.exit(1);
  });
