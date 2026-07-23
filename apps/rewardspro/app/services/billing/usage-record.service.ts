import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../../db.server";

export interface UsageCharge {
  amount: number;
  description: string;
  currencyCode?: string;
  idempotencyKey?: string;
}

export interface UsageSummary {
  shop: string;
  date: Date;
  ordersProcessed: number;
  cashbackIssued: number;
  customersActive: number;
  pendingChargeAmount: number;
}

/**
 * Read-only compatibility service for legacy usage history.
 *
 * Current RewardsPro plans are fixed-price. Mutation-shaped methods remain so
 * stale callers fail safely, but none can call Shopify or write a charge.
 */
export class UsageRecordService {
  constructor(
    private readonly _admin: AdminApiContext,
    private readonly shop: string,
  ) {}

  async getUsageLineItemId(): Promise<null> {
    return null;
  }

  async createUsageCharge(
    _charge: UsageCharge,
  ): Promise<{ success: false; error: string }> {
    return {
      success: false,
      error: "Usage billing is disabled for fixed-price RewardsPro plans.",
    };
  }

  async processDailyUsageBatch(): Promise<{
    success: true;
    skipped: true;
    error: string;
  }> {
    return {
      success: true,
      skipped: true,
      error: "Usage billing is disabled for fixed-price RewardsPro plans.",
    };
  }

  async getUsageSummary(
    startDate: Date,
    endDate: Date,
  ): Promise<UsageSummary[]> {
    try {
      const summaries = await prisma.usageSummary.findMany({
        where: {
          shop: this.shop,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: "desc" },
      });

      return summaries.map((summary) => ({
        shop: summary.shop,
        date: summary.date,
        ordersProcessed: summary.ordersProcessed,
        cashbackIssued: summary.cashbackIssued,
        customersActive: summary.customersActive,
        pendingChargeAmount: summary.chargeAmount,
      }));
    } catch (error) {
      console.error("[UsageRecord] Error fetching historical summaries:", error);
      return [];
    }
  }
}
