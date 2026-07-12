/**
 * Registered game codes — the first segment of every Cambridge TCG SKU.
 *
 * Each TCG the platform catalogues has one entry here. The code is
 * 2–6 lowercase letters; it is the *only* place a game's identity is
 * named in the SKU. Adding a new game = adding one row here + (optionally)
 * one methodology hint about set-code shape.
 *
 * Spec: see `docs/methodology/sku-standard.md`.
 *
 * ── Confirmed vs anticipated ───────────────────────────────────────────
 *
 * Each entry carries `confirmed: boolean`. `confirmed: true` means
 * exactly one thing: **cards for this game exist in the production
 * wholesale DB** (games + cards tables — the substrate this registry
 * describes). `false` means the entry is pre-registered against an
 * anticipated or planned TCG. Pattern mirrors the speculative cardrush
 * subdomains (kingdom-064). When the first ingest lands real cards,
 * flip `confirmed: true` in the same commit. See
 * `docs/connections/the-stress-test.md` §3.
 *
 * Reconciled against the production wholesale DB 2026-07-05: only
 * op (3,438 cards), pkm (6,370) and dbf (1,622) hold cards. Nine codes
 * previously claimed `confirmed: true` with zero production cards —
 * substrate-honesty drift, now corrected. The `tst` code is internal
 * (never in prod by design) and exempt from the definition.
 */

export type GameCode =
  // ── Confirmed (cards exist in the production wholesale DB) ─────────
  | "op"   // One Piece TCG (Bandai)
  | "pkm"  // Pokémon TCG
  | "dbf"  // Dragon Ball Super Fusion World (Bandai's dbs successor)
  // ── Registered, no production cards yet ────────────────────────────
  | "mtg"  // Magic: The Gathering (Wizards)
  | "ygo"  // Yu-Gi-Oh! (Konami)
  | "dbs"  // Dragon Ball Super CCG (Bandai; superseded by dbf)
  | "wei"  // Weiß Schwarz (Bushiroad)
  | "vng"  // Cardfight!! Vanguard (Bushiroad)
  | "dmw"  // Digimon Card Game (Bandai)
  | "bsr"  // Battle Spirits Saga (Bandai)
  | "lcg"  // Living Card Game — Marvel Champions / LOTR LCG / etc.
  | "fab"  // Flesh and Blood (LSS)
  | "lgr"  // Lorcana (Ravensburger)
  // ── Anticipated / pre-registered (no cards ingested yet) ───────────
  | "swu"  // Star Wars Unlimited (Fantasy Flight Games)
  | "sor"  // Sorcery: Contested Realm (Erik Olofsson)
  | "alt"  // Altered TCG (Equinox)
  | "rft"  // Riftbound (Riot Games, 2025+)
  | "rsh"  // Yu-Gi-Oh! Rush Duel (Konami)
  | "pkp"  // Pokémon Pocket (mobile-derived TCG, TPCi)
  | "gen"  // Genshin Impact TCG (HoYoverse, planned)
  | "gcg"  // GUNDAM CARD GAME (Bandai, 2025 — trilingual simultaneous launch)
  | "una"  // UNION ARENA (Bandai, 2023 JP / 2024 NA)
  // ── Internal ───────────────────────────────────────────────────────
  | "tst"; // Test / internal

