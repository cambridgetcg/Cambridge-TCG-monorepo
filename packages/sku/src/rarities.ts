/**
 * @module @cambridge-tcg/sku/rarities
 *
 * Per-game rarity vocabulary + intra-game ordinal rank.
 *
 * **Per-game, not cross-game.** "Rare" in OPTCG ('R') and "Rare" in
 * Pokémon TCG ('R') and "Rare" in Magic ('R') name different positions
 * in different vocabularies, with different market-value distributions
 * and different print-rate semantics. The codebase does NOT model a
 * universal rarity tier — substrate-honest about per-game rarity vocab.
 *
 * Sort-by-rarity is enabled when exactly one game is selected in the
 * filter; disabled otherwise. See `/methodology/edition-variants` and
 * (planned) `/methodology/rarity-vocabulary`.
 *
 * This TS source is the canonical seed of the `rarity_map` table in
 * the wholesale RDS. The seed runner reads from here and writes via
 * idempotent UPSERTs. The audit `pnpm audit:rarity-mapping` (planned)
 * flags any `cards.rarity` value not present here for its game.
 *
 * ── To add a rarity ───────────────────────────────────────────────────
 *
 *   1. Find the game's entry below. If absent, add the game first to
 *      `./games.ts`, then create a `RARITIES[<code>]` entry here.
 *   2. Add the row with `publisher_rarity`, `ordinal` (higher = rarer),
 *      `display_name`, and an optional `palette_key`.
 *   3. Re-run the seed (TODO: `pnpm --filter @cambridge-tcg/admin seed-rarity-map`).
 *   4. The audit stops flagging cards that bear this rarity.
 */

import type { GameCode } from "./games";

export type RarityRow = {
  publisher_rarity: string;
  ordinal: number;
  display_name: string;
  palette_key?: string;
};

export type RarityMap = Partial<Record<GameCode, RarityRow[]>>;

/**
 * Per-game rarity vocabulary. Games absent from this map are not yet
 * seeded — sort-by-rarity stays disabled for them until populated.
 *
 * Cited upstream sources:
 *   - OPTCG: official Bandai card list (en.onepiece-cardgame.com)
 *   - Pokémon TCG: Pokémon TCG Live database + Bulbapedia rarity index
 *   - Magic: Scryfall (scryfall.com)
 *   - Yu-Gi-Oh!: YGOPRODeck (ygoprodeck.com) + Konami official set lists
 *   - Digimon / Dragon Ball: official Bandai card lists
 *   - Flesh and Blood: LSS official card database
 *   - Lorcana: Ravensburger official card database
 */
