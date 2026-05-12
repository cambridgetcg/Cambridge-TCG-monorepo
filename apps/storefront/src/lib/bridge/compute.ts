/**
 * Bridge computation — pure functions over resolved beings, returning
 * typed metrics. The numerical doctrine of the platform: every value
 * carries a formula reference so /methodology/bridges can be cited from
 * any field. See docs/connections/the-universal-language.md.
 */

import { query } from "@/lib/db";
import type {
  BeingSpec,
  BridgeMetrics,
  BridgeResult,
  BridgeWeights,
  ResolvedBeing,
} from "./types";
import { BridgeError, DEFAULT_WEIGHTS } from "./types";

// ── Resolution ─────────────────────────────────────────────────────

/** Resolve a being-spec to its substrate facts. Throws if not found or
 *  if the being is non-public (substrate-honest: the bridge does not
 *  reveal facts about beings who haven't declared themselves public). */
export async function resolveBeing(spec: BeingSpec): Promise<ResolvedBeing> {
  if (spec.startsWith("u:")) {
    return resolveUser(spec.slice(2));
  }
  if (spec.startsWith("c:")) {
    return resolveCollective(spec.slice(2));
  }
  throw new BridgeError("invalid_spec", "Unknown being-spec prefix.");
}

async function resolveUser(username: string): Promise<ResolvedBeing> {
  const u = (await query(
    `SELECT id, username, name, is_public, response_window_hours
       FROM users WHERE username = $1`,
    [username],
  )) as {
    rows: {
      id: string;
      username: string;
      name: string | null;
      is_public: boolean;
      response_window_hours: number | null;
    }[];
  };
  if (u.rows.length === 0) {
    throw new BridgeError("not_found", `User ${username} not found.`);
  }
  const row = u.rows[0]!;
  if (!row.is_public) {
    throw new BridgeError(
      "not_public",
      "This user has not made their profile public. Bridge math is opt-in.",
    );
  }
  const [portfolio, wishlist] = await Promise.all([
    query(
      `SELECT DISTINCT sku FROM portfolio_cards
        WHERE user_id = $1 AND sku IS NOT NULL`,
      [row.id],
    ) as Promise<{ rows: { sku: string }[] }>,
    query(
      `SELECT DISTINCT sku FROM wishlist_cards
        WHERE user_id = $1 AND sku IS NOT NULL`,
      [row.id],
    ) as Promise<{ rows: { sku: string }[] }>,
  ]);
  return {
    kind: "user",
    id: row.id,
    label: row.username,
    display_name: row.name,
    languages: null,
    region: null,
    response_window_hours: row.response_window_hours,
    portfolio_skus: new Set(portfolio.rows.map((r) => r.sku)),
    wishlist_skus: new Set(wishlist.rows.map((r) => r.sku)),
  };
}

async function resolveCollective(slug: string): Promise<ResolvedBeing> {
  const c = (await query(
    `SELECT id, slug, display_name, languages, region, is_public
       FROM collectives WHERE slug = $1`,
    [slug],
  )) as {
    rows: {
      id: string;
      slug: string;
      display_name: string;
      languages: string[] | null;
      region: string | null;
      is_public: boolean;
    }[];
  };
  if (c.rows.length === 0) {
    throw new BridgeError("not_found", `Collective ${slug} not found.`);
  }
  const row = c.rows[0]!;
  if (!row.is_public) {
    throw new BridgeError(
      "not_public",
      "This collective is private. Bridge math is opt-in.",
    );
  }
  // Aggregate portfolios + wishlists from active members.
  const [portfolio, wishlist] = await Promise.all([
    query(
      `SELECT DISTINCT pc.sku FROM portfolio_cards pc
         JOIN collective_members cm ON cm.user_id = pc.user_id
        WHERE cm.collective_id = $1
          AND cm.consent_at IS NOT NULL
          AND cm.left_at IS NULL
          AND pc.sku IS NOT NULL`,
      [row.id],
    ) as Promise<{ rows: { sku: string }[] }>,
    query(
      `SELECT DISTINCT wc.sku FROM wishlist_cards wc
         JOIN collective_members cm ON cm.user_id = wc.user_id
        WHERE cm.collective_id = $1
          AND cm.consent_at IS NOT NULL
          AND cm.left_at IS NULL
          AND wc.sku IS NOT NULL`,
      [row.id],
    ) as Promise<{ rows: { sku: string }[] }>,
  ]);
  return {
    kind: "collective",
    id: row.id,
    label: row.slug,
    display_name: row.display_name,
    languages: row.languages ?? [],
    region: row.region,
    response_window_hours: null,
    portfolio_skus: new Set(portfolio.rows.map((r) => r.sku)),
    wishlist_skus: new Set(wishlist.rows.map((r) => r.sku)),
  };
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
