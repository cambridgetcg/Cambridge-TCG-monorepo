import "server-only";
import { query } from "@/lib/db";
import { DATA_API_PLANS, DATA_API_PLAN_IDS, entitlementFor, type DataApiEntitlement, type DataApiPlanId } from "./plans";

/**
 * An account's data-API entitlement (docs/plans/tcg-data-platform/paid-data-api.md §4):
 * the strongest plan among its test-mode subscriptions that Stripe reports
 * active or trialing and whose paid period has not ended; otherwise free.
 * Status is mirrored from verified events only (migration 0142), so nothing
 * here grants a plan by itself.
 */

/** Predicate over data_api_subscriptions aliased `s`. A NULL period end entitles nothing. */
export const ENTITLING_SUBSCRIPTION = "s.environment = 'test' AND s.status IN ('active', 'trialing') AND s.current_period_end > NOW()";

/** Operators find an account holding more than one entitling subscription with this query; logs never name the account. */
export const DUPLICATE_ENTITLING_SUBSCRIPTIONS_SQL = `SELECT s.user_id, count(*) AS entitling FROM data_api_subscriptions s
  WHERE ${ENTITLING_SUBSCRIPTION} GROUP BY s.user_id HAVING count(*) > 1`;

/** The plan catalogue's ranks and request limits, as the bearer statement reads them: one source of truth, plans.ts. */
export function planLimitsParam(): string {
  return JSON.stringify(DATA_API_PLAN_IDS.map((id, rank) => ({
    plan_id: id, rank, per_minute: DATA_API_PLANS[id].requestsPerMinutePerKey, per_month: DATA_API_PLANS[id].requestsPerMonthPerAccount,
  })));
}

export interface PlanHolding { planId: string; count: number }
export interface HeldEntitlement { entitlement: DataApiEntitlement; entitlingSubscriptions: number }

/** Strongest held plan, or free. More than one entitling subscription is a
 * billing anomaly to repair, not a reason to refuse the account: it is
 * logged (without the account) and the strongest plan is served. An unknown
 * plan id throws, as entitlementFor does, rather than quietly changing plan. */
export function entitlementFromHoldings(holdings: readonly PlanHolding[]): HeldEntitlement {
  let strongest: DataApiPlanId | null = null;
  let entitlingSubscriptions = 0;
  for (const holding of holdings) {
    if (!Number.isSafeInteger(holding.count) || holding.count < 1) throw new TypeError("Invalid data-API subscription count.");
    const rank = (DATA_API_PLAN_IDS as readonly string[]).indexOf(holding.planId);
    if (rank < 0) throw new TypeError(`Unknown data-API plan: ${String(holding.planId)}`);
    entitlingSubscriptions += holding.count;
    if (strongest === null || rank > DATA_API_PLAN_IDS.indexOf(strongest)) strongest = holding.planId as DataApiPlanId;
  }
  if (entitlingSubscriptions > 1) {
    console.warn(`[data-api] an account holds ${entitlingSubscriptions} entitling subscriptions; serving the strongest plan. Find it with DUPLICATE_ENTITLING_SUBSCRIPTIONS_SQL in lib/data-api/entitlements.ts.`);
  }
  return { entitlement: entitlementFor(strongest), entitlingSubscriptions };
}

export type AccountEntitlement =
  | ({ status: "ok" } & HeldEntitlement)
  /** 0142 is not applied: no subscription can exist, so the account is free. */
  | ({ status: "not-provisioned" } & HeldEntitlement);

type Run = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
const HOLDINGS_SQL = `SELECT s.plan_id AS "planId", count(*)::int AS count FROM data_api_subscriptions s
  WHERE s.user_id = $1 AND ${ENTITLING_SUBSCRIPTION} GROUP BY s.plan_id`;

export function isUndefinedTable(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "42P01");
}

/** Outside a transaction. Any failure other than a missing table propagates:
 * an unreadable entitlement is not silently free. */
export async function readAccountEntitlement(userId: string, run: Run = query): Promise<AccountEntitlement> {
  try {
    const result = await run(HOLDINGS_SQL, [userId]);
    return { status: "ok", ...entitlementFromHoldings(result.rows as unknown as PlanHolding[]) };
  } catch (error) {
    if (isUndefinedTable(error)) return { status: "not-provisioned", entitlement: entitlementFor(null), entitlingSubscriptions: 0 };
    throw error;
  }
}

/** Inside a caller's transaction: a missing table would abort it, so the read
 * runs under a savepoint and only an undefined table rolls back to free. */
export async function readAccountEntitlementInTransaction(tx: Run, userId: string): Promise<AccountEntitlement> {
  await tx("SAVEPOINT data_api_entitlement");
  try {
    const result = await tx(HOLDINGS_SQL, [userId]);
    await tx("RELEASE SAVEPOINT data_api_entitlement");
    return { status: "ok", ...entitlementFromHoldings(result.rows as unknown as PlanHolding[]) };
  } catch (error) {
    if (!isUndefinedTable(error)) throw error;
    await tx("ROLLBACK TO SAVEPOINT data_api_entitlement");
    return { status: "not-provisioned", entitlement: entitlementFor(null), entitlingSubscriptions: 0 };
  }
}
