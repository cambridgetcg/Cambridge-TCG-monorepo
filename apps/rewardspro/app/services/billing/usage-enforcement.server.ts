/**
 * Advisory capacity reporting.
 *
 * Plan limits trigger warnings and upgrade guidance, never a payment error,
 * merchant lockout, reward interruption, or Shopify usage charge.
 */

import prisma from "../../db.server";
import { PRICING_PLANS } from "../../constants/pricing-contract";
import { getOrderLimit } from "../../constants/plan-limits";

export interface UsageEnforcementResult {
  allowed: true;
  reason?: never;
  currentUsage: number;
  limit: number;
  percentage: number;
  overage: number;
  message: string;
  upgradeRequired?: boolean;
}

export type UsageBlockReason =
  | "USAGE_CAP_EXCEEDED"
  | "ORDER_LIMIT_EXCEEDED"
  | "NO_SUBSCRIPTION"
  | "SUBSCRIPTION_INACTIVE"
  | "FREE_PLAN_LIMIT";

export interface UsageThresholdAlert {
  shop: string;
  threshold: number;
  currentUsage: number;
  limit: number;
  percentage: number;
  alertType: "WARNING" | "CRITICAL" | "EXCEEDED";
}

export async function enforceUsageCap(
  shop: string,
): Promise<UsageEnforcementResult> {
  try {
    const now = new Date();
    const [billing, settings, monthly] = await Promise.all([
      prisma.billingSubscription.findUnique({
        where: { shop },
        select: { currentPeriodOrders: true, planType: true },
      }),
      prisma.shopSettings.findUnique({
        where: { shop },
        select: { currentPlan: true },
      }),
      prisma.monthlyOrderUsage.findFirst({
        where: {
          shop,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
        },
      }),
    ]);

    const planName =
      billing?.planType ||
      settings?.currentPlan ||
      monthly?.planName ||
      PRICING_PLANS.free.billingName;
    const contractLimit = getOrderLimit(planName);
    const limit = Math.max(contractLimit, monthly?.planLimit || 0);
    const currentUsage = monthly?.orderCount ?? billing?.currentPeriodOrders ?? 0;
    const percentage = limit > 0 ? (currentUsage / limit) * 100 : 0;
    const overage = Math.max(0, currentUsage - limit);

    return {
      allowed: true,
      currentUsage,
      limit,
      percentage,
      overage,
      message: overage > 0
        ? `Plan capacity exceeded by ${overage} reward-eligible orders; consider a larger fixed-price plan.`
        : percentage >= 80
          ? `${Math.round(percentage)}% of monthly plan capacity used.`
          : "Within plan capacity.",
      upgradeRequired: overage > 0,
    };
  } catch (error) {
    console.error("[UsageAdvisory] Failed to read capacity:", error);
    return {
      allowed: true,
      currentUsage: 0,
      limit: PRICING_PLANS.free.limits.orders,
      percentage: 0,
      overage: 0,
      message: "Capacity status is temporarily unavailable.",
    };
  }
}

export async function checkUsageThresholds(
  shop: string,
): Promise<UsageThresholdAlert | null> {
  const result = await enforceUsageCap(shop);
  const threshold = [100, 90, 75, 50].find(
    (candidate) => result.percentage >= candidate,
  );
  if (!threshold) return null;

  return {
    shop,
    threshold,
    currentUsage: result.currentUsage,
    limit: result.limit,
    percentage: result.percentage,
    alertType: threshold >= 100
      ? "EXCEEDED"
      : threshold >= 90
        ? "CRITICAL"
        : "WARNING",
  };
}

export async function recordThresholdAlert(
  shop: string,
  threshold: number,
): Promise<boolean> {
  try {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const existing = await prisma.notification.findFirst({
      where: {
        shop,
        type: "USAGE_THRESHOLD_ALERT",
        createdAt: { gte: periodStart },
        metadata: { path: ["threshold"], equals: threshold },
      },
    });
    if (existing) return false;

    await prisma.notification.create({
      data: {
        id: `usage_alert_${shop}_${threshold}_${now.getTime()}`,
        shop,
        type: "USAGE_THRESHOLD_ALERT",
        title: threshold >= 100
          ? "Monthly plan capacity reached"
          : `${threshold}% of monthly plan capacity used`,
        message: threshold >= 100
          ? "RewardsPro remains available. Consider a larger fixed-price plan for more capacity."
          : `You've used ${threshold}% of this month's reward-eligible order capacity.`,
        severity: threshold >= 90 ? "WARNING" : "INFO",
        metadata: { threshold, alertedAt: now.toISOString(), advisory: true },
      },
    });
    return true;
  } catch (error) {
    console.error("[UsageAdvisory] Error recording threshold alert:", error);
    return false;
  }
}

export async function getUsageSummary(shop: string): Promise<{
  currentUsage: number;
  limit: number;
  percentage: number;
  planType: string;
  daysRemaining: number;
  projectedUsage: number;
  onTrackToExceed: boolean;
}> {
  const result = await enforceUsageCap(shop);
  const now = new Date();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const daysRemaining = Math.max(0, daysInMonth - now.getDate());
  const daysPassed = Math.max(1, now.getDate());
  const projectedUsage = Math.round(
    result.currentUsage + (result.currentUsage / daysPassed) * daysRemaining,
  );

  return {
    currentUsage: result.currentUsage,
    limit: result.limit,
    percentage: Math.round(result.percentage * 10) / 10,
    planType: "advisory",
    daysRemaining,
    projectedUsage,
    onTrackToExceed: projectedUsage > result.limit,
  };
}

export async function requireUsageCapacity(shop: string): Promise<void> {
  await enforceUsageCap(shop);
}
