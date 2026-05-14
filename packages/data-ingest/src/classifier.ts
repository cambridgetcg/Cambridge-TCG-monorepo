/**
 * @module @cambridge-tcg/data-ingest/classifier
 *
 * Layered classification — the *priority decision* for any
 * card-attribute claim (edition_variant, promo_origin).
 *
 * Four sources, ordered:
 *
 *   publisher (3) > operator (2) > heuristic (1) > default (0)
 *
 * When a new claim arrives at the per-app writer:
 *   - Higher or equal priority than the current winner → claim becomes
 *     winner; the previous winner is still recorded in the witness log.
 *   - Lower priority than the current winner → claim is recorded with
 *     `shadowed: true`. Substrate-honestly kept: a heuristic disagreeing
 *     with a publisher feed is signal that the heuristic is broken, and
 *     the audit `pnpm audit:classifier-disagreement` surfaces it.
 *
 * Equal-priority claims promote (most-recent same-tier wins). This
 * lets a publisher re-publish corrections, or an operator update their
 * own override, without revoking-then-replacing.
 *
 * This module ships the **pure decision logic** (`decideClaim`) + types.
 * The actual SQL writer lives per-app (e.g.,
 * apps/wholesale/src/lib/cards/classify.ts) because each app owns its
 * own DB connection.
 *
 * Companions:
 *   - apps/wholesale/drizzle/drafts/0018_card_financial_attributes.sql.draft
 *   - docs/methodology/edition-variants (the priority rule explainer)
 *   - pnpm audit:classifier-disagreement (the drift detector)
 */

export type ClassificationSource =
  | "default"
  | "heuristic"
  | "operator"
  | "publisher";

export const CLASSIFICATION_PRIORITY: Record<ClassificationSource, number> = {
  default: 0,
  heuristic: 1,
  operator: 2,
  publisher: 3,
};

/**
 * Strict-ordering helper — returns the array of sources from highest
 * priority to lowest. Useful when iterating shadowed claims to find
 * the next promotable claim after a revoke.
 */
export const CLASSIFICATION_SOURCE_PRIORITY_ORDER: ClassificationSource[] = [
  "publisher",
  "operator",
  "heuristic",
  "default",
];

export type ClassifiableAttribute = "edition_variant" | "promo_origin";

/**
 * The vocabulary of edition_variant values the platform recognises.
 * Operator overrides may write any of these; heuristics may emit a
 * subset depending on what the upstream URL pattern can distinguish.
 *
 * Substrate-honest: this list is the closed set; values outside it are
 * rejected at the writer. Adding a new value requires editing this
 * file + (probably) a heuristic update.
 */
export const EDITION_VARIANT_VALUES = [
  "regular",
  "parallel",
  "alt-art",
  "manga-style",
  "box-topper",
  "serial-numbered",
] as const;

export type EditionVariant = (typeof EDITION_VARIANT_VALUES)[number];

/**
 * The vocabulary of promo_origin values. Strictly separate from
 * edition_variant: a card can be both alt-art *and* a pre-release
 * promo — they describe different facets (visual treatment vs.
 * distribution channel).
 */
export const PROMO_ORIGIN_VALUES = [
  "pre-release",
  "event-prize",
  "tournament-prize",
  "preconstructed-deck",
  "magazine-insert",
  "promotional-pack",
  "special-product",
] as const;

export type PromoOrigin = (typeof PROMO_ORIGIN_VALUES)[number];

export type ClassificationEvidence = {
  /** A canonical source identifier (e.g. "cardrush-subdomain:pre-release-promo"). */
  marker?: string;
  /** The URL the heuristic read from. */
  url?: string;
  /** Specific subdomain / route segment that produced the classification. */
  subdomain?: string;
  /** Regex / rule name that matched. */
  rule?: string;
  /** Free-form notes. */
  notes?: string;
  /**
   * Confidence band — heuristics only. Operator and publisher claims
   * are implicitly high-confidence; persisting `confidence` on them is
   * not required.
   */
  confidence?: "low" | "high";
};

export type Claim = {
  attribute: ClassifiableAttribute;
  value: string;
  source: ClassificationSource;
  evidence: ClassificationEvidence;
  /**
   * Free-form actor identifier — e.g. "cardrush-ingest",
   * "operator:user@example.com", "bandai-feed". Goes to the witness
   * log's `claimed_by` column. The audit groups disagreement counts by
   * this so we can see "the cardrush-ingest heuristic disagrees with
   * bandai-feed on N cards."
   */
  claimedBy: string;
};

export type CurrentWinner = {
  value: string | null;
  source: ClassificationSource;
};

export type ClaimDecision = {
  /** Should the writer promote this claim to the cards table? */
  promote: boolean;
  /** Should the log row record shadowed=true? */
  shadowed: boolean;
};

/**
 * Pure decision: given the current winner and a new claim, decide
 * whether to promote (update the denormalized winner column on cards)
 * and whether to mark the new claim as shadowed (lower priority — kept
 * for audit).
 *
 * Equal priority means the new claim wins (most-recent same-tier
 * overrides). This lets the publisher re-publish corrections and lets
 * an operator update their own override without an explicit revoke step.
 */
export function decideClaim(
  current: CurrentWinner,
  next: Claim,
): ClaimDecision {
  const nextPri = CLASSIFICATION_PRIORITY[next.source];
  const currPri = CLASSIFICATION_PRIORITY[current.source];
  const promote = nextPri >= currPri;
  return {
    promote,
    shadowed: !promote,
  };
}

/**
 * Validate a claim's value against the attribute's vocabulary. Returns
 * null if valid; an error string describing the violation if not.
 * Writers should call this before issuing the SQL.
 */
export function validateClaim(claim: Claim): string | null {
  if (claim.attribute === "edition_variant") {
    if (!(EDITION_VARIANT_VALUES as readonly string[]).includes(claim.value)) {
      return `edition_variant value "${claim.value}" not in vocabulary; allowed: ${EDITION_VARIANT_VALUES.join(", ")}`;
    }
  } else if (claim.attribute === "promo_origin") {
    if (!(PROMO_ORIGIN_VALUES as readonly string[]).includes(claim.value)) {
      return `promo_origin value "${claim.value}" not in vocabulary; allowed: ${PROMO_ORIGIN_VALUES.join(", ")}`;
    }
  }
  if (claim.source === "heuristic" && !claim.evidence.confidence) {
    return "heuristic claims must declare evidence.confidence ('low' | 'high')";
  }
  return null;
}
