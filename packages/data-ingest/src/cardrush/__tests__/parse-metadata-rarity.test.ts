import { describe, it, expect } from "vitest";
import { parseCardMetadata } from "../discovery";

// Minimal HTML wrapper — parseCardMetadata reads the <title> and the URL.
const page = (title: string) => `<html><head><title>${title}</title></head><body></body></html>`;
const digimonUrl = "https://cardrush-digimon.jp/product/123456";
const onePieceUrl = "https://cardrush-op.jp/product/123456";

describe("parseCardMetadata — grounded Digimon rarity and identity", () => {
  it("extracts digimon rarity from the trailing full-width bracket", () => {
    expect(parseCardMetadata(page("(01)デクスドルガモン【U】"), digimonUrl)?.rarity).toBe("U");
    expect(parseCardMetadata(page("(02)シャウトモンキングVer.【SEC】"), digimonUrl)?.rarity).toBe("SEC");
    expect(parseCardMetadata(page("(-)ブラストファイア【C】"), digimonUrl)?.rarity).toBe("C");
    expect(parseCardMetadata(page("グレイモン【SR】"), digimonUrl)?.rarity).toBe("SR");
  });

  it("is scoped to the Digimon host", () => {
    expect(parseCardMetadata(page("ヤソップ【R】"), onePieceUrl)?.rarity).toBeNull();
    expect(
      parseCardMetadata(
        page("デクスドルガモン【U】"),
        "https://cardrush-digimon.jp.example/product/123456",
      )?.rarity,
    ).toBeNull();
  });

  it("uses only the trailing bracket when several brackets exist", () => {
    expect(
      parseCardMetadata(page("グレイモン【パラレル】【SR】"), digimonUrl)?.rarity,
    ).toBe("SR");
    expect(
      parseCardMetadata(page("グレイモン【SR】【状態A-】"), digimonUrl)?.rarity,
    ).toBeNull();
  });

  it("ignores a valid rarity bracket that is not trailing", () => {
    expect(
      parseCardMetadata(page("グレイモン【SR】 カードラッシュ"), digimonUrl)?.rarity,
    ).toBeNull();
  });

  it("ignores trailing condition and annotation markers", () => {
    expect(parseCardMetadata(page("〔状態A-〕ヤソップ"), digimonUrl)?.rarity).toBeNull();
    expect(parseCardMetadata(page("ヴィオラ【状態A-】"), digimonUrl)?.rarity).toBeNull();
  });

  it("does not override the primary {SET-NUM}-brace rarity method", () => {
    // Primary method finds "SR" before the {BT10-112} brace; the bracket
    // fallback only fires when the primary method found nothing.
    expect(
      parseCardMetadata(page("Some Card SR {BT10-112}【状態A-】"), digimonUrl)?.rarity,
    ).toBe("SR");
  });

  it("keeps opaque no-code titles quarantinable instead of inventing identity", () => {
    const parsed = parseCardMetadata(page("(01)デクスドルガモン【U】"), digimonUrl);
    expect(parsed).toMatchObject({
      set_code: null,
      card_number: null,
      rarity: "U",
      name: "(01)デクスドルガモン",
    });
  });

  it("accepts an explicit unbraced Digimon card id without guessing", () => {
    const parsed = parseCardMetadata(
      page("BT10-112 ジエスモンGX【SEC】"),
      "https://www.cardrush-digimon.jp/product/123456",
    );
    expect(parsed).toMatchObject({
      set_code: "BT10",
      card_number: "112",
      rarity: "SEC",
      name: "ジエスモンGX",
    });
  });
});
