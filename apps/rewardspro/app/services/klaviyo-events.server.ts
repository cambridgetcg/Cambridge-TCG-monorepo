/**
 * Klaviyo Events Service
 *
 * Handles building and dispatching events to Klaviyo.
 * Each event triggers flows configured by merchants in Klaviyo.
 *
 * Event naming convention: "RewardsPro [Event Name]"
 */

import { v4 as uuidv4 } from "uuid";
import prisma from "~/db.server";
import {
  getKlaviyoService,
  buildProfileProperties,
  hashProfileData,
} from "./klaviyo.server";
import type { Customer, Tier } from "@prisma/client";

// ============================================
// EVENT NAMES (Metric Names in Klaviyo)
// ============================================

export const KLAVIYO_EVENTS = {
  // Customer Lifecycle
  CUSTOMER_ENROLLED: "RewardsPro Customer Enrolled",
  CUSTOMER_BIRTHDAY: "RewardsPro Customer Birthday",
  CUSTOMER_ANNIVERSARY: "RewardsPro Customer Anniversary",

  // Transaction Events
  ORDER_PLACED: "RewardsPro Order Placed",
  CASHBACK_EARNED: "RewardsPro Cashback Earned",
  CASHBACK_REDEEMED: "RewardsPro Cashback Redeemed",
  REFUND_PROCESSED: "RewardsPro Refund Processed",

  // Tier Events
  TIER_UPGRADED: "RewardsPro Tier Upgraded",
  TIER_DOWNGRADED: "RewardsPro Tier Downgraded",
  TIER_UPGRADE_NEAR: "RewardsPro Tier Upgrade Near",
  VIP_ACHIEVED: "RewardsPro VIP Status Achieved",

  // Balance & Expiry Events
  POINTS_EXPIRING: "RewardsPro Points Expiring Soon",
  BALANCE_REMINDER: "RewardsPro Cashback Balance Reminder",
  REWARD_AVAILABLE: "RewardsPro Reward Available",

  // Engagement Events
  WIN_BACK: "RewardsPro Win Back Needed",
  AT_RISK: "RewardsPro At Risk Customer",
  REFERRAL_COMPLETED: "RewardsPro Referral Completed",

  // Manual Adjustment Events (Phase 1 Gap Fill)
  CASHBACK_ADJUSTED: "RewardsPro Cashback Adjusted",

  // Customer Segment Events (Phase 1 Gap Fill)
  CUSTOMER_BECAME_CHAMPION: "RewardsPro Customer Became Champion",
  CUSTOMER_BECAME_LOYAL: "RewardsPro Customer Became Loyal",
  CUSTOMER_AT_RISK: "RewardsPro Customer At Risk",

  // ============================================
  // REWARDS ENGAGEMENT EVENTS (Marketing-Rewards Integration)
  // ============================================

  // Points Events
  POINTS_SPENT: "RewardsPro Points Spent",

  // Raffle Events
  RAFFLE_ENTERED: "RewardsPro Raffle Entry",
  RAFFLE_WON: "RewardsPro Raffle Won",
  RAFFLE_ENDING_SOON: "RewardsPro Raffle Ending Soon",
  RAFFLE_NEW_AVAILABLE: "RewardsPro New Raffle Available",

  // Mystery Box Events
  MYSTERY_BOX_OPENED: "RewardsPro Mystery Box Opened",
  MYSTERY_BOX_WON: "RewardsPro Mystery Box Prize Won",
  MYSTERY_BOX_NEW_AVAILABLE: "RewardsPro New Mystery Box Available",

  // Challenge Events (future)
  CHALLENGE_STARTED: "RewardsPro Challenge Started",
  CHALLENGE_COMPLETED: "RewardsPro Challenge Completed",
  CHALLENGE_PROGRESS: "RewardsPro Challenge Progress Update",

  // Bonus Events
  BONUS_EVENT_STARTED: "RewardsPro Bonus Event Started",
  BONUS_EVENT_ENDING: "RewardsPro Bonus Event Ending Soon",

  // Engagement Triggers
  REWARDS_DORMANT: "RewardsPro Rewards Engagement Needed",
  HIGH_POINTS_NO_ACTIVITY: "RewardsPro High Balance No Activity",

  // ============================================
  // GIFT CARD & STORE CREDIT EVENTS (Marketing-Gift Cards Integration)
  // ============================================

  // Gift Card Events
  GIFT_CARD_PURCHASED: "RewardsPro Gift Card Purchased",
  GIFT_CARD_RECEIVED: "RewardsPro Gift Card Received",
  GIFT_CARD_REDEEMED: "RewardsPro Gift Card Redeemed",
  GIFT_CARD_BALANCE_LOW: "RewardsPro Gift Card Balance Low",
  GIFT_CARD_EXPIRING: "RewardsPro Gift Card Expiring Soon",

  // Store Credit Events
  STORE_CREDIT_EARNED: "RewardsPro Store Credit Earned",
  STORE_CREDIT_SPENT: "RewardsPro Store Credit Spent",
  STORE_CREDIT_CONVERTED: "RewardsPro Store Credit Converted",
  STORE_CREDIT_MILESTONE: "RewardsPro Store Credit Milestone",
  STORE_CREDIT_BALANCE_REMINDER: "RewardsPro Store Credit Balance Reminder",

  // Cashback Events (enhanced)
  CASHBACK_MILESTONE: "RewardsPro Cashback Milestone Reached",
} as const;

