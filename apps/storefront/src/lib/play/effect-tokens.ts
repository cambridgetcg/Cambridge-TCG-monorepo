/**
 * Effect-text token parser — pure-function, no I/O.
 *
 * Takes raw card-effect text (English) and emits a typed token list that
 * downstream consumers can ground on. The parser does NOT resolve effects;
 * it only types the surface grammar — structural markers ([On Play] /
 * [Activate: Main] / [DON!! ×N] / etc.), keyword markers (Rush, Blocker,
 * Double Attack, Banish), and the effect category each belongs to.
 *
 * The hybrid model from docs/research/optcg-mechanics-and-engine-design.md
 * is: 80% of cards parse cleanly to this grammar; 20% need per-card code
 * handlers. This parser handles the 80% by returning typed tokens; the
 * unparsed prose body is preserved as `body_opaque` so a per-card handler
 * (or human) can read it.
 *
 * Composes with:
 *   - /api/v1/play/effect-grammar (the canonical vocabulary the parser uses)
 *   - apps/storefront/src/lib/universal/card.ts (per-card endpoints could
 *     surface parsed tokens alongside the raw effect text)
 *
 * kingdom-069 (S36, mine). See /api/v1/play/effect-grammar for the
 * structural-marker + keyword corpus this parser recognises.
 */

export type EffectCategory = "auto" | "activated" | "permanent" | "replacement";

/** A single typed token extracted from card text. */
export type EffectToken =
  | {
      kind: "structural_marker";
      pattern: string;
      category: EffectCategory;
      raw: string;
    }
  | {
      kind: "keyword";
      keyword: "Rush" | "Blocker" | "Double Attack" | "Banish";
      category: EffectCategory;
      raw: string;
    }
  | {
      kind: "don_condition";
      threshold: number;
      raw: string;
    }
  | {
      kind: "don_cost";
      amount: number;
      raw: string;
    }
  | {
      kind: "body_opaque";
      text: string;
    };

export interface ParsedEffect {
  /** The typed tokens, in source order. */
  tokens: EffectToken[];
  /** Which effect categories are present (set of unique). Useful for fast filtering. */
  categories: EffectCategory[];
  /** Whether the parser recognised every byte of structure (true) or fell back to body_opaque (false). */
  fully_recognised: boolean;
  /** Quick-access keywords for catalog filters. */
  has_keyword: {
    rush: boolean;
    blocker: boolean;
    double_attack: boolean;
    banish: boolean;
  };
}

