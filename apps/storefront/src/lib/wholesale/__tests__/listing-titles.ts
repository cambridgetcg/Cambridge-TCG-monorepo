// Stored row shapes, as the catalogue returned them on 2026-11-24.
export const rows: [sku: string, name: string, rarity: string | null, plain: boolean, stands: boolean][] = [
  // The July import: the whole title in the name, no rarity column.
  ["op-op01-004-ja", "ウソップ【R】", null, true, true],
  ["op-op01-001-ja", "〔状態A-〕ロロノア・ゾロ(パラレル/漫画絵)【L/P】", null, false, false],
  ["op-op01-054-ja", "〔状態A-〕X・ドレーク【R】", null, false, false],
  ["op-op01-008-ja", "キャベンディッシュ(フルアート/foil)【C】", null, false, false],
  ["op-op01-016-ja", "ナミ(illust:Sunohara/白枠)【R】", null, false, false],
  ["op-op01-025-ja", "ロロノア・ゾロ(illust:phima)【SR】", null, false, false],
  ["op-p-057-ja", "〔PSA10鑑定済〕ウタカタララバイ(illust:WOTAKICHI)【P】", null, false, false],
  // The shop importer: rarity in its column, its own suffixed key, so it always stands for itself.
  ["OP-OP01-001-JP-V11L1", "ロロノア・ゾロ", "L", true, true],
  ["OP-OP01-001-JP-V11L2", "ロロノア・ゾロ(漫画絵)", "L/P", false, true],
  ["OP-OP01-001-JP-V11DZ", "ロロノア・ゾロ(漫画背景/漫画絵)", "L", false, true],
  ["OP-OP01-001-JP-V11L9", "ロロノア・ゾロ英語版", "L", false, true],
  // The importer took パラレル out of the name: only the rarity is left to say so.
  ["OP-OP01-002-JP-V11L0", "トラファルガー・ロー", "L/P", false, true],
  ["OP-OP15-118-JP-VSOF", "エネル", "SEC/SP", false, true],
  ["OP-OP09-050-JP-VX8H", "ナミ", "SP", false, true],
  ["P-P-029-JP-V11CG", "バルトロメオ", "P", false, true],
  // A shop's sale tag is not part of a name: the same card is also listed without it.
  ["OP-OP15-007-JP-VS4Q", "☆SALE☆ギン", "SR", false, true],
  ["OP-OP15-007-JP-VSRU", "ギン", "SR", true, true],
  ["OP-OP01-004-JP-VT1", "ウソップ「SP」", "R", false, true],
  ["OP-OP01-004-JP-VT2", "ウソップ《漫画絵》", "R", false, true],
  // Nothing may follow the rarity, and a plain SKU is plain in any spelling.
  ["op-op01-004-ja", "ウソップ【R】{OP01-004[PRB01]}", null, false, false],
  ["op-op01-004-ja", "ウソップ【R】【英語版】", null, false, false],
  ["op-op01-004-ja", "ウソップ【R】\u3000", null, false, false],
  ["op-op01-004-ja", "ウソップ\nパラレル【R】", null, false, false],
  ["OP-OP01-004-JP", "〔状態A-〕ウソップ(パラレル)【R/P】", null, false, false],
  // A bracket that belongs to the name is refused too: it cannot be told from a mark.
  ["OP-OP01-083-JP-V11X9", "Mr.1(ダズ・ボーネス)", "UC", false, true],
  // Other games: no title is called plain, and a known mark still refuses.
  ["dbf-fs06-09-ja", "チチミニ：DA【C】", null, false, true],
  ["dbf-fb01-104-ja", "〔状態A-〕ギニュー(パラレル)【L☆】", null, false, false],
  ["dbf-fb01-139-ja", "孫悟空(パラレル)【SCR☆☆】", null, false, false],
  ["dmw-bt3-033-ja", "(-)プロットモン【R】", "R", false, true],
  ["PK-SV2A-025-JP-V403", "ピカチュウ", "C", false, true],
  ["SEALED-V103-JP", "ファントムゲート", null, false, true],
];