export type KlaviyoEventName = (typeof KLAVIYO_EVENTS)[keyof typeof KLAVIYO_EVENTS];

// ============================================
// EVENT DISPATCHER
// ============================================

interface DispatchOptions {
  shop: string;
  eventType: KlaviyoEventName;
  email: string;
  customerId?: string;
  properties: Record<string, unknown>;
  value?: number;
  uniqueId: string;
  eventTime?: Date;
  orderId?: string;
  tierChangeLogId?: string;
}

/**
 * Dispatch an event to Klaviyo and record it in the database
 */
export async function dispatchKlaviyoEvent(
  options: DispatchOptions
): Promise<boolean> {
  const {
    shop,
    eventType,
    email,
    customerId,
    properties,
    value,
    uniqueId,
    eventTime,
    orderId,
    tierChangeLogId,
  } = options;

  // Check if Klaviyo is enabled
  const klaviyo = await getKlaviyoService(shop);
  if (!klaviyo) {
    return false;
  }

  // Check automation settings
  const automationSettings = await prisma.klaviyoAutomationSettings.findUnique({
    where: { shop },
  });

  if (!automationSettings?.automationsEnabled) {
    return false;
  }

  // Check if this specific event type is enabled
  if (!isEventEnabled(automationSettings, eventType)) {
    return false;
  }

  // Create event record in database
  const eventRecord = await prisma.klaviyoEvent.create({
    data: {
      id: uuidv4(),
      shop,
      eventType,
      uniqueId,
      metricName: eventType,
      customerId,
      customerEmail: email,
      eventValue: value,
      eventProperties: properties,
      eventTime: eventTime || new Date(),
      orderId,
      tierChangeLogId,
      status: "SENDING",
    },
  });

  try {
    // Send to Klaviyo
    await klaviyo.trackEvent({
      metricName: eventType,
      email,
      properties: {
        ...properties,
        shop,
      },
      value,
      uniqueId,
      time: eventTime,
    });

    // Update status to sent
    await prisma.klaviyoEvent.update({
      where: { id: eventRecord.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    // Update KlaviyoProfile with last event info
    if (customerId) {
      await prisma.klaviyoProfile.updateMany({
        where: { shop, customerId },
        data: {
          lastEventAt: new Date(),
          lastEventType: eventType,
        },
      });
    }

    return true;
  } catch (error) {
    console.error(`[Klaviyo] Failed to dispatch event ${eventType}:`, error);

    // Update status to failed
    await prisma.klaviyoEvent.update({
      where: { id: eventRecord.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        retryCount: 1,
        nextRetryAt: new Date(Date.now() + 5 * 60 * 1000), // Retry in 5 minutes
      },
    });

    return false;
  }
}

/**
 * Check if a specific event type is enabled in automation settings
 */
function isEventEnabled(
  settings: {
    sendCustomerEnrolled: boolean;
    sendCustomerBirthday: boolean;
    sendCustomerAnniversary: boolean;
    sendOrderPlaced: boolean;
    sendCashbackEarned: boolean;
    sendCashbackRedeemed: boolean;
    sendTierUpgraded: boolean;
    sendTierDowngraded: boolean;
    sendTierUpgradeNear: boolean;
    sendVipAchieved: boolean;
    sendPointsExpiring: boolean;
    sendBalanceReminder: boolean;
    sendWinBack: boolean;
    // Phase 1 Gap Fill - new event toggles
    sendCashbackAdjusted?: boolean;
    sendCustomerBecameChampion?: boolean;
    sendCustomerBecameLoyal?: boolean;
    // Rewards engagement event toggles
    sendRewardsEngagement?: boolean;
    sendRaffleEvents?: boolean;
    sendMysteryBoxEvents?: boolean;
    sendPointsEvents?: boolean;
    // Gift card & store credit event toggles
    sendGiftCardEvents?: boolean;
    sendStoreCreditEvents?: boolean;
  },
  eventType: KlaviyoEventName
): boolean {
  const mapping: Partial<Record<KlaviyoEventName, keyof typeof settings>> = {
    [KLAVIYO_EVENTS.CUSTOMER_ENROLLED]: "sendCustomerEnrolled",
    [KLAVIYO_EVENTS.CUSTOMER_BIRTHDAY]: "sendCustomerBirthday",
    [KLAVIYO_EVENTS.CUSTOMER_ANNIVERSARY]: "sendCustomerAnniversary",
    [KLAVIYO_EVENTS.ORDER_PLACED]: "sendOrderPlaced",
    [KLAVIYO_EVENTS.CASHBACK_EARNED]: "sendCashbackEarned",
    [KLAVIYO_EVENTS.CASHBACK_REDEEMED]: "sendCashbackRedeemed",
    [KLAVIYO_EVENTS.TIER_UPGRADED]: "sendTierUpgraded",
    [KLAVIYO_EVENTS.TIER_DOWNGRADED]: "sendTierDowngraded",
    [KLAVIYO_EVENTS.TIER_UPGRADE_NEAR]: "sendTierUpgradeNear",
    [KLAVIYO_EVENTS.VIP_ACHIEVED]: "sendVipAchieved",
    [KLAVIYO_EVENTS.POINTS_EXPIRING]: "sendPointsExpiring",
    [KLAVIYO_EVENTS.BALANCE_REMINDER]: "sendBalanceReminder",
    [KLAVIYO_EVENTS.WIN_BACK]: "sendWinBack",
    // Phase 1 Gap Fill - new event mappings
    [KLAVIYO_EVENTS.CASHBACK_ADJUSTED]: "sendCashbackAdjusted",
    [KLAVIYO_EVENTS.CUSTOMER_BECAME_CHAMPION]: "sendCustomerBecameChampion",
    [KLAVIYO_EVENTS.CUSTOMER_BECAME_LOYAL]: "sendCustomerBecameLoyal",
    [KLAVIYO_EVENTS.CUSTOMER_AT_RISK]: "sendWinBack", // Reuses win-back setting
    // These don't have toggles, always enabled if automations are on
    [KLAVIYO_EVENTS.REFUND_PROCESSED]: "sendOrderPlaced",
    [KLAVIYO_EVENTS.REWARD_AVAILABLE]: "sendBalanceReminder",
    [KLAVIYO_EVENTS.AT_RISK]: "sendWinBack",
    [KLAVIYO_EVENTS.REFERRAL_COMPLETED]: "sendCustomerEnrolled",

    // Rewards Engagement Events - grouped by feature
    // Points events
    [KLAVIYO_EVENTS.POINTS_EARNED]: "sendPointsEvents",
    [KLAVIYO_EVENTS.POINTS_SPENT]: "sendPointsEvents",
    [KLAVIYO_EVENTS.POINTS_MILESTONE]: "sendPointsEvents",
    [KLAVIYO_EVENTS.POINTS_BALANCE_LOW]: "sendPointsEvents",

    // Raffle events
    [KLAVIYO_EVENTS.RAFFLE_ENTERED]: "sendRaffleEvents",
    [KLAVIYO_EVENTS.RAFFLE_WON]: "sendRaffleEvents",
    [KLAVIYO_EVENTS.RAFFLE_ENDING_SOON]: "sendRaffleEvents",
    [KLAVIYO_EVENTS.RAFFLE_NEW_AVAILABLE]: "sendRaffleEvents",

    // Mystery box events
    [KLAVIYO_EVENTS.MYSTERY_BOX_OPENED]: "sendMysteryBoxEvents",
    [KLAVIYO_EVENTS.MYSTERY_BOX_WON]: "sendMysteryBoxEvents",
    [KLAVIYO_EVENTS.MYSTERY_BOX_NEW_AVAILABLE]: "sendMysteryBoxEvents",

    // Challenge events (use rewards engagement toggle)
    [KLAVIYO_EVENTS.CHALLENGE_STARTED]: "sendRewardsEngagement",
    [KLAVIYO_EVENTS.CHALLENGE_COMPLETED]: "sendRewardsEngagement",
    [KLAVIYO_EVENTS.CHALLENGE_PROGRESS]: "sendRewardsEngagement",

    // Bonus events (use rewards engagement toggle)
    [KLAVIYO_EVENTS.BONUS_EVENT_STARTED]: "sendRewardsEngagement",
    [KLAVIYO_EVENTS.BONUS_EVENT_ENDING]: "sendRewardsEngagement",

    // Re-engagement triggers
    [KLAVIYO_EVENTS.REWARDS_DORMANT]: "sendRewardsEngagement",
    [KLAVIYO_EVENTS.HIGH_POINTS_NO_ACTIVITY]: "sendRewardsEngagement",

    // Gift card events
    [KLAVIYO_EVENTS.GIFT_CARD_PURCHASED]: "sendGiftCardEvents",
    [KLAVIYO_EVENTS.GIFT_CARD_RECEIVED]: "sendGiftCardEvents",
    [KLAVIYO_EVENTS.GIFT_CARD_REDEEMED]: "sendGiftCardEvents",
    [KLAVIYO_EVENTS.GIFT_CARD_BALANCE_LOW]: "sendGiftCardEvents",
    [KLAVIYO_EVENTS.GIFT_CARD_EXPIRING]: "sendGiftCardEvents",

    // Store credit events
    [KLAVIYO_EVENTS.STORE_CREDIT_EARNED]: "sendStoreCreditEvents",
    [KLAVIYO_EVENTS.STORE_CREDIT_SPENT]: "sendStoreCreditEvents",
    [KLAVIYO_EVENTS.STORE_CREDIT_CONVERTED]: "sendStoreCreditEvents",
    [KLAVIYO_EVENTS.STORE_CREDIT_MILESTONE]: "sendStoreCreditEvents",
    [KLAVIYO_EVENTS.STORE_CREDIT_BALANCE_REMINDER]: "sendStoreCreditEvents",

    // Cashback milestone (uses cashback toggle)
    [KLAVIYO_EVENTS.CASHBACK_MILESTONE]: "sendCashbackEarned",
  };

  const settingKey = mapping[eventType];
  // Default to true for new events if setting doesn't exist
  return settingKey ? (settings[settingKey] ?? true) : true;
}

// ============================================
// EVENT BUILDERS
// ============================================

/**
 * Track customer enrollment event
 */
export async function trackCustomerEnrolled(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  enrolledVia: "checkout" | "account_page" | "import" | "manual" = "manual"
): Promise<boolean> {
  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.CUSTOMER_ENROLLED,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `enrolled_${customer.id}`,
    properties: {
      customer_id: customer.id,
      shopify_customer_id: customer.shopifyCustomerId,
      first_name: customer.firstName,
      last_name: customer.lastName,
      initial_tier: customer.currentTier?.name || "None",
      initial_tier_id: customer.currentTier?.id || null,
      cashback_percent: customer.currentTier?.cashbackPercent || 0,
      enrolled_via: enrolledVia,
      program_name: "Rewards Pro",
    },
  });
}

/**
 * Track order placed event
 */
export async function trackOrderPlaced(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  order: {
    id: string;
    orderNumber?: string;
    totalPrice: number;
    cashbackEarned: number;
    cashbackUsed: number;
    currency?: string;
    discountCode?: string;
    lineItems?: Array<{
      productId?: string;
      sku?: string;
      title: string;
      quantity: number;
      price: number;
      imageUrl?: string;
      productUrl?: string;
    }>;
  },
  tiers?: Tier[]
): Promise<boolean> {
  // Calculate tier progress
  let nextTierName: string | null = null;
  let spendToNextTier: number | null = null;
  let progressToNextTier: number | null = null;

  if (tiers && customer.currentTier) {
    const sortedTiers = [...tiers].sort((a, b) => a.minSpend - b.minSpend);
    const currentIndex = sortedTiers.findIndex(
      (t) => t.id === customer.currentTier?.id
    );
    if (currentIndex >= 0 && currentIndex < sortedTiers.length - 1) {
      const nextTier = sortedTiers[currentIndex + 1];
      nextTierName = nextTier.name;
      spendToNextTier = Math.max(0, nextTier.minSpend - Number(customer.totalSpent));
      progressToNextTier = Math.min(
        100,
        Math.round((Number(customer.totalSpent) / nextTier.minSpend) * 100)
      );
    }
  }

  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.ORDER_PLACED,
    email: customer.email,
    customerId: customer.id,
    uniqueId: order.id,
    orderId: order.id,
    value: order.totalPrice,
    properties: {
      $value: order.totalPrice,
      order_id: order.id,
      order_number: order.orderNumber,

      // Cashback details
      cashback_earned: order.cashbackEarned,
      cashback_percent: customer.currentTier?.cashbackPercent || 0,
      cashback_used: order.cashbackUsed,

      // Customer status
      current_tier: customer.currentTier?.name || "None",
      tier_id: customer.currentTier?.id || null,
      cashback_balance_after: customer.storeCredit,
      lifetime_spend: customer.totalSpent,
      orders_count: customer.orderCount,

      // Progress tracking
      spend_to_next_tier: spendToNextTier,
      next_tier_name: nextTierName,
      progress_to_next_tier: progressToNextTier,

      // Order details
      items: order.lineItems?.map((item) => ({
        ProductID: item.productId,
        SKU: item.sku,
        ProductName: item.title,
        Quantity: item.quantity,
        ItemPrice: item.price,
        ImageURL: item.imageUrl,
        ProductURL: item.productUrl,
      })),
      item_count: order.lineItems?.reduce((sum, item) => sum + item.quantity, 0) || 0,

      // Metadata
      currency: order.currency || "USD",
      discount_code: order.discountCode,
    },
  });
}

