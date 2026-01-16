/**
 * Points Maintenance Service
 *
 * Handles scheduled maintenance tasks for the Points Engagement System:
 * - Points expiration processing
 * - Expiration warning notifications
 * - Daily streak resets
 * - Points economy health checks
 *
 * This service is designed to be called by a cron job.
 */

import db from "~/db.server";
import { expirePoints, getExpiringPoints } from "./points-ledger.server";
import { getPointsConfig, getExpirationSettings } from "./points-config.server";
import type { Prisma } from "@prisma/client";

// ============================================
// TYPES
// ============================================

export interface PointsMaintenanceResult {
  shop: string;
  expiration: {
    customersAffected: number;
    totalPointsExpired: number;
  };
  warnings: {
    customersSentWarning: number;
    totalPointsExpiring: number;
  };
  streaks: {
    streaksReset: number;
    streaksIncremented: number;
  };
  errors: string[];
}

export interface AllShopsMaintenanceResult {
  shopsProcessed: number;
  totalCustomersAffected: number;
  totalPointsExpired: number;
  totalWarningsSent: number;
  results: PointsMaintenanceResult[];
  errors: string[];
}

export interface PointsEconomyHealth {
  shop: string;
  totalPointsInCirculation: number;
  totalLifetimePointsIssued: number;
  pointsRedemptionRate: number;
  averageBalancePerCustomer: number;
  customersWithPoints: number;
  expiringIn30Days: number;
  economyHealthScore: number; // 0-100
  warnings: string[];
}

// ============================================
// EXPIRATION PROCESSING
// ============================================

/**
 * Process points expiration for a single shop
 */
export async function processShopExpiration(shop: string): Promise<{
  customersAffected: number;
  totalPointsExpired: number;
}> {
  const settings = await getExpirationSettings(shop);

  // If expiration is disabled, skip
  if (!settings.enabled) {
    return { customersAffected: 0, totalPointsExpired: 0 };
  }

  return expirePoints(shop);
}

/**
 * Send expiration warning emails to customers with points expiring soon
 */
export async function sendExpirationWarnings(shop: string): Promise<{
  customersSentWarning: number;
  totalPointsExpiring: number;
}> {
  const settings = await getExpirationSettings(shop);
  const config = await getPointsConfig(shop);

  // If expiration is disabled, skip
  if (!settings.enabled) {
    return { customersSentWarning: 0, totalPointsExpiring: 0 };
  }

  const warningDays = settings.warningDays;
  const now = new Date();
  const warningThreshold = new Date(now);
  warningThreshold.setDate(warningThreshold.getDate() + warningDays);

  // Find customers with points expiring within warning period
  // who haven't been warned yet (check metadata)
  const expiringEntries = await db.pointsLedger.findMany({
    where: {
      shop,
      expired: false,
      amount: { gt: 0 },
      expiresAt: {
        gt: now,
        lte: warningThreshold,
      },
    },
    select: {
      customerId: true,
      amount: true,
      expiresAt: true,
    },
  });

  if (expiringEntries.length === 0) {
    return { customersSentWarning: 0, totalPointsExpiring: 0 };
  }

  // Group by customer
  const customerExpiringPoints = new Map<string, { total: number; earliestExpiry: Date }>();
  for (const entry of expiringEntries) {
    const existing = customerExpiringPoints.get(entry.customerId);
    if (existing) {
      existing.total += entry.amount;
      if (entry.expiresAt && entry.expiresAt < existing.earliestExpiry) {
        existing.earliestExpiry = entry.expiresAt;
      }
    } else {
      customerExpiringPoints.set(entry.customerId, {
        total: entry.amount,
        earliestExpiry: entry.expiresAt!,
      });
    }
  }

  // Get customers who haven't been warned recently (within last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let customersSentWarning = 0;
  let totalPointsExpiring = 0;

  for (const [customerId, expiring] of customerExpiringPoints) {
    const customer = await db.customer.findFirst({
      where: { id: customerId, shop },
      select: {
        id: true,
        email: true,
        firstName: true,
        metadata: true,
      },
    });

    if (!customer?.email) continue;

    // Check if already warned recently
    const metadata = customer.metadata as Record<string, unknown> | null;
    const lastExpirationWarning = metadata?.lastPointsExpirationWarning as string | undefined;

    if (lastExpirationWarning) {
      const lastWarningDate = new Date(lastExpirationWarning);
      if (lastWarningDate > sevenDaysAgo) {
        continue; // Already warned recently
      }
    }

    // Queue email notification (integrate with email service)
    try {
      await queueExpirationWarningEmail(shop, customer, expiring, config);

      // Update metadata with warning timestamp
      await db.customer.update({
        where: { id: customerId },
        data: {
          metadata: {
            ...(metadata || {}),
            lastPointsExpirationWarning: now.toISOString(),
          } as Prisma.JsonValue,
        },
      });

      customersSentWarning++;
      totalPointsExpiring += expiring.total;
    } catch (error) {
      console.error(`[PointsMaintenance] Failed to send warning to ${customer.email}:`, error);
    }
  }

  console.log(`[PointsMaintenance] Sent ${customersSentWarning} expiration warnings for shop ${shop}`);

  return { customersSentWarning, totalPointsExpiring };
}

