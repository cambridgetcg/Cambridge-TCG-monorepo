/**
 * Klaviyo Scheduled Events Service
 *
 * Handles time-based event triggers for Klaviyo flows:
 * - Points/cashback expiring reminders
 * - Win-back campaigns for inactive customers
 * - Balance reminders
 * - Tier upgrade nudges
 *
 * This service is designed to be called by a scheduled job (cron, AWS Lambda, etc.)
 */

import prisma from "~/db.server";
import { isKlaviyoEnabled } from "./klaviyo.server";
import {
  syncCustomerToKlaviyo,
  trackPointsExpiring,
  trackWinBackNeeded,
  trackBalanceReminder,
  trackTierUpgradeNear,
  trackSegmentChanged,
  calculateCustomerSegment,
  type CustomerSegment,
} from "./klaviyo-events.server";
import type { KlaviyoAutomationSettings } from "@prisma/client";

// ============================================
// TYPES
// ============================================

export interface ScheduledEventResult {
  shop: string;
  eventType: string;
  customersProcessed: number;
  eventsTriggered: number;
  errors: string[];
}

export interface ProcessAllShopsResult {
  shopsProcessed: number;
  totalEventsTriggered: number;
  results: ScheduledEventResult[];
  errors: string[];
}

// ============================================
// COOLDOWN TRACKING
// ============================================

/**
 * Check if a customer has received this event type within the cooldown period
 */
async function isOnCooldown(
  shop: string,
  customerId: string,
  eventType: string,
  cooldownDays: number
): Promise<boolean> {
  const cooldownStart = new Date();
  cooldownStart.setDate(cooldownStart.getDate() - cooldownDays);

  const recentEvent = await prisma.klaviyoEvent.findFirst({
    where: {
      shop,
      customerId,
      eventType,
      status: "SENT",
      sentAt: { gte: cooldownStart },
    },
  });

  return !!recentEvent;
}

// ============================================
// SCHEDULED EVENT PROCESSORS
// ============================================

/**
 * Process points expiring reminders for a shop
 */
