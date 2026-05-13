/**
 * Set-format registry — per-game ordered patterns for card-number → (set, number).
 *
 * Closes the rigidity named in [Yu, 2026-05-13]: *"The roll out of EB01
 * when One Piece has been OP01, 02, 03 all along. Give the protocol
 * flexibility."* — when a publisher ships a new prefix (Extra Booster,
 * Premium Booster, Anniversary Collection), the canonical SKU spec
 * already accommodates it (the `set` segment is `[a-z0-9]+` — anything
 * lowercased works). The rigidity lived in the *tooling layer* — the
 * cardrush mapper's hand-coded per-game regex hardcoded which prefixes
 * it knew about. A new prefix = silent drop or wrong fallthrough.
 *
 * This module makes set-shape recognition a *data extension*, not a
 * code extension. New prefix = add a `SetFormat` row + flip `confirmed`
 * when first ingest succeeds. The pattern mirrors:
 *   - `GameMeta.confirmed` for game codes (kingdom-069)
 *   - `CARDRUSH_SUBDOMAINS[host].confirmed` for upstream subdomains (kingdom-064)
 *
 * Substrate-honest: an unrecognised format is **named**, not crashed.
 * The audit `pnpm audit:set-discovery` (kingdom-076) surfaces every
 * unregistered set_code found in the catalog so the operator knows
 * which new patterns reality has produced.
 *
 * Positional captures are used (not named groups) so this module
 * compiles down to ES2017 — wholesale's current target. The convention
 * is `setGroupIndex` (default 1) and `numberGroupIndex` (default 2).
 *
 * See `docs/connections/the-set-discovery.md` for the doctrine.
 */

import type { GameCode } from "./games";

// ── SetFormat shape ─────────────────────────────────────────────────────

export interface SetFormat {
  /** Game this format belongs to. */
  game: GameCode;
  /** Pattern with positional capture groups. By convention capture 1 is
   *  the set and capture 2 is the number — override via setGroupIndex /
   *  numberGroupIndex when the pattern uses a different layout. Anchored
   *  start-to-end (^…$); case-insensitive flag set since publishers vary
   *  on uppercase usage. */
  pattern: RegExp;
  /** Index of the capture group containing the set token. Default 1.
   *  Set to undefined when the format has no set in the pattern itself
   *  and uses `setOverride` (e.g. promo consolidation). */
  setGroupIndex?: number;
  /** Index of the capture group containing the number token. Default 2. */
  numberGroupIndex?: number;
  /** When the matched format implies a *different* set than what the
   *  regex captures (e.g. promo codes like `P-2ANNY-001` → set: "promo").
   *  Used for namespace consolidation. */
  setOverride?: string;
  /** One-line human-readable description. */
  description: string;
  /** Example card-numbers in this format. Used by the doc + audit. */
  examples: readonly string[];
  /** Whether the platform has ingested at least one card in this format.
   *  `false` = anticipated / pre-registered (the first match flips it).
   *  Mirrors the GameMeta.confirmed + cardrush subdomain patterns. */
  confirmed: boolean;
}

// ── Result of parsing one card-number ───────────────────────────────────

export interface CardNumberParts {
  /** The set segment, lowercased. */
  set: string;
  /** The number segment, lowercased. */
  number: string;
  /** Description of which `SetFormat` matched. Lets the audit and
   *  operator-facing pages name *why* the parse succeeded. */
  format_matched: string;
  /** Whether the matched format is platform-confirmed. */
  confirmed: boolean;
}

// ── The registry ────────────────────────────────────────────────────────

/**
 * Per-game ordered formats. Order matters: the parser walks the list
 * and returns the first match. Put more-specific patterns first
 * (e.g. `PRB\d{2}-\d{3}` before catch-all `[A-Z]{2,5}\d{2}-\d{3}`).
 *
 * The catch-all pattern at the end of each list is intentionally
 * permissive — it preserves card-numbers that don't fit any narrower
 * format so the row still parses; the `confirmed: false` flag signals
 * "audit-needed" so the discovery audit can flag it for operator review.
 *
 * To add a new format: append a row + run `pnpm audit:set-discovery`
 * + when the first real card arrives, flip `confirmed: true`.
 */
