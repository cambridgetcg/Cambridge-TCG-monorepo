/**
 * Type definitions for RewardsPro Customer Account UI Extension
 */

export interface LoyaltyData {
  balance: {
    storeCredit: number;
    storeCreditFormatted: string;
    pendingCredit: number;
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
    nextTier: string | null;
    nextTierCashback?: number;
    progressPercentage: number;
    remainingToNextTier: number;
  };
  lifetime: {
    earned: number;
    spent: number;
    redeemed: number;
    orderCount?: number;
    averageCashback?: number;
  };
  transactions: Transaction[];
  referral?: {
    code: string;
    rewardAmount: number;
    referralCount: number;
  };
}

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  amountFormatted: string;
  description: string;
  createdAt: string;
  orderId?: string;
}

export interface LoyaltyAPIResponse {
  success: boolean;
  enrolled: boolean;
  customer?: {
    id: string;
    displayName: string;
    email: string;
  };
  data?: LoyaltyData;
  message?: string;
  benefits?: string[];
}
