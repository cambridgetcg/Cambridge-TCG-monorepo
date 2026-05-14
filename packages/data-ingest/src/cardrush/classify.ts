/**
 * @module @cambridge-tcg/data-ingest/cardrush/classify
 *
 * CardRush → classification claims (kingdom-089).
 *
 * Pure function: given a CardRush product signal (URL + name + rarity +
 * inferred game + card number), emit zero or more classification claims
 * suitable for the layered classifier in `../classifier.ts`.
 *
 * Substrate-honest: only emits claims for rules whose markers are
 * unambiguous in CardRush's existing product-page conventions (verified
 * against `apps/wholesale/tools/lib/cardrush-parser.ts`). Ambiguous
 * signals get `confidence: 'low'` so the audit can surface them for
 * operator review.
 *
 * ── Current rules (intentionally conservative) ──────────────────────
 *
 *   R1. Explicit parallel marker in product name
 *       (`パラレル` / `/P` suffix) → edition_variant: 'parallel',
 *       confidence: 'high'.
 *
 *   R2. OPTCG rarity 'P' (Promo) → promo_origin: 'promotional-pack',
 *       confidence: 'low'.
 *
 *   R3. OPTCG set-code prefix 'PRB-' (promotion / pre-release bundles)
 *       → promo_origin: 'pre-release', confidence: 'low'.
 *
 * Each rule emits a separate claim. The classifier in `../classifier.ts`
 * decides whether each claim promotes or is shadowed by an existing
 * higher-priority winner (operator override or publisher feed).
 *
 * Future rules (named, not yet shipped):
 *   - Alt-art keyword detection (アルト / オルタネート)
 *   - Manga-style detection (漫画 / マンガ)
 *   - Per-subdomain path-pattern detection
 *
 * Adding a rule:
 *   1. Append a `Rule` entry to the RULES array below.
 *   2. Add a unit test in `__tests__/cardrush-classify.test.ts`.
 *   3. Document the marker in the methodology page.
 */

import type { GameCode } from "@cambridge-tcg/sku";
import type {
  Claim,
  ClassifiableAttribute,
  ClassificationEvidence,
} from "../classifier";

/**
 * Signal shape this classifier consumes — the fields CardRush ingest
 * actually produces. Lean: just what the rules read.
 */
export interface CardRushClassificationSignal {
  /** Product page URL (kept on every claim for traceability). */
  url: string;
  /** Product display name in Japanese — the source of parser markers. */
  name: string | null;
  /** Parsed rarity (from 【】 brackets in the product name). */
  rarity: string | null;
  /** Inferred game from the subdomain. */
  game: GameCode | null;
  /** Card number (from `{SET-NUMBER}` token, or null if unrecognised). */
  cardNumber: string | null;
}

/**
 * One classification rule — a markers → claim derivation.
 */
type Rule = {
  /** Stable identifier — written into evidence.rule. */
  id: string;
  /** Returns claim parts if rule fires, else null. */
  test: (signal: CardRushClassificationSignal) => {
    attribute: ClassifiableAttribute;
    value: string;
    marker: string;
    confidence: "low" | "high";
    notes?: string;
  } | null;
};

const RULES: Rule[] = [
  // ── R1: explicit parallel marker ────────────────────────────────────
  {
    id: "cardrush.parallel-marker",
    test: (signal) => {
      if (!signal.name) return null;
      if (signal.name.includes("パラレル")) {
        return {
          attribute: "edition_variant",
          value: "parallel",
          marker: "パラレル",
          confidence: "high",
          notes: "Explicit Japanese 'parallel' keyword in product name",
        };
      }
      if (/\/P\b/.test(signal.name) && !signal.name.includes("ドン!!")) {
        return {
          attribute: "edition_variant",
          value: "parallel",
          marker: "/P",
          confidence: "high",
          notes: "Japanese parallel suffix `/P` in product name",
        };
      }
      // Rarity letter suffix containing P — but only when the suffix is
      // a parallel marker (e.g. 'SRP', 'RP'). Rarity 'P' alone is the
      // promo rarity letter handled by R2.
      if (
        signal.rarity &&
        signal.rarity.length >= 2 &&
        signal.rarity.endsWith("P") &&
        !["SP", "TP", "PP"].includes(signal.rarity)
      ) {
        return {
          attribute: "edition_variant",
          value: "parallel",
          marker: signal.rarity,
          confidence: "high",
          notes: `Rarity suffix 'P' on '${signal.rarity}' indicates parallel print`,
        };
      }
      return null;
    },
  },

  // ── R2: OPTCG rarity 'P' alone → promo (low confidence) ─────────────
  {
    id: "cardrush.optcg.promo-rarity",
    test: (signal) => {
      if (signal.game !== "op") return null;
      if (signal.rarity === "P" || signal.rarity === "PR") {
        return {
          attribute: "promo_origin",
          value: "promotional-pack",
          marker: signal.rarity,
          confidence: "low",
          notes:
            "OPTCG rarity letter 'P' indicates promo distribution; specific channel (event/magazine/pack) unknown",
        };
      }
      return null;
    },
  },

  // ── R3: OPTCG PRB- set-code prefix → pre-release ────────────────────
  {
    id: "cardrush.optcg.prb-prefix",
    test: (signal) => {
      if (signal.game !== "op") return null;
      if (!signal.cardNumber) return null;
      if (signal.cardNumber.toUpperCase().startsWith("PRB-")) {
        return {
          attribute: "promo_origin",
          value: "pre-release",
          marker: "PRB-",
          confidence: "low",
          notes:
            "OPTCG 'PRB-' set prefix typically denotes pre-release / promo bundles",
        };
      }
      return null;
    },
  },
];

/**
 * Apply all rules to a CardRush signal. Returns the claims emitted in
 * the order rules fired. An empty array means no rule matched —
 * substrate-honest absence (no claim is emitted; the row defaults
 * stand).
 */
export function classifyCardRushSignal(
  signal: CardRushClassificationSignal,
  options: { claimedBy?: string } = {},
): Claim[] {
  const claimedBy = options.claimedBy ?? "cardrush-heuristic";
  const claims: Claim[] = [];
  for (const rule of RULES) {
    const result = rule.test(signal);
    if (!result) continue;
    const evidence: ClassificationEvidence = {
      url: signal.url,
      rule: rule.id,
      marker: result.marker,
      notes: result.notes,
      confidence: result.confidence,
    };
    claims.push({
      attribute: result.attribute,
      value: result.value,
      source: "heuristic",
      evidence,
      claimedBy,
    });
  }
  return claims;
}

/** Exported for tests + audits — the full rule registry. */
export const CARDRUSH_CLASSIFICATION_RULES = RULES.map((r) => ({ id: r.id }));
