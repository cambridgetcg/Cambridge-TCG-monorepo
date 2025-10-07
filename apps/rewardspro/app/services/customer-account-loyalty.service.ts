/**
 * Customer Account Loyalty Service
 *
 * Shared business logic for fetching loyalty data.
 * Used by both App Proxy and Customer Account UI Extension endpoints.
 *
 * This service encapsulates all loyalty calculations and database queries,
 * making it reusable across different authentication methods.
 */

import db from "../db.server";
import { formatCurrency } from "../utils/currency";

export interface LoyaltyData {
  balance: {
    storeCredit: number;
    storeCreditFormatted: string;
    pendingCredit: number;
    pendingCreditFormatted: string;
    points: number;
  };
  tier: {
    name: string;
    level: number;
    cashbackRate: number;
    benefits: string[];
    renewalDate: string | null;
  };
  progress: {
    currentSpend: number;
    currentSpendFormatted: string;
    nextTier: string | null;
    nextTierThreshold: number;
    nextTierThresholdFormatted: string;
    progressPercentage: number;
    remainingToNextTier: number;
    remainingToNextTierFormatted: string;
    nextTierCashbackRate: number | null;
  };
  lifetime: {
    earned: number;
    earnedFormatted: string;
    spent: number;
    spentFormatted: string;
    redeemed: number;
    redeemedFormatted: string;
  };
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    amountFormatted: string;
    balance: number;
    balanceFormatted: string;
    description: string;
    orderName?: string;
    orderId?: string;
    date: string;
    formattedDate: string;
  }>;
  referral?: {
    code: string;
    rewardAmount: number;
    referralCount: number;
  };
}

interface GetLoyaltyDataParams {
  shop: string;
  customerId: string; // Shopify customer ID (numeric string)
}

/**
 * Get transaction description from type and metadata
 */
function getTransactionDescription(type: string, metadata: any): string {
  switch (type) {
    case 'CASHBACK_EARNED':
      return metadata?.orderName
        ? `Cashback earned on order ${metadata.orderName}`
        : 'Cashback earned';
    case 'ORDER_PAYMENT':
      return metadata?.orderName
        ? `Store credit used for order ${metadata.orderName}`
        : 'Store credit used';
    case 'REFUND_CREDIT':
      return metadata?.orderName
        ? `Refund for order ${metadata.orderName}`
        : 'Store credit refund';
    case 'MANUAL_ADJUSTMENT':
      return metadata?.reason || metadata?.note || metadata?.description || 'Manual credit adjustment';
    case 'SHOPIFY_SYNC':
      return 'Balance sync';
    default:
      return type.replace(/_/g, ' ').toLowerCase();
  }
}

/**
 * Convert Decimal or number to number safely
 */
function toNumber(value: any): number {
  if (typeof value === 'object' && value?.toNumber) {
    return value.toNumber();
  }
  return Number(value) || 0;
}

/**
 * Main service function to get loyalty data for a customer
 *
 * @param params - Shop and customer ID
 * @returns Complete loyalty data for the customer
 */