/**
 * Track tier upgraded event
 */
export async function trackTierUpgraded(
  shop: string,
  customer: Customer,
  previousTier: Tier | null,
  newTier: Tier,
  qualifyingOrderId?: string,
  tiers?: Tier[]
): Promise<boolean> {
  // Calculate next tier info
  let nextTierName: string | null = null;
  let spendToNextTier: number | null = null;

  if (tiers) {
    const sortedTiers = [...tiers].sort((a, b) => a.minSpend - b.minSpend);
    const currentIndex = sortedTiers.findIndex((t) => t.id === newTier.id);
    if (currentIndex >= 0 && currentIndex < sortedTiers.length - 1) {
      const nextTier = sortedTiers[currentIndex + 1];
      nextTierName = nextTier.name;
      spendToNextTier = nextTier.minSpend - Number(customer.totalSpent);
    }
  }

  // Check if this is VIP status (highest tier)
  const isVip = tiers
    ? !tiers.some((t) => t.minSpend > newTier.minSpend)
    : false;

  // Calculate time to achieve
  const timeToAchieve = Math.floor(
    (Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Track upgrade event
  const upgradeResult = await dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.TIER_UPGRADED,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `tier_upgrade_${customer.id}_${Date.now()}`,
    properties: {
      // Tier change details
      previous_tier: previousTier?.name || "None",
      previous_tier_id: previousTier?.id || null,
      previous_cashback_percent: previousTier?.cashbackPercent || 0,

      new_tier: newTier.name,
      new_tier_id: newTier.id,
      new_cashback_percent: newTier.cashbackPercent,

      cashback_increase: newTier.cashbackPercent - (previousTier?.cashbackPercent || 0),

      // Achievement context
      lifetime_spend: customer.totalSpent,
      qualifying_order_id: qualifyingOrderId,
      time_to_achieve: timeToAchieve,

      // Next goal
      next_tier_name: nextTierName,
      spend_to_next_tier: spendToNextTier,

      // VIP status
      is_vip: isVip,
    },
  });

  // If VIP status achieved, also send VIP event
  if (isVip && upgradeResult) {
    await dispatchKlaviyoEvent({
      shop,
      eventType: KLAVIYO_EVENTS.VIP_ACHIEVED,
      email: customer.email,
      customerId: customer.id,
      uniqueId: `vip_achieved_${customer.id}`,
      properties: {
        tier_name: newTier.name,
        cashback_percent: newTier.cashbackPercent,
        lifetime_spend: customer.totalSpent,
        orders_count: customer.orderCount,
        time_to_achieve: timeToAchieve,
      },
    });
  }

  return upgradeResult;
}

