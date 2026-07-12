/**
 * Canonical freshness budgets for Cambridge TCG public endpoints.
 *
 * The platform's *intent* on how stale each kind of data is expected to
 * be. Lives in the data-spec package so partners can read the budgets
 * statically without depending on the runtime emission code.
 *
 * Mirror of the same table in `apps/storefront/src/lib/data-pantry/envelope.ts`.
 * If they drift, the (future) `pnpm audit:inclusion` check will flag it.
 */

/** Spec version. Bump on breaking changes; non-breaking additions don't. */
export const SPEC_VERSION = "1" as const;

/**
 * Safe default when a route has not made an affirmative payload-level rights
 * decision. Cambridge-authored routes may opt into CC0-1.0 explicitly; mixed
 * or upstream-derived data must never become CC0 merely by omission.
 */
export const DEFAULT_LICENSE = "NOASSERTION" as const;

/**
 * Per-kind freshness budgets in seconds. Names the platform's intent;
 * the actual `@as_of` rides on each record.
 */
export const FRESHNESS = {
  /** Card catalog (game / set / card metadata). 24h. */
  catalog: 86400,
  /** Current channel-aware price. 5min. */
  price_current: 300,
  /** Historical price snapshot — never stale (immutable record). */
  price_historical: Number.MAX_SAFE_INTEGER,
  /** Aggregate market signals (availability, spread, volume). 1min. */
  market_signal: 60,
  /** Platform status + freshness self-report. 30s. */
  status: 30,
  /** Methodology pages, doctrines — change rarely. 24h. */
  methodology: 86400,
  /** Platform self-identification — rarely changes. 1h. */
  identity: 3600,
  /** Adopter registry — small set, refreshes daily. */
  adopters: 86400,
  /** Live signals (heartbeat, event stream tick, sub-30s freshness). 5s. */
  live: 5,
  /** Rotating content that refreshes on a short cycle — comedy surfaces
   *  (dadjoke / joke / koan rotations), agent-says headers, fortune-cookie
   *  endpoints. 5min. */
  rotating: 300,
} as const;

export type FreshnessKey = keyof typeof FRESHNESS;