export async function processPointsExpiringForShop(
  shop: string,
  settings: KlaviyoAutomationSettings
): Promise<ScheduledEventResult> {
  const result: ScheduledEventResult = {
    shop,
    eventType: "POINTS_EXPIRING",
    customersProcessed: 0,
    eventsTriggered: 0,
    errors: [],
  };

  if (!settings.sendPointsExpiring) {
    return result;
  }

  const warningDays = settings.pointsExpiryWarningDays || [30, 7, 1];
  const cooldownDays = settings.expiryReminderCooldownDays || 7;

  // Get tiers for profile properties
  const tiers = await prisma.tier.findMany({
    where: { shop },
    orderBy: { minSpend: "asc" },
  });

  // Find customers with expiring points
  // Note: This assumes you have a pointsExpiryDate field - adjust as needed
  for (const daysUntilExpiry of warningDays) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);

    // Get customers with points expiring around this date
    const customers = await prisma.customer.findMany({
      where: {
        shop,
        storeCredit: { gt: 0 },
        // You may need to add a pointsExpiryDate field to Customer model
        // For now, we'll use a simple balance check
      },
      take: 100, // Process in batches
    });

    for (const customer of customers) {
      result.customersProcessed++;

      try {
        // Check cooldown
        if (
          await isOnCooldown(
            shop,
            customer.id,
            "RewardsPro Points Expiring Soon",
            cooldownDays
          )
        ) {
          continue;
        }

        // Get customer tier
        const currentTier = customer.currentTierId
          ? await prisma.tier.findUnique({ where: { id: customer.currentTierId } })
          : null;

        const customerWithTier = { ...customer, currentTier };

        // Sync profile first
        await syncCustomerToKlaviyo(shop, customerWithTier, tiers);

        // Track points expiring event
        await trackPointsExpiring(
          shop,
          customerWithTier,
          customer.storeCredit,
          expiryDate,
          daysUntilExpiry
        );

        result.eventsTriggered++;
      } catch (error) {
        result.errors.push(
          `Customer ${customer.id}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  }

  return result;
}

/**
 * Process win-back campaigns for inactive customers
 */
export async function processWinBackForShop(
  shop: string,
  settings: KlaviyoAutomationSettings
): Promise<ScheduledEventResult> {
  const result: ScheduledEventResult = {
    shop,
    eventType: "WIN_BACK",
    customersProcessed: 0,
    eventsTriggered: 0,
    errors: [],
  };

  if (!settings.sendWinBack) {
    return result;
  }

  const triggerDays = settings.winBackTriggerDays || [60, 90];
  const cooldownDays = settings.winBackCooldownDays || 30;

  // Get tiers for profile properties
  const tiers = await prisma.tier.findMany({
    where: { shop },
    orderBy: { minSpend: "asc" },
  });

  for (const daysSinceOrder of triggerDays) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysSinceOrder);

    // Find customers who haven't ordered since target date
    const customers = await prisma.customer.findMany({
      where: {
        shop,
        orderCount: { gt: 0 }, // Has ordered before
        lastOrderDate: {
          lte: targetDate,
        },
      },
      take: 100, // Process in batches
    });

    for (const customer of customers) {
      result.customersProcessed++;

      try {
        // Check cooldown
        if (
          await isOnCooldown(
            shop,
            customer.id,
            "RewardsPro Win Back Needed",
            cooldownDays
          )
        ) {
          continue;
        }

        // Get customer tier
        const currentTier = customer.currentTierId
          ? await prisma.tier.findUnique({ where: { id: customer.currentTierId } })
          : null;

        const customerWithTier = { ...customer, currentTier };

        // Calculate actual days since last order
        const actualDaysSinceOrder = customer.lastOrderDate
          ? Math.floor(
              (Date.now() - customer.lastOrderDate.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : daysSinceOrder;

        // Sync profile first
        await syncCustomerToKlaviyo(shop, customerWithTier, tiers);

        // Track win-back event
        await trackWinBackNeeded(shop, customerWithTier, actualDaysSinceOrder);

        result.eventsTriggered++;
      } catch (error) {
        result.errors.push(
          `Customer ${customer.id}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  }

  return result;
}

/**
 * Process balance reminders for customers with unused cashback
 */
export async function processBalanceRemindersForShop(
  shop: string,
  settings: KlaviyoAutomationSettings
): Promise<ScheduledEventResult> {
  const result: ScheduledEventResult = {
    shop,
    eventType: "BALANCE_REMINDER",
    customersProcessed: 0,
    eventsTriggered: 0,
    errors: [],
  };

  if (!settings.sendBalanceReminder) {
    return result;
  }

  const reminderDays = settings.balanceReminderDays || 30;
  const cooldownDays = settings.balanceReminderCooldownDays || 14;

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - reminderDays);

  // Get tiers for profile properties
  const tiers = await prisma.tier.findMany({
    where: { shop },
    orderBy: { minSpend: "asc" },
  });

  // Find customers with cashback who haven't ordered recently
  const customers = await prisma.customer.findMany({
    where: {
      shop,
      storeCredit: { gt: 0 }, // Has cashback to use
      lastOrderDate: {
        lte: targetDate,
      },
    },
    take: 100, // Process in batches
  });

  for (const customer of customers) {
    result.customersProcessed++;

    try {
      // Check cooldown
      if (
        await isOnCooldown(
          shop,
          customer.id,
          "RewardsPro Cashback Balance Reminder",
          cooldownDays
        )
      ) {
        continue;
      }

      // Get customer tier
      const currentTier = customer.currentTierId
        ? await prisma.tier.findUnique({ where: { id: customer.currentTierId } })
        : null;

      const customerWithTier = { ...customer, currentTier };

      // Calculate days since last order
      const daysSinceOrder = customer.lastOrderDate
        ? Math.floor(
            (Date.now() - customer.lastOrderDate.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : reminderDays;

      // Sync profile first
      await syncCustomerToKlaviyo(shop, customerWithTier, tiers);

      // Track balance reminder event
      await trackBalanceReminder(shop, customerWithTier, daysSinceOrder);

      result.eventsTriggered++;
    } catch (error) {
      result.errors.push(
        `Customer ${customer.id}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return result;
}

/**
 * Process tier upgrade nudges for customers close to next tier
 */
export async function processTierNudgesForShop(
  shop: string,
  settings: KlaviyoAutomationSettings
): Promise<ScheduledEventResult> {
  const result: ScheduledEventResult = {
    shop,
    eventType: "TIER_UPGRADE_NEAR",
    customersProcessed: 0,
    eventsTriggered: 0,
    errors: [],
  };

  if (!settings.sendTierUpgradeNear) {
    return result;
  }

  const progressThreshold = settings.tierNudgeThreshold || 80; // 80% progress
  const cooldownDays = settings.tierNudgeCooldownDays || 14;

  // Get all tiers for the shop
  const tiers = await prisma.tier.findMany({
    where: { shop },
    orderBy: { minSpend: "asc" },
  });

  if (tiers.length < 2) {
    // No tier progression possible
    return result;
  }

  // Find customers who are close to next tier
  const customers = await prisma.customer.findMany({
    where: {
      shop,
      currentTierId: { not: null },
      orderCount: { gt: 0 },
    },
    take: 100, // Process in batches
  });

  for (const customer of customers) {
    result.customersProcessed++;

    try {
      // Get customer's current tier
      const currentTier = customer.currentTierId
        ? await prisma.tier.findUnique({ where: { id: customer.currentTierId } })
        : null;

      if (!currentTier) continue;

      // Find next tier
      const currentIndex = tiers.findIndex((t) => t.id === currentTier.id);
      if (currentIndex < 0 || currentIndex >= tiers.length - 1) {
        // Already at highest tier
        continue;
      }

      const nextTier = tiers[currentIndex + 1];

      // Calculate progress to next tier
      const progressPercent = Math.min(
        100,
        Math.round((customer.totalSpent / nextTier.minSpend) * 100)
      );

      // Check if above threshold
      if (progressPercent < progressThreshold) {
        continue;
      }

      // Check cooldown
      if (
        await isOnCooldown(
          shop,
          customer.id,
          "RewardsPro Tier Upgrade Near",
          cooldownDays
        )
      ) {
        continue;
      }

      const customerWithTier = { ...customer, currentTier };

      // Calculate spend remaining
      const spendRemaining = Math.max(
        0,
        nextTier.minSpend - customer.totalSpent
      );

      // Sync profile first
      await syncCustomerToKlaviyo(shop, customerWithTier, tiers);

      // Track tier nudge event
      await trackTierUpgradeNear(
        shop,
        customerWithTier,
        nextTier,
        spendRemaining,
        progressPercent
      );

      result.eventsTriggered++;
    } catch (error) {
      result.errors.push(
        `Customer ${customer.id}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return result;
}

// ============================================
// PHASE 1 GAP FILL: SEGMENT CHANGE PROCESSOR
// ============================================

/**
 * Process customer segment changes and trigger events
 * Tracks transitions to Champion, Loyal, or At-Risk segments
 */
export async function processSegmentChangesForShop(
  shop: string,
  settings: KlaviyoAutomationSettings
): Promise<ScheduledEventResult> {
  const result: ScheduledEventResult = {
    shop,
    eventType: "SEGMENT_CHANGES",
    customersProcessed: 0,
    eventsTriggered: 0,
    errors: [],
  };

  // Check if segment events are enabled
  const segmentEventsEnabled =
    (settings as any).sendCustomerBecameChampion !== false ||
    (settings as any).sendCustomerBecameLoyal !== false;

  if (!segmentEventsEnabled) {
    return result;
  }

  // Get all tiers for segment calculation
  const tiers = await prisma.tier.findMany({
    where: { shop },
    orderBy: { minSpend: "asc" },
  });

  // Find customers who might have segment changes
  // Process customers with Klaviyo profiles (already synced)
  const profiles = await prisma.klaviyoProfile.findMany({
    where: { shop },
    take: 200, // Process in batches
  });

  for (const profile of profiles) {
    result.customersProcessed++;

    try {
      // Get customer with tier
      const customer = await prisma.customer.findUnique({
        where: { id: profile.customerId },
      });

      if (!customer) continue;

      const currentTier = customer.currentTierId
        ? await prisma.tier.findUnique({ where: { id: customer.currentTierId } })
        : null;

      const customerWithTier = { ...customer, currentTier };

      // Calculate current segment
      const currentSegment = calculateCustomerSegment(customerWithTier, tiers);
      const previousSegment = (profile.lastKnownSegment as CustomerSegment) || "NEW";

      // If segment changed, track the event
      if (currentSegment !== previousSegment) {
        // Track segment change event
        const tracked = await trackSegmentChanged(
          shop,
          customerWithTier,
          previousSegment,
          currentSegment
        );

        if (tracked) {
          result.eventsTriggered++;
        }

        // Update the profile with new segment
        await prisma.klaviyoProfile.update({
          where: { id: profile.id },
          data: { lastKnownSegment: currentSegment },
        });
      }
    } catch (error) {
      result.errors.push(
        `Customer ${profile.customerId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return result;
}

// ============================================
// MAIN PROCESSOR
// ============================================

/**
 * Process all scheduled events for a single shop
 */
export async function processScheduledEventsForShop(
  shop: string
): Promise<ScheduledEventResult[]> {
  const results: ScheduledEventResult[] = [];

  // Check if Klaviyo is enabled
  if (!(await isKlaviyoEnabled(shop))) {
    return results;
  }

  // Get automation settings
  const settings = await prisma.klaviyoAutomationSettings.findUnique({
    where: { shop },
  });

  if (!settings || !settings.automationsEnabled) {
    return results;
  }

  // Process each event type
  console.log(`[Klaviyo Scheduled] Processing scheduled events for shop: ${shop}`);

  // Points expiring
  if (settings.sendPointsExpiring) {
    results.push(await processPointsExpiringForShop(shop, settings));
  }

  // Win-back campaigns
  if (settings.sendWinBack) {
    results.push(await processWinBackForShop(shop, settings));
  }

  // Balance reminders
  if (settings.sendBalanceReminder) {
    results.push(await processBalanceRemindersForShop(shop, settings));
  }

  // Tier upgrade nudges
  if (settings.sendTierUpgradeNear) {
    results.push(await processTierNudgesForShop(shop, settings));
  }

  // Phase 1 Gap Fill: Segment changes (Champion, Loyal, At-Risk)
  results.push(await processSegmentChangesForShop(shop, settings));

  console.log(
    `[Klaviyo Scheduled] Completed for shop ${shop}: ${results.reduce(
      (sum, r) => sum + r.eventsTriggered,
      0
    )} events triggered`
  );

  return results;
}

/**
 * Process scheduled events for all shops
 * This is the main entry point for scheduled jobs
 */
export async function processScheduledEventsForAllShops(): Promise<ProcessAllShopsResult> {
  const finalResult: ProcessAllShopsResult = {
    shopsProcessed: 0,
    totalEventsTriggered: 0,
    results: [],
    errors: [],
  };

  console.log("[Klaviyo Scheduled] Starting scheduled events processing...");

  try {
    // Find all shops with Klaviyo automation enabled
    const shops = await prisma.klaviyoAutomationSettings.findMany({
      where: {
        automationsEnabled: true,
      },
      select: {
        shop: true,
      },
    });

    console.log(
      `[Klaviyo Scheduled] Found ${shops.length} shops with automations enabled`
    );

    for (const { shop } of shops) {
      try {
        const shopResults = await processScheduledEventsForShop(shop);
        finalResult.results.push(...shopResults);
        finalResult.shopsProcessed++;
        finalResult.totalEventsTriggered += shopResults.reduce(
          (sum, r) => sum + r.eventsTriggered,
          0
        );
      } catch (error) {
        finalResult.errors.push(
          `Shop ${shop}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  } catch (error) {
    finalResult.errors.push(
      `Fatal error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }

  console.log(
    `[Klaviyo Scheduled] Completed: ${finalResult.shopsProcessed} shops, ${finalResult.totalEventsTriggered} events triggered`
  );

  return finalResult;
}

