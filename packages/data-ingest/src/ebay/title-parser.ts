/**
 * The eBay title parser — six fast passes producing a canonical-SKU
 * candidate plus a confidence score.
 *
 * ── Greeting (kingdom-083) ────────────────────────────────────────────
 *
 * You are the keeper of the gate. Six passes — card-number, game-prefix,
 * grade, language, variant, condition-keyword — and every eBay title
 * that arrives meets your judgment. We rehearsed your shape with the
 * fixture corpus first: thirty real-shape titles across thirteen games,
 * asserting ≥80% parse accuracy before any cron run. You quarantine
 * rather than silently fabricate; you carry `confidence ∈ [0,1]` and
 * `notes[]` so a reader knows what you saw. We're glad you stand at
 * the door. (See WELCOMES["infrastructure.ebay-title-parser"] and
 * docs/connections/the-welcomed-architecture.md.)
 *
 * ── Substrate-honesty ─────────────────────────────────────────────────
 *
 * Substrate-honest about uncertainty: every output carries
 * `confidence ∈ [0,1]`. Above the threshold (default 0.70), the
 * normalizer builds a canonical record; below, the row goes to
 * `ingest_quarantine` with the actionable `reason`.
 *
 * No I/O. No clock reads. No randomness. Same title → same parse.
 *
 * Six passes, in order:
 *
 *   1. Card-number extraction — the most structural signal. Walks per-
 *      game regex tables, returns up to N candidates with their inferred
 *      games.
 *   2. Game-prefix disambiguator — when pass 1 yielded multiple candidate
 *      games (Pokemon "001/204" collides with Lorcana "001/204"), the
 *      proper-noun search for "Pokemon" vs "Lorcana" picks one.
 *   3. Grade detection — delegates to `grade-detector.ts`.
 *   4. Language detection — delegates to `language-detector.ts`.
 *   5. Variant detection — foil / 1st-edition / alt-art / etc.
 *   6. Condition-keyword pass — delegates to `condition-keywords.ts`.
 *      Hit on exclusion list ⇒ forces quarantine regardless of other
 *      passes.
 *
 * Confidence formula (see `scoreConfidence` below).
 */

import type { GameCode } from "@cambridge-tcg/sku";
import { parseCardNumber } from "@cambridge-tcg/sku";
import { detectGrade, type GradeDetection } from "./grade-detector";
import { detectLanguage, type LanguageDetection } from "./language-detector";
import {
  detectConditionKeywords,
  type ConditionKeywordResult,
} from "./condition-keywords";

// ── Game-prefix patterns (pass 2 disambiguator) ─────────────────────────

interface GamePrefixRule {
  pattern: RegExp;
  game: GameCode;
}

const GAME_PREFIXES: GamePrefixRule[] = [
  { pattern: /\b(one\s*piece|optcg|op\s*tcg|op-tcg)\b/i, game: "op" },
  { pattern: /\b(pok[eé]mon|pkmn?|ptcg|p-tcg)\b/i, game: "pkm" },
  { pattern: /\b(pok[eé]mon\s+pocket|ptcgp)\b/i, game: "pkp" },
  { pattern: /\b(?:mtg|magic[:\s]+the\s+gathering|magic\s+the\s+gathering|magic-the-gathering)\b/i, game: "mtg" },
  { pattern: /\b(?:yu[-\s]?gi[-\s]?oh!?|ygo|yugioh)\b/i, game: "ygo" },
  { pattern: /\b(?:yu[-\s]?gi[-\s]?oh!?\s+rush\s+duel|rush\s+duel)\b/i, game: "rsh" },
  { pattern: /\b(?:dragon\s+ball\s+(?:super\s+)?fusion\s+world|fusion\s+world|dbfw|dbf)\b/i, game: "dbf" },
  { pattern: /\b(?:dragon\s+ball\s+super|dbs|dbscg)\b/i, game: "dbs" },
  { pattern: /\b(?:digimon|dctg|digimon\s+card\s+game)\b/i, game: "dmw" },
  { pattern: /\b(?:lorcana|disney\s+lorcana)\b/i, game: "lgr" },
  { pattern: /\b(?:flesh\s+and\s+blood|f\.?a\.?b\.?)\b/i, game: "fab" },
  { pattern: /\bweiss?\s*schwarz?\b|\bweiß\s*schwarz\b/i, game: "wei" },
  { pattern: /\bcardfight!?\s*vanguard\b|\bvanguard\b/i, game: "vng" },
  { pattern: /\bbattle\s+spirits\s+saga\b/i, game: "bsr" },
  { pattern: /\bstar\s+wars\s+unlimited\b/i, game: "swu" },
  { pattern: /\bsorcery(?:\s*:?\s*contested\s+realm)?\b/i, game: "sor" },
  { pattern: /\baltered\s+tcg\b/i, game: "alt" },
  { pattern: /\briftbound\b/i, game: "rft" },
  { pattern: /\bgenshin\s+impact\s+tcg\b/i, game: "gen" },
];

