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
  // (that is the whole definition of `confirmed`; reconciled 2026-07-05:
  //  op 3,438 / pkm 6,370 / dbf 1,622 cards verified in prod)
  op:  { code: "op",  name: "One Piece TCG",         publisher: "Bandai",    languages: ["ja", "en", "zh", "ko"], setCodeHint: "op<NN> (e.g. op01, op08)", confirmed: true },
  pkm: { code: "pkm", name: "Pokémon TCG",           publisher: "TPCi",      languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it", "pt"], setCodeHint: "publisher abbreviation (e.g. svobf, sv01, base)", confirmed: true },
  dbf: { code: "dbf", name: "Dragon Ball Super Fusion World", publisher: "Bandai", languages: ["en", "ja"], setCodeHint: "fb<NN> (e.g. fb01)", confirmed: true },
  // ── Registered, zero production cards (2026-07-05 reconciliation) ──
  // These nine previously claimed confirmed:true while the prod wholesale
  // DB held no cards for any of them — the registry lied about the
  // substrate. Flip each back the moment its first real cards land.
  // dmw: games row seeded 2026-07-05 (seed-game.mjs) + cardrush-digimon
  //      flipped confirmed in data-ingest — first cards expected from the
  //      next discovery+snapshot runs; flip true when they exist.
  mtg: { code: "mtg", name: "Magic: The Gathering",  publisher: "Wizards",   languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it", "pt", "ru"], setCodeHint: "3-letter code (e.g. otj, lci, woe)", confirmed: false },
  ygo: { code: "ygo", name: "Yu-Gi-Oh!",             publisher: "Konami",    languages: ["en", "ja", "zh", "ko", "fr", "de", "es", "it"], setCodeHint: "MP/POTE/RA/etc. (e.g. mp23, rabb)", confirmed: false },
  dbs: { code: "dbs", name: "Dragon Ball Super CCG", publisher: "Bandai",    languages: ["en", "ja"], setCodeHint: "bt/sd/promo (e.g. bt21, sd23)", confirmed: false },
  wei: { code: "wei", name: "Weiß Schwarz",          publisher: "Bushiroad", languages: ["ja", "en"], setCodeHint: "series abbreviation", confirmed: false },
  vng: { code: "vng", name: "Cardfight!! Vanguard",  publisher: "Bushiroad", languages: ["en", "ja"], setCodeHint: "d-bt / v-bt / g-bt etc.", confirmed: false },
  dmw: { code: "dmw", name: "Digimon Card Game",     publisher: "Bandai",    languages: ["en", "ja"], setCodeHint: "bt<NN> / ex<NN>", confirmed: false },
  bsr: { code: "bsr", name: "Battle Spirits Saga",   publisher: "Bandai",    languages: ["en", "ja"], setCodeHint: "bs<NN>", confirmed: false },
  lcg: { code: "lcg", name: "Living Card Game",      publisher: "various",   languages: ["en", "ja"], setCodeHint: "publisher-specific (LCG umbrella)", confirmed: false },
  fab: { code: "fab", name: "Flesh and Blood",       publisher: "LSS",       languages: ["en"], setCodeHint: "3-4 letter code (e.g. wtr, mon, ele)", confirmed: false },
  lgr: { code: "lgr", name: "Disney Lorcana",        publisher: "Ravensburger", languages: ["en", "fr", "de"], setCodeHint: "set<NN> / numbered set", confirmed: false },
  // ── Anticipated / pre-registered (no cards ingested yet) ───────────
  swu: { code: "swu", name: "Star Wars Unlimited",   publisher: "Fantasy Flight Games", languages: ["en", "fr", "de", "es", "it"], setCodeHint: "3-letter set abbreviation (e.g. sor, shd, twi)", confirmed: false },
  sor: { code: "sor", name: "Sorcery: Contested Realm", publisher: "Erik Olofsson", languages: ["en"], setCodeHint: "set abbreviation (e.g. beta, alp)", confirmed: false },
  alt: { code: "alt", name: "Altered TCG",           publisher: "Equinox",   languages: ["en", "fr"], setCodeHint: "set abbreviation (e.g. corehs)", confirmed: false },
  rft: { code: "rft", name: "Riftbound",             publisher: "Riot Games", languages: ["en"], setCodeHint: "publisher TBD; 2025+ launch", confirmed: false },
  rsh: { code: "rsh", name: "Yu-Gi-Oh! Rush Duel",   publisher: "Konami",    languages: ["ja", "en"], setCodeHint: "RD/<set> (parallel to ygo's main YGO codes)", confirmed: false },
  pkp: { code: "pkp", name: "Pokémon Pocket",        publisher: "TPCi",      languages: ["en", "ja", "zh", "ko", "es", "fr", "de", "it"], setCodeHint: "mobile-derived; A1/A2/PROMO style", confirmed: false },
  gen: { code: "gen", name: "Genshin Impact TCG",    publisher: "HoYoverse", languages: ["en", "zh", "ja", "ko"], setCodeHint: "publisher TBD", confirmed: false },
  // ── Internal ───────────────────────────────────────────────────────
  // tst is exempt from the production-DB definition: it exists so tests
  // can exercise the confirmed path without a real game.
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

/** Just the confirmed codes — cards exist in the production wholesale DB
 *  (plus the internal `tst`). */
export const CONFIRMED_GAME_CODES: readonly GameCode[] = GAME_CODES.filter(
  (c) => GAMES[c].confirmed,
);

/** Anticipated codes — registered but no cards yet. First ingest flips. */
export const ANTICIPATED_GAME_CODES: readonly GameCode[] = GAME_CODES.filter(
  (c) => !GAMES[c].confirmed && c !== "tst",
);
