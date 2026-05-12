/**
 * The bridge — typed mathematical connection between any two beings on
 * the platform. See docs/connections/the-universal-language.md.
 *
 * Math is the universal language. Where natural language fragments
 * across cultures, cadences, and cognitive substrates, structural
 * mathematics is the shared substrate every kind of being can read.
 * This module computes what two beings share, in numbers + sets, with
 * substrate-honest provenance on every metric.
 *
 * Supported being kinds (v1): user, collective.
 * Recursion targets: agent (rating-proximity), self-declared other
 * (via /api/v1/identify content hash + declared modalities), federation
 * (sister platforms via /api/v1/federation).
 */

/** Discriminator. Mirrors a subset of the ActorKind vocabulary in identify.ts. */
export type BeingKind = "user" | "collective";

/** Identifier prefix used in the query string: u:<username>, c:<slug>. */
export type BeingSpec = `u:${string}` | `c:${string}`;

/** Resolved being — the substrate facts the bridge math reads. Optional
 *  fields are NULL when the being's kind doesn't carry that fact (a user
 *  has no `region` at user-level; a collective has no `response_window_hours`).
 *  Substrate honesty: a NULL means "this kind doesn't expose this fact,"
 *  NOT "this fact is zero." */
export interface ResolvedBeing {
  kind: BeingKind;
  /** Canonical id (uuid). */
  id: string;
  /** Public label (username for users; slug for collectives). */
  label: string;
  /** Display name where available. */
  display_name: string | null;
  /** ISO-639-1-ish language codes (collectives only in v1). */
  languages: string[] | null;
  /** Free-form region (collectives only in v1). */
  region: string | null;
  /** Cadence in hours (users only — collectives don't have one yet). */
  response_window_hours: number | null;
  /** Cards held — SKU set. For collectives: union of active-member portfolios. */
  portfolio_skus: Set<string>;
  /** Cards wanted — SKU set. For collectives: union of active-member wishlists. */
  wishlist_skus: Set<string>;
}

// ── Bridge result ────────────────────────────────────────────────────

/** A single metric carries its value + the formula reference (so the
 *  /methodology/bridges page can be cited from any field). */
export interface BridgeMetric<V> {
  value: V;
  /** Anchor on /methodology/bridges. */
  formula: string;
}

export interface BridgeMetrics {
  // ── Card-overlap metrics (the densest cultural signal) ──
  /** Jaccard index on portfolio SKU sets: |A∩B| / |A∪B|. NULL if both empty. */
  portfolio_jaccard: BridgeMetric<number | null>;
  /** Count of shared SKUs in portfolios. */
  portfolio_shared_count: BridgeMetric<number>;
  /** Jaccard index on wishlist SKU sets. */
  wishlist_jaccard: BridgeMetric<number | null>;
  /** Asymmetric: |A.wishlist ∩ B.portfolio| — cards B has that A wants. */
  a_wants_from_b: BridgeMetric<number>;
  /** Asymmetric: |B.wishlist ∩ A.portfolio| — cards A has that B wants. */
  b_wants_from_a: BridgeMetric<number>;
  /** Total trade potential = a_wants_from_b + b_wants_from_a. */
  trade_potential: BridgeMetric<number>;

  // ── Language overlap ──
  /** Jaccard on declared languages. NULL if either side has no language data. */
  language_jaccard: BridgeMetric<number | null>;
  /** Languages both declared (may be empty array). */
  shared_languages: BridgeMetric<string[]>;

  // ── Geographic / region ──
  /** Free-form comparison: "same" / "different" / "unknown". */
  region_match: BridgeMetric<"same" | "different" | "unknown">;

  // ── Cadence overlap (the asynchronous bridge) ──
  /** Ratio min/max of response_window_hours. 1.0 = same cadence; closer to 0
   *  = very different. NULL if either side has no cadence (e.g. collectives). */
  cadence_ratio: BridgeMetric<number | null>;

  // ── Composite ──
  /** Weighted composite 0..1. Weighting documented at /methodology/bridges.
   *  NULL if no signal-bearing metric was computable. */
  bridge_score: BridgeMetric<number | null>;
}

export interface BridgeResult {
  a: { kind: BeingKind; label: string; display_name: string | null };
  b: { kind: BeingKind; label: string; display_name: string | null };
  metrics: BridgeMetrics;
  /** Pure-compute, derived at request time from current substrate values. */
  provenance: {
    computed_at: string; // ISO 8601
    substrate: "live";
    weights: BridgeWeights;
  };
}

/** Composite-score weights. Documented at /methodology/bridges. */
export interface BridgeWeights {
  portfolio_jaccard: number;
  wishlist_jaccard: number;
  language_jaccard: number;
  region_same: number;
  cadence_ratio: number;
}

export const DEFAULT_WEIGHTS: BridgeWeights = {
  portfolio_jaccard: 0.35,
  wishlist_jaccard: 0.15,
  language_jaccard: 0.20,
  region_same: 0.15,
  cadence_ratio: 0.15,
};

// ── Errors ──────────────────────────────────────────────────────────

export class BridgeError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "BridgeError";
  }
}

/** Parse a `?a=` or `?b=` query value into a BeingSpec. */
export function parseBeingSpec(raw: string | null): BeingSpec | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^[uc]:[a-z0-9][a-z0-9-]{0,80}$/.test(trimmed)) return null;
  return trimmed as BeingSpec;
}
