import type { LoyaltyData } from "./types/loyaltyData";

/**
 * Mock payload used by the Shopify checkout/theme editor preview.
 *
 * When merchants customize the customer-account extension inside Shopify's
 * editor, there's no real customer session — but the widget still needs
 * to render a believable state so designers can see what they're
 * configuring. `useLoyaltyData` injects this value whenever `isInEditor`
 * is true.
 *
 * Keep this in sync with the `LoyaltyData` shape. Values are deliberately
 * "middle of the journey" so every branch of the render tree
 * (dual-progress card, upgrade options, pending cashback, streaks) has
 * realistic data to show in the editor preview.
 *
 * Extracted from MembershipBlock.tsx 2026-04-23 to slim the orchestrator.
 */
export function getMockData(): LoyaltyData {
  // Mock data simulates a subscription tier with dual progress display
  const nextBillingDate = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000); // 23 days from now

  return {
    success: true,
    enrolled: true,
    customer: {
      firstName: "Sarah",
      lastName: "Smith",
      memberSince: "2024-01-15T00:00:00.000Z",
      tags: [],
    },
    balance: {
      current: 50.0,
      lifetimeEarned: 125.5,
    },
    tier: {
      id: "mock-tier-gold",
      name: "Gold Member",
      icon: "⭐",
      color: "#FFD700",
      cashbackPercent: 5,
      minSpend: 500,
      source: "TIER_SUBSCRIPTION",
      sourceDetails: {
        type: "subscription",
        nextBillingDate: nextBillingDate.toISOString(),
        billingInterval: "MONTHLY",
        daysRemaining: 23,
        expiryType: "renewal",
        willAutoRenew: true,
      },
    },
    benefits: [
      "5% cashback on every order",
      "Member-only promotions",
      "Early access to new products",
    ],
    progress: {
      nextTierName: "Platinum Member",
      nextTierCashback: 10,
      percent: 65,
      amountRemaining: 350,
      isMaxTier: false,
    },
    stats: {
      orderCount: 12,
      totalSpent: 420.0,
      lastOrderDate: new Date().toISOString(),
    },
    allTiers: [
      { id: "1", name: "Bronze", icon: "🥉", cashbackPercent: 2, minSpend: 0, isCurrentTier: false, isAchieved: true },
      { id: "2", name: "Silver", icon: "🥈", cashbackPercent: 3, minSpend: 250, isCurrentTier: false, isAchieved: true },
      { id: "3", name: "Gold", icon: "⭐", cashbackPercent: 5, minSpend: 500, isCurrentTier: true, isAchieved: false },
      { id: "4", name: "Platinum", icon: "💎", cashbackPercent: 10, minSpend: 1000, isCurrentTier: false, isAchieved: false },
    ],
    recentTransactions: [
      { id: "1", type: "CASHBACK_EARNED", amount: 12.5, date: new Date().toISOString(), description: "Cashback from order #1234", orderNumber: "#1234" },
      { id: "2", type: "ORDER_PAYMENT", amount: -5.0, date: new Date(Date.now() - 86400000).toISOString(), description: "Used for order #1235", orderNumber: "#1235" },
      { id: "3", type: "CASHBACK_EARNED", amount: 8.0, date: new Date(Date.now() - 172800000).toISOString(), description: "Cashback from order #1233", orderNumber: "#1233" },
    ],
    currency: "USD",
    message: "Preview - This is sample membership data",
    isPreview: true,
    spendingProgress: {
      spendingBasedTierId: "mock-tier-silver",
      spendingBasedTierName: "Silver",
      spendingBasedCashback: 3,
      currentSpending: 420,
      nextSpendingTierName: "Gold",
      nextSpendingTierMinSpend: 500,
      progressToNextSpendingTier: 68,
      amountToNextSpendingTier: 80,
      wouldDowngradeOnExpiry: true,
    },
    totalEarned: 125.5,
    progressToNextTier: 65,
    amountToNextTier: 350,
    nextTier: { name: "Platinum Member", cashbackPercent: 10, minSpend: 1000 },
    upgradeOptions: {
      available: true,
      shopDomain: "preview-store.myshopify.com",
      products: [
        {
          id: "mock-upgrade-1",
          tierName: "Platinum Member",
          tierCashback: 10,
          tierIcon: "💎",
          tierColor: "#E5E4E2",
          productHandle: "platinum-membership-monthly",
          productUrl: "https://preview-store.myshopify.com/products/platinum-membership-monthly",
          duration: "MONTHLY" as const,
          price: 9.99,
          currency: "USD",
        },
        {
          id: "mock-upgrade-2",
          tierName: "Platinum Member",
          tierCashback: 10,
          tierIcon: "💎",
          tierColor: "#E5E4E2",
          productHandle: "platinum-membership-annual",
          productUrl: "https://preview-store.myshopify.com/products/platinum-membership-annual",
          duration: "ANNUAL" as const,
          price: 99.99,
          currency: "USD",
        },
      ],
      message: "Upgrade to Platinum Member for 10% cashback!",
    },
    points: {
      enabled: true,
      balance: {
        available: 1250,
        lifetime: 3500,
        expiringSoon: { amount: 200, expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() },
      },
      currency: {
        name: "Star",
        plural: "Stars",
        icon: "",
      },
      config: {
        pointsPerDollar: 10,
        tierMultiplier: 1.5,
      },
      activeBonus: {
        hasBonus: true,
        multiplier: 2,
        eventNames: ["Double Stars Weekend"],
        endsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      streak: {
        current: 5,
        bonusMultiplier: 1.25,
      },
      recentTransactions: [
        { id: "pt-1", type: "ORDER_POINTS", amount: 150, date: new Date().toISOString(), description: "Order #1234" },
        { id: "pt-2", type: "STREAK_BONUS", amount: 50, date: new Date(Date.now() - 86400000).toISOString(), description: "5-day streak bonus" },
        { id: "pt-3", type: "REDEMPTION", amount: -500, date: new Date(Date.now() - 172800000).toISOString(), description: "Redeemed $5 discount" },
      ],
    },
  };
}
