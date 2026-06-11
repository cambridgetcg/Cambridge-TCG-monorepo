// CardRush scraper configuration
// Product-group IDs verified by scraping cardrush-*.jp homepages
//
// SKU assembly uses `buildSku()` from `@/lib/sku` (the wholesale compat
// module) — emits legacy form today, canonical after migration 0015 +
// SKU_FORM flip. See `docs/connections/the-drift-reconciliation.md`
// (kingdom-070) and `apps/wholesale/src/lib/sku.ts`.

import { buildSku } from "@/lib/sku";
import { parseCardNumber } from "@cambridge-tcg/sku";

export interface GameParseConfig {
  cardNumberRegex: RegExp;
  parallelIndicators: string[];
  parallelRarityCheck: (rarity: string) => boolean;
  specialCards: Record<string, string>; // name substring → cardNumber
}

export interface GameMapConfig {
  generateBaseSku: (cardNumber: string, setCode: string) => string;
  cleanNameExtra?: (name: string) => string;
}

export interface GameConfig {
  code: string;
  baseUrl: string;
  cardNumberPrefixes: string[];
  sealedListId: number;
  s3Bucket: string;
  dbGameCode: string;
  dbGameName: string;
  dbGameSlug: string;
  parse: GameParseConfig;
  map: GameMapConfig;
}

// ---------------------------------------------------------------------------
// Per-game parse + map configs
// ---------------------------------------------------------------------------

