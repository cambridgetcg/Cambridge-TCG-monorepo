/**
 * Safe Data Access Utilities
 *
 * Provides type-safe accessors for API response data to handle
 * null, undefined, and partial responses gracefully.
 */

// ============================================================================
// Primitive Safe Accessors
// ============================================================================

export function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

export function safeString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function safeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

export function safeArray<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? value : fallback;
}

export function safeDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

// ============================================================================
// Complex Object Safe Accessors
// ============================================================================

export interface SafeBalanceInfo {
  current: number;
  lifetimeEarned: number;
}

export function safeBalance(data: unknown): SafeBalanceInfo {
  if (!data || typeof data !== 'object') {
    return { current: 0, lifetimeEarned: 0 };
  }
  const obj = data as Record<string, unknown>;
  return {
    current: safeNumber(obj.current),
    lifetimeEarned: safeNumber(obj.lifetimeEarned)
  };
}

export interface SafeCustomerInfo {
  firstName: string | null;
  lastName: string | null;
  memberSince: string;
  tags: string[];
}

export function safeCustomer(data: unknown): SafeCustomerInfo {
  if (!data || typeof data !== 'object') {
    return {
      firstName: null,
      lastName: null,
      memberSince: new Date().toISOString(),
      tags: []
    };
  }
  const obj = data as Record<string, unknown>;
  return {
    firstName: obj.firstName as string | null ?? null,
    lastName: obj.lastName as string | null ?? null,
    memberSince: safeString(obj.memberSince, new Date().toISOString()),
    tags: safeArray(obj.tags)
  };
}

export interface SafeTierSourceDetails {
  type: 'spending' | 'subscription' | 'purchase' | 'manual';
  nextBillingDate?: string | null;
  billingInterval?: string;
  expiresAt?: string | null;
  isLifetime?: boolean;
  annualSpend?: number;
  evaluationPeriod?: string;
  note?: string | null;
  daysRemaining?: number | null;
  expiryType?: 'renewal' | 'expiration' | 'none';
  willAutoRenew?: boolean;
}

export interface SafeTierInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  cashbackPercent: number;
  minSpend: number;
  source?: string;
  sourceDetails?: SafeTierSourceDetails;
}

export function safeTier(data: unknown): SafeTierInfo | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  return {
    id: safeString(obj.id, 'unknown'),
    name: safeString(obj.name, 'Member'),
    icon: safeString(obj.icon, '⭐'),
    color: safeString(obj.color, '#FFD700'),
    cashbackPercent: safeNumber(obj.cashbackPercent),
    minSpend: safeNumber(obj.minSpend),
    source: obj.source as string | undefined,
    sourceDetails: obj.sourceDetails as SafeTierSourceDetails | undefined
  };
}

export interface SafeProgressInfo {
  nextTierName: string | null;
  nextTierCashback: number | null;
  percent: number;
  amountRemaining: number;
  isMaxTier: boolean;
}

export function safeProgress(data: unknown): SafeProgressInfo {
  if (!data || typeof data !== 'object') {
    return {
      nextTierName: null,
      nextTierCashback: null,
      percent: 0,
      amountRemaining: 0,
      isMaxTier: false
    };
  }
  const obj = data as Record<string, unknown>;

  return {
    nextTierName: obj.nextTierName as string | null ?? null,
    nextTierCashback: obj.nextTierCashback != null ? safeNumber(obj.nextTierCashback) : null,
    percent: safeNumber(obj.percent),
    amountRemaining: safeNumber(obj.amountRemaining),
    isMaxTier: safeBoolean(obj.isMaxTier)
  };
}

export interface SafeStatsInfo {
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string | null;
  totalCashbackEarned: number;
  annualSpent: number;
}

export function safeStats(data: unknown): SafeStatsInfo {
  if (!data || typeof data !== 'object') {
    return {
      orderCount: 0,
      totalSpent: 0,
      lastOrderDate: null,
      totalCashbackEarned: 0,
      annualSpent: 0
    };
  }
  const obj = data as Record<string, unknown>;

  return {
    orderCount: safeNumber(obj.orderCount),
    totalSpent: safeNumber(obj.totalSpent),
    lastOrderDate: obj.lastOrderDate as string | null ?? null,
    totalCashbackEarned: safeNumber(obj.totalCashbackEarned),
    annualSpent: safeNumber(obj.annualSpent)
  };
}

export interface SafeMaintenanceInfo {
  evaluationPeriod: 'ANNUAL' | 'LIFETIME';
  minSpendToMaintain: number;
  annualSpent: number;
  isSecured: boolean;
  maintenancePercent: number;
  amountToMaintain: number;
}

