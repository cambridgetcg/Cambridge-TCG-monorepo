import { describe, it, expect } from "vitest";
import { parseCardMetadata } from "../discovery";

// Minimal HTML wrapper — parseCardMetadata reads the <title> and the URL.
const page = (title: string) => `<html><head><title>${title}</title></head><body></body></html>`;
const url = "https://cardrush-digimon.jp/product/123456";

describe("parseCardMetadata — trailing 【X】 rarity fallback (kingdom: digimon rarity gap, 2026-07-12)", () => {
  it("extracts digimon rarity from the trailing full-width bracket", () => {
    expect(parseCardMetadata(page("(01)デクスドルガモン【U】"), url)?.rarity).toBe("U");
    expect(parseCardMetadata(page("(02)シャウトモンキングVer.【SEC】"), url)?.rarity).toBe("SEC");
    expect(parseCardMetadata(page("(-)ブラストファイア【C】"), url)?.rarity).toBe("C");
    expect(parseCardMetadata(page("グレイモン【SR】"), url)?.rarity).toBe("SR");
  });

  it("ignores non-rarity brackets (condition / annotation markers)", () => {
    // 状態A- is a condition grade, not a rarity — must not be adopted.
    expect(parseCardMetadata(page("〔状態A-〕ヤソップ"), url)?.rarity).toBeNull();
    expect(parseCardMetadata(page("ヴィオラ【状態A-】"), url)?.rarity).toBeNull();
  });

  it("does not override the primary {SET-NUM}-brace rarity method", () => {
    // Primary method finds "SR" before the {OP08-105} brace; the bracket
    // fallback only fires when the primary method found nothing.
    expect(parseCardMetadata(page("Some Card SR {OP08-105}"), url)?.rarity).toBe("SR");
  });
});