/**
 * Track cashback earned event
 */
export async function trackCashbackEarned(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  amount: number,
  orderId: string,
  orderNumber?: string
): Promise<boolean> {
  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.CASHBACK_EARNED,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `cashback_earned_${orderId}`,
    orderId,
    value: amount,
    properties: {
      $value: amount,
      cashback_amount: amount,
      order_id: orderId,
      order_number: orderNumber,
      current_tier: customer.currentTier?.name || "None",
      cashback_percent: customer.currentTier?.cashbackPercent || 0,
      new_balance: customer.storeCredit,
      total_earned: customer.totalCashbackEarned,
    },
  });
}

/**
 * Track cashback redeemed event
 */
export async function trackCashbackRedeemed(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  amount: number,
  orderId?: string,
  orderNumber?: string
): Promise<boolean> {
  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.CASHBACK_REDEEMED,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `cashback_redeemed_${orderId || Date.now()}`,
    orderId,
    value: amount,
    properties: {
      $value: amount,
      cashback_amount: amount,
      order_id: orderId,
      order_number: orderNumber,
      remaining_balance: customer.storeCredit,
      total_redeemed: customer.totalCashbackEarned,
      current_tier: customer.currentTier?.name || "None",
    },
  });
}

/**
 * Track points expiring soon event
 */
