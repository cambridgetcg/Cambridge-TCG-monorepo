// DEPRECATED — disabled 2026-04-23.
//
// Points can no longer be redeemed for discount codes. Points are spent
// exclusively on raffles and mystery boxes.
//
// Why this file still exists
// --------------------------
// Two live routes import `getRedemptionTiers` and expect an array shape:
//   - app/routes/api.proxy.$.tsx:454
//   - app/routes/api.points-analytics.tsx:365
// For those callers we short-circuit to `[]` (feature disabled → empty
// UI is the natural fallback).
//
// Every OTHER exported function throws when called. The old `redeemPoints`
// implementation spent points via the ledger and THEN called Shopify's
// discount API with no wrapping transaction — a Shopify failure would
// drop the customer's points on the floor. Making that code throw
// prevents any forgotten or scheduled caller (jobs, background tasks,
// ops scripts) from corrupting customer balances.
//
// The original implementation lives in git history; restore via:
//   git show HEAD~1:app/services/points-redemption.server.ts

/**
 * Points Redemption Service
 *
 * @deprecated Points can no longer be redeemed for discount codes.
 * All exported functions either return empty/null (reads) or throw (writes).
 */

// ════════════════════════════════════════════════════════════════════════
// Deprecation guards
// ════════════════════════════════════════════════════════════════════════

/** Throw from any mutating entry point. `never` return type satisfies
 *  every Promise<X> signature so existing TypeScript callers compile
 *  without edits. */
function deprecatedThrow(fn: string): never {
  throw new Error(
    `points-redemption.server.${fn}() is deprecated and has been disabled. ` +
    `Points can no longer be redeemed for discount codes — they are spent ` +
    `exclusively on raffles and mystery boxes. If you are hitting this, ` +
    `remove the call site or migrate to raffle-entry / mystery-box-open.`
  );
}

/** Dedupe'd deprecation warning for read paths that remain callable. */
const _warnedReads = new Set<string>();
function warnDeprecatedRead(fn: string): void {
  if (_warnedReads.has(fn)) return;
  _warnedReads.add(fn);
  console.warn(
    `[points-redemption] ${fn}() is deprecated and returns empty. ` +
    `Points redemption is disabled; remove the call when convenient.`
  );
}

// ════════════════════════════════════════════════════════════════════════
// Public types — preserved so TypeScript importers still compile.
// ════════════════════════════════════════════════════════════════════════

export type RedemptionType =
  | "FIXED_DISCOUNT"
  | "PERCENTAGE_DISCOUNT"
  | "FREE_SHIPPING"
  | "FREE_PRODUCT";

export interface RedemptionTier {
  id: string;
  name: string;
  pointsCost: number;
  type: RedemptionType;
  value: number;
  isActive: boolean;
  minOrderAmount?: number;
  maxUsesPerCustomer?: number;
  validDays?: number;
  productId?: string;
  metadata?: Record<string, unknown>;
}

export interface RedemptionResult {
  success: boolean;
  redemptionId?: string;
  discountCode?: string;
  discountAmount?: number;
  discountType?: RedemptionType;
  expiresAt?: Date;
  pointsSpent?: number;
  remainingBalance?: number;
  error?: string;
}

export interface Redemption {
  id: string;
  customerId: string;
  shop: string;
  tierId: string;
  tierName: string;
  pointsSpent: number;
  discountCode: string;
  discountType: RedemptionType;
  discountValue: number;
  status: "PENDING" | "USED" | "EXPIRED" | "CANCELLED";
  shopifyDiscountId?: string;
  usedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

// ════════════════════════════════════════════════════════════════════════
// Reads — return empty/null with a one-time deprecation log.
// Two live proxy callers depend on the array shape.
// ════════════════════════════════════════════════════════════════════════

export async function getRedemptionTiers(
  _shop: string,
  _options?: { includeInactive?: boolean }
): Promise<RedemptionTier[]> {
  warnDeprecatedRead("getRedemptionTiers");
  return [];
}

export async function getRedemptionTier(
  _shop: string,
  _tierId: string
): Promise<RedemptionTier | null> {
  warnDeprecatedRead("getRedemptionTier");
  return null;
}

export async function getActiveDiscountCodes(
  _shop: string,
  _customerId: string
): Promise<Redemption[]> {
  warnDeprecatedRead("getActiveDiscountCodes");
  return [];
}

export async function getRedemptionStats(_shop: string): Promise<{
  totalRedemptions: number;
  totalPointsRedeemed: number;
  totalDiscountValue: number;
  byTier: Record<string, { count: number; points: number }>;
  byStatus: Record<string, number>;
}> {
  warnDeprecatedRead("getRedemptionStats");
  return {
    totalRedemptions: 0,
    totalPointsRedeemed: 0,
    totalDiscountValue: 0,
    byTier: {},
    byStatus: {},
  };
}

// ════════════════════════════════════════════════════════════════════════
// Writes — disabled. These paths are unsafe (no wrapping transaction
// around point-spend + external Shopify call, lost-update on refunds)
// and no live caller should hit them. Any hit is a bug — fail loudly.
// ════════════════════════════════════════════════════════════════════════

export async function createRedemptionTier(
  _shop: string,
  _tier: Omit<RedemptionTier, "id">
): Promise<RedemptionTier> {
  deprecatedThrow("createRedemptionTier");
}

export async function updateRedemptionTier(
  _shop: string,
  _tierId: string,
  _updates: Partial<Omit<RedemptionTier, "id">>
): Promise<RedemptionTier | null> {
  deprecatedThrow("updateRedemptionTier");
}

export async function deleteRedemptionTier(
  _shop: string,
  _tierId: string
): Promise<boolean> {
  deprecatedThrow("deleteRedemptionTier");
}

export async function redeemPoints(
  _shop: string,
  _customerId: string,
  _tierId: string,
  _admin?: unknown
): Promise<RedemptionResult> {
  // SAFETY-CRITICAL: the original body spent points via the ledger and
  // then called Shopify to create a discount — with no wrapping
  // transaction. A Shopify failure between those two steps dropped the
  // customer's points on the floor. This throw is a hard guard against
  // any forgotten caller, scheduled job, or ops script.
  deprecatedThrow("redeemPoints");
}

export async function markRedemptionUsed(
  _shop: string,
  _customerId: string,
  _redemptionId: string
): Promise<boolean> {
  deprecatedThrow("markRedemptionUsed");
}

export async function markRedemptionUsedByCode(
  _shop: string,
  _discountCode: string
): Promise<boolean> {
  deprecatedThrow("markRedemptionUsedByCode");
}

export async function cancelRedemption(
  _shop: string,
  _customerId: string,
  _redemptionId: string
): Promise<boolean> {
  // cancelRedemption refunded points — same lost-update risk as
  // redeemPoints if the refund write races with a concurrent earn.
  deprecatedThrow("cancelRedemption");
}

export async function processExpiredRedemptions(_shop: string): Promise<number> {
  // Job-callable: iterates customer metadata, refunds expired redemptions.
  // With redemption disabled, running this can only replay unsafe refunds
  // against historical records.
  deprecatedThrow("processExpiredRedemptions");
}
