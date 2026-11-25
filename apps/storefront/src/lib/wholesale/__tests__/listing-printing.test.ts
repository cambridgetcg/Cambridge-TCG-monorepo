import { describe, expect, it } from "vitest";
import { cardRushName, skuIdentity } from "@cambridge-tcg/sku";
import { answersFor, isPlainListing, listingTitle, mayStandForSku, mayStandSql, plainListingSql, MARKED_TITLE, PLAIN_TITLE } from "../listing-printing";
import { rows } from "./listing-titles";


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
      expect(isPlainListing({ sku, name, rarity })).toBe(!("reason" in read) && read.markers.length === 0 && read.illustrator === undefined && base && !/[☆「」《》]/.test(title));
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
