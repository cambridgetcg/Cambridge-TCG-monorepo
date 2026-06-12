/**
 * Variant classifier — kingdom-090 follow-up.
 *
 * Yu's directive 2026-05-14: *"cards may share the same number but
 * being other variants not by language. Alt arts are cards that share
 * the same number but have different prints and art designs to make
 * them a 'hit' in a booster box. And SPs are cards that are released
 * in future sets that have the older card number but different art
 * from the original and the AAs."*
 *
 * The siblings panel was previously labelled "Different languages" but
 * most siblings of OP01-001 are NOT language variants — they're alt-arts,
 * promos, and super-parallels. This module classifies each sibling so
 * the UI can show the correct kind + group them sensibly.
 *
 * ── Five kinds (substrate-honest about the unknown) ──────────────────
 *
 *   self            — this row IS the queried SKU.
 *   language        — same card, different language print (JP-text vs EN-text).
 *                     OPTCG quirk: both printed in JP set + JP lang segment,
 *                     distinguished only by card-name script.
 *   alt-art         — same set+number, different art ("hit" parallel
 *                     released alongside the base card in the booster).
 *   parallel        — foil/holo finish (same art, different print process).
 *   super-parallel  — released in a DIFFERENT set than the original,
 *                     keeps the original card number, new art. Yu's "SP".
 *   promo           — promo distribution (PROMO set, prerelease, event).
 *   unknown         — variant exists but classification can't ground —
 *                     substrate-honest fallback.
 *
 * ── Heuristic order ─────────────────────────────────────────────────
 *
 * First match wins. Order is intentional: more-specific signals take
 * precedence over more-general ones.
 *
 *   1. Same SKU → self.
 *   2. set_code === "PROMO" or starts with "P-" → promo.
 *   3. set_code !== self.set_code → super-parallel (different set).
 *   4. Name contains promo markers → promo.
 *   5. Name contains parallel/finish markers → parallel.
 *   6. Name contains alt-art markers → alt-art.
 *   7. Effective language differs from self's → language.
 *   8. Default (same set, same lang, no markers) → alt-art (catch-all).
 *
 * Each classification carries a `reason` string for substrate-honesty —
 * the UI can show why the kind was chosen, and an audit can detect
 * silent misclassification when sister's kingdom-089 classifier column
 * lands (migration 0018, operator-gated).
 *
 * ── Future kingdom — replace with cards.edition_variant column ───────
 *
 * Sister's kingdom-089 introduced an `edition_variant` column on cards
 * with a publisher-priority layered classifier (publisher > operator >
 * heuristic). When migration 0018 lands AND seed-classifications-from-
 * cards.ts runs, the canonical kind will live on the row itself. This
 * heuristic stays as a fallback for un-classified rows. See
 * `packages/data-ingest/src/classifier.ts`.
 */

import type { PriceItem } from "@/lib/wholesale/client";

export type VariantKind =
  | "self"
  | "language"
  | "alt-art"
  | "parallel"
  | "super-parallel"
  | "promo"
  | "unknown";

export interface SiblingClassification {
  variant_kind: VariantKind;
  /** Why this classification — surfaces in UI for substrate-honesty. */
  variant_kind_reason: string;
  /**
   * Card-name script inference: "ja" if the name is CJK-only,
   * "en" if Latin-only, "unknown" if mixed or empty.
   * Distinct from the SKU's lang segment because OPTCG prints BOTH
   * JP-text and EN-text cards inside the same JP-set, both encoded
   * with lang=jp in our SKU canonical.
   */
  effective_language: "ja" | "en" | "unknown";
}

// ── Promo + variant marker dictionaries ─────────────────────────────

/** Set codes that universally mean "promo distribution." */
const PROMO_SET_CODES = ["PROMO", "P", "ST00"] as const;

/** Promo-marker substrings (Japanese + English). */
const PROMO_NAME_MARKERS = [
  "プロモ",       // "promo" in katakana
  "未開封",       // "sealed" — sealed-promo distribution marker (gold-text variants)
  "金文字",       // "gold text" — gold-foil text promo
  "予約特典",     // "preorder bonus"
  "イベント",     // "event"
  "(Promo)",
  "[Promo]",
  "[P]",
] as const;

