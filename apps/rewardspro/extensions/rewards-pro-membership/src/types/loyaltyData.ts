/**
 * Loyalty data shape returned by the `/api/customer-account/loyalty`
 * endpoint. Extracted from MembershipBlock.tsx so the hook
 * (`useLoyaltyData`) and the overview component (`MembershipOverview`)
 * can share the same type without the orchestrator owning every
 * interface definition.
 *
 * Keep this file in sync with the server response shape in
 * `app/routes/api.customer-account.loyalty.tsx`.
 */

// Re-export of the points/upgrade types that live with their
// component files — importing from there keeps this module dependency-
// free while still giving callers the full `LoyaltyData` shape.
import type { PointsData } from "../components";
import type { UpgradeOptionsInfo } from "../components";

export interface CustomerInfo {
  firstName: string | null;
  lastName: string | null;
  memberSince: string;
  tags: string[];
}

export interface BalanceInfo {
  current: number;
  lifetimeEarned: number;
}

export interface TierSourceDetails {
  type: "spending" | "subscription" | "purchase" | "manual";
  nextBillingDate?: string | null;
  billingInterval?: string;
  expiresAt?: string | null;
  isLifetime?: boolean;
  annualSpend?: number;
  evaluationPeriod?: string;
  note?: string | null;
  daysRemaining?: number | null;
  expiryType?: "renewal" | "expiration" | "none";
  willAutoRenew?: boolean;
}

export interface TierInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  cashbackPercent: number;
  minSpend: number;
  source?: string;
  sourceDetails?: TierSourceDetails;
}

export interface ProgressInfo {
  nextTierName: string | null;
  nextTierCashback: number | null;
  percent: number;
  amountRemaining: number;
  isMaxTier: boolean;
}

export interface MaintenanceInfo {
  evaluationPeriod: "ANNUAL" | "LIFETIME";
  minSpendToMaintain: number;
  annualSpent: number;
  isSecured: boolean;
  maintenancePercent: number;
  amountToMaintain: number;
}

export interface TransactionInfo {
  id: string;
  type: string;
  amount: number;
  date: string;
  description: string;
  orderNumber?: string | null;
}

export interface AllTierInfo {
  id: string;
  name: string;
  icon: string;
  cashbackPercent: number;
  minSpend: number;
  isCurrentTier: boolean;
  isAchieved: boolean;
}

export interface SpendingProgressInfo {
  spendingBasedTierId: string | null;
  spendingBasedTierName: string | null;
  spendingBasedCashback: number | null;
  currentSpending: number;
  nextSpendingTierName: string | null;
  nextSpendingTierMinSpend: number | null;
  progressToNextSpendingTier: number;
  amountToNextSpendingTier: number;
  wouldDowngradeOnExpiry: boolean;
}

export interface PendingCashbackInfo {
  amount: number;
  orderCount: number;
  orders: Array<{
    orderName: string;
    amount: number;
    date: string;
  }>;
}

export interface TierChangeInfo {
  fromTier: string | null;
  toTier: string | null;
  changeType: "UPGRADE" | "DOWNGRADE" | "LATERAL" | "INITIAL";
  reason: string;
  changedAt: string;
  daysAgo: number;
}

export interface DataFreshnessInfo {
  customerUpdatedAt: string | null;
  tierStateUpdatedAt: string | null;
  progressCalculatedAt: string | null;
}

export interface LoyaltyData {
  success: boolean;
  enrolled: boolean;
  customer: CustomerInfo;
  balance: BalanceInfo;
  tier: TierInfo | null;
  benefits: string[];
  progress: ProgressInfo;
  stats: {
    orderCount: number;
    totalSpent: number;
    lastOrderDate: string | null;
    totalCashbackEarned?: number;
    annualSpent?: number;
  };
  maintenance?: MaintenanceInfo | null;
  allTiers: AllTierInfo[];
  recentTransactions: TransactionInfo[];
  currency: string;
  message?: string;
  canEnroll?: boolean;
  isPreview?: boolean;
  // Dual progress for non-spending tier sources.
  spendingProgress?: SpendingProgressInfo | null;
  // Edge-case flags.
  isNewCustomer?: boolean;
  pendingCashback?: PendingCashbackInfo | null;
  recentTierChange?: TierChangeInfo | null;
  // Data freshness metadata (displayed in StaleDataBanner).
  lastUpdated?: string;
  dataFreshness?: DataFreshnessInfo;
  // Feature-specific payloads.
  points?: PointsData | null;
  upgradeOptions?: UpgradeOptionsInfo | null;
  // Legacy fields — kept for backward compatibility with older API responses.
  totalEarned?: number;
  progressToNextTier?: number;
  amountToNextTier?: number;
  nextTier?: { name: string; cashbackPercent: number; minSpend: number } | null;
}