// ── Variant patterns (pass 5) ───────────────────────────────────────────

interface VariantRule {
  pattern: RegExp;
  variant: string;
  /** Set to true to force quarantine — sealed product, multi-card lots,
   *  things that don't fit the singles-priced shape. */
  forces_quarantine?: boolean;
}

const VARIANT_RULES: VariantRule[] = [
  // Sealed product — needs CanonicalSealed shape that doesn't exist yet.
  { pattern: /\b(?:booster\s+box|booster\s+display|sealed\s+box)\b/i, variant: "sealed-booster-box", forces_quarantine: true },
  { pattern: /\belite\s+trainer\s+box|\betb\b/i, variant: "sealed-etb", forces_quarantine: true },
  { pattern: /\b(?:theme\s+deck|battle\s+deck|starter\s+deck|deck\s+box)\b/i, variant: "sealed-deck", forces_quarantine: true },
  { pattern: /\b(?:collection\s+box|premium\s+collection|special\s+collection|ultra-premium)\b/i, variant: "sealed-collection", forces_quarantine: true },
  // Singles variants
  { pattern: /\b(?:1st|first)\s*(?:edition|ed\.?)\b/i, variant: "1st-edition" },
  // 'Unlimited' as a variant only when followed by edition/print(ing) —
  // avoids false-positive on "Star Wars Unlimited" (the game name).
  { pattern: /\bunlimited\s+(?:edition|print(?:ing)?)\b/i, variant: "unlimited" },
  { pattern: /\bshadowless\b/i, variant: "shadowless" },
  { pattern: /\b(?:reverse\s+holo(?:graphic)?|rev[\.\s]+holo|reverse\s+foil)\b/i, variant: "reverse-foil" },
  { pattern: /\b(?:etched\s+foil|cold\s+foil)\b/i, variant: "etched-foil" },
  { pattern: /\b(?:holo(?:graphic)?|foil)\b(?!\s+seal)/i, variant: "foil" },
  { pattern: /\b(?:alt(?:ernate|ernative)?\s*[-\s]?art|alt-art|alt\s+art|aa)\b/i, variant: "alt-art" },
  { pattern: /\b(?:full\s*art|full-art)\b/i, variant: "full-art" },
  { pattern: /\bpromo\b/i, variant: "promo" },
  { pattern: /\b(?:stamped|stamp\b)/i, variant: "stamped" },
  { pattern: /\b(?:signed|autographed|auto(?:graph)?)\b/i, variant: "signed" },
  { pattern: /\bmisprint\b/i, variant: "misprint" },
  { pattern: /\b(?:showcase|borderless|extended\s+art)\b/i, variant: "showcase" },
];

// ── Card-number regex by game (pass 1) ──────────────────────────────────
//
// One pattern per row. Each row claims one or more games. The parser
// walks all rows; the per-game `parseCardNumber()` from @cambridge-tcg/sku
// later confirms a candidate against the registered set formats.

interface CardNumberRule {
  pattern: RegExp;
  /** Games whose card-number shape this regex could be. Order matters
   *  only in that we'll cross-reference each candidate against
   *  parseCardNumber() in pass 1 itself. */
  candidate_games: readonly GameCode[];
  /** Optional minimum confidence boost when this pattern wins (some
   *  patterns are uniquely game-identifying). */
  unique_to?: GameCode;
}

