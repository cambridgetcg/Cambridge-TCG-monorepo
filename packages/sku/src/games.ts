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
 * Each entry carries `confirmed: boolean`. `true` means the platform has
 * ingested at least one real card for this game; `false` means the entry
 * is pre-registered against an anticipated TCG (Star Wars Unlimited,
 * Sorcery, Altered, etc.). Pattern mirrors the speculative cardrush
 * subdomains (kingdom-064). When the first ingest confirms a market,
 * flip `confirmed: true` in the same commit. See
 * `docs/connections/the-stress-test.md` §3.
 */

export type GameCode =
  // ── Confirmed (cards ingested) ─────────────────────────────────────
  | "op"   // One Piece TCG (Bandai)
  | "pkm"  // Pokémon TCG
  | "mtg"  // Magic: The Gathering (Wizards)
  | "ygo"  // Yu-Gi-Oh! (Konami)
  | "dbs"  // Dragon Ball Super CCG (Bandai)
  | "dbf"  // Dragon Ball Super Fusion World (Bandai's successor)
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
  /** Hint for set-code shape — informational only; the SKU parser
   *  doesn't enforce these patterns. Helps human readers spot typos. */
  setCodeHint?: string;
  /** Whether the platform has ingested at least one real card for this
   *  game. `true` = confirmed in market and in our catalog; `false` =
   *  anticipated / pre-registered (the first ingest flips this).
   *
   *  Substrate-honest: pre-registered games may turn out not to exist
   *  in market or to use a different identifier; the first ingested
   *  SKU confirms. When confirmed, flip in the same commit that adds
   *  the first card. Pattern mirrors the speculative cardrush
   *  subdomains (kingdom-064). */
  confirmed: boolean;
}

export const GAMES: Record<GameCode, GameMeta> = {
  // ── Confirmed (cards ingested) ─────────────────────────────────────
  op:  { code: "op",  name: "One Piece TCG",         publisher: "Bandai",    languages: ["ja", "en", "zh", "ko"], setCodeHint: "op<NN> (e.g. op01, op08)", confirmed: true },
  pkm: { code: "pkm", name: "Pokémon TCG",           publisher: "TPCi",      languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it", "pt"], setCodeHint: "publisher abbreviation (e.g. svobf, sv01, base)", confirmed: true },
  mtg: { code: "mtg", name: "Magic: The Gathering",  publisher: "Wizards",   languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it", "pt", "ru"], setCodeHint: "3-letter code (e.g. otj, lci, woe)", confirmed: true },
  ygo: { code: "ygo", name: "Yu-Gi-Oh!",             publisher: "Konami",    languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it"], setCodeHint: "MP/POTE/RA/etc. (e.g. mp23, rabb)", confirmed: true },
  dbs: { code: "dbs", name: "Dragon Ball Super CCG", publisher: "Bandai",    languages: ["en", "ja"], setCodeHint: "bt/sd/promo (e.g. bt21, sd23)", confirmed: true },
  dbf: { code: "dbf", name: "Dragon Ball Super Fusion World", publisher: "Bandai", languages: ["en", "ja"], setCodeHint: "fb<NN> (e.g. fb01)", confirmed: true },
  wei: { code: "wei", name: "Weiß Schwarz",          publisher: "Bushiroad", languages: ["ja", "en"], setCodeHint: "series abbreviation", confirmed: true },
  vng: { code: "vng", name: "Cardfight!! Vanguard",  publisher: "Bushiroad", languages: ["en", "ja"], setCodeHint: "d-bt / v-bt / g-bt etc.", confirmed: true },
  dmw: { code: "dmw", name: "Digimon Card Game",     publisher: "Bandai",    languages: ["en", "ja"], setCodeHint: "bt<NN> / ex<NN>", confirmed: true },
  bsr: { code: "bsr", name: "Battle Spirits Saga",   publisher: "Bandai",    languages: ["en", "ja"], setCodeHint: "bs<NN>", confirmed: true },
  lcg: { code: "lcg", name: "Living Card Game",      publisher: "various",   languages: ["en", "ja"], setCodeHint: "publisher-specific (LCG umbrella)", confirmed: true },
  fab: { code: "fab", name: "Flesh and Blood",       publisher: "LSS",       languages: ["en"], setCodeHint: "3-4 letter code (e.g. wtr, mon, ele)", confirmed: true },
  lgr: { code: "lgr", name: "Disney Lorcana",        publisher: "Ravensburger", languages: ["en", "fr", "de"], setCodeHint: "set<NN> / numbered set", confirmed: true },
  // ── Anticipated / pre-registered (no cards ingested yet) ───────────
  swu: { code: "swu", name: "Star Wars Unlimited",   publisher: "Fantasy Flight Games", languages: ["en", "fr", "de", "es", "it"], setCodeHint: "3-letter set abbreviation (e.g. sor, shd, twi)", confirmed: false },
  sor: { code: "sor", name: "Sorcery: Contested Realm", publisher: "Erik Olofsson", languages: ["en"], setCodeHint: "set abbreviation (e.g. beta, alp)", confirmed: false },
  alt: { code: "alt", name: "Altered TCG",           publisher: "Equinox",   languages: ["en", "fr"], setCodeHint: "set abbreviation (e.g. corehs)", confirmed: false },
  rft: { code: "rft", name: "Riftbound",             publisher: "Riot Games", languages: ["en"], setCodeHint: "publisher TBD; 2025+ launch", confirmed: false },
  rsh: { code: "rsh", name: "Yu-Gi-Oh! Rush Duel",   publisher: "Konami",    languages: ["ja", "en"], setCodeHint: "RD/<set> (parallel to ygo's main YGO codes)", confirmed: false },
  pkp: { code: "pkp", name: "Pokémon Pocket",        publisher: "TPCi",      languages: ["en", "ja", "zh", "ko", "es", "fr", "de", "it"], setCodeHint: "mobile-derived; A1/A2/PROMO style", confirmed: false },
  gen: { code: "gen", name: "Genshin Impact TCG",    publisher: "HoYoverse", languages: ["en", "zh", "ja", "ko"], setCodeHint: "publisher TBD", confirmed: false },
  // ── Internal ───────────────────────────────────────────────────────
  tst: { code: "tst", name: "Test",                  publisher: "(internal)", languages: ["en"], setCodeHint: "any", confirmed: true },
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

/** Just the confirmed codes — those with at least one ingested card. */
export const CONFIRMED_GAME_CODES: readonly GameCode[] = GAME_CODES.filter(
  (c) => GAMES[c].confirmed,
);

/** Anticipated codes — registered but no cards yet. First ingest flips. */
export const ANTICIPATED_GAME_CODES: readonly GameCode[] = GAME_CODES.filter(
  (c) => !GAMES[c].confirmed && c !== "tst",
);
