import { describe, expect, it } from "vitest";
import { cardRushName, skuIdentity } from "@cambridge-tcg/sku";
import { answersFor, isPlainListing, listingTitle, mayStandForSku, mayStandSql, plainListingSql, MARKED_TITLE, PLAIN_TITLE } from "../listing-printing";

// Stored row shapes, as the catalogue returned them on 2026-11-24.
const rows: [sku: string, name: string, rarity: string | null, plain: boolean, stands: boolean][] = [
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

describe("what a listing title says about its printing", () => {
  it.each(rows)("%s %s", (sku, name, rarity, plain, stands) => {
    expect(isPlainListing({ sku, name, rarity })).toBe(plain);
    expect(mayStandForSku({ sku, name, rarity })).toBe(stands);
  });

  it("calls a One Piece title plain exactly when names-1 reads a name, no marker, no credit and a base rarity", () => {
    for (const [sku, name, rarity] of rows) {
      if (skuIdentity(sku)?.game !== "op") continue;
      const title = listingTitle({ name, rarity });
      const read = cardRushName(title);
      const base = /【(C|UC|R|SR|SEC|L)】$/.test(title);
      expect(isPlainListing({ sku, name, rarity })).toBe(!("reason" in read) && read.markers.length === 0 && read.illustrator === undefined && base);
    }
  });

  it("uses the same patterns in SQL", () => {
    expect(plainListingSql("c.")).toContain(`~ '${PLAIN_TITLE}'`);
    expect(plainListingSql("c.")).toContain("c.sku ~*");
    expect(mayStandSql()).toContain(`~ '${PLAIN_TITLE}'`);
    expect(mayStandSql()).toContain(`!~ '${MARKED_TITLE}'`);
    expect(plainListingSql() + mayStandSql()).not.toMatch(/\$\{|undefined|''''/);
  });

  it("answers a plain SKU with its own number's plain listing in its own language only", () => {
    const asked = skuIdentity("op-op01-001-ja")!;
    expect(answersFor(asked, { sku: "OP-OP01-001-JP-V11L1", plain_listing: true })).toBe(true);
    expect(answersFor(asked, { sku: "OP-OP01-001-JP-V11L1" })).toBe(false);
    expect(answersFor(asked, { sku: "OP-OP01-002-JP-V11KZ", plain_listing: true })).toBe(false);
    expect(answersFor(skuIdentity("op-op01-001-en")!, { sku: "OP-OP01-001-JP-V11L1", plain_listing: true })).toBe(false);
    expect(answersFor(skuIdentity("op-op01-001-ja-v11l1")!, { sku: "OP-OP01-001-JP-V11L1", plain_listing: true })).toBe(true);
    expect(answersFor(skuIdentity("op-op01-001-ja-p1")!, { sku: "OP-OP01-001-JP-V11L1", plain_listing: true })).toBe(false);
  });
});
