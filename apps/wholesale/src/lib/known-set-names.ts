/**
 * Curated `(gameCode, setCode) → setName` mapping for the CardRush
 * discovery cron's auto-set-creation path.
 *
 * Why this file: CardRush product pages do not surface a set's display
 * name (their breadcrumbs are color-categorical, not set-categorical),
 * so the parser can ground set_code but not set_name. This map is the
 * operator's curated source of truth for names — mirroring (a slim
 * extract of) `apps/wholesale/tools/lib/config.ts` SET_CONFIGS, which is
 * already maintained for the scraper tools.
 *
 * When a new set appears on CardRush that isn't in this map, the
 * discovery still creates the `sets` row but with the code as a
 * placeholder name. Operator adds the new entry here in the same PR
 * that adds it to `tools/lib/config.ts`.
 *
 * Keys: uppercased `${gameCode}:${setCode}`. Game-qualified so future
 * cross-game code collisions stay distinct.
 *
 * Game codes are @cambridge-tcg/sku GameCodes ('op', 'pkm', 'dbf') —
 * matching games.code since migration 0022 (kingdom-039). The Dragon
 * Ball entries are Fusion World sets, hence 'dbf'.
 */

export const KNOWN_SET_NAMES: Record<string, string> = {
  // ── One Piece TCG ────────────────────────────────────────────────
  "op:OP01": "Romance Dawn",
  "op:OP02": "Paramount War",
  "op:OP03": "Pillars of Strength",
  "op:OP04": "Kingdoms of Intrigue",
  "op:OP05": "Awakening of the New Era",
  "op:OP06": "Wings of the Captain",
  "op:OP07": "500 Years in the Future",
  "op:OP08": "Two Legends",
  "op:OP09": "The Four Emperors",
  "op:OP10": "Royal Blood",
  "op:OP11": "Godspeed Fist",
  "op:OP12": "Bond of Master and Student",
  "op:OP13": "Inherited Will",
  "op:OP14": "Seven Greats of the Azure Sea",
  "op:OP15": "Adventure on God's Island",
  "op:OP16": "Hour of the Decisive Battle", // 決戦の刻, 2026-05-30; check official EN name on western release
  "op:OP17": "The World's Strongest Warrior", // 世界最強の戦士, 2026-08-22
  "op:EB01": "Memorial Collection",
  "op:EB02": "Anime 25th Collection",
  "op:EB03": "Heroines Edition",
  "op:EB04": "Egghead Crisis",
  "op:EB05": "Heroines Edition vol.2", // 2026-10
  "op:OP18": "Booster Pack (title TBA)", // 2026-11; rename when the publisher announces
  "op:PRB01": "ONE PIECE CARD THE BEST",
  "op:PRB02": "THE BEST vol.2",
  "op:PCC04": "Premium Card Collection: Best Selection vol.4",
  "op:PCC05": "Premium Card Collection: Best Selection vol.5",
  "op:ST13": "Ultimate Deck: Bond of Three Brothers",
  "op:ST21": "Starter Deck EX: Gear 5",
  "op:ST22": "Starter Deck: Ace & Newgate",
  "op:ST29": "Start Deck: EGGHEAD", // 2025-12-20
  "op:ST30": "Starter Deck EX: Luffy & Ace", // 2026-04-11
  "op:ST31": "Start Deck Red: Monkey.D.Luffy", // 2026-07-11 wave ↓
  "op:ST32": "Start Deck Green: Roronoa Zoro",
  "op:ST33": "Start Deck Blue: Kuzan",
  "op:ST34": "Start Deck Purple: Charlotte Katakuri",
  "op:ST35": "Start Deck Red/Black: Sabo",
  "op:ST36": "Start Deck Yellow: Eustass Kid",

  // ── Dragon Ball Fusion World ─────────────────────────────────────
  "dbf:FB01": "Awakened Pulse",
  "dbf:FB02": "Blazing Aura",
  "dbf:FB03": "Roar of Anger",
  "dbf:FB04": "Beyond the Limit",
  "dbf:FB05": "Unknown Adventure",
  "dbf:FB06": "Approaching Threat",
  "dbf:FB07": "Wish to Shenron",
  "dbf:FB08": "Proud Fighting Race",
  "dbf:SB01": "Manga Booster 01",
  "dbf:SB02": "Manga Booster 02",
  "dbf:FS01": "Starter Deck: Son Goku",
  "dbf:FS02": "Starter Deck: Vegeta",
  "dbf:FS03": "Starter Deck: Broly",
  "dbf:FS04": "Starter Deck: Frieza",
  "dbf:FS05": "Starter Deck: Bardock",
  "dbf:FS06": "Starter Deck: Son Goku Mini",
  "dbf:FS07": "Starter Deck: Vegeta Mini",
  "dbf:FS08": "Starter Deck: Vegeta Mini SS3",
  "dbf:FS09": "Starter Deck EX: Shallot",
  "dbf:FS10": "Starter Deck EX: Giblet",
  "dbf:FB09": "Dual Evolution", // 2026-03-14
  "dbf:FB10": "Cross Force", // 2026-06-13
  "dbf:FB11": "Brightness of Hope", // 2026-09-12
  "dbf:FB12": "Reach the God", // 2026-12-12
  "dbf:FS11": "Starter Deck EX: The Phase of Evolution", // 進化の境地, 2026-03-14
  "dbf:FS12": "Starter Deck EX: The Beat of Ki", // 気の躍動, 2026-03-14
  "dbf:FS13": "Start Deck: Earth-Raised Saiyan", // 地球育ちのサイヤ人, 2026-12-12
  "dbf:FS14": "Start Deck: Saiyan Prince", // サイヤ人の王子, 2026-12-12
  "dbf:ST01": "STORY BOOSTER 01", // 2026-08-08

  // ── Pokémon TCG — MEGA era ───────────────────────────────────────
  "pkm:M6A": "30th CELEBRATION", // 2026-09-16
  "pkm:M6": "ストームエメラルダ", // Storm Emeralda, 2026-07-31
  "pkm:M5": "アビスアイ", // Abyss Eye, 2026-05-22
  "pkm:M4": "ニンジャスピナー", // Ninja Spinner, 2026-03-13
  "pkm:M3": "ムニキスゼロ",
  "pkm:M2A": "MEGA バンドルデッキ",
  "pkm:M2": "超電ブレイカー MEGA",
  "pkm:M1L": "MEGA ルガルガン",
  "pkm:M1S": "MEGA サーナイト",

  // ── Pokémon TCG — Scarlet & Violet (SV) ──────────────────────────
  // SV11B/W shipped 2025-06-06 as the Zekrom/Reshiram-themed pair. Earlier
  // entries here said "ガイアクライシス" / "ディストピアフォール" — those
  // were pre-release rumour names. TCGdex confirms the actual release
  // names (verified live 2026-05-14 against api.tcgdex.net/v2/ja/sets/SV11B).
  // See docs/connections/the-second-witness.md for how the drift was caught.
  "pkm:SV11B": "ブラックボルト",
  "pkm:SV11W": "ホワイトフレア",
  "pkm:SV10": "スーパーエレクトリックブリーダーズ",
  "pkm:SV9A": "超イブ",
  // SV9 previously said "サイバージャッジ" — that's SV5M (Cyber Judge,
  // 2024-01). SV9 is Battle Partners (2025-01). Same drift pattern the
  // SV11B/W note above documents. Fixed 2026-07-09.
  "pkm:SV9": "バトルパートナーズ",
  "pkm:SV8A": "テラスタルフェスex",
  "pkm:SV8": "超電ブレイカー",
  "pkm:SV7A": "ステラミラクル",
  "pkm:SV7": "星屑キラメキ",
  "pkm:SV6A": "ナイトワンダラー",
  "pkm:SV6": "変幻の仮面",
  "pkm:SV5A": "クリムゾンヘイズ",
  "pkm:SV5K": "ワイルドフォース",
  "pkm:SV5M": "サイバージャッジ",
  "pkm:SV4A": "シャイニートレジャーex",
  "pkm:SV4K": "古代の咆哮",
  "pkm:SV4M": "未来の一閃",
  "pkm:SV3A": "レイジングサーフ",
  "pkm:SV3": "黒炎の支配者",
  "pkm:SV2A": "ポケモンカード151",
  "pkm:SV2D": "クレイバースト",
  "pkm:SV2P": "スノーハザード",
  "pkm:SV1A": "トリプレットビート",
  "pkm:SV1S": "スカーレットex",
  "pkm:SV1V": "バイオレットex",

  // ── Pokémon TCG — Sword & Shield (S) ─────────────────────────────
  "pkm:S12A": "VSTARユニバース",
  "pkm:S12": "パラダイムトリガー",
  "pkm:S11A": "インセクトアロー",
  "pkm:S11": "ロストアビス",
  "pkm:S10B": "Pokemon GO",
  "pkm:S10A": "ダークファンタズマ",
  "pkm:S10D": "タイムゲイザー",
  "pkm:S10P": "スペースジャグラー",
  "pkm:S9A": "バトルリージョン",
  "pkm:S9": "スターバース",
  "pkm:S8B": "VMAXクライマックス",
  "pkm:S8A": "25thアニバーサリーコレクション",
  "pkm:S8": "フュージョンアーツ",
  "pkm:S7R": "蒼空ストリーム",
  "pkm:S7D": "摩天パーフェクト",
  "pkm:S6A": "イーブイヒーローズ",
  "pkm:S6K": "漆黒のガイスト",
  "pkm:S6H": "白銀のランス",
  "pkm:S5A": "双璧のファイター",
  "pkm:S5I": "一撃マスター",
  "pkm:S5R": "連撃マスター",
  "pkm:S4A": "シャイニースターV",
  "pkm:S4": "仰天のボルテッカー",
  "pkm:S3A": "伝説の鼓動",
  "pkm:S3": "ムゲンゾーン",
  "pkm:S2A": "爆炎ウォーカー",
  "pkm:S2": "反逆クラッシュ",
  "pkm:S1A": "VMAXライジング",
  "pkm:S1": "ソード",

  // ── Cardfight!! Vanguard (vng) ───────────────────────────────────
  "vng:DZ-BT14": "赫月ノ使者", // Envoys of the Crimson Moon, 2026-04-10
  "vng:DZ-BT15": "虚影襲雷", // Strike of Illusion, 2026-06-19
  "vng:DZ-BT16": "幻真覚醒", // 2026-08-07
  "vng:DZ-BT17": "運命星戦", // 2026-10-09
  "vng:DZ-SS16": "伝説の先導者達", // The Legendary Vanguards, 2026-05-15
  "vng:DZ-TB03": "タイトルブースター フューチャーカード バディファイト", // 2026-07-24

  // ── Battle Spirits (bsr) ─────────────────────────────────────────
  "bsr:BS76": "エターナルブースター 永皇の輝き", // 2026-05-30
  "bsr:BS77": "エターナルブースター 戦神の轟臨", // 2026-11-21
  "bsr:26RBS01": "ブースターパック 創世の鼓動", // 2026-04-18
  "bsr:26RBS02": "ブースターパック 幻惑の翔風", // 2026-07-18
  "bsr:26RBS03": "ブースターパック 絶界の覇者", // 2026-10-17
  "bsr:26RCB01": "コラボブースター 仮面ライダー 運命の戦線", // 2026-06-20
  "bsr:26RDB01": "ディーバブースター ネクストストーリー", // 2026-09-26

  // ── Pokémon TCG — Sun & Moon (SM) ────────────────────────────────
  "pkm:SM12A": "タッグオールスターズ",
  "pkm:SM12": "アルタージェネシス",
  "pkm:SM11B": "ドリームリーグ",
  "pkm:SM11A": "リミックスバウト",
  "pkm:SM11": "ミラクルツイン",
  "pkm:SM10B": "スカイレジェンド",
  "pkm:SM10A": "ジージーエンド",
  "pkm:SM10": "ダブルブレイズ",
  "pkm:SM9B": "フルメタルウォール",
  "pkm:SM9A": "ナイトユニゾン",
  "pkm:SM9": "タッグボルト",
  "pkm:SM8B": "GXウルトラシャイニー",
  "pkm:SM8A": "ダークオーダー",
  "pkm:SM8": "超爆インパクト",
};

export function getKnownSetName(
  gameCode: string,
  setCode: string,
): string | null {
  const key = `${gameCode}:${setCode.toUpperCase()}`;
  return KNOWN_SET_NAMES[key] ?? null;
}