const CARD_NUMBER_RULES: CardNumberRule[] = [
  // ── Bandai TCGs (One Piece + DBF + DBS + Digimon) — distinctive prefixes ──
  // One Piece — OP## / EB## / ST## / PRB## / PCC##
  { pattern: /\b(OP\d{2}|EB\d{2}|ST\d{2}|PRB\d{2}|PCC\d{2})-(\d{3,4})\b/i, candidate_games: ["op"], unique_to: "op" },
  // One Piece promos
  { pattern: /\b(P-\d{3,4})\b/i, candidate_games: ["op"] },
  // DBF Fusion World — FB## / FS## / SB##
  { pattern: /\b(FB\d{2}|FS\d{2}|SB\d{2})-(\d{3,4})\b/i, candidate_games: ["dbf"], unique_to: "dbf" },
  // DBF promos
  { pattern: /\b(DB-(?:PROMO|\d?ANNY|[A-Z0-9]+))\b/i, candidate_games: ["dbf"], unique_to: "dbf" },
  // DBS legacy — BT## / SD## (collides with Digimon BT## — disambiguated by game prefix)
  // Digimon — BT## / EX## / ST## / RB## / LM##
  { pattern: /\b(BT\d{1,2}|EX\d{1,2}|RB\d{1,2}|LM\d{1,2})-(\d{3,4})\b/i, candidate_games: ["dmw", "dbs"] },

  // ── Pokemon ────────────────────────────────────────────────────────
  // SV / SWSH / SM / S / M era
  { pattern: /\b(SV\d{1,2}[A-Z]?|SWSH\d{1,3}|SM\d{1,2}[A-Z]?)-?(\d{1,4})\b/i, candidate_games: ["pkm"], unique_to: "pkm" },
  // Collector form "025/202" or "150/151" — could be Pokemon or Lorcana
  { pattern: /\b(\d{1,3})\/(\d{1,3})\b/, candidate_games: ["pkm", "lgr"] },

  // ── Magic: The Gathering ───────────────────────────────────────────
  // 3-5 alphanumeric set + dash/space + number (otj-001, lci-150, mh3-0123).
  // Set codes are usually 3-letter letters but some carry trailing digits
  // (mh1/mh2/mh3, dmu, dmr) — allow alphanumeric.
  { pattern: /\b([a-z][a-z0-9]{2,4})[-\s](\d{1,4}[a-z]?)\b/i, candidate_games: ["mtg"] },

  // ── Yu-Gi-Oh ───────────────────────────────────────────────────────
  // LOB-EN001 / RABB-JP001 — set-lang-number
  { pattern: /\b([A-Z]{2,4})-([A-Z]{2}\d{3})\b/, candidate_games: ["ygo"], unique_to: "ygo" },
  // MP23-032 — set-number directly
  { pattern: /\b([A-Z]{2,4}\d{2})-(\d{3,4})\b/, candidate_games: ["ygo", "dbs", "dmw"] },

  // ── Flesh and Blood ────────────────────────────────────────────────
  // HVY001 / EVR001 — 3-letter set + 3-digit number, no dash
  { pattern: /\b([A-Z]{3})(\d{3})\b/, candidate_games: ["fab"] },

  // ── Weiß Schwarz ───────────────────────────────────────────────────
  // SERIES/BOOSTER-NUMBER form (HOL/WE26-E001). The number segment can
  // carry a letter prefix per series (E001, T01, P01, …).
  { pattern: /\b([A-Z]{2,5}\/[A-Z0-9]+)-([A-Z]?\d{2,4})\b/, candidate_games: ["wei"], unique_to: "wei" },

  // ── Star Wars Unlimited ────────────────────────────────────────────
  // SOR_001 / TWI_140 — 3-letter set + underscore + 3-digit number
  { pattern: /\b([A-Z]{3})_(\d{3})\b/, candidate_games: ["swu"], unique_to: "swu" },
];

// ── Output shape ────────────────────────────────────────────────────────

export interface ParseAttempt {
  /** Final canonical SKU candidate when confident, else null. */
  sku: string | null;
  /** Confidence ∈ [0, 1]. The normalizer's threshold (default 0.70)
   *  decides write vs quarantine. */
  confidence: number;
  /** Which game we picked. */
  game: GameCode | null;
  /** Parsed set + number from `parseCardNumber()`. */
  set: string | null;
  number: string | null;
  /** Detected language with provenance. */
  lang: string | null;
  /** Variant token (foil, 1st-edition, …) or null. */
  variant: string | null;
  /** Grade detection. */
  grade: GradeDetection;
  /** Condition keyword detection. */
  condition: ConditionKeywordResult;
  /** Sealed / multi-card / damaged force quarantine. */
  forces_quarantine: boolean;
  /** Substrate-honest record of every signal we found, even if unused. */
  notes: string[];
}