export async function trackPointsExpiring(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  pointsExpiring: number,
  expiryDate: Date,
  daysUntilExpiry: number
): Promise<boolean> {
  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.POINTS_EXPIRING,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `points_expiry_${customer.id}_${daysUntilExpiry}d`,
    properties: {
      points_expiring: pointsExpiring,
      cashback_expiring: customer.storeCredit, // Assuming points = cashback for simplicity
      expiry_date: expiryDate.toISOString().split("T")[0],
      days_until_expiry: daysUntilExpiry,
      total_cashback_balance: customer.storeCredit,
      current_tier: customer.currentTier?.name || "None",
      redeem_url: `https://${shop}/account/rewards`,
    },
  });
}

/**
 * Track win-back needed event
 */
export async function trackWinBackNeeded(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  daysSinceLastOrder: number,
  winBackCode?: string,
  offerExpires?: Date
): Promise<boolean> {
  const riskLevel =
    daysSinceLastOrder >= 90 ? "high" : daysSinceLastOrder >= 60 ? "medium" : "low";

  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.WIN_BACK,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `winback_${customer.id}_${daysSinceLastOrder}d`,
    properties: {
      days_since_last_order: daysSinceLastOrder,
      last_order_date: customer.lastOrderDate?.toISOString().split("T")[0],
      cashback_balance: customer.storeCredit,
      current_tier: customer.currentTier?.name || "None",
      lifetime_spend: customer.totalSpent,
      total_orders: customer.orderCount,
      risk_level: riskLevel,
      win_back_code: winBackCode,
      offer_expires: offerExpires?.toISOString().split("T")[0],
    },
  });
}

/**
 * Track balance reminder event
 */
export async function trackBalanceReminder(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  daysSinceLastOrder: number
): Promise<boolean> {
  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.BALANCE_REMINDER,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `balance_reminder_${customer.id}_${daysSinceLastOrder}d`,
    properties: {
      cashback_balance: customer.storeCredit,
      days_since_last_order: daysSinceLastOrder,
      last_order_date: customer.lastOrderDate?.toISOString().split("T")[0],
      current_tier: customer.currentTier?.name || "None",
      lifetime_spend: customer.totalSpent,
      orders_count: customer.orderCount,
    },
  });
}

