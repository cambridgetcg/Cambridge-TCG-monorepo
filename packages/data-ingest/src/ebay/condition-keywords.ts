/**
 * Condition-keyword vocabulary — substrate-honest about what eBay titles
 * are admitting.
 *
 * Two role-distinct lists:
 *
 *   EXCLUSION — words that force a quarantine even when the title parses
 *               otherwise cleanly. Damage, alteration, counterfeit. We
 *               don't want these rows polluting a "near-mint median".
 *
 *   NEUTRAL   — words that *describe* a condition we can record. NM, LP,
 *               PL, etc. These populate `condition` on the canonical row.
 *
 * The two lists never overlap. A word hit on EXCLUSION wins.
 *
 * Substrate-honesty principle: a condition keyword found in the title is
 * *evidence the seller chose to state*. We carry those exact tokens out
 * on `condition_keywords` so the operator + auditor can trace why we
 * assigned a condition (or quarantined a row).
 *
 * Not enforced: a title without any keyword leaves `condition: undefined`
 * and `condition_keywords: []`. Downstream cohort aggregation treats
 * those rows as "unknown raw" — the responsibility to disambiguate
 * belongs to the consumer query, not the ingest layer.
 */

export interface ConditionKeywordResult {
  /** Whether the title contains words that force quarantine. */
  exclude: boolean;
  /** All matched exclusion tokens (audit trail). */
  excluded_keywords: string[];
  /** The canonical condition string when a neutral match was found. */
  condition: string | null;
  /** All matched neutral tokens (audit trail). */
  neutral_keywords: string[];
}

interface KeywordRule {
  pattern: RegExp;
  /** Lower-case token recorded in keyword audit trail. */
  token: string;
}

interface NeutralRule extends KeywordRule {
  /** Canonical condition string (lower-cased, hyphen-joined). */
  condition: string;
}

const EXCLUSION_RULES: KeywordRule[] = [
  { pattern: /\b(damaged|dmg)\b/i, token: "damaged" },
  { pattern: /\b(heavily\s+played|heavily-played)\b/i, token: "heavily-played" },
  // 'HP' as a condition only when not part of "60 HP" / "120HP" (Pokemon HP stat).
  // Negative lookbehind avoids matching after digit-space.
  { pattern: /(?<!\d\s)\bhp\b(?!\s+(?:\d|\/))/i, token: "hp" },
  { pattern: /\b(moderately\s+played|moderately-played)\b/i, token: "moderately-played" },
  // 'mp' without trailing digit/slash — avoids matching 'MP23-032' (a Yu-Gi-Oh set code).
  { pattern: /\bmp\b(?!\s*(?:\d|\/|-))/i, token: "mp" },
  { pattern: /\b(creas(?:e|ed|es|ing))\b/i, token: "creased" },
  { pattern: /\b(bent|bend|bending)\b/i, token: "bent" },
  { pattern: /\b(warped|warp(?!\s+pipe))\b/i, token: "warped" },
  { pattern: /\b(stained|stain)\b/i, token: "stained" },
  { pattern: /\b(water\s+damage|water-damaged|water\s+damaged)\b/i, token: "water-damaged" },
  { pattern: /\b(trimmed|altered|recolou?red|repainted)\b/i, token: "altered" },
  // Word 'cut' is too ambiguous on its own (cut sleeves, cut from sheet); only flag with context
  { pattern: /\b(?:cut\s+card|miscut\s+card|card\s+miscut)\b/i, token: "miscut" },
  { pattern: /\b(fake|replica|counterfeit|fanmade|fan-made)\b/i, token: "counterfeit" },
  // Proxy and custom are common keywords on unofficial reprints. Quarantine.
  { pattern: /\b(proxy|proxies)\b/i, token: "proxy" },
  // Allow 'custom slab' in graded contexts (it's still the card); but bare 'custom card' is a craft listing.
  { pattern: /\bcustom\s+(?:card|art|made|print)\b/i, token: "custom-card" },
  { pattern: /\b(reprint|re-print)\b(?!\s+(?:edition|series))/i, token: "reprint" },
  // 'lot of N' implies a multi-card bundle, not a single-card observation.
  { pattern: /\blot\s+of\s+\d+\b/i, token: "lot" },
  { pattern: /\b(?:bulk|bundle\s+of)\b/i, token: "bulk" },
];

const NEUTRAL_RULES: NeutralRule[] = [
  // Most specific first so 'near mint' beats bare 'mint'.
  { pattern: /\b(gem\s+mint|gem-mint)\b/i, token: "gem-mint", condition: "gem-mint" },
  { pattern: /\b(near\s+mint|near-mint|nm)\b(?!\s+\d)/i, token: "near-mint", condition: "near-mint" },
  { pattern: /\b(lightly\s+played|lightly-played|lp)\b(?!\s+\d)/i, token: "lightly-played", condition: "lightly-played" },
  { pattern: /\b(?:very\s+good|vg)\b/i, token: "very-good", condition: "very-good" },
  // 'mint' alone — only match when not preceded by 'gem' / 'near'. Done by ordering above.
  { pattern: /\bmint\b(?!\s+\d)/i, token: "mint", condition: "mint" },
  { pattern: /\b(?:played|pl)\b(?!\s+\d)/i, token: "played", condition: "played" },
];

/**
 * Run the keyword passes against a title. Always returns a result;
 * `exclude: false` and `condition: null` means *we have no opinion*.
 *
 * Pure. Same title → same result.
 */
export function detectConditionKeywords(title: string): ConditionKeywordResult {
  if (typeof title !== "string" || title.length === 0) {
    return {
      exclude: false,
      excluded_keywords: [],
      condition: null,
      neutral_keywords: [],
    };
  }

  const excluded_keywords: string[] = [];
  for (const rule of EXCLUSION_RULES) {
    if (rule.pattern.test(title)) excluded_keywords.push(rule.token);
  }
  if (excluded_keywords.length > 0) {
    return {
      exclude: true,
      excluded_keywords,
      condition: null,
      neutral_keywords: [],
    };
  }

  const neutral_keywords: string[] = [];
  let condition: string | null = null;
  for (const rule of NEUTRAL_RULES) {
    if (rule.pattern.test(title)) {
      neutral_keywords.push(rule.token);
      // Pick the first match — rules are ordered specific-first.
      if (condition === null) condition = rule.condition;
    }
  }

  return {
    exclude: false,
    excluded_keywords: [],
    condition,
    neutral_keywords,
  };
}