export function safeMaintenance(data: unknown): SafeMaintenanceInfo | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  return {
    evaluationPeriod: (obj.evaluationPeriod as 'ANNUAL' | 'LIFETIME') || 'LIFETIME',
    minSpendToMaintain: safeNumber(obj.minSpendToMaintain),
    annualSpent: safeNumber(obj.annualSpent),
    isSecured: safeBoolean(obj.isSecured),
    maintenancePercent: safeNumber(obj.maintenancePercent),
    amountToMaintain: safeNumber(obj.amountToMaintain)
  };
}

export interface SafePendingCashbackInfo {
  amount: number;
  orderCount: number;
  orders: Array<{
    orderName: string;
    amount: number;
    date: string;
  }>;
}

export function safePendingCashback(data: unknown): SafePendingCashbackInfo | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  const amount = safeNumber(obj.amount);
  if (amount <= 0) return null;

  return {
    amount,
    orderCount: safeNumber(obj.orderCount),
    orders: safeArray(obj.orders).map((o: any) => ({
      orderName: safeString(o?.orderName),
      amount: safeNumber(o?.amount),
      date: safeString(o?.date)
    }))
  };
}

export interface SafeTierChangeInfo {
  fromTier: string | null;
  toTier: string | null;
  changeType: 'UPGRADE' | 'DOWNGRADE' | 'LATERAL' | 'INITIAL';
  reason: string;
  changedAt: string;
  daysAgo: number;
}

export function safeTierChange(data: unknown): SafeTierChangeInfo | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  return {
    fromTier: obj.fromTier as string | null ?? null,
    toTier: obj.toTier as string | null ?? null,
    changeType: (obj.changeType as SafeTierChangeInfo['changeType']) || 'LATERAL',
    reason: safeString(obj.reason, 'other'),
    changedAt: safeString(obj.changedAt),
    daysAgo: safeNumber(obj.daysAgo)
  };
}

export interface SafeTransactionInfo {
  id: string;
  type: string;
  amount: number;
  date: string;
  description: string;
  orderNumber: string | null;
}

export function safeTransactions(data: unknown): SafeTransactionInfo[] {
  if (!Array.isArray(data)) return [];

  return data.map((t: any) => ({
    id: safeString(t?.id, `tx-${Math.random()}`),
    type: safeString(t?.type, 'UNKNOWN'),
    amount: safeNumber(t?.amount),
    date: safeString(t?.date),
    description: safeString(t?.description, 'Transaction'),
    orderNumber: t?.orderNumber as string | null ?? null
  }));
}

export interface SafeAllTierInfo {
  id: string;
  name: string;
  icon: string;
  cashbackPercent: number;
  minSpend: number;
  isCurrentTier: boolean;
  isAchieved: boolean;
}

export function safeAllTiers(data: unknown): SafeAllTierInfo[] {
  if (!Array.isArray(data)) return [];

  return data.map((t: any) => ({
    id: safeString(t?.id, `tier-${Math.random()}`),
    name: safeString(t?.name, 'Tier'),
    icon: safeString(t?.icon, '⭐'),
    cashbackPercent: safeNumber(t?.cashbackPercent),
    minSpend: safeNumber(t?.minSpend),
    isCurrentTier: safeBoolean(t?.isCurrentTier),
    isAchieved: safeBoolean(t?.isAchieved)
  }));
}

// ============================================================================
// Detection Utilities
// ============================================================================

/**
 * Check if customer is new (no orders, no earnings)
 */
export function isNewCustomerState(
  stats: SafeStatsInfo,
  balance: SafeBalanceInfo,
  isNewCustomerFlag?: boolean
): boolean {
  // Trust the API flag if provided
  if (typeof isNewCustomerFlag === 'boolean') {
    return isNewCustomerFlag;
  }
  // Fallback to calculation
  return stats.orderCount === 0 && balance.lifetimeEarned === 0 && balance.current === 0;
}

/**
 * Check if data is stale (older than threshold)
 */
export function isDataStale(lastUpdated: string | null | undefined, thresholdMs = 60 * 60 * 1000): boolean {
  if (!lastUpdated) return true;
  const updateTime = safeDate(lastUpdated);
  if (!updateTime) return true;
  return Date.now() - updateTime.getTime() > thresholdMs;
}

/**
 * Get age of data in minutes
 */
export function getDataAgeMinutes(lastUpdated: string | null | undefined): number {
  if (!lastUpdated) return Infinity;
  const updateTime = safeDate(lastUpdated);
  if (!updateTime) return Infinity;
  return Math.floor((Date.now() - updateTime.getTime()) / 60000);
}