export const SET_FORMATS: Record<GameCode, readonly SetFormat[]> = {
  // ── One Piece TCG ────────────────────────────────────────────────────
  // Publisher: Bandai. SET_CONFIGS in wholesale tooling enumerates
  // ~30 known sets; this registry teaches the parser the shape, not
  // the inventory.
  op: [
    { game: "op", pattern: /^(OP\d{2})-(\d{3,4})$/i, description: "One Piece main booster (OP01..OPNN)", examples: ["OP01-001", "OP15-100"], confirmed: true },
    { game: "op", pattern: /^(ST\d{2})-(\d{3,4})$/i, description: "One Piece starter deck (ST01..STNN)", examples: ["ST01-001", "ST21-010"], confirmed: true },
    { game: "op", pattern: /^(EB\d{2})-(\d{3,4})$/i, description: "One Piece extra booster (EB01..EBNN) — Yu's example case", examples: ["EB01-001", "EB04-024"], confirmed: true },
    { game: "op", pattern: /^(PRB\d{2})-(\d{3,4})$/i, description: "One Piece premium booster (PRB01..PRBNN)", examples: ["PRB01-001"], confirmed: true },
    { game: "op", pattern: /^(PCC\d{2})-(\d{3,4})$/i, description: "One Piece premium card collection (PCC04..PCCNN)", examples: ["PCC04-001", "PCC05-010"], confirmed: true },
    // Promo formats — consolidate under set: "promo" via setOverride.
    { game: "op", pattern: /^P-(\d{3,4})$/i, setGroupIndex: undefined, numberGroupIndex: 1, setOverride: "promo", description: "One Piece promo (P-NNN)", examples: ["P-001"], confirmed: true },
    { game: "op", pattern: /^E-(\d{3,4})$/i, setGroupIndex: undefined, numberGroupIndex: 1, setOverride: "promo", description: "One Piece event promo (E-NNN)", examples: ["E-001"], confirmed: true },
    { game: "op", pattern: /^P-(\d?[A-Z]+)-(\d{3,4})$/i, description: "One Piece named promo set (P-2ANNY, P-START, etc.)", examples: ["P-2ANNY-001", "P-START-005"], confirmed: true },
    // Catch-all: 2-5 letter prefix + 2 digits + dash + 3-4 digits.
    // Anticipated future deluxe/anniversary sets land here as `confirmed: false`.
    { game: "op", pattern: /^([A-Z]{2,5}\d{2})-(\d{3,4})$/i, description: "One Piece catch-all (alphanumeric prefix + 2-digit + dash + 3-4 digit)", examples: [], confirmed: false },
  ],

  // ── Pokémon TCG ───────────────────────────────────────────────────────
  // Card-numbers often arrive as "025/202" (collector/total). The "set"
  // for slash-form comes from row context (publisher set code on the
  // card_sets table); the parser returns `_set_from_context` as a
  // sentinel the caller resolves.
  pkm: [
    // Slash form: capture 1 is the number; set comes from caller context.
    { game: "pkm", pattern: /^(\d{1,4})\/\d{1,4}$/, setGroupIndex: undefined, numberGroupIndex: 1, setOverride: "_set_from_context", description: "Pokémon collector/total form — set from row context", examples: ["025/202", "150/151"], confirmed: true },
    { game: "pkm", pattern: /^(SV\d{1,2}[A-Z]?)-(\d{1,4})$/i, description: "Pokémon Scarlet & Violet era", examples: ["SV01-001", "SV2A-150"], confirmed: true },
    { game: "pkm", pattern: /^(SM\d{1,2}[A-Z]?)-(\d{1,4})$/i, description: "Pokémon Sun & Moon era", examples: ["SM12-100", "SM8B-200"], confirmed: true },
    { game: "pkm", pattern: /^(S\d{1,2}[A-Z]?)-(\d{1,4})$/i, description: "Pokémon Sword & Shield era", examples: ["S12A-100", "S4-050"], confirmed: true },
    { game: "pkm", pattern: /^(M\d{1,2}[A-Z]?)-(\d{1,4})$/i, description: "Pokémon MEGA era", examples: ["M1L-001", "M2-100"], confirmed: true },
    { game: "pkm", pattern: /^([A-Z]{2,4}\d?[A-Z]?)-(\d{1,4})$/i, description: "Pokémon catch-all", examples: [], confirmed: false },
  ],

  // ── Magic: The Gathering ─────────────────────────────────────────────
  // Scryfall set codes are 3-5 letters lowercase. Card numbers are
  // small integers (1-N) but can include suffixes (★, †, ☆) for
  // collector specials. The catch-all is wide because MTG has many
  // edge cases (token series "T", commander "C", supplemental "PSPRG").
  mtg: [
    { game: "mtg", pattern: /^([a-z]{3,5})[-_/](\d{1,4}[a-z]?)$/i, description: "MTG <set>-<number> form", examples: ["otj-001", "lci-150", "woe-200a"], confirmed: true },
    { game: "mtg", pattern: /^([a-z0-9]+)-(\d{1,4})$/i, description: "MTG catch-all", examples: [], confirmed: false },
  ],

  // ── Yu-Gi-Oh! ────────────────────────────────────────────────────────
  // YGOPRODeck's set codes embed language (e.g. "LOB-EN001"). The
  // resolver in packages/data-ingest/src/ygoprodeck/normalize.ts strips
  // the language token; here we accept the un-stripped form too — set
  // capture skips the lang segment via positional layout.
  ygo: [
    // "LOB-EN001" — capture 1 is "LOB", lang segment is unused, capture 2 is "001"
    { game: "ygo", pattern: /^([A-Z]{2,4})-[A-Z]{2}(\d{3})$/i, description: "Yu-Gi-Oh! set-lang-number form (LOB-EN001)", examples: ["LOB-EN001", "RABB-EN001"], confirmed: true },
    { game: "ygo", pattern: /^([A-Z]{2,4}\d{2})-(\d{3,4})$/i, description: "Yu-Gi-Oh! set-number form (MP23-032)", examples: ["MP23-032"], confirmed: true },
    { game: "ygo", pattern: /^([A-Z0-9]{3,6})-(\d{3,4})$/i, description: "Yu-Gi-Oh! catch-all", examples: [], confirmed: false },
  ],

  // ── Dragon Ball Super CCG (legacy, "DBS") ────────────────────────────
  dbs: [
    { game: "dbs", pattern: /^(BT\d{2})-(\d{3,4})$/i, description: "DBS Booster (BT01..BTNN)", examples: ["BT21-001"], confirmed: true },
    { game: "dbs", pattern: /^(SD\d{2})-(\d{3,4})$/i, description: "DBS Starter Deck (SD01..SDNN)", examples: ["SD23-001"], confirmed: true },
    { game: "dbs", pattern: /^([A-Z]{2,4}\d{2})-(\d{3,4})$/i, description: "DBS catch-all", examples: [], confirmed: false },
  ],

  // ── Dragon Ball Super Fusion World (current, "DBF") ───────────────────
  dbf: [
    { game: "dbf", pattern: /^(FB\d{2})-(\d{3,4})$/i, description: "Fusion World booster (FB01..FBNN)", examples: ["FB01-001", "FB08-100"], confirmed: true },
    { game: "dbf", pattern: /^(FS\d{2})-(\d{3,4})$/i, description: "Fusion World starter (FS01..FSNN)", examples: ["FS01-001"], confirmed: true },
    { game: "dbf", pattern: /^(SB\d{2})-(\d{3,4})$/i, description: "Fusion World manga booster (SB01..SBNN)", examples: ["SB01-001"], confirmed: true },
    // DB-PROMO / DB-1ANNY etc — single token, no number; consolidated as set: "promo"
    { game: "dbf", pattern: /^DB-([A-Z0-9]+)$/i, setGroupIndex: undefined, numberGroupIndex: 1, setOverride: "promo", description: "Fusion World named promo (DB-PROMO, DB-1ANNY)", examples: ["DB-PROMO", "DB-1ANNY"], confirmed: true },
    { game: "dbf", pattern: /^([A-Z]{2,4}\d{2})-(\d{3,4})$/i, description: "Fusion World catch-all", examples: [], confirmed: false },
  ],

  // ── Weiß Schwarz ─────────────────────────────────────────────────────
  wei: [
    { game: "wei", pattern: /^([A-Z]{2,5}\/[A-Z0-9]+)-(\d{3,4})$/i, description: "Weiß Schwarz series/booster-number form (HOL/WE26-E001)", examples: ["HOL/WE26-E001"], confirmed: true },
    { game: "wei", pattern: /^([A-Z0-9]{2,8})-(\d{3,4})$/i, description: "Weiß Schwarz catch-all", examples: [], confirmed: false },
  ],

  // ── Cardfight!! Vanguard ─────────────────────────────────────────────
  vng: [
    { game: "vng", pattern: /^(D-[A-Z]{2}\d{2})\/(\d{3,4})$/i, description: "Vanguard D-series", examples: ["D-BT01/001"], confirmed: true },
    { game: "vng", pattern: /^(V-[A-Z]{2}\d{2})\/(\d{3,4})$/i, description: "Vanguard V-series", examples: ["V-BT01/001"], confirmed: true },
    { game: "vng", pattern: /^([A-Z0-9-]+)\/(\d{3,4})$/i, description: "Vanguard catch-all", examples: [], confirmed: false },
  ],

  // ── Digimon ──────────────────────────────────────────────────────────
  dmw: [
    { game: "dmw", pattern: /^(BT\d{2})-(\d{3,4})$/i, description: "Digimon booster", examples: ["BT01-001"], confirmed: true },
    { game: "dmw", pattern: /^(EX\d{2})-(\d{3,4})$/i, description: "Digimon EX series", examples: ["EX01-001"], confirmed: true },
    { game: "dmw", pattern: /^([A-Z]{2,4}\d{2})-(\d{3,4})$/i, description: "Digimon catch-all", examples: [], confirmed: false },
  ],

  // ── Battle Spirits Saga ──────────────────────────────────────────────
  bsr: [
    { game: "bsr", pattern: /^(BSS\d{2})-(\d{3,4})$/i, description: "BSS booster", examples: ["BSS01-001"], confirmed: true },
    { game: "bsr", pattern: /^([A-Z]{2,4}\d{2})-(\d{3,4})$/i, description: "BSS catch-all", examples: [], confirmed: false },
  ],

  // ── Flesh and Blood ──────────────────────────────────────────────────
  fab: [
    { game: "fab", pattern: /^([A-Z]{3,4})(\d{3,4})$/i, description: "FaB set-prefix + number (WTR001)", examples: ["WTR001", "MON105"], confirmed: true },
    { game: "fab", pattern: /^([a-z0-9]+)-(\d{1,4})$/i, description: "FaB catch-all", examples: [], confirmed: false },
  ],

  // ── Lorcana ──────────────────────────────────────────────────────────
  lgr: [
    { game: "lgr", pattern: /^(\d{1,3})\/(\d{2,3})$/, setGroupIndex: undefined, numberGroupIndex: 1, setOverride: "_set_from_context", description: "Lorcana number/set-total form — set from row context", examples: ["1/204", "67/204"], confirmed: true },
    { game: "lgr", pattern: /^(set\d{2})-(\d{1,4})$/i, description: "Lorcana set-NN form", examples: ["set01-001"], confirmed: false },
  ],

  // ── Living Card Game umbrella ────────────────────────────────────────
  lcg: [
    { game: "lcg", pattern: /^([A-Z]{2,6}\d?)-(\d{1,4})$/i, description: "LCG catch-all", examples: [], confirmed: false },
  ],

  // ── Anticipated games (no formats yet — first ingest provides) ───────
  swu: [{ game: "swu", pattern: /^([A-Z]{3,5})-(\d{3,4})$/i, description: "Star Wars Unlimited catch-all", examples: [], confirmed: false }],
  sor: [{ game: "sor", pattern: /^([a-z0-9]+)-(\d{1,4})$/i, description: "Sorcery catch-all", examples: [], confirmed: false }],
  alt: [{ game: "alt", pattern: /^([A-Z0-9]+)-(\d{3,4})$/i, description: "Altered catch-all", examples: [], confirmed: false }],
  rft: [{ game: "rft", pattern: /^([A-Z0-9]+)-(\d{3,4})$/i, description: "Riftbound catch-all", examples: [], confirmed: false }],
  rsh: [{ game: "rsh", pattern: /^RD\/([A-Z]{2,4})-(\d{3,4})$/i, description: "Yu-Gi-Oh! Rush Duel", examples: ["RD/KP01-EN001"], confirmed: false }],
  pkp: [{ game: "pkp", pattern: /^([A-Z]\d{1,2})-(\d{3})$/i, description: "Pokémon Pocket (A1, A2 series)", examples: ["A1-001"], confirmed: false }],
  gen: [{ game: "gen", pattern: /^([A-Z0-9]+)-(\d{3,4})$/i, description: "Genshin TCG catch-all", examples: [], confirmed: false }],

  // ── Internal test ────────────────────────────────────────────────────
  tst: [{ game: "tst", pattern: /^([a-z0-9]+)-([a-z0-9]+)$/i, description: "Test catch-all", examples: [], confirmed: true }],
};

