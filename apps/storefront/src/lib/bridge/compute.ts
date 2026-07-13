/**
 * Bridge computation — pure functions over resolved beings, returning
 * typed metrics. The numerical doctrine of the platform: every value
 * carries a formula reference so /methodology/bridges can be cited from
 * any field. See docs/connections/the-universal-language.md.
 */

import type {
  BeingSpec,
  BridgeMetrics,
  BridgeResult,
  BridgeWeights,
  ResolvedBeing,
} from "./types";
import { BridgeError, DEFAULT_WEIGHTS } from "./types";

// ── Resolution ─────────────────────────────────────────────────────

/**
 * Person/collective affinity resolution is paused.
 *
 * A public profile or collective is permission to display its chosen fields;
 * it is not permission to scan portfolios, wishlists, or private members into
 * a relationship score. Keep this seam closed until explicit field-level
 * bridge inputs and withdrawal receipts exist.
 */
export async function resolveBeing(spec: BeingSpec): Promise<ResolvedBeing> {
  void spec;
  throw new BridgeError(
    "paused",
    "Affinity scoring is paused until each input has explicit field-level publication consent. Public profiles, wishlists, portfolios, and collective membership are not bridge inputs.",
  );
}

// ── Pure math ───────────────────────────────────────────────────────

/** Jaccard index |A∩B|/|A∪B|. Returns NULL when both sets empty (denominator zero). */
export function jaccard<T>(a: Set<T>, b: Set<T>): number | null {
  if (a.size === 0 && b.size === 0) return null;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? null : inter / union;
}

/** Size of A ∩ B. */
export function intersectSize<T>(a: Set<T>, b: Set<T>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

/** Cadence ratio: min(a, b) / max(a, b). 1 = identical, near-0 = wildly different. */
export function cadenceRatio(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return Math.min(a, b) / Math.max(a, b);
}

/** Free-form region match: substring-insensitive overlap. Substrate-honest:
 *  region is free-form text; "Tokyo, JP" vs "Tokyo" should count as same;
 *  "Tokyo, JP" vs "Bristol, UK" as different. Both NULL → unknown. */
export function regionMatch(
  a: string | null,
  b: string | null,
): "same" | "different" | "unknown" {
  if (!a || !b) return "unknown";
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return "same";
  // Substring overlap (either contains the other) signals same region at
  // a coarse granularity — "Tokyo" vs "Tokyo, JP" → same.
  if (na.includes(nb) || nb.includes(na)) return "same";
  return "different";
}

// ── Bridge construction ─────────────────────────────────────────────

const F = (anchor: string) => `/methodology/bridges#${anchor}`;

export function computeBridge(
  a: ResolvedBeing,
  b: ResolvedBeing,
  weights: BridgeWeights = DEFAULT_WEIGHTS,
): BridgeResult {
  // ── Card overlap
  const portfolio_jaccard = jaccard(a.portfolio_skus, b.portfolio_skus);
  const portfolio_shared_count = intersectSize(a.portfolio_skus, b.portfolio_skus);
  const wishlist_jaccard = jaccard(a.wishlist_skus, b.wishlist_skus);
  const a_wants_from_b = intersectSize(a.wishlist_skus, b.portfolio_skus);
  const b_wants_from_a = intersectSize(b.wishlist_skus, a.portfolio_skus);
  const trade_potential = a_wants_from_b + b_wants_from_a;

  // ── Language overlap
  const aLangs = new Set(a.languages ?? []);
  const bLangs = new Set(b.languages ?? []);
  const language_jaccard =
    a.languages == null || b.languages == null ? null : jaccard(aLangs, bLangs);
  const shared_languages: string[] = [];
  for (const l of aLangs) if (bLangs.has(l)) shared_languages.push(l);
  shared_languages.sort();

  // ── Region
  const region = regionMatch(a.region, b.region);

  // ── Cadence
  const cadence_ratio =
    a.response_window_hours != null && b.response_window_hours != null
      ? cadenceRatio(a.response_window_hours, b.response_window_hours)
      : null;

  // ── Composite score: weighted sum over the metrics that produced a number.
  // Substrate-honest: weights only count for metrics that were computable;
  // the score reports null if no metric carried signal.
  let weightedSum = 0;
  let totalWeight = 0;
  if (portfolio_jaccard != null) {
    weightedSum += portfolio_jaccard * weights.portfolio_jaccard;
    totalWeight += weights.portfolio_jaccard;
  }
  if (wishlist_jaccard != null) {
    weightedSum += wishlist_jaccard * weights.wishlist_jaccard;
    totalWeight += weights.wishlist_jaccard;
  }
  if (language_jaccard != null) {
    weightedSum += language_jaccard * weights.language_jaccard;
    totalWeight += weights.language_jaccard;
  }
  if (region !== "unknown") {
    weightedSum += (region === "same" ? 1 : 0) * weights.region_same;
    totalWeight += weights.region_same;
  }
  if (cadence_ratio != null) {
    weightedSum += cadence_ratio * weights.cadence_ratio;
    totalWeight += weights.cadence_ratio;
  }
  const bridge_score = totalWeight === 0 ? null : weightedSum / totalWeight;

  const metrics: BridgeMetrics = {
    portfolio_jaccard: { value: portfolio_jaccard, formula: F("portfolio-jaccard") },
    portfolio_shared_count: {
      value: portfolio_shared_count,
      formula: F("portfolio-shared-count"),
    },
    wishlist_jaccard: { value: wishlist_jaccard, formula: F("wishlist-jaccard") },
    a_wants_from_b: { value: a_wants_from_b, formula: F("a-wants-from-b") },
    b_wants_from_a: { value: b_wants_from_a, formula: F("b-wants-from-a") },
    trade_potential: { value: trade_potential, formula: F("trade-potential") },
    language_jaccard: { value: language_jaccard, formula: F("language-jaccard") },
    shared_languages: { value: shared_languages, formula: F("shared-languages") },
    region_match: { value: region, formula: F("region-match") },
    cadence_ratio: { value: cadence_ratio, formula: F("cadence-ratio") },
    bridge_score: { value: bridge_score, formula: F("bridge-score") },
  };

  return {
    a: { kind: a.kind, label: a.label, display_name: a.display_name },
    b: { kind: b.kind, label: b.label, display_name: b.display_name },
    metrics,
    provenance: {
      computed_at: new Date().toISOString(),
      substrate: "live",
      weights,
    },
  };
}

/** End-to-end: resolve both beings, compute the bridge. */
export async function buildBridge(
  aSpec: BeingSpec,
  bSpec: BeingSpec,
): Promise<BridgeResult> {
  if (aSpec === bSpec) {
    throw new BridgeError(
      "same_being",
      "A bridge requires two distinct beings.",
    );
  }
  const [a, b] = await Promise.all([resolveBeing(aSpec), resolveBeing(bSpec)]);
  return computeBridge(a, b);
}