/**
 * Track tier upgrade near event
 */
export async function trackTierUpgradeNear(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  nextTier: Tier,
  spendRemaining: number,
  progressPercent: number
): Promise<boolean> {
  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.TIER_UPGRADE_NEAR,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `tier_nudge_${customer.id}_${customer.currentTier?.id}`,
    properties: {
      current_tier: customer.currentTier?.name || "None",
      current_tier_id: customer.currentTier?.id,
      current_cashback_percent: customer.currentTier?.cashbackPercent || 0,
      next_tier: nextTier.name,
      next_tier_id: nextTier.id,
      next_tier_cashback: nextTier.cashbackPercent,
      spend_to_next_tier: spendRemaining,
      progress_percent: progressPercent,
      cashback_increase: nextTier.cashbackPercent - (customer.currentTier?.cashbackPercent || 0),
      lifetime_spend: customer.totalSpent,
    },
  });
}

// ============================================
// PHASE 1 GAP FILL: CASHBACK ADJUSTED EVENT
// ============================================

/**
 * Track manual cashback adjustment event
 * Triggered when admin manually adds or removes cashback/store credit
 */
export async function trackCashbackAdjusted(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  adjustment: {
    amount: number;
    type: "ADDITION" | "REMOVAL";
    reason: string;
    adminNote?: string;
    newBalance: number;
  }
): Promise<boolean> {
  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.CASHBACK_ADJUSTED,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `adjustment_${customer.id}_${Date.now()}`,
    value: adjustment.amount,
    properties: {
      $value: adjustment.amount,
      adjustment_type: adjustment.type,
      adjustment_amount: adjustment.amount,
      reason: adjustment.reason,
      admin_note: adjustment.adminNote || null,
      new_balance: adjustment.newBalance,
      current_tier: customer.currentTier?.name || "None",
      cashback_percent: customer.currentTier?.cashbackPercent || 0,
      lifetime_spend: customer.totalSpent,
      orders_count: customer.orderCount,
    },
  });
}

// ============================================
// PHASE 1 GAP FILL: CUSTOMER SEGMENT EVENTS
// ============================================

/**
 * Customer segment types based on behavior patterns
 * Modeled after LoyaltyLion's Insights Segments
 */
export type CustomerSegment =
  | "CHAMPION"   // VIP tier + active in last 30 days
  | "LOYAL"      // 3+ orders + active in last 60 days
  | "ENGAGED"    // Active in last 45 days
  | "AT_RISK"    // 2+ orders but inactive 45-89 days
  | "LAPSED"     // Inactive 90+ days
  | "NEW";       // 1 order or enrolled < 30 days

/**
 * Calculate customer segment based on behavior metrics
 */
