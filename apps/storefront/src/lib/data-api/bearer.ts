import "server-only";
import { query } from "@/lib/db";
import { hashMemberKey, memberKeyFromHeader, VALID_MEMBER_KEY_SQL } from "@/lib/datafeed/member-keys";
import { ENTITLING_SUBSCRIPTION, entitlementFromHoldings, isUndefinedTable, planLimitsParam, type PlanHolding } from "./entitlements";
import type { DataApiEntitlement } from "./plans";

/**
 * Data-API authentication and metering (docs/plans/tcg-data-platform/paid-data-api.md §4).
 *
 * The same ctcg_member_ keys and validity rule as the free member feed
 * (lib/datafeed/member-keys.ts): Authorization: Bearer only, no session
 * fallback, no URL token. Minute counts live in data_api_rate_buckets and
 * never in member_data_rate_buckets, which the free route saturates at 31.
 * An accepted request adds one to the account's month in
 * data_api_usage_months. Nothing else is recorded: no path, query, IP
 * address or read history.
 */

export interface DataApiMinute { limit: number; remaining: number; resetSeconds: number }
/** start is the UTC calendar month the count belongs to (YYYY-MM-01). */
export interface DataApiMonth { start: string; limit: number; remaining: number; used: number; resetSeconds: number }

export type DataApiBearerResult =
  | { ok: true; actor: { userId: string }; entitlement: DataApiEntitlement; minute: DataApiMinute; month: DataApiMonth }
  | { ok: false; status: 401 }
  /** The minute's or month's limit is reached; this request was not served or counted toward the month. */
  | { ok: false; status: 429; window: "minute" | "month"; limit: number; resetSeconds: number; entitlement: DataApiEntitlement; minute: DataApiMinute; month: DataApiMonth }
  /** NOT_PROVISIONED: a valid key, but migration 0142's tables do not exist. UNAVAILABLE: storage failed. */
  | { ok: false; status: 503; code: "NOT_PROVISIONED" | "UNAVAILABLE" };

// One statement: the key's validity, its account's strongest entitling plan,
// the minute bucket and the month count are read and written together, so
// concurrent requests cannot overrun either limit. Minute counts saturate
// one above the applied plan's limit (0142 bounds them at 100,001). The month
// count only grows while below the limit, re-checked on the locked row.
const BEARER_SQL = `WITH valid_key AS (
       ${VALID_MEMBER_KEY_SQL}
     ), plans AS (
       SELECT * FROM jsonb_to_recordset($2::jsonb) AS p(plan_id text, rank integer, per_minute integer, per_month integer)
     ), holdings AS (
       SELECT s.plan_id, count(*)::int AS n FROM data_api_subscriptions s JOIN valid_key v ON v.user_id = s.user_id
       WHERE ${ENTITLING_SUBSCRIPTION} GROUP BY s.plan_id
     ), applied AS (
       SELECT p.* FROM plans p WHERE p.plan_id = COALESCE(
         (SELECT h.plan_id FROM holdings h JOIN plans hp ON hp.plan_id = h.plan_id ORDER BY hp.rank DESC LIMIT 1), 'free')
     ), pruned AS (
       DELETE FROM data_api_rate_buckets WHERE (key_id, bucket_minute) IN (
         SELECT key_id, bucket_minute FROM data_api_rate_buckets
         WHERE bucket_minute < NOW() - interval '1 day'
           AND EXISTS (SELECT 1 FROM valid_key)
         ORDER BY bucket_minute LIMIT 100
       )
     ), consumed AS (
       INSERT INTO data_api_rate_buckets (key_id, bucket_minute, request_count)
       SELECT id, date_trunc('minute', NOW()), 1 FROM valid_key
       ON CONFLICT (key_id, bucket_minute) DO UPDATE
         SET request_count = LEAST(data_api_rate_buckets.request_count + 1, (SELECT per_minute FROM applied) + 1)
       RETURNING key_id, request_count
     ), this_month AS (
       SELECT (date_trunc('month', NOW() AT TIME ZONE 'UTC'))::date AS start
     ), counted AS (
       INSERT INTO data_api_usage_months (user_id, month, request_count)
       SELECT v.user_id, m.start, 1 FROM consumed c JOIN valid_key v ON v.id = c.key_id
       CROSS JOIN this_month m CROSS JOIN applied a
       WHERE c.request_count <= a.per_minute
       ON CONFLICT (user_id, month) DO UPDATE
         SET request_count = data_api_usage_months.request_count + 1
         WHERE data_api_usage_months.request_count < (SELECT per_month FROM applied)
       RETURNING request_count
     )
     SELECT v.user_id, a.plan_id, a.per_minute, a.per_month, c.request_count AS minute_count,
       (SELECT to_char(start, 'YYYY-MM-DD') FROM this_month) AS month_start,
       (SELECT request_count FROM counted) AS month_count,
       COALESCE((SELECT u.request_count FROM data_api_usage_months u CROSS JOIN this_month m
         WHERE u.user_id = v.user_id AND u.month = m.start), 0) AS month_before,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('planId', h.plan_id, 'count', h.n)) FROM holdings h), '[]'::jsonb) AS holdings,
       GREATEST(1, CEIL(EXTRACT(EPOCH FROM (date_trunc('minute', NOW()) + interval '1 minute' - NOW()))))::int AS minute_reset,
       GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((((SELECT start FROM this_month) + interval '1 month') AT TIME ZONE 'UTC') - NOW()))))::int AS month_reset
     FROM consumed c JOIN valid_key v ON v.id = c.key_id CROSS JOIN applied a`;