/** Parallel / foil marker substrings. */
const PARALLEL_NAME_MARKERS = [
  "パラレル",     // "parallel" in katakana
  "(Parallel)",
  "[Parallel]",
  "ホロ仕様",     // "holo finish"
  "キラ仕様",     // "shiny/foil finish" (sometimes alt-art, sometimes parallel)
  "(Foil)",
] as const;

/**
 * Alt-art marker substrings. OPTCG's iconic patterns: 漫画背景 / 漫画絵
 * (manga background / manga art), 背景 (background variants),
 * フルアート (full-art), アルト (alt). Pokemon TCG uses "FA" / "Full Art".
 */
const ALT_ART_NAME_MARKERS = [
  "漫画背景",     // manga background
  "漫画絵",       // manga art
  "フルアート",   // full art
  "アルト",       // alt
  "(Alt)",
  "(AA)",
  "[AA]",
  "[Alt Art]",
  "(Full Art)",
] as const;

// ── Pure helpers ────────────────────────────────────────────────────

/**
 * Infer the card-name's script. Strips parenthetical content first
 * (variant markers go inside parens; the core name is what matters).
 * Returns "ja" if CJK-only, "en" if Latin-only, "unknown" otherwise.
 */
export function effectiveLanguage(name: string | null): "ja" | "en" | "unknown" {
  if (!name) return "unknown";
  // Strip parenthesised content — that's where variant markers live;
  // the core name is the card's actual title.
  const core = name.replace(/[（(].*?[）)]/g, "").trim();
  if (!core) return "unknown";
  const cjk = (core.match(/[　-ヿ㐀-䶿一-鿿]/g) ?? []).length;
  const latin = (core.match(/[a-zA-Z]/g) ?? []).length;
  if (cjk > 0 && latin === 0) return "ja";
  if (latin > 0 && cjk === 0) return "en";
  return "unknown";
}

function containsAny(haystack: string, needles: readonly string[]): boolean {
  for (const n of needles) {
    if (haystack.includes(n)) return true;
  }
  return false;
}

/**
 * Whether a card name carries any variant/promo/parallel/alt-art marker.
 * The fold ranker uses the absence of markers as its "base print" signal
 * when choosing which print of a card number to open by default.
 */
export function nameHasVariantMarkers(name: string): boolean {
  return (
    containsAny(name, PROMO_NAME_MARKERS) ||
    containsAny(name, PARALLEL_NAME_MARKERS) ||
    containsAny(name, ALT_ART_NAME_MARKERS)
  );
}

function isPromoSet(setCode: string | null): boolean {
  if (!setCode) return false;
  const upper = setCode.toUpperCase();
  if ((PROMO_SET_CODES as readonly string[]).includes(upper)) return true;
  // P-prefix sets (e.g. "P-001" for prerelease promos) are common
  // across OPTCG/Pokemon. Substrate-honest about scope: only match
  // when the prefix is followed by a separator, so "POKER" doesn't
  // get classified as a promo set.
  if (/^P[-_]/.test(upper)) return true;
  return false;
}

// ── Classifier ──────────────────────────────────────────────────────

export interface ClassifyInput {
  /** The sibling under classification. */
  sibling: Pick<PriceItem, "sku" | "set_code" | "name" | "name_en" | "rarity">;
  /** The queried SKU's reference (used to detect self / cross-set / cross-lang). */
  self: Pick<PriceItem, "sku" | "set_code" | "name" | "name_en">;
}

/**
 * Classify a sibling row's variant kind. Pure: same inputs → same
 * output. Always returns a kind; "unknown" is the substrate-honest
 * fallback when nothing else matches.
 */