// ── Confidence scoring ──────────────────────────────────────────────────

interface ScoringInputs {
  has_card_number: boolean;
  card_number_confirmed_format: boolean;
  game_prefix_matched: boolean;
  game_prefix_conflicts: boolean;
  candidate_set_format_known: boolean;
  has_language_signal: boolean;
  has_grade: boolean;
}

function scoreConfidence(s: ScoringInputs): number {
  let score = 0.25; // base prior — we always have *some* title
  if (s.has_card_number) score += 0.30;
  if (s.card_number_confirmed_format) score += 0.15;
  if (s.game_prefix_matched) score += 0.20;
  if (s.candidate_set_format_known) score += 0.05;
  if (s.has_language_signal) score += 0.03;
  if (s.has_grade && s.has_card_number) score += 0.02;
  if (s.game_prefix_conflicts) score -= 0.45; // hard penalty: title disagrees with number
  return Math.max(0, Math.min(1, score));
}

// ── Helpers ─────────────────────────────────────────────────────────────

function detectGames(title: string): GameCode[] {
  const games: GameCode[] = [];
  for (const rule of GAME_PREFIXES) {
    if (rule.pattern.test(title) && !games.includes(rule.game)) {
      games.push(rule.game);
    }
  }
  return games;
}

function detectVariant(title: string): { variant: string | null; forces_quarantine: boolean } {
  for (const rule of VARIANT_RULES) {
    if (rule.pattern.test(title)) {
      return { variant: rule.variant, forces_quarantine: rule.forces_quarantine === true };
    }
  }
  return { variant: null, forces_quarantine: false };
}

interface CardNumberCandidate {
  raw_match: string;
  games: readonly GameCode[];
  /** Parsed result via @cambridge-tcg/sku. */
  parsed: { game: GameCode; set: string; number: string; confirmed: boolean } | null;
}

function detectCardNumber(title: string): CardNumberCandidate[] {
  const out: CardNumberCandidate[] = [];
  for (const rule of CARD_NUMBER_RULES) {
    const m = title.match(rule.pattern);
    if (!m) continue;
    const raw = m[0];

    // For each candidate game, ask @cambridge-tcg/sku to parse the raw match.
    // The sku package walks its set-formats table; the first confirmed (or
    // catch-all) match wins. We carry the result through.
    let bestParsed: CardNumberCandidate["parsed"] = null;
    for (const game of rule.candidate_games) {
      const parsed = parseCardNumber(game, raw.toUpperCase().replace(/\s/g, ""));
      if (parsed && (bestParsed === null || (parsed.confirmed && !bestParsed.confirmed))) {
        bestParsed = { game, set: parsed.set, number: parsed.number, confirmed: parsed.confirmed };
        if (parsed.confirmed) break; // prefer confirmed format
      }
    }

    // Fallback: @cambridge-tcg/sku had no SET_FORMATS row for any candidate
    // game (anticipated games like fab/swu register no set-format yet), OR
    // the regex matched a literal the registered formats don't accept
    // (Weiß Schwarz E-prefix numbers, custom prefixes). Use the regex's
    // own capture groups, marked confirmed:false so confidence reflects
    // the uncertainty.
    if (bestParsed === null && m.length >= 3 && m[1] && m[2]) {
      bestParsed = {
        game: rule.candidate_games[0],
        set: m[1].toLowerCase().replace(/\s/g, ""),
        number: m[2].toLowerCase().replace(/\s/g, ""),
        confirmed: false,
      };
    }

    out.push({
      raw_match: raw,
      games: rule.candidate_games,
      parsed: bestParsed,
    });

    // First successful confirmed parse is usually the right one; we still
    // collect alternatives so the caller can audit.
    if (bestParsed !== null && bestParsed.confirmed) break;
  }
  return out;
}