export function calculateCustomerSegment(
  customer: Customer & { currentTier?: Tier | null },
  tiers?: Tier[]
): CustomerSegment {
  const daysSinceOrder = customer.lastOrderDate
    ? Math.floor(
        (Date.now() - customer.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  // Check if customer is VIP (highest tier)
  const isVip =
    tiers && customer.currentTier
      ? !tiers.some((t) => t.minSpend > customer.currentTier!.minSpend)
      : false;

  // Champion: VIP + active in last 30 days
  if (isVip && daysSinceOrder !== null && daysSinceOrder <= 30) {
    return "CHAMPION";
  }

  // Loyal: 3+ orders + active in last 60 days
  if (
    customer.orderCount >= 3 &&
    daysSinceOrder !== null &&
    daysSinceOrder <= 60
  ) {
    return "LOYAL";
  }

  // Engaged: Active in last 45 days
  if (daysSinceOrder !== null && daysSinceOrder <= 45) {
    return "ENGAGED";
  }

  // At-Risk: 2+ orders but inactive 45-89 days
  if (
    customer.orderCount >= 2 &&
    daysSinceOrder !== null &&
    daysSinceOrder >= 45 &&
    daysSinceOrder < 90
  ) {
    return "AT_RISK";
  }

  // Lapsed: Inactive 90+ days
  if (daysSinceOrder !== null && daysSinceOrder >= 90) {
    return "LAPSED";
  }

  // New: Everything else (1 order or enrolled < 30 days)
  return "NEW";
}

/**
 * Track when a customer transitions to a notable segment
 * Only tracks transitions to CHAMPION, LOYAL, or AT_RISK
 */
export async function trackSegmentChanged(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  previousSegment: CustomerSegment,
  newSegment: CustomerSegment
): Promise<boolean> {
  // Only track transitions to specific notable segments
  const eventMapping: Record<string, KlaviyoEventName | null> = {
    CHAMPION: KLAVIYO_EVENTS.CUSTOMER_BECAME_CHAMPION,
    LOYAL: KLAVIYO_EVENTS.CUSTOMER_BECAME_LOYAL,
    AT_RISK: KLAVIYO_EVENTS.CUSTOMER_AT_RISK,
    ENGAGED: null,
    LAPSED: null, // LAPSED triggers WIN_BACK instead
    NEW: null,
  };

  const eventType = eventMapping[newSegment];
  if (!eventType) {
    return false;
  }

  const daysSinceOrder = customer.lastOrderDate
    ? Math.floor(
        (Date.now() - customer.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  return dispatchKlaviyoEvent({
    shop,
    eventType,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `segment_${newSegment}_${customer.id}_${Date.now()}`,
    properties: {
      previous_segment: previousSegment,
      new_segment: newSegment,
      orders_count: customer.orderCount,
      lifetime_spend: customer.totalSpent,
      days_since_last_order: daysSinceOrder,
      current_tier: customer.currentTier?.name || "None",
      cashback_balance: customer.storeCredit,
      cashback_percent: customer.currentTier?.cashbackPercent || 0,
    },
  });
}

// ============================================
// REWARDS ENGAGEMENT EVENTS
// ============================================

/**
 * Track points spent event
 */
export async function trackPointsSpent(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  pointsSpent: number,
  spentOn: "raffle" | "mystery_box" | "redemption" | "premium_spin" | "other",
  details?: {
    raffleName?: string;
    raffleId?: string;
    mysteryBoxName?: string;
    mysteryBoxId?: string;
    redemptionValue?: number;
  }
): Promise<boolean> {
  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.POINTS_SPENT,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `points_spent_${customer.id}_${Date.now()}`,
    value: pointsSpent,
    properties: {
      $value: pointsSpent,
      points_spent: pointsSpent,
      spent_on: spentOn,
      new_balance: customer.pointsBalance,
      current_tier: customer.currentTier?.name || "None",
      ...details,
    },
  });
}

/**
 * Track raffle entry event
 */
export async function trackRaffleEntered(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  raffle: {
    id: string;
    name: string;
    endsAt: Date;
    entryCount: number;
    totalEntries: number;
  },
  entriesThisPurchase: number,
  pointsSpent: number
): Promise<boolean> {
  const daysUntilDraw = Math.ceil(
    (raffle.endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.RAFFLE_ENTERED,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `raffle_entry_${customer.id}_${raffle.id}_${Date.now()}`,
    properties: {
      raffle_id: raffle.id,
      raffle_name: raffle.name,
      entries_purchased: entriesThisPurchase,
      total_entries: raffle.entryCount,
      points_spent: pointsSpent,
      raffle_ends_at: raffle.endsAt.toISOString(),
      days_until_draw: daysUntilDraw,
      total_participants: raffle.totalEntries,
      points_balance_after: customer.pointsBalance,
      current_tier: customer.currentTier?.name || "None",
    },
  });
}

/**
 * Track raffle won event
 */
export async function trackRaffleWon(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  raffle: {
    id: string;
    name: string;
  },
  prize: {
    id: string;
    name: string;
    type: string;
    value?: number;
    valueDescription?: string;
  },
  winDetails: {
    entriesEntered: number;
    totalParticipants: number;
  }
): Promise<boolean> {
  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.RAFFLE_WON,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `raffle_won_${customer.id}_${raffle.id}_${prize.id}`,
    value: prize.value,
    properties: {
      $value: prize.value,
      raffle_id: raffle.id,
      raffle_name: raffle.name,
      prize_id: prize.id,
      prize_name: prize.name,
      prize_type: prize.type,
      prize_value: prize.value,
      prize_description: prize.valueDescription,
      entries_entered: winDetails.entriesEntered,
      total_participants: winDetails.totalParticipants,
      current_tier: customer.currentTier?.name || "None",
      lifetime_raffle_wins: 1, // Will need to query from DB if tracking
    },
  });
}

/**
 * Track mystery box opened event
 */
export async function trackMysteryBoxOpened(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  mysteryBox: {
    id: string;
    name: string;
    openCost: number;
  },
  pointsSpent: number
): Promise<boolean> {
  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.MYSTERY_BOX_OPENED,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `mystery_box_open_${customer.id}_${mysteryBox.id}_${Date.now()}`,
    properties: {
      mystery_box_id: mysteryBox.id,
      mystery_box_name: mysteryBox.name,
      points_spent: pointsSpent,
      open_cost: mysteryBox.openCost,
      points_balance_after: customer.pointsBalance,
      current_tier: customer.currentTier?.name || "None",
    },
  });
}

/**
 * Track mystery box prize won event
 */
export async function trackMysteryBoxWon(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  mysteryBox: {
    id: string;
    name: string;
  },
  reward: {
    id: string;
    name: string;
    type: string;
    rarity: string;
    value?: number;
    valueDescription?: string;
  }
): Promise<boolean> {
  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.MYSTERY_BOX_WON,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `mystery_box_won_${customer.id}_${mysteryBox.id}_${reward.id}_${Date.now()}`,
    value: reward.value,
    properties: {
      $value: reward.value,
      mystery_box_id: mysteryBox.id,
      mystery_box_name: mysteryBox.name,
      reward_id: reward.id,
      reward_name: reward.name,
      reward_type: reward.type,
      reward_rarity: reward.rarity,
      reward_value: reward.value,
      reward_description: reward.valueDescription,
      current_tier: customer.currentTier?.name || "None",
      is_jackpot: reward.rarity === "LEGENDARY" || reward.rarity === "EPIC",
    },
  });
}