const ONEPIECE_PARSE: GameParseConfig = {
  cardNumberRegex: /\{((?:OP|ST|EB|PRB)\d{2}-\d{3}|[PE]-\d{3})/,
  parallelIndicators: ["パラレル", "/P"],
  parallelRarityCheck: (rarity) => rarity.includes("P"),
  specialCards: { "ドン!!": "DON", "{P}": "P" },
};

const ONEPIECE_MAP: GameMapConfig = {
  generateBaseSku: (cardNumber) => {
    // Special promo symbols. The set-format registry handles
    // `P-NNN` / `E-NNN` / `P-2ANNY-NNN` patterns, but the bare DON / {P}
    // glyphs come through as un-numbered strings; keep the explicit
    // override for those.
    if (cardNumber === "DON" || cardNumber === "P") {
      return buildSku({
        game: "op",
        set: "promo",
        number: cardNumber.toLowerCase(),
        lang: "ja",
      });
    }

    // Delegate to the typed set-format registry in @cambridge-tcg/sku.
    // Recognises OP01..15, ST01..28, EB01..N, PRB01..N, PCC04..N, plus
    // promo forms (P-NNN, P-2ANNY-NNN, etc.) without hand-editing this
    // file. New publisher prefixes appear in `pnpm audit:set-discovery`
    // as `confirmed: false` matches that the operator can promote when
    // ready.
    const parts = parseCardNumber("op", cardNumber);
    if (!parts) {
      // Unparseable — emit set:"unknown"; the audit will surface this
      // row so the operator can extend the registry.
      return buildSku({
        game: "op",
        set: "unknown",
        number: cardNumber.toLowerCase(),
        lang: "ja",
      });
    }
    return buildSku({
      game: "op",
      set: parts.set,
      number: parts.number,
      lang: "ja",
    });
  },
};

const DRAGONBALL_PARSE: GameParseConfig = {
  cardNumberRegex: /\{((?:FB|FS|SB)\d{2}-\d{3})/,
  parallelIndicators: ["パラレル", "/P"],
  parallelRarityCheck: (rarity) => rarity.includes("P"),
  specialCards: {},
};

const DRAGONBALL_MAP: GameMapConfig = {
  generateBaseSku: (cardNumber) => {
    const parts = parseCardNumber("dbf", cardNumber);
    if (!parts) {
      return buildSku({
        game: "dbf",
        set: "unknown",
        number: cardNumber.toLowerCase(),
        lang: "ja",
      });
    }
    return buildSku({
      game: "dbf",
      set: parts.set,
      number: parts.number,
      lang: "ja",
    });
  },
};

const POKEMON_PARSE: GameParseConfig = {
  cardNumberRegex: /\{(\d{3}\/\d{3})\}/,
  parallelIndicators: ["ミラー"],
  parallelRarityCheck: () => false,
  specialCards: {},
};

const POKEMON_MAP: GameMapConfig = {
  generateBaseSku: (cardNumber, setCode) => {
    // CardNumber is like "025/202"; take the number-before-slash.
    const num = cardNumber.split("/")[0];
    return buildSku({ game: "pkm", set: setCode, number: num, lang: "ja" });
  },
  cleanNameExtra: (name) => name.replace(/\[[^\]]+\]/g, ""),
};

export const GAME_CONFIGS: Record<string, GameConfig> = {
  onepiece: {
    code: "onepiece",
    baseUrl: "https://www.cardrush-op.jp",
    cardNumberPrefixes: ["OP", "ST", "EB", "PRB"],
    sealedListId: 4,
    s3Bucket: "jp-op-photos",
    dbGameCode: "op",
    dbGameName: "One Piece",
    dbGameSlug: "one-piece",
    parse: ONEPIECE_PARSE,
    map: ONEPIECE_MAP,
  },
  dragonball: {
    code: "dragonball",
    baseUrl: "https://www.cardrush-db.jp",
    cardNumberPrefixes: ["FB", "FS", "SB"],
    sealedListId: 0, // TODO: discover sealed list ID
    s3Bucket: "jp-db-photos",
    dbGameCode: "dbf",
    dbGameName: "Dragon Ball Fusion World",
    dbGameSlug: "dragon-ball-fusion-world",
    parse: DRAGONBALL_PARSE,
    map: DRAGONBALL_MAP,
  },
  pokemon: {
    code: "pokemon",
    baseUrl: "https://www.cardrush-pokemon.jp",
    cardNumberPrefixes: [],
    sealedListId: 0, // TODO: discover sealed list ID
    s3Bucket: "jp-pk-photos",
    dbGameCode: "pkm",
    dbGameName: "Pokémon",
    dbGameSlug: "pokemon",
    parse: POKEMON_PARSE,
    map: POKEMON_MAP,
  },
};

export function getGameConfig(gameCode: string): GameConfig | undefined {
  return GAME_CONFIGS[gameCode];
}

export interface SetConfig {
  code: string;
  name: string;
  productGroupId: number;
  gameCode: string;
  maxPages?: number; // Override default page limit (default: 20)
}

// Verified product-group IDs from cardrush-op.jp
export const SET_CONFIGS: Record<string, SetConfig> = {
  // Main booster sets
  OP01: { code: "OP01", name: "Romance Dawn", productGroupId: 27, gameCode: "onepiece" },
  OP02: { code: "OP02", name: "Paramount War", productGroupId: 28, gameCode: "onepiece" },
  OP03: { code: "OP03", name: "Pillars of Strength", productGroupId: 29, gameCode: "onepiece" },
  OP04: { code: "OP04", name: "Kingdoms of Intrigue", productGroupId: 30, gameCode: "onepiece" },
  OP05: { code: "OP05", name: "Awakening of the New Era", productGroupId: 31, gameCode: "onepiece" },
  OP06: { code: "OP06", name: "Wings of the Captain", productGroupId: 35, gameCode: "onepiece" },
  OP07: { code: "OP07", name: "500 Years in the Future", productGroupId: 41, gameCode: "onepiece" },
  OP08: { code: "OP08", name: "Two Legends", productGroupId: 44, gameCode: "onepiece" },
  OP09: { code: "OP09", name: "The Four Emperors", productGroupId: 53, gameCode: "onepiece" },
  OP10: { code: "OP10", name: "Royal Blood", productGroupId: 54, gameCode: "onepiece" },
  OP11: { code: "OP11", name: "Godspeed Fist", productGroupId: 89, gameCode: "onepiece" },
  OP12: { code: "OP12", name: "Bond of Master and Student", productGroupId: 93, gameCode: "onepiece" },
  OP13: { code: "OP13", name: "Inherited Will", productGroupId: 103, gameCode: "onepiece" },
  OP14: { code: "OP14", name: "Seven Greats of the Azure Sea", productGroupId: 113, gameCode: "onepiece" },
  OP15: { code: "OP15", name: "Adventure on God's Island", productGroupId: 119, gameCode: "onepiece" },
  OP16: { code: "OP16", name: "Hour of the Decisive Battle", productGroupId: 124, gameCode: "onepiece" }, // 決戦の刻 — discovered 2026-06-11; check official EN name on release
  // Extra boosters
  EB01: { code: "EB01", name: "Memorial Collection", productGroupId: 40, gameCode: "onepiece" },
  EB02: { code: "EB02", name: "Anime 25th Collection", productGroupId: 59, gameCode: "onepiece" },
  EB03: { code: "EB03", name: "Heroines Edition", productGroupId: 112, gameCode: "onepiece" },
  EB04: { code: "EB04", name: "Egghead Crisis", productGroupId: 117, gameCode: "onepiece" },
  // Premium boosters
  PRB01: { code: "PRB01", name: "ONE PIECE CARD THE BEST", productGroupId: 52, gameCode: "onepiece" },
  PRB02: { code: "PRB02", name: "THE BEST vol.2", productGroupId: 102, gameCode: "onepiece" },
  // Premium card collections
  PCC04: { code: "PCC04", name: "Premium Card Collection: Best Selection vol.4", productGroupId: 91, gameCode: "onepiece" },
  PCC05: { code: "PCC05", name: "Premium Card Collection: Best Selection vol.5", productGroupId: 107, gameCode: "onepiece" },
  // Starter decks
  ST13: { code: "ST13", name: "Ultimate Deck: Bond of Three Brothers", productGroupId: 39, gameCode: "onepiece" },
  "ST15-20": { code: "ST15-20", name: "Starter Deck 6-Color (2024)", productGroupId: 45, gameCode: "onepiece" },
  ST21: { code: "ST21", name: "Starter Deck EX: Gear 5", productGroupId: 55, gameCode: "onepiece" },
  ST22: { code: "ST22", name: "Starter Deck: Ace & Newgate", productGroupId: 90, gameCode: "onepiece" },
  ST30: { code: "ST30", name: "Starter Deck EX: Luffy & Ace", productGroupId: 123, gameCode: "onepiece" }, // discovered 2026-06-11
  "ST23-28": { code: "ST23-28", name: "Starter Deck 6-Color (2025)", productGroupId: 95, gameCode: "onepiece" },
  // Promo sets
  PROMO: { code: "PROMO", name: "Promo Cards", productGroupId: 5, gameCode: "onepiece", maxPages: 50 },
  "P-2ANNY": { code: "P-2ANNY", name: "2nd Anniversary Set", productGroupId: 57, gameCode: "onepiece" },
  "P-3ANNY": { code: "P-3ANNY", name: "3rd Anniversary Set", productGroupId: 115, gameCode: "onepiece" },
  "P-2ANNY-CN": { code: "P-2ANNY-CN", name: "China 2nd Anniversary Set", productGroupId: 94, gameCode: "onepiece" }, // discovered 2026-06-11
  "P-2ANNY-EN": { code: "P-2ANNY-EN", name: "English 2nd Anniversary Set", productGroupId: 105, gameCode: "onepiece" }, // discovered 2026-06-11
  "P-START": { code: "P-START", name: "Starter Campaign Promo Pack", productGroupId: 58, gameCode: "onepiece" },
  "P-TREASURE": { code: "P-TREASURE", name: "Treasure Campaign Pack", productGroupId: 104, gameCode: "onepiece" },
  "P-SUPPLY": { code: "P-SUPPLY", name: "Supply Promo Cards", productGroupId: 92, gameCode: "onepiece" },
  "P-2025": { code: "P-2025", name: "Promo Card Set 2025", productGroupId: 110, gameCode: "onepiece" },
  // Storage box set
  "PRB01-BOX": { code: "PRB01-BOX", name: "THE BEST Storage Box Set", productGroupId: 56, gameCode: "onepiece" },

  // --- Dragon Ball Fusion World ---
  // Booster packs
  FB01: { code: "FB01", name: "Awakened Pulse", productGroupId: 16, gameCode: "dragonball" },
  FB02: { code: "FB02", name: "Blazing Aura", productGroupId: 27, gameCode: "dragonball" },
  FB03: { code: "FB03", name: "Roar of Anger", productGroupId: 29, gameCode: "dragonball" },
  FB04: { code: "FB04", name: "Beyond the Limit", productGroupId: 31, gameCode: "dragonball" },
  FB05: { code: "FB05", name: "Unknown Adventure", productGroupId: 44, gameCode: "dragonball" },
  FB06: { code: "FB06", name: "Approaching Threat", productGroupId: 45, gameCode: "dragonball" },
  FB07: { code: "FB07", name: "Wish to Shenron", productGroupId: 95, gameCode: "dragonball" },
  FB08: { code: "FB08", name: "Proud Fighting Race", productGroupId: 97, gameCode: "dragonball" },
  // Manga boosters
  SB01: { code: "SB01", name: "Manga Booster 01", productGroupId: 53, gameCode: "dragonball" },
  SB02: { code: "SB02", name: "Manga Booster 02", productGroupId: 96, gameCode: "dragonball" },
  // Starter decks
  FS01: { code: "FS01", name: "Starter Deck: Son Goku", productGroupId: 17, gameCode: "dragonball" },
  FS02: { code: "FS02", name: "Starter Deck: Vegeta", productGroupId: 18, gameCode: "dragonball" },
  FS03: { code: "FS03", name: "Starter Deck: Broly", productGroupId: 19, gameCode: "dragonball" },
  FS04: { code: "FS04", name: "Starter Deck: Frieza", productGroupId: 20, gameCode: "dragonball" },
  FS05: { code: "FS05", name: "Starter Deck: Bardock", productGroupId: 30, gameCode: "dragonball" },
  FS06: { code: "FS06", name: "Starter Deck: Son Goku Mini", productGroupId: 32, gameCode: "dragonball" },
  FS07: { code: "FS07", name: "Starter Deck: Vegeta Mini", productGroupId: 33, gameCode: "dragonball" },
  FS08: { code: "FS08", name: "Starter Deck: Vegeta Mini SS3", productGroupId: 46, gameCode: "dragonball" },
  FS09: { code: "FS09", name: "Starter Deck EX: Shallot", productGroupId: 50, gameCode: "dragonball" },
  FS10: { code: "FS10", name: "Starter Deck EX: Giblet", productGroupId: 51, gameCode: "dragonball" },
  // Promo & event sets
  "DB-PROMO": { code: "DB-PROMO", name: "Promotion Cards", productGroupId: 22, gameCode: "dragonball", maxPages: 50 },
  "DB-STARTER-BONUS": { code: "DB-STARTER-BONUS", name: "Start Deck Bonus Pack", productGroupId: 23, gameCode: "dragonball" },
  "DB-BATTLE": { code: "DB-BATTLE", name: "Battle Pack", productGroupId: 24, gameCode: "dragonball" },
  "DB-PCC01": { code: "DB-PCC01", name: "Premium Card Collection 01 -Leaders-", productGroupId: 35, gameCode: "dragonball" },
  "DB-ULTIMATE": { code: "DB-ULTIMATE", name: "Ultimate Battle", productGroupId: 36, gameCode: "dragonball" },
  "DB-CHAMP": { code: "DB-CHAMP", name: "Championship", productGroupId: 37, gameCode: "dragonball" },
  "DB-SELECT": { code: "DB-SELECT", name: "Selectable Promotion Cards", productGroupId: 39, gameCode: "dragonball" },
  "DB-ANNY01": { code: "DB-ANNY01", name: "Anniversary Pack 01", productGroupId: 40, gameCode: "dragonball" },
  "DB-ANNY02": { code: "DB-ANNY02", name: "Anniversary Pack 02", productGroupId: 41, gameCode: "dragonball" },
  "DB-ANNY03": { code: "DB-ANNY03", name: "Anniversary Pack 03", productGroupId: 42, gameCode: "dragonball" },
  "DB-LP01": { code: "DB-LP01", name: "Limited Pack 01", productGroupId: 47, gameCode: "dragonball" },
  "DB-1ANNY": { code: "DB-1ANNY", name: "1st Anniversary Set", productGroupId: 49, gameCode: "dragonball" },
  "DB-FSEX": { code: "DB-FSEX", name: "Starter Deck EX Shallot + Giblet", productGroupId: 52, gameCode: "dragonball" },
  "DB-LPMANGA": { code: "DB-LPMANGA", name: "Limited Pack MANGA", productGroupId: 55, gameCode: "dragonball" },
  "DB-LP02": { code: "DB-LP02", name: "Limited Pack 02", productGroupId: 65, gameCode: "dragonball" },

  // --- Pokémon TCG ---
  // MEGA era (M-series)
  M3: { code: "M3", name: "ムニキスゼロ", productGroupId: 533, gameCode: "pokemon" },
  M2A: { code: "M2A", name: "MEGA バンドルデッキ", productGroupId: 509, gameCode: "pokemon" },
  M2: { code: "M2", name: "超電ブレイカー MEGA", productGroupId: 501, gameCode: "pokemon" },
  M1L: { code: "M1L", name: "MEGA ルガルガン", productGroupId: 488, gameCode: "pokemon" },
  M1S: { code: "M1S", name: "MEGA サーナイト", productGroupId: 488, gameCode: "pokemon" },
  "M-START": { code: "M-START", name: "MEGA Starters", productGroupId: 500, gameCode: "pokemon" },

  // Scarlet & Violet (SV)
  SV11B: { code: "SV11B", name: "ガイアクライシス", productGroupId: 476, gameCode: "pokemon" },
  SV11W: { code: "SV11W", name: "ディストピアフォール", productGroupId: 476, gameCode: "pokemon" },
  SV10: { code: "SV10", name: "スーパーエレクトリックブリーダーズ", productGroupId: 457, gameCode: "pokemon" },
  SV9A: { code: "SV9A", name: "超イブ", productGroupId: 449, gameCode: "pokemon" },
  SV9: { code: "SV9", name: "サイバージャッジ", productGroupId: 427, gameCode: "pokemon" },
  SV8A: { code: "SV8A", name: "テラスタルフェスex", productGroupId: 416, gameCode: "pokemon" },
  SV8: { code: "SV8", name: "超電ブレイカー", productGroupId: 411, gameCode: "pokemon" },
  SV7A: { code: "SV7A", name: "ステラミラクル", productGroupId: 409, gameCode: "pokemon" },
  SV7: { code: "SV7", name: "星屑キラメキ", productGroupId: 327, gameCode: "pokemon" },
  SV6A: { code: "SV6A", name: "ナイトワンダラー", productGroupId: 318, gameCode: "pokemon" },
  SV6: { code: "SV6", name: "変幻の仮面", productGroupId: 311, gameCode: "pokemon" },
  SV5A: { code: "SV5A", name: "クリムゾンヘイズ", productGroupId: 310, gameCode: "pokemon" },
  SV5K: { code: "SV5K", name: "ワイルドフォース", productGroupId: 302, gameCode: "pokemon" },
  SV5M: { code: "SV5M", name: "サイバージャッジ", productGroupId: 302, gameCode: "pokemon" },
  SV4A: { code: "SV4A", name: "シャイニートレジャーex", productGroupId: 300, gameCode: "pokemon" },
  SV4K: { code: "SV4K", name: "古代の咆哮", productGroupId: 298, gameCode: "pokemon" },
  SV4M: { code: "SV4M", name: "未来の一閃", productGroupId: 298, gameCode: "pokemon" },
  SV3A: { code: "SV3A", name: "レイジングサーフ", productGroupId: 294, gameCode: "pokemon" },
  SV3: { code: "SV3", name: "黒炎の支配者", productGroupId: 286, gameCode: "pokemon" },
  SV2A: { code: "SV2A", name: "ポケモンカード151", productGroupId: 284, gameCode: "pokemon" },
  SV2D: { code: "SV2D", name: "クレイバースト", productGroupId: 280, gameCode: "pokemon" },
  SV2P: { code: "SV2P", name: "スノーハザード", productGroupId: 280, gameCode: "pokemon" },
  SV1A: { code: "SV1A", name: "トリプレットビート", productGroupId: 276, gameCode: "pokemon" },
  SV1S: { code: "SV1S", name: "スカーレットex", productGroupId: 266, gameCode: "pokemon" },
  SV1V: { code: "SV1V", name: "バイオレットex", productGroupId: 266, gameCode: "pokemon" },

  // Sword & Shield (S)
  S12A: { code: "S12A", name: "VSTARユニバース", productGroupId: 261, gameCode: "pokemon" },
  S12: { code: "S12", name: "パラダイムトリガー", productGroupId: 251, gameCode: "pokemon" },
  S11A: { code: "S11A", name: "インセクトアロー", productGroupId: 247, gameCode: "pokemon" },
  S11: { code: "S11", name: "ロストアビス", productGroupId: 241, gameCode: "pokemon" },
  S10B: { code: "S10B", name: "Pokemon GO", productGroupId: 240, gameCode: "pokemon" },
  S10A: { code: "S10A", name: "ダークファンタズマ", productGroupId: 236, gameCode: "pokemon" },
  S10D: { code: "S10D", name: "タイムゲイザー", productGroupId: 235, gameCode: "pokemon" },
  S10P: { code: "S10P", name: "スペースジャグラー", productGroupId: 235, gameCode: "pokemon" },
  S9A: { code: "S9A", name: "バトルリージョン", productGroupId: 227, gameCode: "pokemon" },
  S9: { code: "S9", name: "スターバース", productGroupId: 223, gameCode: "pokemon" },
  S8B: { code: "S8B", name: "VMAXクライマックス", productGroupId: 219, gameCode: "pokemon" },
  S8A: { code: "S8A", name: "25thアニバーサリーコレクション", productGroupId: 217, gameCode: "pokemon" },
  S8: { code: "S8", name: "フュージョンアーツ", productGroupId: 215, gameCode: "pokemon" },
  S7R: { code: "S7R", name: "蒼空ストリーム", productGroupId: 175, gameCode: "pokemon" },
  S7D: { code: "S7D", name: "摩天パーフェクト", productGroupId: 175, gameCode: "pokemon" },
  S6A: { code: "S6A", name: "イーブイヒーローズ", productGroupId: 173, gameCode: "pokemon" },
  S6K: { code: "S6K", name: "漆黒のガイスト", productGroupId: 172, gameCode: "pokemon" },
  S6H: { code: "S6H", name: "白銀のランス", productGroupId: 172, gameCode: "pokemon" },
  S5A: { code: "S5A", name: "双璧のファイター", productGroupId: 171, gameCode: "pokemon" },
  S5I: { code: "S5I", name: "一撃マスター", productGroupId: 166, gameCode: "pokemon" },
  S5R: { code: "S5R", name: "連撃マスター", productGroupId: 166, gameCode: "pokemon" },
  S4A: { code: "S4A", name: "シャイニースターV", productGroupId: 163, gameCode: "pokemon" },
  S4: { code: "S4", name: "仰天のボルテッカー", productGroupId: 155, gameCode: "pokemon" },
  S3A: { code: "S3A", name: "伝説の鼓動", productGroupId: 148, gameCode: "pokemon" },
  S3: { code: "S3", name: "ムゲンゾーン", productGroupId: 145, gameCode: "pokemon" },
  S2A: { code: "S2A", name: "爆炎ウォーカー", productGroupId: 139, gameCode: "pokemon" },
  S2: { code: "S2", name: "反逆クラッシュ", productGroupId: 127, gameCode: "pokemon" },
  S1A: { code: "S1A", name: "VMAXライジング", productGroupId: 126, gameCode: "pokemon" },
  S1: { code: "S1", name: "ソード", productGroupId: 113, gameCode: "pokemon" },

  // Sun & Moon (SM)
  SM12A: { code: "SM12A", name: "タッグオールスターズ", productGroupId: 83, gameCode: "pokemon" },
  SM12: { code: "SM12", name: "アルタージェネシス", productGroupId: 54, gameCode: "pokemon" },
  SM11B: { code: "SM11B", name: "ドリームリーグ", productGroupId: 53, gameCode: "pokemon" },
  SM11A: { code: "SM11A", name: "リミックスバウト", productGroupId: 52, gameCode: "pokemon" },
  SM11: { code: "SM11", name: "ミラクルツイン", productGroupId: 48, gameCode: "pokemon" },
  SM10B: { code: "SM10B", name: "スカイレジェンド", productGroupId: 46, gameCode: "pokemon" },
  SM10A: { code: "SM10A", name: "ジージーエンド", productGroupId: 42, gameCode: "pokemon" },
  SM10: { code: "SM10", name: "ダブルブレイズ", productGroupId: 38, gameCode: "pokemon" },
  SM9B: { code: "SM9B", name: "フルメタルウォール", productGroupId: 37, gameCode: "pokemon" },
  SM9A: { code: "SM9A", name: "ナイトユニゾン", productGroupId: 33, gameCode: "pokemon" },
  SM9: { code: "SM9", name: "タッグボルト", productGroupId: 31, gameCode: "pokemon" },
  SM8B: { code: "SM8B", name: "GXウルトラシャイニー", productGroupId: 21, gameCode: "pokemon" },
  SM8A: { code: "SM8A", name: "ダークオーダー", productGroupId: 20, gameCode: "pokemon" },
  SM8: { code: "SM8", name: "超爆インパクト", productGroupId: 15, gameCode: "pokemon" },

  // Promos
  "SV-PROMO": { code: "SV-PROMO", name: "SV Promo Cards", productGroupId: 260, gameCode: "pokemon", maxPages: 50 },
  "S-PROMO": { code: "S-PROMO", name: "S Promo Cards", productGroupId: 87, gameCode: "pokemon", maxPages: 50 },
  "SM-PROMO": { code: "SM-PROMO", name: "SM Promo Cards", productGroupId: 43, gameCode: "pokemon", maxPages: 50 },
};

export const MIN_PRICE_JPY = 0; // Include all cards regardless of price
export const ITEMS_PER_PAGE = 100;
export const REQUEST_DELAY_MS = 1500;

export function getSetConfig(setCode: string): SetConfig | undefined {
  return SET_CONFIGS[setCode.toUpperCase()];
}

export function getAllSetCodes(gameCode?: string): string[] {
  // Sort by product-group ID ascending so lower groups claim base SKUs first
  return Object.values(SET_CONFIGS)
    .filter((s) => !gameCode || s.gameCode === gameCode)
    .sort((a, b) => a.productGroupId - b.productGroupId)
    .map((s) => s.code);
}
