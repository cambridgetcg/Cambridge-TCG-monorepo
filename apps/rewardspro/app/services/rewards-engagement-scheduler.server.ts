/**
 * Rewards Engagement Scheduler
 *
 * Scheduled jobs that analyze customer rewards engagement and trigger
 * marketing events for the retention feedback loop.
 *
 * Integration with Marketing Module:
 * - Tracks rewards dormancy and triggers re-engagement events
 * - Sends raffle ending reminders
 * - Notifies customers with high points balance but no activity
 * - Triggers new rewards availability notifications
 */

import db from "~/db.server";
import {
  trackRewardsDormant,
  trackHighPointsNoActivity,
  trackRaffleEndingSoon,
  trackNewRaffleAvailable,
  trackNewMysteryBoxAvailable,
  trackBonusEventStarted,
} from "./klaviyo-events.server";

const LOG_PREFIX = "[RewardsEngagementScheduler]";

// ============================================
// DORMANCY DETECTION
// ============================================

interface DormancyResult {
  customersProcessed: number;
  eventsTriggered: number;
  errors: number;
}

/**
 * Find customers who haven't engaged with rewards and trigger re-engagement events
 */
export async function processRewardsDormancy(
  shop: string,
  dormancyDays: number = 30
): Promise<DormancyResult> {
  console.log(`${LOG_PREFIX} Processing rewards dormancy for shop: ${shop}`);

  const result: DormancyResult = {
    customersProcessed: 0,
    eventsTriggered: 0,
    errors: 0,
  };

  try {
    // Find customers with points who haven't had recent activity
    const dormancyCutoff = new Date();
    dormancyCutoff.setDate(dormancyCutoff.getDate() - dormancyDays);

    // Get customers with points balance but no recent orders
    const dormantCustomers = await db.customer.findMany({
      where: {
        shop,
        pointsBalance: { gt: 0 },
        OR: [
          { lastOrderAt: { lt: dormancyCutoff } },
          { lastOrderAt: null },
        ],
        email: { not: null },
      },
      include: { currentTier: true },
      take: 100, // Process in batches
    });

    // Get active rewards counts
    const [activeRaffles, activeMysteryBoxes, activeChallenges] = await Promise.all([
      db.raffle.count({ where: { shop, status: "ACTIVE" } }),
      db.mysteryBox.count({ where: { shop, status: "ACTIVE" } }),
      0, // Challenges not yet implemented
    ]);

    for (const customer of dormantCustomers) {
      result.customersProcessed++;

      const daysSinceActivity = customer.lastOrderAt
        ? Math.floor((Date.now() - customer.lastOrderAt.getTime()) / (1000 * 60 * 60 * 24))
        : dormancyDays;

      try {
        await trackRewardsDormant(
          shop,
          customer,
          daysSinceActivity,
          { activeRaffles, activeMysteryBoxes, activeChallenges }
        );
        result.eventsTriggered++;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error processing customer ${customer.id}:`, error);
        result.errors++;
      }
    }

    console.log(`${LOG_PREFIX} Dormancy processing complete:`, result);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error in processRewardsDormancy:`, error);
    throw error;
  }
}

// ============================================
// HIGH POINTS NO ACTIVITY
// ============================================

/**
 * Find customers with high points balance who haven't spent recently
 */
export async function processHighPointsNoActivity(
  shop: string,
  pointsThreshold: number = 500,
  inactiveDays: number = 14
): Promise<DormancyResult> {
  console.log(`${LOG_PREFIX} Processing high points no activity for shop: ${shop}`);

  const result: DormancyResult = {
    customersProcessed: 0,
    eventsTriggered: 0,
    errors: 0,
  };

  try {
    const inactiveCutoff = new Date();
    inactiveCutoff.setDate(inactiveCutoff.getDate() - inactiveDays);

    // Get customers with high points balance
    const highPointsCustomers = await db.customer.findMany({
      where: {
        shop,
        pointsBalance: { gte: pointsThreshold },
        email: { not: null },
      },
      include: { currentTier: true },
      take: 100,
    });

    // For each customer, check their last points spend
    for (const customer of highPointsCustomers) {
      result.customersProcessed++;

      // Check last points spending transaction
      const lastSpend = await db.pointsLedger.findFirst({
        where: {
          customerId: customer.id,
          points: { lt: 0 }, // Negative means spent
        },
        orderBy: { createdAt: "desc" },
      });

      const daysSinceSpend = lastSpend
        ? Math.floor((Date.now() - lastSpend.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      if (daysSinceSpend >= inactiveDays) {
        try {
          // Get a suggested redemption option
          const suggestion = await getSuggestedRedemption(shop, customer.pointsBalance);

          await trackHighPointsNoActivity(
            shop,
            customer,
            daysSinceSpend,
            suggestion
          );
          result.eventsTriggered++;
        } catch (error) {
          console.error(`${LOG_PREFIX} Error processing customer ${customer.id}:`, error);
          result.errors++;
        }
      }
    }

    console.log(`${LOG_PREFIX} High points processing complete:`, result);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error in processHighPointsNoActivity:`, error);
    throw error;
  }
}

/**
 * Get a suggested redemption for a customer based on available rewards
 */
async function getSuggestedRedemption(
  shop: string,
  pointsBalance: number
): Promise<{ type: "raffle" | "mystery_box" | "redemption"; name: string; cost: number } | undefined> {
  // Check for affordable raffles
  const raffle = await db.raffle.findFirst({
    where: {
      shop,
      status: "ACTIVE",
      entryCost: { lte: pointsBalance },
    },
    orderBy: { entryCost: "asc" },
  });

  if (raffle) {
    return { type: "raffle", name: raffle.name, cost: raffle.entryCost };
  }

  // Check for affordable mystery boxes
  const mysteryBox = await db.mysteryBox.findFirst({
    where: {
      shop,
      status: "ACTIVE",
      openCost: { lte: pointsBalance },
    },
    orderBy: { openCost: "asc" },
  });

  if (mysteryBox) {
    return { type: "mystery_box", name: mysteryBox.name, cost: mysteryBox.openCost };
  }

  return undefined;
}

// ============================================
// RAFFLE ENDING REMINDERS
// ============================================

interface RaffleReminderResult {
  rafflesProcessed: number;
  remindersTriggered: number;
  errors: number;
}

/**
 * Send reminders for raffles ending soon
 */
export async function processRaffleEndingReminders(
  shop: string,
  hoursBeforeEnd: number = 24
): Promise<RaffleReminderResult> {
  console.log(`${LOG_PREFIX} Processing raffle ending reminders for shop: ${shop}`);

  const result: RaffleReminderResult = {
    rafflesProcessed: 0,
    remindersTriggered: 0,
    errors: 0,
  };

  try {
    const now = new Date();
    const reminderCutoff = new Date(now.getTime() + hoursBeforeEnd * 60 * 60 * 1000);

    // Find raffles ending soon
    const endingRaffles = await db.raffle.findMany({
      where: {
        shop,
        status: "ACTIVE",
        endsAt: {
          gt: now,
          lte: reminderCutoff,
        },
      },
      include: {
        prizes: {
          select: { name: true, prizeType: true },
        },
      },
    });

    for (const raffle of endingRaffles) {
      result.rafflesProcessed++;

      // Get all customers with points who haven't entered this raffle
      const customersWithPoints = await db.customer.findMany({
        where: {
          shop,
          pointsBalance: { gte: raffle.entryCost },
          email: { not: null },
        },
        include: { currentTier: true },
        take: 500,
      });

      // Get customers who have already entered
      const entries = await db.raffleEntry.findMany({
        where: { raffleId: raffle.id },
        select: { customerId: true, entriesCount: true },
      });
      const entryMap = new Map(entries.map((e) => [e.customerId, e.entriesCount]));

      const hoursRemaining = Math.ceil(
        (raffle.endsAt.getTime() - now.getTime()) / (1000 * 60 * 60)
      );

      for (const customer of customersWithPoints) {
        const customerEntries = entryMap.get(customer.id) || 0;

        // Send reminder to both entered and non-entered customers
        try {
          await trackRaffleEndingSoon(
            shop,
            customer,
            {
              id: raffle.id,
              name: raffle.name,
              endsAt: raffle.endsAt,
              entryCost: raffle.entryCost,
              prizes: raffle.prizes,
            },
            customerEntries,
            hoursRemaining
          );
          result.remindersTriggered++;
        } catch (error) {
          console.error(`${LOG_PREFIX} Error sending reminder to ${customer.id}:`, error);
          result.errors++;
        }
      }
    }

    console.log(`${LOG_PREFIX} Raffle reminders complete:`, result);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error in processRaffleEndingReminders:`, error);
    throw error;
  }
}

// ============================================
// NEW REWARDS ANNOUNCEMENTS
// ============================================

interface AnnouncementResult {
  rewardsProcessed: number;
  announcementsSent: number;
  errors: number;
}

/**
 * Announce new raffles to eligible customers
 */
export async function announceNewRaffle(
  shop: string,
  raffleId: string
): Promise<AnnouncementResult> {
  console.log(`${LOG_PREFIX} Announcing new raffle: ${raffleId}`);

  const result: AnnouncementResult = {
    rewardsProcessed: 1,
    announcementsSent: 0,
    errors: 0,
  };

  try {
    const raffle = await db.raffle.findFirst({
      where: { id: raffleId, shop },
      include: {
        prizes: {
          select: { name: true, prizeType: true, prizeValue: true },
        },
      },
    });

    if (!raffle) {
      throw new Error("Raffle not found");
    }

    // Get customers with email
    const customers = await db.customer.findMany({
      where: {
        shop,
        email: { not: null },
      },
      include: { currentTier: true },
      take: 1000,
    });

    for (const customer of customers) {
      try {
        await trackNewRaffleAvailable(shop, customer, {
          id: raffle.id,
          name: raffle.name,
          description: raffle.description || undefined,
          startsAt: raffle.startsAt,
          endsAt: raffle.endsAt,
          entryCost: raffle.entryCost,
          prizes: raffle.prizes.map((p) => ({
            name: p.name,
            type: p.prizeType,
            value: (p.prizeValue as any)?.amount,
          })),
        });
        result.announcementsSent++;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error announcing to ${customer.id}:`, error);
        result.errors++;
      }
    }

    console.log(`${LOG_PREFIX} Raffle announcement complete:`, result);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error in announceNewRaffle:`, error);
    throw error;
  }
}

/**
 * Announce new mystery box to eligible customers
 */
export async function announceNewMysteryBox(
  shop: string,
  mysteryBoxId: string
): Promise<AnnouncementResult> {
  console.log(`${LOG_PREFIX} Announcing new mystery box: ${mysteryBoxId}`);

  const result: AnnouncementResult = {
    rewardsProcessed: 1,
    announcementsSent: 0,
    errors: 0,
  };

  try {
    const mysteryBox = await db.mysteryBox.findFirst({
      where: { id: mysteryBoxId, shop },
      include: {
        rewards: {
          select: { name: true, rarity: true },
        },
      },
    });

    if (!mysteryBox) {
      throw new Error("Mystery box not found");
    }

    // Get customers with email
    const customers = await db.customer.findMany({
      where: {
        shop,
        email: { not: null },
      },
      include: { currentTier: true },
      take: 1000,
    });

    for (const customer of customers) {
      try {
        await trackNewMysteryBoxAvailable(shop, customer, {
          id: mysteryBox.id,
          name: mysteryBox.name,
          description: mysteryBox.description || undefined,
          openCost: mysteryBox.openCost,
          rewards: mysteryBox.rewards,
        });
        result.announcementsSent++;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error announcing to ${customer.id}:`, error);
        result.errors++;
      }
    }

    console.log(`${LOG_PREFIX} Mystery box announcement complete:`, result);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error in announceNewMysteryBox:`, error);
    throw error;
  }
}

// ============================================
// BONUS EVENT NOTIFICATIONS
// ============================================

/**
 * Announce a bonus event (e.g., double points) to all customers
 */
export async function announceBonusEvent(
  shop: string,
  bonusEvent: {
    id: string;
    name: string;
    multiplier: number;
    startsAt: Date;
    endsAt: Date;
    description?: string;
  }
): Promise<AnnouncementResult> {
  console.log(`${LOG_PREFIX} Announcing bonus event: ${bonusEvent.name}`);

  const result: AnnouncementResult = {
    rewardsProcessed: 1,
    announcementsSent: 0,
    errors: 0,
  };

  try {
    // Get customers with email
    const customers = await db.customer.findMany({
      where: {
        shop,
        email: { not: null },
      },
      include: { currentTier: true },
      take: 1000,
    });

    for (const customer of customers) {
      try {
        await trackBonusEventStarted(shop, customer, bonusEvent);
        result.announcementsSent++;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error announcing to ${customer.id}:`, error);
        result.errors++;
      }
    }

    console.log(`${LOG_PREFIX} Bonus event announcement complete:`, result);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error in announceBonusEvent:`, error);
    throw error;
  }
}

// ============================================
// SCHEDULED JOB RUNNER
// ============================================

/**
 * Run all scheduled engagement jobs for a shop
 * Called by a cron job or manual trigger
 */
export async function runScheduledEngagementJobs(shop: string): Promise<{
  dormancy: DormancyResult;
  highPoints: DormancyResult;
  raffleReminders: RaffleReminderResult;
}> {
  console.log(`${LOG_PREFIX} Running all scheduled engagement jobs for shop: ${shop}`);

  // Get automation settings for thresholds
  const settings = await db.klaviyoAutomationSettings.findUnique({
    where: { shop },
  });

  const dormancyDays = settings?.rewardsDormancyDays || 30;
  const highPointsThreshold = settings?.highPointsThreshold || 500;
  const highPointsDormancyDays = settings?.highPointsDormancyDays || 14;
  const raffleReminderHours = settings?.raffleReminderHours || 24;

  const [dormancy, highPoints, raffleReminders] = await Promise.all([
    processRewardsDormancy(shop, dormancyDays),
    processHighPointsNoActivity(shop, highPointsThreshold, highPointsDormancyDays),
    processRaffleEndingReminders(shop, raffleReminderHours),
  ]);

  return { dormancy, highPoints, raffleReminders };
}