export interface GameMeta {
  /** The canonical 2–6 letter code used in every SKU. */
  code: GameCode;
  /** Human-readable game name. */
  name: string;
  /** Publisher / rights-holder. */
  publisher: string;
  /** ISO 639-1 language codes this game publishes in. The platform
   *  accepts SKUs in any of these; SKUs in other languages are
   *  allowed but flagged as non-canonical (publisher hasn't shipped). */
  languages: readonly string[];
  /** The catalog/URL slug — one truth for the code↔slug dual regime
   *  (the Atlas, spec 2026-07-07). Wholesale /api/v1/games slugs and
   *  every storefront route use this value. */
  slug: string;
  /** Official brand name — JSON-LD `brand`, SEO surfaces. */
  brand: string;
  /** Short display label for UI tabs/badges ("Dragon Ball", not the
   *  full product name). Optional — absent means `name` is already
   *  short enough. Review batch 2026-07-07: regex-trimming `name`
   *  regressed dbf's tab to its 31-char full name. */
  label?: string;
  /** FROZEN legacy uppercase SKU prefixes (the pre-canonical wholesale
   *  regime). Only the founding trio ever had them; new games enter
   *  canonical-only, so on-card prefixes of later games (e.g. gundam's
   *  ST/GD) can never collide — canonical SKUs carry the game code as
   *  first segment. */
  legacyPrefixes?: readonly string[];
  /** Hint for set-code shape — informational only; the SKU parser
   *  doesn't enforce these patterns. Helps human readers spot typos. */
  setCodeHint?: string;
  /** `true` = cards for this game exist in the production wholesale DB
   *  — that is the whole definition (reconciled against prod
   *  2026-07-05). `false` = registered/anticipated; the first ingest
   *  that lands real production cards flips it.
   *
   *  Substrate-honest: pre-registered games may turn out not to exist
   *  in market or to use a different identifier; the first ingested
   *  card confirms. Flip in the same commit that lands the first card.
   *  Pattern mirrors the speculative cardrush subdomains (kingdom-064).
   *  (`tst` is internal-only and exempt.) */
  confirmed: boolean;
}