// ── parseCardNumber — the public helper ─────────────────────────────────

/**
 * Sentinel returned in `set` when a format matches a layout that
 * doesn't include the set token itself — e.g. Pokémon "025/202" or
 * Lorcana "1/204". The caller is expected to substitute the
 * publisher's set code from row context (typically the wholesale
 * `card_sets` table) before building the canonical SKU.
 */
export const SET_FROM_CONTEXT = "_set_from_context";

/**
 * Parse a raw publisher card-number into structured (set, number) parts
 * for the given game. Walks the game's registered formats in order and
 * returns the first match.
 *
 * Returns `null` when nothing matches — substrate-honest about unknown
 * inputs. The caller (typically the wholesale ingest tooling) should
 * either quarantine the row or push it through with `set: "unknown"`
 * + flag for the `audit:set-discovery` to surface.
 *
 * @example
 *   parseCardNumber("op", "OP01-001")
 *   // → { set: "op01", number: "001", format_matched: "One Piece main booster (OP01..OPNN)", confirmed: true }
 *
 *   parseCardNumber("op", "EB01-001")
 *   // → { set: "eb01", number: "001", format_matched: "One Piece extra booster (EB01..EBNN)…", confirmed: true }
 *
 *   parseCardNumber("op", "ACME99-001")
 *   // → { set: "acme99", number: "001", format_matched: "One Piece catch-all…", confirmed: false }
 *
 *   parseCardNumber("op", "garbage")
 *   // → null
 */