export const RARITIES: RarityMap = {
  // ── One Piece TCG (Bandai) ──────────────────────────────────────────
  op: [
    { publisher_rarity: "C",   ordinal: 1, display_name: "Common",       palette_key: "common" },
    { publisher_rarity: "UC",  ordinal: 2, display_name: "Uncommon",     palette_key: "uncommon" },
    { publisher_rarity: "R",   ordinal: 3, display_name: "Rare",         palette_key: "rare" },
    { publisher_rarity: "SR",  ordinal: 4, display_name: "Super Rare",   palette_key: "super-rare" },
    { publisher_rarity: "SEC", ordinal: 5, display_name: "Secret Rare",  palette_key: "secret-rare" },
    { publisher_rarity: "L",   ordinal: 4, display_name: "Leader",       palette_key: "leader" },
    { publisher_rarity: "P",   ordinal: 2, display_name: "Promo",        palette_key: "promo" },
    { publisher_rarity: "SP",  ordinal: 5, display_name: "Special Card", palette_key: "special" },
    { publisher_rarity: "TR",  ordinal: 6, display_name: "Treasure Rare",palette_key: "treasure" },
  ],

  // ── Pokémon TCG ─────────────────────────────────────────────────────
  pkm: [
    { publisher_rarity: "C",     ordinal: 1,  display_name: "Common",            palette_key: "common" },
    { publisher_rarity: "U",     ordinal: 2,  display_name: "Uncommon",          palette_key: "uncommon" },
    { publisher_rarity: "R",     ordinal: 3,  display_name: "Rare",              palette_key: "rare" },
    { publisher_rarity: "RH",    ordinal: 3,  display_name: "Reverse Holo",      palette_key: "rare" },
    { publisher_rarity: "HR",    ordinal: 4,  display_name: "Holo Rare",         palette_key: "holo" },
    { publisher_rarity: "V",     ordinal: 5,  display_name: "Pokémon V",         palette_key: "v-card" },
    { publisher_rarity: "VMAX",  ordinal: 6,  display_name: "Pokémon VMAX",      palette_key: "vmax" },
    { publisher_rarity: "VSTAR", ordinal: 6,  display_name: "Pokémon VSTAR",     palette_key: "vstar" },
    { publisher_rarity: "EX",    ordinal: 6,  display_name: "ex",                palette_key: "ex" },
    { publisher_rarity: "UR",    ordinal: 8,  display_name: "Ultra Rare",        palette_key: "ultra" },
    { publisher_rarity: "SR",    ordinal: 9,  display_name: "Special Rare",      palette_key: "secret-rare" },
    { publisher_rarity: "AR",    ordinal: 9,  display_name: "Art Rare",          palette_key: "art-rare" },
    { publisher_rarity: "SAR",   ordinal: 10, display_name: "Special Art Rare",  palette_key: "secret-art" },
    { publisher_rarity: "HYR",   ordinal: 11, display_name: "Hyper Rare",        palette_key: "hyper" },
  ],

  // ── Magic: The Gathering ────────────────────────────────────────────
  mtg: [
    { publisher_rarity: "C", ordinal: 1, display_name: "Common",          palette_key: "common" },
    { publisher_rarity: "U", ordinal: 2, display_name: "Uncommon",        palette_key: "uncommon" },
    { publisher_rarity: "R", ordinal: 3, display_name: "Rare",            palette_key: "rare" },
    { publisher_rarity: "M", ordinal: 4, display_name: "Mythic Rare",     palette_key: "mythic" },
    { publisher_rarity: "S", ordinal: 5, display_name: "Special / Bonus", palette_key: "special" },
  ],

  // ── Yu-Gi-Oh! ───────────────────────────────────────────────────────
  ygo: [
    { publisher_rarity: "C",    ordinal: 1, display_name: "Common",                       palette_key: "common" },
    { publisher_rarity: "R",    ordinal: 2, display_name: "Rare",                         palette_key: "rare" },
    { publisher_rarity: "SR",   ordinal: 3, display_name: "Super Rare",                   palette_key: "super-rare" },
    { publisher_rarity: "UR",   ordinal: 4, display_name: "Ultra Rare",                   palette_key: "ultra" },
    { publisher_rarity: "ScR",  ordinal: 5, display_name: "Secret Rare",                  palette_key: "secret-rare" },
    { publisher_rarity: "UtR",  ordinal: 6, display_name: "Ultimate Rare",                palette_key: "ultimate" },
    { publisher_rarity: "ColR", ordinal: 7, display_name: "Collector's Rare",             palette_key: "collector" },
    { publisher_rarity: "GR",   ordinal: 7, display_name: "Gold Rare",                    palette_key: "gold" },
    { publisher_rarity: "QcR",  ordinal: 8, display_name: "Quarter Century Secret Rare",  palette_key: "quarter-century" },
    { publisher_rarity: "PScR", ordinal: 8, display_name: "Prismatic Secret Rare",        palette_key: "prismatic" },
    { publisher_rarity: "GhR",  ordinal: 9, display_name: "Ghost Rare",                   palette_key: "ghost" },
  ],

  // ── Digimon Card Game (Bandai) ──────────────────────────────────────
  dmw: [
    { publisher_rarity: "C",   ordinal: 1, display_name: "Common",      palette_key: "common" },
    { publisher_rarity: "U",   ordinal: 2, display_name: "Uncommon",    palette_key: "uncommon" },
    { publisher_rarity: "R",   ordinal: 3, display_name: "Rare",        palette_key: "rare" },
    { publisher_rarity: "SR",  ordinal: 4, display_name: "Super Rare",  palette_key: "super-rare" },
    { publisher_rarity: "SEC", ordinal: 5, display_name: "Secret Rare", palette_key: "secret-rare" },
    { publisher_rarity: "P",   ordinal: 2, display_name: "Promo",       palette_key: "promo" },
  ],

  // ── Dragon Ball Super CCG (Bandai, legacy) ──────────────────────────
  dbs: [
    { publisher_rarity: "C",   ordinal: 1, display_name: "Common",       palette_key: "common" },
    { publisher_rarity: "UC",  ordinal: 2, display_name: "Uncommon",     palette_key: "uncommon" },
    { publisher_rarity: "R",   ordinal: 3, display_name: "Rare",         palette_key: "rare" },
    { publisher_rarity: "SR",  ordinal: 4, display_name: "Super Rare",   palette_key: "super-rare" },
    { publisher_rarity: "SCR", ordinal: 5, display_name: "Secret Rare",  palette_key: "secret-rare" },
    { publisher_rarity: "SPR", ordinal: 6, display_name: "Special Rare", palette_key: "special" },
  ],

  // ── Dragon Ball Super Fusion World (Bandai, current) ────────────────
  dbf: [
    { publisher_rarity: "C",   ordinal: 1, display_name: "Common",      palette_key: "common" },
    { publisher_rarity: "UC",  ordinal: 2, display_name: "Uncommon",    palette_key: "uncommon" },
    { publisher_rarity: "R",   ordinal: 3, display_name: "Rare",        palette_key: "rare" },
    { publisher_rarity: "SR",  ordinal: 4, display_name: "Super Rare",  palette_key: "super-rare" },
    { publisher_rarity: "SCR", ordinal: 5, display_name: "Secret Rare", palette_key: "secret-rare" },
    { publisher_rarity: "L",   ordinal: 4, display_name: "Leader",      palette_key: "leader" },
  ],

  // ── Flesh and Blood (LSS) ───────────────────────────────────────────
  fab: [
    { publisher_rarity: "C", ordinal: 1, display_name: "Common",    palette_key: "common" },
    { publisher_rarity: "R", ordinal: 3, display_name: "Rare",      palette_key: "rare" },
    { publisher_rarity: "M", ordinal: 4, display_name: "Majestic",  palette_key: "mythic" },
    { publisher_rarity: "L", ordinal: 5, display_name: "Legendary", palette_key: "legendary" },
    { publisher_rarity: "F", ordinal: 6, display_name: "Fabled",    palette_key: "fabled" },
  ],

  // ── Lorcana (Ravensburger) ──────────────────────────────────────────
  lgr: [
    { publisher_rarity: "C",         ordinal: 1, display_name: "Common",     palette_key: "common" },
    { publisher_rarity: "U",         ordinal: 2, display_name: "Uncommon",   palette_key: "uncommon" },
    { publisher_rarity: "R",         ordinal: 3, display_name: "Rare",       palette_key: "rare" },
    { publisher_rarity: "SR",        ordinal: 4, display_name: "Super Rare", palette_key: "super-rare" },
    { publisher_rarity: "L",         ordinal: 5, display_name: "Legendary",  palette_key: "legendary" },
    { publisher_rarity: "Enchanted", ordinal: 6, display_name: "Enchanted",  palette_key: "enchanted" },
  ],

  // ── GUNDAM CARD GAME (Bandai) — official filter: C/U/R/LR/P; no SR.
  // +/++/SP are PARALLEL TREATMENTS, not tiers, so they get no rows —
  // they arrive as variant suffixes on the base rarity (verified
  // 2026-07-07, gundam-gcg.com card search + GD01 50C/36U/32R/12LR).
  gcg: [
    { publisher_rarity: "C",  ordinal: 1, display_name: "Common",      palette_key: "common" },
    { publisher_rarity: "U",  ordinal: 2, display_name: "Uncommon",    palette_key: "uncommon" },
    { publisher_rarity: "R",  ordinal: 3, display_name: "Rare",        palette_key: "rare" },
    { publisher_rarity: "LR", ordinal: 4, display_name: "Legend Rare", palette_key: "secret-rare" },
    { publisher_rarity: "P",  ordinal: 2, display_name: "Promo",       palette_key: "promo" },
  ],

  // ── UNION ARENA (Bandai) — base C/U/R/SR + AP; ★-suffixed parallels
  // (to SR★★★) keep the same card number (variant, not tier); SP/UR/PR on
  // special products/promos (verified 2026-07-07, official UEX02BT composition
  // 30C/29U/16R/9SR/5AP).
  una: [
    { publisher_rarity: "C",  ordinal: 1, display_name: "Common",       palette_key: "common" },
    { publisher_rarity: "U",  ordinal: 2, display_name: "Uncommon",     palette_key: "uncommon" },
    { publisher_rarity: "R",  ordinal: 3, display_name: "Rare",         palette_key: "rare" },
    { publisher_rarity: "SR", ordinal: 4, display_name: "Super Rare",   palette_key: "super-rare" },
    { publisher_rarity: "AP", ordinal: 2, display_name: "Action Point", palette_key: "special" },
    { publisher_rarity: "PR", ordinal: 2, display_name: "Promo",        palette_key: "promo" },
    { publisher_rarity: "SP", ordinal: 5, display_name: "Special",      palette_key: "special" },
    { publisher_rarity: "UR", ordinal: 6, display_name: "Union Rare",   palette_key: "secret-rare" },
  ],

  // Games not yet seeded (wei, vng, lcg, bsr, swu, sor, alt, ...) are
  // absent from this map. Audit reports the first card of each unseeded
  // game so the operator knows when to extend this file.
};

/**
 * Lookup helper — returns the rarity row for (game, publisher_rarity)
 * or null if unmapped.
 */
export function lookupRarity(
  game: GameCode,
  publisherRarity: string,
): RarityRow | null {
  const rows = RARITIES[game];
  if (!rows) return null;
  return rows.find((r) => r.publisher_rarity === publisherRarity) ?? null;
}

/**
 * Sort helper — returns the ordinal for sorting. Unmapped rarities
 * return 0, which sorts them below all mapped rarities — substrate-
 * honestly without claiming a confident position.
 */
export function rarityOrdinal(
  game: GameCode,
  publisherRarity: string,
): number {
  return lookupRarity(game, publisherRarity)?.ordinal ?? 0;
}

/**
 * Returns all known rarities for a game, sorted by ordinal descending
 * (rarest first). Empty array for unseeded games.
 */
export function gameRarities(game: GameCode): RarityRow[] {
  return [...(RARITIES[game] ?? [])].sort((a, b) => b.ordinal - a.ordinal);
}

/**
 * Returns the list of game codes with seeded rarity vocabulary.
 */
export function seededRarityGames(): GameCode[] {
  return Object.keys(RARITIES) as GameCode[];
}