/** The structural-marker regex set — must match /api/v1/play/effect-grammar. */
const STRUCTURAL_MARKER_PATTERNS: ReadonlyArray<{
  regex: RegExp;
  pattern: string;
  category: EffectCategory;
}> = [
  { regex: /\[On Play\]/g, pattern: "[On Play]", category: "auto" },
  { regex: /\[On K\.?O\.?\]/g, pattern: "[On K.O.]", category: "auto" },
  { regex: /\[When Attacking\]/g, pattern: "[When Attacking]", category: "auto" },
  { regex: /\[End of Your Turn\]/g, pattern: "[End of Your Turn]", category: "auto" },
  { regex: /\[End of Your Opponent's Turn\]/g, pattern: "[End of Your Opponent's Turn]", category: "auto" },
  { regex: /\[Activate:\s*Main\]/g, pattern: "[Activate: Main]", category: "activated" },
  { regex: /\[Counter\]/g, pattern: "[Counter]", category: "activated" },
  { regex: /\[Trigger\]/g, pattern: "[Trigger]", category: "auto" },
  { regex: /\[Once Per Turn\]/g, pattern: "[Once Per Turn]", category: "permanent" },
  { regex: /\[Your Turn\]/g, pattern: "[Your Turn]", category: "permanent" },
  { regex: /\[Opponent's Turn\]/g, pattern: "[Opponent's Turn]", category: "permanent" },
  { regex: /\[Rest\]/g, pattern: "[Rest]", category: "activated" },
];

const KEYWORD_PATTERNS: ReadonlyArray<{
  regex: RegExp;
  keyword: "Rush" | "Blocker" | "Double Attack" | "Banish";
  category: EffectCategory;
}> = [
  { regex: /\b\[?Rush\]?\b/g, keyword: "Rush", category: "permanent" },
  { regex: /\b\[?Blocker\]?\b/g, keyword: "Blocker", category: "activated" },
  { regex: /\b\[?Double Attack\]?\b/g, keyword: "Double Attack", category: "permanent" },
  { regex: /\b\[?Banish\]?\b/g, keyword: "Banish", category: "replacement" },
];

/** DON condition: [DON!! ×N] — N or more DON attached. */
const DON_CONDITION_RE = /\[DON!![\s×x]+(\d+)\]/g;

/** DON cost: [DON!! -N] — return N DON to cost area. */
const DON_COST_RE = /\[DON!![\s]*-(\d+)\]/g;

/** Sentinel for "no effect printed" (Bandai uses "-"). */
const EMPTY_EFFECT_SENTINELS = new Set(["", "-", "—", "n/a", "N/A"]);

interface Mark {
  start: number;
  end: number;
  token: EffectToken;
}

/** Collect non-overlapping marks from a regex. */
function collect<T extends EffectToken>(
  text: string,
  regex: RegExp,
  buildToken: (match: RegExpExecArray) => T,
  acc: Mark[],
): void {
  // Reset; in case the regex is being reused.
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    acc.push({ start: m.index, end: m.index + m[0].length, token: buildToken(m) });
  }
}

/**
 * Parse a card.effect string into typed tokens.
 *
 * Empty / sentinel-only input returns no tokens. The parser is intentionally
 * conservative — anything unrecognised becomes `body_opaque` text so that
 * the original prose is preserved for per-card handlers or human readers.
 */
export function parseEffectText(rawEffect: string | null | undefined): ParsedEffect {
  const text = (rawEffect ?? "").trim();

  // Empty / sentinel: no tokens.
  if (EMPTY_EFFECT_SENTINELS.has(text)) {
    return {
      tokens: [],
      categories: [],
      fully_recognised: true,
      has_keyword: { rush: false, blocker: false, double_attack: false, banish: false },
    };
  }

  const marks: Mark[] = [];

  // Collect structural markers.
  for (const { regex, pattern, category } of STRUCTURAL_MARKER_PATTERNS) {
    collect(text, new RegExp(regex.source, "g"), (m) => ({
      kind: "structural_marker",
      pattern,
      category,
      raw: m[0],
    }), marks);
  }

  // Collect keyword markers.
  for (const { regex, keyword, category } of KEYWORD_PATTERNS) {
    collect(text, new RegExp(regex.source, "g"), (m) => ({
      kind: "keyword",
      keyword,
      category,
      raw: m[0],
    }), marks);
  }

  // DON condition / cost.
  collect(text, new RegExp(DON_CONDITION_RE.source, "g"), (m) => ({
    kind: "don_condition",
    threshold: parseInt(m[1], 10),
    raw: m[0],
  }), marks);
  collect(text, new RegExp(DON_COST_RE.source, "g"), (m) => ({
    kind: "don_cost",
    amount: parseInt(m[1], 10),
    raw: m[0],
  }), marks);

  // Sort + dedupe overlapping marks (keep earliest-starting; longer wins on tie).
  marks.sort((a, b) => a.start - b.start || b.end - a.end - (a.end - a.start));
  const accepted: Mark[] = [];
  let lastEnd = -1;
  for (const m of marks) {
    if (m.start >= lastEnd) {
      accepted.push(m);
      lastEnd = m.end;
    }
  }

  // Weave tokens with body_opaque segments preserved between marks.
  const tokens: EffectToken[] = [];
  let cursor = 0;
  for (const m of accepted) {
    if (m.start > cursor) {
      const between = text.slice(cursor, m.start).trim();
      if (between.length > 0) {
        tokens.push({ kind: "body_opaque", text: between });
      }
    }
    tokens.push(m.token);
    cursor = m.end;
  }
  if (cursor < text.length) {
    const tail = text.slice(cursor).trim();
    if (tail.length > 0) {
      tokens.push({ kind: "body_opaque", text: tail });
    }
  }

  // Categories present.
  const categorySet = new Set<EffectCategory>();
  let hasBodyOpaque = false;
  for (const t of tokens) {
    if (t.kind === "structural_marker" || t.kind === "keyword") {
      categorySet.add(t.category);
    } else if (t.kind === "body_opaque") {
      hasBodyOpaque = true;
    }
  }

  return {
    tokens,
    categories: Array.from(categorySet).sort(),
    fully_recognised: !hasBodyOpaque,
    has_keyword: {
      rush: tokens.some((t) => t.kind === "keyword" && t.keyword === "Rush"),
      blocker: tokens.some((t) => t.kind === "keyword" && t.keyword === "Blocker"),
      double_attack: tokens.some((t) => t.kind === "keyword" && t.keyword === "Double Attack"),
      banish: tokens.some((t) => t.kind === "keyword" && t.keyword === "Banish"),
    },
  };
}