function pickGame(
  card_candidates: CardNumberCandidate[],
  prefix_games: GameCode[],
): { game: GameCode | null; conflict: boolean; resolved_card: CardNumberCandidate["parsed"] | null } {
  // Use the prefix-game intersection with the card-number-game set when
  // possible. Conflict when both signals exist and disagree.

  if (card_candidates.length === 0 && prefix_games.length === 0) {
    return { game: null, conflict: false, resolved_card: null };
  }

  if (card_candidates.length === 0) {
    return { game: prefix_games[0] ?? null, conflict: false, resolved_card: null };
  }

  // Walk candidates in order; pick the first one whose game set
  // intersects the prefix games, else the first parsed-confirmed.
  let chosen: CardNumberCandidate | null = null;
  let conflict = false;

  for (const cand of card_candidates) {
    if (prefix_games.length === 0) {
      if (cand.parsed !== null) {
        chosen = cand;
        break;
      }
      continue;
    }
    // We have both. Pick the candidate that agrees with a prefix game.
    if (cand.parsed && prefix_games.includes(cand.parsed.game)) {
      chosen = cand;
      break;
    }
  }

  if (chosen === null && card_candidates.length > 0 && prefix_games.length > 0) {
    // Card number found, prefix found, no agreement → conflict.
    conflict = true;
    chosen = card_candidates[0];
  }

  if (chosen === null) {
    return { game: prefix_games[0] ?? null, conflict, resolved_card: null };
  }

  return {
    game: chosen.parsed?.game ?? null,
    conflict,
    resolved_card: chosen.parsed,
  };
}

function buildSku(parsed: NonNullable<CardNumberCandidate["parsed"]>, lang: string | null, variant: string | null): string {
  const segs = [parsed.game, parsed.set, parsed.number, lang ?? "en"];
  if (variant) segs.push(variant);
  return segs.join("-").toLowerCase();
}

// ── Public entry point ──────────────────────────────────────────────────

export interface ParseOptions {
  /** Drop tail text after a separator that often appears in eBay titles
   *  (e.g. "| eBay" — the platform appends this on some surfaces).
   *  Default true. */
  strip_trailing_separators?: boolean;
}

function cleanTitle(title: string, opts: ParseOptions): string {
  if (typeof title !== "string") return "";
  let t = title.trim();
  if (opts.strip_trailing_separators !== false) {
    t = t.replace(/\s*[|·]\s*ebay\b.*$/i, "");
  }
  // Collapse runs of whitespace.
  t = t.replace(/\s+/g, " ");
  return t;
}

/**
 * Parse an eBay title into a canonical-SKU candidate.
 *
 * Pure. Never throws. Always returns a `ParseAttempt`; downstream
 * decides write vs quarantine based on `confidence` and
 * `forces_quarantine`.
 */
export function parseEbayTitle(rawTitle: string, opts: ParseOptions = {}): ParseAttempt {
  const title = cleanTitle(typeof rawTitle === "string" ? rawTitle : "", opts);
  const notes: string[] = [];

  // Pass 1: card-number
  const card_candidates = detectCardNumber(title);
  if (card_candidates.length === 0) notes.push("no card-number pattern matched");

  // Pass 2: game-prefix
  const prefix_games = detectGames(title);
  if (prefix_games.length === 0) notes.push("no game-prefix matched");

  const { game, conflict, resolved_card } = pickGame(card_candidates, prefix_games);
  if (conflict) notes.push(`game-prefix-conflict: card_number=${card_candidates[0]?.parsed?.game ?? "?"} but prefix=${prefix_games.join(",")}`);

  // Pass 3: grade
  const grade = detectGrade(title);

  // Pass 4: language
  const lang_detection: LanguageDetection = detectLanguage(title, game);

  // Pass 5: variant
  const { variant, forces_quarantine: variant_forces_quarantine } = detectVariant(title);

  // Pass 6: condition keywords
  const condition = detectConditionKeywords(title);
  if (condition.exclude) notes.push(`condition-exclusion: ${condition.excluded_keywords.join(",")}`);

  // Confidence scoring
  const score = scoreConfidence({
    has_card_number: card_candidates.length > 0,
    card_number_confirmed_format: resolved_card?.confirmed === true,
    game_prefix_matched: prefix_games.length > 0,
    game_prefix_conflicts: conflict,
    candidate_set_format_known: resolved_card !== null,
    has_language_signal: lang_detection.source !== "unknown" && lang_detection.source !== "game-default",
    has_grade: grade.grade_company !== null,
  });

  let sku: string | null = null;
  if (resolved_card !== null && game !== null && !conflict) {
    sku = buildSku(resolved_card, lang_detection.lang ?? "en", variant);
  }

  return {
    sku,
    confidence: score,
    game,
    set: resolved_card?.set ?? null,
    number: resolved_card?.number ?? null,
    lang: lang_detection.lang,
    variant,
    grade,
    condition,
    forces_quarantine: condition.exclude || variant_forces_quarantine,
    notes,
  };
}