/**
 * Queue an expiration warning email
 */
async function queueExpirationWarningEmail(
  shop: string,
  customer: { id: string; email: string; firstName: string | null },
  expiring: { total: number; earliestExpiry: Date },
  config: { currencyName: string; currencyNamePlural: string; currencyIcon: string }
): Promise<void> {
  // This integrates with the existing email system
  // For now, we'll log it - the actual email sending will use the email-notifications service

  const daysUntilExpiry = Math.ceil(
    (expiring.earliestExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  console.log(`[PointsMaintenance] Queuing expiration warning email:`, {
    shop,
    customerId: customer.id,
    email: customer.email,
    pointsExpiring: expiring.total,
    daysUntilExpiry,
  });

  // TODO: Integrate with email-notifications.server.ts
  // await sendPointsExpirationWarning({
  //   shop,
  //   customer,
  //   pointsExpiring: expiring.total,
  //   expiryDate: expiring.earliestExpiry,
  //   currencyName: config.currencyNamePlural,
  //   currencyIcon: config.currencyIcon,
  // });
}

// ============================================
// STREAK MANAGEMENT
// ============================================

/**
 * Process daily streak updates for a shop
 *
 * Streaks are based on consecutive days with activity (purchases, spins, etc.)
 */
export async function processStreakUpdates(shop: string): Promise<{
  streaksReset: number;
  streaksIncremented: number;
}> {
  const config = await getPointsConfig(shop);

  if (!config.streakBonusEnabled) {
    return { streaksReset: 0, streaksIncremented: 0 };
  }

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  twoDaysAgo.setHours(0, 0, 0, 0);

  // Find customers with points activity yesterday (to increment streak)
  const activeYesterday = await db.pointsLedger.findMany({
    where: {
      shop,
      createdAt: {
        gte: yesterday,
        lt: now,
      },
      type: {
        in: ["ORDER_EARNED", "CHALLENGE_COMPLETED", "SPIN_WHEEL_WIN"],
      },
    },
    select: {
      customerId: true,
    },
    distinct: ["customerId"],
  });

  const activeCustomerIds = new Set(activeYesterday.map((a) => a.customerId));

  // Get all customers with active streaks
  const customersWithStreaks = await db.customer.findMany({
    where: {
      shop,
      metadata: {
        path: ["pointsStreak", "current"],
        gt: 0,
      },
    },
    select: {
      id: true,
      metadata: true,
    },
  });

  let streaksReset = 0;
  let streaksIncremented = 0;

  for (const customer of customersWithStreaks) {
    const metadata = customer.metadata as Record<string, unknown>;
    const streakData = metadata?.pointsStreak as {
      current: number;
      longest: number;
      lastDate: string;
    } | undefined;

    if (!streakData) continue;

    const lastActivityDate = new Date(streakData.lastDate);
    lastActivityDate.setHours(0, 0, 0, 0);

    if (activeCustomerIds.has(customer.id)) {
      // Customer was active yesterday - increment streak
      const newStreak = streakData.current + 1;
      const newLongest = Math.max(newStreak, streakData.longest);

      await db.customer.update({
        where: { id: customer.id },
        data: {
          metadata: {
            ...metadata,
            pointsStreak: {
              current: newStreak,
              longest: newLongest,
              lastDate: yesterday.toISOString(),
            },
          } as Prisma.JsonValue,
        },
      });

      streaksIncremented++;
    } else if (lastActivityDate < twoDaysAgo) {
      // Customer was not active for more than a day - reset streak
      await db.customer.update({
        where: { id: customer.id },
        data: {
          metadata: {
            ...metadata,
            pointsStreak: {
              current: 0,
              longest: streakData.longest,
              lastDate: streakData.lastDate,
            },
          } as Prisma.JsonValue,
        },
      });

      streaksReset++;
    }
  }

  console.log(`[PointsMaintenance] Streak updates for shop ${shop}: ${streaksIncremented} incremented, ${streaksReset} reset`);

  return { streaksReset, streaksIncremented };
}

/**
 * Record activity for streak tracking
 * Call this when a customer earns points through engagement activities
 */
export async function recordStreakActivity(
  shop: string,
  customerId: string
): Promise<{
  newStreak: number;
  bonusMultiplier: number;
}> {
  const config = await getPointsConfig(shop);

  if (!config.streakBonusEnabled) {
    return { newStreak: 0, bonusMultiplier: 1 };
  }

  const customer = await db.customer.findFirst({
    where: { id: customerId, shop },
    select: { metadata: true },
  });

  const metadata = (customer?.metadata as Record<string, unknown>) || {};
  const streakData = metadata?.pointsStreak as {
    current: number;
    longest: number;
    lastDate: string;
  } | undefined;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  let newStreak: number;
  let longest: number;

  if (!streakData) {
    // First activity
    newStreak = 1;
    longest = 1;
  } else {
    const lastDate = new Date(streakData.lastDate);
    lastDate.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (lastDate.getTime() === today.getTime()) {
      // Already recorded today
      return {
        newStreak: streakData.current,
        bonusMultiplier: 1 + Math.min(streakData.current, 7) * config.streakBonusMultiplier,
      };
    } else if (lastDate.getTime() === yesterday.getTime()) {
      // Consecutive day - increment streak
      newStreak = streakData.current + 1;
      longest = Math.max(newStreak, streakData.longest);
    } else {
      // Streak broken - start fresh
      newStreak = 1;
      longest = Math.max(1, streakData.longest);
    }
  }

  await db.customer.update({
    where: { id: customerId },
    data: {
      metadata: {
        ...metadata,
        pointsStreak: {
          current: newStreak,
          longest,
          lastDate: today.toISOString(),
        },
      } as Prisma.JsonValue,
    },
  });

  const bonusMultiplier = 1 + Math.min(newStreak, 7) * config.streakBonusMultiplier;

  return { newStreak, bonusMultiplier };
}

// ============================================
// ECONOMY HEALTH
// ============================================

/**
 * Calculate points economy health metrics for a shop
 */
export async function calculateEconomyHealth(shop: string): Promise<PointsEconomyHealth> {
  const config = await getPointsConfig(shop);
  const warnings: string[] = [];

  // Get total points in circulation
  const balanceResult = await db.customer.aggregate({
    where: { shop },
    _sum: { pointsBalance: true, lifetimePoints: true },
    _count: true,
    _avg: { pointsBalance: true },
  });

  const totalPointsInCirculation = Number(balanceResult._sum.pointsBalance ?? 0);
  const totalLifetimePointsIssued = Number(balanceResult._sum.lifetimePoints ?? 0);
  const averageBalancePerCustomer = Number(balanceResult._avg.pointsBalance ?? 0);
  const totalCustomers = balanceResult._count;

  // Get customers with non-zero balance
  const customersWithPoints = await db.customer.count({
    where: { shop, pointsBalance: { gt: 0 } },
  });

  // Calculate redemption rate (points redeemed / points earned)
  const pointsRedeemed = totalLifetimePointsIssued - totalPointsInCirculation;
  const pointsRedemptionRate = totalLifetimePointsIssued > 0
    ? (pointsRedeemed / totalLifetimePointsIssued) * 100
    : 0;

  // Get points expiring in 30 days
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const expiringResult = await db.pointsLedger.aggregate({
    where: {
      shop,
      expired: false,
      amount: { gt: 0 },
      expiresAt: {
        gt: new Date(),
        lte: thirtyDaysFromNow,
      },
    },
    _sum: { amount: true },
  });

  const expiringIn30Days = Number(expiringResult._sum.amount ?? 0);

  // Calculate health score (0-100)
  let economyHealthScore = 100;

  // Penalize low redemption rate (indicates points aren't valuable enough)
  if (pointsRedemptionRate < 10) {
    economyHealthScore -= 20;
    warnings.push("Low redemption rate - consider making rewards more attractive");
  } else if (pointsRedemptionRate < 25) {
    economyHealthScore -= 10;
    warnings.push("Below average redemption rate");
  }

  // Penalize very high redemption rate (might indicate points are too easy to earn)
  if (pointsRedemptionRate > 80) {
    economyHealthScore -= 15;
    warnings.push("Very high redemption rate - points may be too easy to earn");
  }

  // Penalize if too many points are expiring
  if (expiringIn30Days > totalPointsInCirculation * 0.2) {
    economyHealthScore -= 15;
    warnings.push("High percentage of points expiring soon");
  }

  // Penalize low engagement (few customers with points)
  const engagementRate = totalCustomers > 0 ? customersWithPoints / totalCustomers : 0;
  if (engagementRate < 0.1) {
    economyHealthScore -= 20;
    warnings.push("Low engagement rate - consider promoting the points program");
  } else if (engagementRate < 0.3) {
    economyHealthScore -= 10;
    warnings.push("Below average engagement rate");
  }

  // Penalize points concentration (if average balance is too high relative to points per dollar)
  const expectedAverageAfter10Orders = config.pointsPerDollar * 50 * 10; // Assuming $50 average order
  if (averageBalancePerCustomer > expectedAverageAfter10Orders * 5) {
    economyHealthScore -= 10;
    warnings.push("High average balance - customers may be hoarding points");
  }

  return {
    shop,
    totalPointsInCirculation,
    totalLifetimePointsIssued,
    pointsRedemptionRate: Math.round(pointsRedemptionRate * 100) / 100,
    averageBalancePerCustomer: Math.round(averageBalancePerCustomer),
    customersWithPoints,
    expiringIn30Days,
    economyHealthScore: Math.max(0, Math.min(100, economyHealthScore)),
    warnings,
  };
}

// ============================================
// MAIN MAINTENANCE JOB
// ============================================

/**
 * Run maintenance for a single shop
 */
export async function runShopMaintenance(shop: string): Promise<PointsMaintenanceResult> {
  const errors: string[] = [];

  // Process expiration
  let expiration = { customersAffected: 0, totalPointsExpired: 0 };
  try {
    expiration = await processShopExpiration(shop);
  } catch (error: any) {
    errors.push(`Expiration failed: ${error.message}`);
  }

  // Send expiration warnings
  let warnings = { customersSentWarning: 0, totalPointsExpiring: 0 };
  try {
    warnings = await sendExpirationWarnings(shop);
  } catch (error: any) {
    errors.push(`Warning emails failed: ${error.message}`);
  }

  // Process streak updates
  let streaks = { streaksReset: 0, streaksIncremented: 0 };
  try {
    streaks = await processStreakUpdates(shop);
  } catch (error: any) {
    errors.push(`Streak updates failed: ${error.message}`);
  }

  return {
    shop,
    expiration,
    warnings,
    streaks,
    errors,
  };
}

/**
 * Run maintenance for all shops with points enabled
 */
export async function runAllShopsMaintenance(): Promise<AllShopsMaintenanceResult> {
  const errors: string[] = [];
  const results: PointsMaintenanceResult[] = [];

  // Find all shops with points enabled
  const configs = await db.pointsConfig.findMany({
    where: { isEnabled: true },
    select: { shop: true },
  });

  for (const { shop } of configs) {
    try {
      const result = await runShopMaintenance(shop);
      results.push(result);
    } catch (error: any) {
      errors.push(`Shop ${shop} failed: ${error.message}`);
    }
  }

  // Calculate totals
  const totals = results.reduce(
    (acc, r) => ({
      totalCustomersAffected: acc.totalCustomersAffected + r.expiration.customersAffected,
      totalPointsExpired: acc.totalPointsExpired + r.expiration.totalPointsExpired,
      totalWarningsSent: acc.totalWarningsSent + r.warnings.customersSentWarning,
    }),
    { totalCustomersAffected: 0, totalPointsExpired: 0, totalWarningsSent: 0 }
  );

  return {
    shopsProcessed: results.length,
    ...totals,
    results,
    errors,
  };
}