export async function getLoyaltyData({
  shop,
  customerId,
}: GetLoyaltyDataParams): Promise<LoyaltyData | null> {

  // 1. Fetch customer data (scoped to shop)
  const customer = await db.customer.findFirst({
    where: {
      shopifyCustomerId: customerId,
      shop: shop, // CRITICAL: Always scope to shop for multi-tenant security
    },
  });

  if (!customer) {
    return null; // Customer not enrolled
  }

  // 2. Fetch tier data if customer has one
  let currentTier = null;
  if (customer.currentTierId) {
    currentTier = await db.tier.findFirst({
      where: {
        id: customer.currentTierId,
        shop: shop,
      },
    });
  }

  // 3. Get shop settings for currency formatting
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop },
  });

  // 4. Calculate lifetime earned (sum of all positive credit entries)
  const allCreditEntries = await db.storeCreditLedger.findMany({
    where: {
      customerId: customer.id,
      shop: shop,
      type: {
        in: ["CASHBACK_EARNED", "REFUND_CREDIT", "MANUAL_ADJUSTMENT"],
      },
    },
    select: {
      amount: true,
      type: true,
    },
  });

  let totalEarned = 0;
  for (const entry of allCreditEntries) {
    const amountValue = toNumber(entry.amount);
    if (amountValue > 0) {
      totalEarned += amountValue;
    }
  }

  // 5. Calculate store credit used (redeemed)
  const storeCreditUsed = await db.storeCreditLedger.aggregate({
    where: {
      customerId: customer.id,
      shop: shop,
      type: "ORDER_PAYMENT",
    },
    _sum: {
      amount: true,
    },
  });

  const totalRedeemed = storeCreditUsed._sum.amount
    ? Math.abs(toNumber(storeCreditUsed._sum.amount))
    : 0;

  // 6. Calculate lifetime spent from order metadata
  const cashbackEntries = await db.storeCreditLedger.findMany({
    where: {
      customerId: customer.id,
      shop: shop,
      type: "CASHBACK_EARNED",
    },
    select: {
      metadata: true,
    },
  });

  let totalSpent = 0;
  for (const entry of cashbackEntries) {
    const metadata = entry.metadata as any;
    if (metadata) {
      const amount = metadata.orderTotal || metadata.orderAmount;
      if (amount) {
        totalSpent += parseFloat(amount) || 0;
      }
    }
  }

  // Fallback estimate if no order amounts in metadata (backward compatibility)
  if (totalSpent === 0 && totalEarned > 0) {
    const cashbackOnlyTotal = allCreditEntries
      .filter(e => e.type === 'CASHBACK_EARNED')
      .reduce((sum, entry) => sum + Math.max(0, toNumber(entry.amount)), 0);

    if (cashbackOnlyTotal > 0 && currentTier?.cashbackPercent) {
      totalSpent = (cashbackOnlyTotal / currentTier.cashbackPercent) * 100;
    }
  }

  // 7. Calculate next tier progress
  let nextTierInfo = {
    name: null as string | null,
    threshold: 0,
    cashbackRate: null as number | null,
    progress: 0,
    remaining: 0,
  };

  if (currentTier) {
    // Look for next tier above current
    const nextTier = await db.tier.findFirst({
      where: {
        shop,
        minSpend: { gt: currentTier.minSpend },
      },
      orderBy: { minSpend: 'asc' },
    });

    if (nextTier) {
      const progress = Math.min(100, (totalSpent / nextTier.minSpend) * 100);
      nextTierInfo = {
        name: nextTier.name,
        threshold: nextTier.minSpend,
        cashbackRate: nextTier.cashbackPercent,
        progress: Math.round(progress),
        remaining: Math.max(0, nextTier.minSpend - totalSpent),
      };
    }
  } else {
    // Customer has no tier, show first available tier
    const firstTier = await db.tier.findFirst({
      where: { shop },
      orderBy: { minSpend: 'asc' },
    });

    if (firstTier) {
      nextTierInfo = {
        name: firstTier.name,
        threshold: firstTier.minSpend,
        cashbackRate: firstTier.cashbackPercent,
        progress: 0,
        remaining: firstTier.minSpend,
      };
    }
  }

  // 8. Get recent transaction history
  const recentTransactions = await db.storeCreditLedger.findMany({
    where: {
      customerId: customer.id,
      shop: shop,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 20, // Last 20 transactions
  });

  // Format transactions
  const formattedTransactions = recentTransactions.map(tx => {
    const metadata = tx.metadata as any;
    const amountValue = toNumber(tx.amount);
    const balanceValue = toNumber(tx.balance);

    return {
      id: tx.id,
      type: tx.type,
      amount: amountValue,
      amountFormatted: formatCurrency(Math.abs(amountValue), shopSettings),
      balance: balanceValue,
      balanceFormatted: formatCurrency(balanceValue, shopSettings),
      description: metadata?.description || getTransactionDescription(tx.type, metadata),
      orderName: metadata?.orderName,
      orderId: metadata?.orderId || tx.shopifyOrderId,
      date: tx.createdAt.toISOString(),
      formattedDate: new Date(tx.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    };
  });

  // 9. Check for referral code
  const referralCode = await db.referralCode.findUnique({
    where: { customerId: customer.id },
  });

  // 10. Build complete loyalty data response
  const storeCreditValue = toNumber(customer.storeCredit);
  const pendingCreditValue = toNumber(customer.pendingCreditBalance) || 0;

  const loyaltyData: LoyaltyData = {
    balance: {
      storeCredit: storeCreditValue,
      storeCreditFormatted: formatCurrency(storeCreditValue, shopSettings),
      pendingCredit: pendingCreditValue,
      pendingCreditFormatted: formatCurrency(pendingCreditValue, shopSettings),
      points: customer.pointsBalance || 0,
    },
    tier: {
      name: currentTier?.name || "No Tier",
      level: currentTier?.level || 0,
      cashbackRate: currentTier?.cashbackPercent || 0,
      benefits: currentTier?.benefits || [],
      renewalDate: customer.tierRenewalDate?.toISOString() || null,
    },
    progress: {
      currentSpend: totalSpent,
      currentSpendFormatted: formatCurrency(totalSpent, shopSettings),
      nextTier: nextTierInfo.name,
      nextTierThreshold: nextTierInfo.threshold,
      nextTierThresholdFormatted: formatCurrency(nextTierInfo.threshold, shopSettings),
      progressPercentage: nextTierInfo.progress,
      remainingToNextTier: nextTierInfo.remaining,
      remainingToNextTierFormatted: formatCurrency(nextTierInfo.remaining, shopSettings),
      nextTierCashbackRate: nextTierInfo.cashbackRate,
    },
    lifetime: {
      earned: totalEarned,
      earnedFormatted: formatCurrency(totalEarned, shopSettings),
      spent: totalSpent,
      spentFormatted: formatCurrency(totalSpent, shopSettings),
      redeemed: totalRedeemed,
      redeemedFormatted: formatCurrency(totalRedeemed, shopSettings),
    },
    transactions: formattedTransactions,
    referral: referralCode ? {
      code: referralCode.code,
      rewardAmount: toNumber(referralCode.rewardAmount),
      referralCount: referralCode.usageCount,
    } : undefined,
  };

  return loyaltyData;
}

/**
 * Get customer enrollment status
 */
export async function getCustomerEnrollmentStatus({
  shop,
  customerId,
}: GetLoyaltyDataParams): Promise<{
  enrolled: boolean;
  customer?: any;
}> {
  const customer = await db.customer.findFirst({
    where: {
      shopifyCustomerId: customerId,
      shop: shop,
    },
  });

  return {
    enrolled: !!customer,
    customer,
  };
}