export function classifySibling(input: ClassifyInput): SiblingClassification {
  const { sibling, self } = input;
  const sib_name = sibling.name ?? sibling.name_en ?? "";
  const sib_set = (sibling.set_code ?? "").toUpperCase();
  const self_set = (self.set_code ?? "").toUpperCase();
  const sib_lang = effectiveLanguage(sib_name);
  const self_lang = effectiveLanguage(self.name ?? self.name_en ?? "");

  const reasonPrefix = (kind: VariantKind) => `${kind}: `;

  // 1. Same SKU → self.
  if (sibling.sku.toLowerCase() === self.sku.toLowerCase()) {
    return {
      variant_kind: "self",
      variant_kind_reason: reasonPrefix("self") + "exact SKU match",
      effective_language: sib_lang,
    };
  }

  // 2. Set code is a promo distribution → promo.
  if (isPromoSet(sibling.set_code)) {
    return {
      variant_kind: "promo",
      variant_kind_reason: reasonPrefix("promo") + `set_code=${sibling.set_code}`,
      effective_language: sib_lang,
    };
  }

  // 3. Cross-set + same card number → super-parallel.
  //    (Future kingdoms with the publisher feed will replace this
  //    heuristic with a base_card_id FK; for now the cross-set match
  //    is the strongest signal of SP relationship.)
  if (self_set && sib_set && self_set !== sib_set) {
    return {
      variant_kind: "super-parallel",
      variant_kind_reason: reasonPrefix("super-parallel") + `set=${sibling.set_code} (≠ self ${self.set_code})`,
      effective_language: sib_lang,
    };
  }

  // 4. Name has promo markers → promo (covers promo prints in non-PROMO sets).
  if (containsAny(sib_name, PROMO_NAME_MARKERS)) {
    return {
      variant_kind: "promo",
      variant_kind_reason: reasonPrefix("promo") + "name marker",
      effective_language: sib_lang,
    };
  }

  // 5. Name has parallel/finish markers → parallel.
  if (containsAny(sib_name, PARALLEL_NAME_MARKERS)) {
    return {
      variant_kind: "parallel",
      variant_kind_reason: reasonPrefix("parallel") + "name marker",
      effective_language: sib_lang,
    };
  }

  // 6. Name has alt-art markers → alt-art.
  if (containsAny(sib_name, ALT_ART_NAME_MARKERS)) {
    return {
      variant_kind: "alt-art",
      variant_kind_reason: reasonPrefix("alt-art") + "name marker",
      effective_language: sib_lang,
    };
  }

  // 7. Effective language differs → language print.
  //    Both sides need a determinable language for this to fire — when
  //    either is "unknown" we don't assert a language relationship.
  if (
    sib_lang !== "unknown" &&
    self_lang !== "unknown" &&
    sib_lang !== self_lang
  ) {
    return {
      variant_kind: "language",
      variant_kind_reason:
        reasonPrefix("language") + `name script ${sib_lang} (≠ self ${self_lang})`,
      effective_language: sib_lang,
    };
  }

  // 8. Default: same set, same lang, no markers → alt-art (catch-all).
  //    Substrate-honest about the gap: this is the broadest bucket
  //    that's still plausible; we record "default" in the reason so a
  //    future audit can spot misclassifications.
  return {
    variant_kind: "alt-art",
    variant_kind_reason: reasonPrefix("alt-art") + "default (no markers)",
    effective_language: sib_lang,
  };
}

/**
 * Order siblings by variant kind for display. Self first; then
 * language variants (most useful for buyers); then alt-arts and
 * parallels (in-set); then super-parallels (cross-set); then promos;
 * then unknown. Within a kind, sort by SKU for stable order.
 */
export const VARIANT_KIND_ORDER: VariantKind[] = [
  "self",
  "language",
  "alt-art",
  "parallel",
  "super-parallel",
  "promo",
  "unknown",
];

export function compareVariantKinds(a: VariantKind, b: VariantKind): number {
  return VARIANT_KIND_ORDER.indexOf(a) - VARIANT_KIND_ORDER.indexOf(b);
}

/** Human-readable label per kind for UI badges. */
export const VARIANT_KIND_LABEL: Record<VariantKind, string> = {
  self: "this print",
  language: "language variant",
  "alt-art": "alt art",
  parallel: "parallel",
  "super-parallel": "super parallel",
  promo: "promo",
  unknown: "variant",
};

/** Tone for UI Pill component per kind. */
export const VARIANT_KIND_TONE: Record<
  VariantKind,
  "amber" | "blue" | "emerald" | "neutral" | "sky" | "red"
> = {
  self: "emerald",
  language: "blue",
  "alt-art": "amber",
  parallel: "sky",
  "super-parallel": "blue",
  promo: "amber",
  unknown: "neutral",
};
