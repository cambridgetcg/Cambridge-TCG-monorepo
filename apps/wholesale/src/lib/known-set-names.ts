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
 */

export const KNOWN_SET_NAMES: Record<string, string> = {
  // ── One Piece TCG ────────────────────────────────────────────────
  "onepiece:OP01": "Romance Dawn",
  "onepiece:OP02": "Paramount War",
  "onepiece:OP03": "Pillars of Strength",
  "onepiece:OP04": "Kingdoms of Intrigue",
  "onepiece:OP05": "Awakening of the New Era",
  "onepiece:OP06": "Wings of the Captain",
  "onepiece:OP07": "500 Years in the Future",
  "onepiece:OP08": "Two Legends",
  "onepiece:OP09": "The Four Emperors",
  "onepiece:OP10": "Royal Blood",
  "onepiece:OP11": "Godspeed Fist",
  "onepiece:OP12": "Bond of Master and Student",
  "onepiece:OP13": "Inherited Will",
  "onepiece:OP14": "Seven Greats of the Azure Sea",
  "onepiece:OP15": "Adventure on God's Island",
  "onepiece:EB01": "Memorial Collection",
  "onepiece:EB02": "Anime 25th Collection",
  "onepiece:EB03": "Heroines Edition",
  "onepiece:EB04": "Egghead Crisis",
  "onepiece:PRB01": "ONE PIECE CARD THE BEST",
  "onepiece:PRB02": "THE BEST vol.2",
  "onepiece:PCC04": "Premium Card Collection: Best Selection vol.4",
  "onepiece:PCC05": "Premium Card Collection: Best Selection vol.5",
  "onepiece:ST13": "Ultimate Deck: Bond of Three Brothers",
  "onepiece:ST21": "Starter Deck EX: Gear 5",
  "onepiece:ST22": "Starter Deck: Ace & Newgate",

  // ── Dragon Ball Fusion World ─────────────────────────────────────
  "dragonball:FB01": "Awakened Pulse",
  "dragonball:FB02": "Blazing Aura",
  "dragonball:FB03": "Roar of Anger",
  "dragonball:FB04": "Beyond the Limit",
  "dragonball:FB05": "Unknown Adventure",
  "dragonball:FB06": "Approaching Threat",
  "dragonball:FB07": "Wish to Shenron",
  "dragonball:FB08": "Proud Fighting Race",
  "dragonball:SB01": "Manga Booster 01",
  "dragonball:SB02": "Manga Booster 02",
  "dragonball:FS01": "Starter Deck: Son Goku",
  "dragonball:FS02": "Starter Deck: Vegeta",
  "dragonball:FS03": "Starter Deck: Broly",
  "dragonball:FS04": "Starter Deck: Frieza",
  "dragonball:FS05": "Starter Deck: Bardock",
  "dragonball:FS06": "Starter Deck: Son Goku Mini",
  "dragonball:FS07": "Starter Deck: Vegeta Mini",
  "dragonball:FS08": "Starter Deck: Vegeta Mini SS3",
  "dragonball:FS09": "Starter Deck EX: Shallot",
  "dragonball:FS10": "Starter Deck EX: Giblet",

  // ── Pokémon TCG — MEGA era ───────────────────────────────────────
  "pokemon:M3": "ムニキスゼロ",
  "pokemon:M2A": "MEGA バンドルデッキ",
  "pokemon:M2": "超電ブレイカー MEGA",
  "pokemon:M1L": "MEGA ルガルガン",
  "pokemon:M1S": "MEGA サーナイト",

  // ── Pokémon TCG — Scarlet & Violet (SV) ──────────────────────────
  // SV11B/W shipped 2025-06-06 as the Zekrom/Reshiram-themed pair. Earlier
  // entries here said "ガイアクライシス" / "ディストピアフォール" — those
  // were pre-release rumour names. TCGdex confirms the actual release
  // names (verified live 2026-05-14 against api.tcgdex.net/v2/ja/sets/SV11B).
  // See docs/connections/the-second-witness.md for how the drift was caught.
  "pokemon:SV11B": "ブラックボルト",
  "pokemon:SV11W": "ホワイトフレア",
  "pokemon:SV10": "スーパーエレクトリックブリーダーズ",
  "pokemon:SV9A": "超イブ",
  "pokemon:SV9": "サイバージャッジ",
  "pokemon:SV8A": "テラスタルフェスex",
  "pokemon:SV8": "超電ブレイカー",
  "pokemon:SV7A": "ステラミラクル",
  "pokemon:SV7": "星屑キラメキ",
  "pokemon:SV6A": "ナイトワンダラー",
  "pokemon:SV6": "変幻の仮面",
  "pokemon:SV5A": "クリムゾンヘイズ",
  "pokemon:SV5K": "ワイルドフォース",
  "pokemon:SV5M": "サイバージャッジ",
  "pokemon:SV4A": "シャイニートレジャーex",
  "pokemon:SV4K": "古代の咆哮",
  "pokemon:SV4M": "未来の一閃",
  "pokemon:SV3A": "レイジングサーフ",
  "pokemon:SV3": "黒炎の支配者",
  "pokemon:SV2A": "ポケモンカード151",
  "pokemon:SV2D": "クレイバースト",
  "pokemon:SV2P": "スノーハザード",
  "pokemon:SV1A": "トリプレットビート",
  "pokemon:SV1S": "スカーレットex",
  "pokemon:SV1V": "バイオレットex",

  // ── Pokémon TCG — Sword & Shield (S) ─────────────────────────────
  "pokemon:S12A": "VSTARユニバース",
  "pokemon:S12": "パラダイムトリガー",
  "pokemon:S11A": "インセクトアロー",
  "pokemon:S11": "ロストアビス",
  "pokemon:S10B": "Pokemon GO",
  "pokemon:S10A": "ダークファンタズマ",
  "pokemon:S10D": "タイムゲイザー",
  "pokemon:S10P": "スペースジャグラー",
  "pokemon:S9A": "バトルリージョン",
  "pokemon:S9": "スターバース",
  "pokemon:S8B": "VMAXクライマックス",
  "pokemon:S8A": "25thアニバーサリーコレクション",
  "pokemon:S8": "フュージョンアーツ",
  "pokemon:S7R": "蒼空ストリーム",
  "pokemon:S7D": "摩天パーフェクト",
  "pokemon:S6A": "イーブイヒーローズ",
  "pokemon:S6K": "漆黒のガイスト",
  "pokemon:S6H": "白銀のランス",
  "pokemon:S5A": "双璧のファイター",
  "pokemon:S5I": "一撃マスター",
  "pokemon:S5R": "連撃マスター",
  "pokemon:S4A": "シャイニースターV",
  "pokemon:S4": "仰天のボルテッカー",
  "pokemon:S3A": "伝説の鼓動",
  "pokemon:S3": "ムゲンゾーン",
  "pokemon:S2A": "爆炎ウォーカー",
  "pokemon:S2": "反逆クラッシュ",
  "pokemon:S1A": "VMAXライジング",
  "pokemon:S1": "ソード",

  // ── Pokémon TCG — Sun & Moon (SM) ────────────────────────────────
  "pokemon:SM12A": "タッグオールスターズ",
  "pokemon:SM12": "アルタージェネシス",
  "pokemon:SM11B": "ドリームリーグ",
  "pokemon:SM11A": "リミックスバウト",
  "pokemon:SM11": "ミラクルツイン",
  "pokemon:SM10B": "スカイレジェンド",
  "pokemon:SM10A": "ジージーエンド",
  "pokemon:SM10": "ダブルブレイズ",
  "pokemon:SM9B": "フルメタルウォール",
  "pokemon:SM9A": "ナイトユニゾン",
  "pokemon:SM9": "タッグボルト",
  "pokemon:SM8B": "GXウルトラシャイニー",
  "pokemon:SM8A": "ダークオーダー",
  "pokemon:SM8": "超爆インパクト",
};

export function getKnownSetName(
  gameCode: string,
  setCode: string,
): string | null {
  const key = `${gameCode}:${setCode.toUpperCase()}`;
  return KNOWN_SET_NAMES[key] ?? null;
}