/**
 * Track gift card purchased event
 */
export async function trackGiftCardPurchased(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  giftCard: {
    id: string;
    code: string;
    initialAmount: number;
    recipientEmail?: string;
    recipientName?: string;
    message?: string;
    expiresAt?: Date;
    tierBranded?: boolean;
    tierName?: string;
  }
): Promise<boolean> {
  const isSelfPurchase = !giftCard.recipientEmail || giftCard.recipientEmail === customer.email;

  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.GIFT_CARD_PURCHASED,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `gift_card_purchased_${giftCard.id}`,
    value: giftCard.initialAmount,
    properties: {
      $value: giftCard.initialAmount,
      gift_card_id: giftCard.id,
      gift_card_code: giftCard.code,
      amount: giftCard.initialAmount,
      is_self_purchase: isSelfPurchase,
      recipient_email: giftCard.recipientEmail,
      recipient_name: giftCard.recipientName,
      gift_message: giftCard.message,
      expires_at: giftCard.expiresAt?.toISOString(),
      is_tier_branded: giftCard.tierBranded || false,
      tier_name: giftCard.tierName,
      current_tier: customer.currentTier?.name || "None",
    },
  });
}

/**
 * Track store credit converted to gift card event
 */
export async function trackStoreCreditConverted(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  conversion: {
    creditAmount: number;
    giftCardCode: string;
    giftCardId: string;
    bonusAmount?: number;
    tierBonus?: boolean;
    newCreditBalance: number;
  }
): Promise<boolean> {
  const totalValue = conversion.creditAmount + (conversion.bonusAmount || 0);

  return dispatchKlaviyoEvent({
    shop,
    eventType: KLAVIYO_EVENTS.STORE_CREDIT_CONVERTED,
    email: customer.email,
    customerId: customer.id,
    uniqueId: `store_credit_converted_${conversion.giftCardId}`,
    value: totalValue,
    properties: {
      $value: totalValue,
      credit_converted: conversion.creditAmount,
      bonus_amount: conversion.bonusAmount || 0,
      total_gift_card_value: totalValue,
      gift_card_code: conversion.giftCardCode,
      gift_card_id: conversion.giftCardId,
      tier_bonus_applied: conversion.tierBonus || false,
      new_credit_balance: conversion.newCreditBalance,
      current_tier: customer.currentTier?.name || "None",
    },
  });
}

// ============================================
// PROFILE SYNC
// ============================================

/**
 * Sync a customer profile to Klaviyo
 */
export async function syncCustomerToKlaviyo(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  tiers?: Tier[]
): Promise<boolean> {
  const klaviyo = await getKlaviyoService(shop);
  if (!klaviyo) {
    return false;
  }

  const properties = buildProfileProperties(customer, shop, tiers);
  const dataHash = hashProfileData(properties as unknown as Record<string, unknown>);

  // Check if we need to sync (compare hash)
  const existingProfile = await prisma.klaviyoProfile.findUnique({
    where: { shop_customerId: { shop, customerId: customer.id } },
  });

  if (existingProfile?.profileDataHash === dataHash) {
    // No changes, skip sync
    return true;
  }

  try {
    // Create or update profile in Klaviyo
    const klaviyoProfileId = await klaviyo.createOrUpdateProfile({
      email: customer.email,
      firstName: customer.firstName || undefined,
      lastName: customer.lastName || undefined,
      phone: customer.phone || undefined,
      externalId: customer.shopifyCustomerId,
      properties: properties as unknown as Record<string, unknown>,
    });

    // Update or create local record
    await prisma.klaviyoProfile.upsert({
      where: { shop_customerId: { shop, customerId: customer.id } },
      create: {
        id: uuidv4(),
        shop,
        customerId: customer.id,
        klaviyoProfileId,
        email: customer.email,
        shopifyCustomerId: customer.shopifyCustomerId,
        syncStatus: "SYNCED",
        syncedAt: new Date(),
        profileDataHash: dataHash,
      },
      update: {
        klaviyoProfileId,
        email: customer.email,
        syncStatus: "SYNCED",
        syncedAt: new Date(),
        syncVersion: { increment: 1 },
        profileDataHash: dataHash,
        lastSyncError: null,
        syncRetryCount: 0,
      },
    });

    return true;
  } catch (error) {
    console.error("[Klaviyo] Failed to sync customer:", error);

    // Update profile with error
    if (existingProfile) {
      await prisma.klaviyoProfile.update({
        where: { id: existingProfile.id },
        data: {
          syncStatus: "ERROR",
          lastSyncError: error instanceof Error ? error.message : "Unknown error",
          syncRetryCount: { increment: 1 },
        },
      });
    }

    return false;
  }
}