export const GAMES: Record<GameCode, GameMeta> = {
  // ── Confirmed — cards exist in the production wholesale DB ─────────
  // (that is the whole definition of `confirmed`; live coverage evidence
  // reconciled 2026-07-11 confirms op, pkm, dbf, dmw, vng, and bsr)
  op:  { code: "op",  name: "One Piece TCG",         publisher: "Bandai",    languages: ["ja", "en", "zh", "ko"], slug: "one-piece", brand: "One Piece Card Game", legacyPrefixes: ["OP", "EB", "ST", "P", "PRB", "DON"], setCodeHint: "op<NN> (e.g. op01, op08)", label: "One Piece", confirmed: true },
  pkm: { code: "pkm", name: "Pokémon TCG",           publisher: "TPCi",      languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it", "pt"], slug: "pokemon", brand: "Pokémon Trading Card Game", legacyPrefixes: ["PK"], setCodeHint: "publisher abbreviation (e.g. svobf, sv01, base)", label: "Pokémon", confirmed: true },
  dbf: { code: "dbf", name: "Dragon Ball Super Fusion World", publisher: "Bandai", languages: ["en", "ja"], slug: "dragon-ball", brand: "Dragon Ball Super Card Game Fusion World", legacyPrefixes: ["FB", "SB"], setCodeHint: "fb<NN> (e.g. fb01)", label: "Dragon Ball", confirmed: true },
  // ── Registered games; flags follow production evidence ─────────────
  // Seven remain at zero production cards. Vanguard, Digimon, and Battle
  // Spirits flipped back to true when the public ground route showed real
  // archive rows joined to their catalog cards on 2026-07-11.
  mtg: { code: "mtg", name: "Magic: The Gathering",  publisher: "Wizards",   languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it", "pt", "ru"], slug: "magic", brand: "Magic: The Gathering", setCodeHint: "3-letter code (e.g. otj, lci, woe)", confirmed: false },
  ygo: { code: "ygo", name: "Yu-Gi-Oh!",             publisher: "Konami",    languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it"], slug: "yu-gi-oh", brand: "Yu-Gi-Oh! Trading Card Game", setCodeHint: "MP/POTE/RA/etc. (e.g. mp23, rabb)", confirmed: false },
  dbs: { code: "dbs", name: "Dragon Ball Super CCG", publisher: "Bandai",    languages: ["en", "ja"], slug: "dragon-ball-super", brand: "Dragon Ball Super Card Game", setCodeHint: "bt/sd/promo (e.g. bt21, sd23)", confirmed: false },
  wei: { code: "wei", name: "Weiß Schwarz",          publisher: "Bushiroad", languages: ["ja", "en"], slug: "weiss-schwarz", brand: "Weiß Schwarz", setCodeHint: "series abbreviation", confirmed: false },
  vng: { code: "vng", name: "Cardfight!! Vanguard",  publisher: "Bushiroad", languages: ["en", "ja"], slug: "vanguard", brand: "Cardfight!! Vanguard", setCodeHint: "d-bt / v-bt / g-bt etc.", label: "Vanguard", confirmed: true },
  dmw: { code: "dmw", name: "Digimon Card Game",     publisher: "Bandai",    languages: ["en", "ja"], slug: "digimon", brand: "Digimon Card Game", setCodeHint: "bt<NN> / ex<NN>", label: "Digimon", confirmed: true },
  bsr: { code: "bsr", name: "Battle Spirits Saga",   publisher: "Bandai",    languages: ["en", "ja"], slug: "battle-spirits", brand: "Battle Spirits Saga", setCodeHint: "bs<NN>", label: "Battle Spirits", confirmed: true },
  lcg: { code: "lcg", name: "Living Card Game",      publisher: "various",   languages: ["en", "ja"], slug: "living-card-game", brand: "Living Card Game", setCodeHint: "publisher-specific (LCG umbrella)", confirmed: false },
  fab: { code: "fab", name: "Flesh and Blood",       publisher: "LSS",       languages: ["en"], slug: "flesh-and-blood", brand: "Flesh and Blood", setCodeHint: "3-4 letter code (e.g. wtr, mon, ele)", confirmed: false },
  lgr: { code: "lgr", name: "Disney Lorcana",        publisher: "Ravensburger", languages: ["en", "fr", "de"], slug: "lorcana", brand: "Disney Lorcana", setCodeHint: "set<NN> / numbered set", confirmed: false },
  // ── Anticipated / pre-registered (no cards ingested yet) ───────────
  swu: { code: "swu", name: "Star Wars Unlimited",   publisher: "Fantasy Flight Games", languages: ["en", "fr", "de", "es", "it"], slug: "star-wars-unlimited", brand: "Star Wars: Unlimited", setCodeHint: "3-letter set abbreviation (e.g. sor, shd, twi)", confirmed: false },
  sor: { code: "sor", name: "Sorcery: Contested Realm", publisher: "Erik Olofsson", languages: ["en"], slug: "sorcery", brand: "Sorcery: Contested Realm", setCodeHint: "set abbreviation (e.g. beta, alp)", confirmed: false },
  alt: { code: "alt", name: "Altered TCG",           publisher: "Equinox",   languages: ["en", "fr"], slug: "altered", brand: "Altered TCG", setCodeHint: "set abbreviation (e.g. corehs)", confirmed: false },
  rft: { code: "rft", name: "Riftbound",             publisher: "Riot Games", languages: ["en"], slug: "riftbound", brand: "Riftbound", setCodeHint: "publisher TBD; 2025+ launch", confirmed: false },
  rsh: { code: "rsh", name: "Yu-Gi-Oh! Rush Duel",   publisher: "Konami",    languages: ["ja", "en"], slug: "rush-duel", brand: "Yu-Gi-Oh! Rush Duel", setCodeHint: "RD/<set> (parallel to ygo's main YGO codes)", confirmed: false },
  pkp: { code: "pkp", name: "Pokémon Pocket",        publisher: "TPCi",      languages: ["en", "ja", "zh", "ko", "es", "fr", "de", "it"], slug: "pokemon-pocket", brand: "Pokémon Trading Card Game Pocket", setCodeHint: "mobile-derived; A1/A2/PROMO style", confirmed: false },
  gen: { code: "gen", name: "Genshin Impact TCG",    publisher: "HoYoverse", languages: ["en", "zh", "ja", "ko"], slug: "genshin", brand: "Genshin Impact TCG", setCodeHint: "publisher TBD", confirmed: false },
  // gcg/una registered 2026-07-07 (the Atlas, spec 2026-07-07 §2) with
  // research-verified papers (run wf_2c020f23, adversarially verified).
  // NEITHER has a cardrush subdomain (all candidates NXDOMAIN) — Wave 3
  // sources: gundam-gcg.com official DB + yuyu-tei/dorasuta (gcg);
  // yuyu-tei/dorasuta/merucarduniari (una).
  gcg: { code: "gcg", name: "GUNDAM CARD GAME",      publisher: "Bandai",    languages: ["ja", "en", "zh"], /* zh = Simplified (grammar carries no script subtag) */ slug: "gundam", brand: "GUNDAM CARD GAME", setCodeHint: "st<NN>/gd<NN>/eb<NN> + no-digit special families (t-, rp-, exbp-, exrp-)", label: "Gundam", confirmed: false },
  una: { code: "una", name: "UNION ARENA",           publisher: "Bandai",    languages: ["ja", "en", "zh"], /* zh = Traditional (HK/TW program; no script subtag in grammar) */ slug: "union-arena", brand: "UNION ARENA", setCodeHint: "on-card SETCODE/TITLE-wave-seq; JP ua<NN>bt|st|nc, ex<NN>bt; NA ue<NN>bt, uex<NN>bt (regional renumbering)", label: "Union Arena", confirmed: false },
  // ── Internal ───────────────────────────────────────────────────────
  // tst is exempt from the production-DB definition: it exists so tests
  // can exercise the confirmed path without a real game.
  tst: { code: "tst", name: "Test",                  publisher: "(internal)", languages: ["en"], slug: "test", brand: "Test", setCodeHint: "any", confirmed: true },
};

/** Type-guard: is this string a registered game code? */
export function isGameCode(s: string): s is GameCode {
  return typeof s === "string" && Object.prototype.hasOwnProperty.call(GAMES, s);
}

/** Type-guard: is this string a registered AND confirmed game code? */
export function isConfirmedGameCode(s: string): s is GameCode {
  return isGameCode(s) && GAMES[s].confirmed;
}

/** Every game code currently registered, in the order they were added. */
export const GAME_CODES: readonly GameCode[] = Object.keys(GAMES) as GameCode[];

/** Just the confirmed codes — cards exist in the production wholesale DB
 *  (plus the internal `tst`). */
export const CONFIRMED_GAME_CODES: readonly GameCode[] = GAME_CODES.filter(
  (c) => GAMES[c].confirmed,
);

/** Anticipated codes — registered but no cards yet. First ingest flips. */
export const ANTICIPATED_GAME_CODES: readonly GameCode[] = GAME_CODES.filter(
  (c) => !GAMES[c].confirmed && c !== "tst",
);

/* ── The Atlas: slug-side helpers (spec 2026-07-07 the-atlas §1) ─────── */

/** Every game's slug, in registry order. */
export const GAME_SLUGS: readonly string[] = GAME_CODES.map((c) => GAMES[c].slug);

/** Confirmed games' slugs (cards exist in prod; includes internal tst). */
export const CONFIRMED_GAME_SLUGS: readonly string[] = CONFIRMED_GAME_CODES.map(
  (c) => GAMES[c].slug,
);

/** Type-guard: is this string a registered game's slug? */
export function isGameSlug(s: string): boolean {
  return GAME_CODES.some((c) => GAMES[c].slug === s);
}

/** Full meta for a slug, or null — the slug-side door into the Atlas. */
export function gameBySlug(slug: string): GameMeta | null {
  const code = GAME_CODES.find((c) => GAMES[c].slug === slug);
  return code ? GAMES[code] : null;
}

/** The slug for a code — the code-side door. */
export function slugForCode(code: GameCode): string {
  return GAMES[code].slug;
}