/** Authenticates, applies the account's plan and meters one request. */
export async function resolveDataApiBearer(header: string | null): Promise<DataApiBearerResult> {
  const token = memberKeyFromHeader(header);
  if (!token) return { ok: false, status: 401 };
  const hash = hashMemberKey(token);
  try {
    const result = await query(BEARER_SQL, [hash, planLimitsParam()]);
    const row = result.rows[0];
    if (!row) return { ok: false, status: 401 };
    const { entitlement } = entitlementFromHoldings(row.holdings as PlanHolding[]);
    // The statement and plans.ts must agree on the plan they applied.
    if (entitlement.planId !== row.plan_id || entitlement.requestsPerMinutePerKey !== Number(row.per_minute)
      || entitlement.requestsPerMonthPerAccount !== Number(row.per_month)) throw new TypeError("data-api-plan-mismatch");
    const minuteCount = Number(row.minute_count);
    const withinMinute = minuteCount <= entitlement.requestsPerMinutePerKey;
    const monthCount = row.month_count === null ? null : Number(row.month_count);
    // An accepted request returns the exact new count. A month refusal saw the
    // locked row at or above the limit, though this statement's snapshot may
    // predate concurrent increments; otherwise the snapshot count is reported.
    const used = monthCount ?? (withinMinute
      ? Math.max(Number(row.month_before), entitlement.requestsPerMonthPerAccount)
      : Number(row.month_before));
    const minute: DataApiMinute = {
      limit: entitlement.requestsPerMinutePerKey,
      remaining: Math.max(0, entitlement.requestsPerMinutePerKey - minuteCount),
      resetSeconds: Number(row.minute_reset),
    };
    const month: DataApiMonth = {
      start: String(row.month_start), limit: entitlement.requestsPerMonthPerAccount,
      remaining: Math.max(0, entitlement.requestsPerMonthPerAccount - used),
      used, resetSeconds: Number(row.month_reset),
    };
    if (!withinMinute) {
      return { ok: false, status: 429, window: "minute", limit: minute.limit, resetSeconds: minute.resetSeconds, entitlement, minute, month };
    }
    if (monthCount === null) {
      return { ok: false, status: 429, window: "month", limit: month.limit, resetSeconds: month.resetSeconds, entitlement, minute, month };
    }
    return { ok: true, actor: { userId: String(row.user_id) }, entitlement, minute, month };
  } catch (error) {
    if (isUndefinedTable(error)) return notProvisioned(hash);
    // Do not leak SQL, connection strings or infrastructure details.
    console.error("[data-api] bearer unavailable", error instanceof Error ? error.name : "unknown");
    return { ok: false, status: 503, code: "UNAVAILABLE" };
  }
}

/** Without 0142 nothing can be metered, so nothing is served; an invalid key
 * still answers 401 rather than learning that the API is unprovisioned. */
async function notProvisioned(hash: string): Promise<DataApiBearerResult> {
  try {
    const key = await query(VALID_MEMBER_KEY_SQL, [hash]);
    if (!key.rows.length) return { ok: false, status: 401 };
    return { ok: false, status: 503, code: "NOT_PROVISIONED" };
  } catch (error) {
    // Without 0138 no member key exists, so none is valid.
    if (isUndefinedTable(error)) return { ok: false, status: 401 };
    console.error("[data-api] bearer unavailable", error instanceof Error ? error.name : "unknown");
    return { ok: false, status: 503, code: "UNAVAILABLE" };
  }
}