export function parseCardNumber(
  game: GameCode,
  raw: string,
): CardNumberParts | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const formats = SET_FORMATS[game];
  if (!formats || formats.length === 0) return null;

  for (const fmt of formats) {
    const m = raw.match(fmt.pattern);
    if (!m) continue;

    const setIdx = fmt.setGroupIndex ?? 1;
    const numIdx = fmt.numberGroupIndex ?? 2;
    // The set comes from setOverride when declared (promo-namespace
    // consolidation, _set_from_context sentinel), else from the regex's
    // capture at `setIdx`. Rules that want to suppress the captured set
    // entirely declare `setGroupIndex: undefined` *and* a `setOverride`;
    // the override always wins below.
    const setCaptured = m[setIdx];
    const numberCaptured = m[numIdx];

    const set = fmt.setOverride ?? setCaptured;
    const number = numberCaptured;

    if (!set || !number) continue;
    return {
      set: set.toLowerCase(),
      number: number.toLowerCase(),
      format_matched: fmt.description,
      confirmed: fmt.confirmed,
    };
  }
  return null;
}

/**
 * List every registered confirmed set-prefix for a game (the leading
 * letters before the digit pair). Used by the audit to ask: "is this
 * set_code likely under one of our confirmed format prefixes, or is it
 * a new shape?"
 */
export function knownSetPrefixes(game: GameCode): readonly string[] {
  const formats = SET_FORMATS[game] ?? [];
  const prefixes = new Set<string>();
  for (const fmt of formats) {
    if (!fmt.confirmed) continue;
    for (const ex of fmt.examples) {
      const m = ex.match(/^([A-Z]+)\d/i);
      if (m) prefixes.add(m[1].toUpperCase());
    }
  }
  return [...prefixes].sort();
}

/**
 * All registered set-format descriptions across all games — useful for
 * documentation + introspection (the audit lists these to the operator).
 */
export function listAllFormats(): readonly SetFormat[] {
  const out: SetFormat[] = [];
  for (const game of Object.keys(SET_FORMATS) as GameCode[]) {
    for (const fmt of SET_FORMATS[game]) out.push(fmt);
  }
  return out;
}
