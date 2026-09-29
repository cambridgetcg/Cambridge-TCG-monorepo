import { describe, expect, it } from "vitest";
import { catalogImageUrl, DEFAULT_CARD_IMAGE_CDN, officialImageUrl, projectOfficialImage, type StoredOfficialImage } from "./image-publication";

const row: StoredOfficialImage = {
  sku: "OP-OP01-001-EN", lang: "en", source: "bandai-en", kind: "official_sample",
  takedown_status: "clear", s3_key: "official/OP-OP01-001-EN.png",
  attribution: "Publisher copyright", source_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
  retrieved_at: new Date("2026-07-13T09:00:00Z"),
};

describe("stored official image projection", () => {
  it("keeps a display URL, credit and reference identity together without claiming exactness", () => {
    const image = projectOfficialImage("OP-OP01-001-JP-V11DZ", row)!;
    expect(image.url).toBe(`${DEFAULT_CARD_IMAGE_CDN}/${row.s3_key}`);
    expect(image.source_url).toBe(row.source_url);
    expect(image.attribution).toBe(row.attribution);
    expect(image.reference).toMatchObject({ requested_sku: "OP-OP01-001-JP-V11DZ", depicted_sku: row.sku, relationship: "reference", scope: "syntax_only" });
    expect(image.retrieved_at).toBe("2026-07-13T09:00:00.000Z");
    expect(image.publication_policy).toBe("cambridge.official-en-media/2026-07-13");
  });

  it.each([
    { kind: "shop_scan" }, { takedown_status: "disputed" }, { takedown_status: "removed" },
    { source: "unknown" }, { lang: "ja" }, { attribution: "   " }, { source_url: null },
    { source_url: "https://www.dbs-cardgame.com/fw/en/cardlist/" },
    { source_url: "http://en.onepiece-cardgame.com/cardlist/" },
    { source_url: "https://en.onepiece-cardgame.com.evil.invalid/card.png" },
    { source_url: "https://en.onepiece-cardgame.com/card.png?api_key=example" },
    { retrieved_at: "yesterday" }, { retrieved_at: "2026-07-13T09:00:00" },
    { retrieved_at: null }, { retrieved_at: new Date(NaN) },
    { sku: "OP-OP01-002-EN" }, { sku: "OP-OP01-001-EN-P1" },
    { s3_key: null }, { s3_key: "" }, { s3_key: "official/../private.png" },
    { s3_key: "official/%2e%2e/private.png" }, { s3_key: "official/a.png?key=example" },
    { s3_key: "https://en.onepiece-cardgame.com/image.png" },
  ])("withholds a row outside the recorded boundary: %o", (change) => {
    expect(projectOfficialImage("op-op01-001-ja", { ...row, ...change })).toBeNull();
  });

  it("does not extend the recorded game scope or accept an unreviewed CDN", () => {
    expect(projectOfficialImage("pkm-sv1-001-ja", { ...row, sku: "PKM-SV1-001-EN" })).toBeNull();
    expect(projectOfficialImage("op-op01-001-ja", row, "https://images.example.invalid")).toBeNull();
    expect(officialImageUrl(row.s3_key, "https://ctcg-card-images.s3.amazonaws.com/")).toBe(`https://ctcg-card-images.s3.amazonaws.com/${row.s3_key}`);
  });

  it.each([
    [new Date(0), "1970-01-01T00:00:00.000Z"],
    ["2024-02-29T23:59:59Z", "2024-02-29T23:59:59.000Z"],
    ["2000-02-29T00:00:00Z", "2000-02-29T00:00:00.000Z"],
    ["2026-09-29T00:15:30.123456+05:30", "2026-09-28T18:45:30.123Z"],
    ["2026-09-29T00:15:30.000001-03:30", "2026-09-29T03:45:30.000Z"],
    ["2026-09-29T00:15:30.1+00:00", "2026-09-29T00:15:30.100Z"],
  ])("preserves valid retrieval input %s with the existing UTC millisecond output", (retrieved_at, expected) => {
    expect(projectOfficialImage("op-op01-001-en", { ...row, retrieved_at })?.retrieved_at).toBe(expected);
  });

  it.each([
    "2026-02-30T00:00:00Z", "2026-02-29T00:00:00Z", "1900-02-29T00:00:00Z",
    "2024-02-30T00:00:00Z", "2026-04-31T00:00:00Z", "2026-01-32T00:00:00Z",
    "2026-00-01T00:00:00Z", "2026-13-01T00:00:00Z", "2026-01-00T00:00:00Z",
    "2026-09-29T24:00:00Z", "2026-09-29T25:00:00Z", "2026-09-29T23:60:00Z",
    "2026-09-29T23:59:60Z", "2026-09-29T00:00:00+24:00", "2026-09-29T00:00:00-01:60",
    "2026-02-30T00:15:30.123456+05:30",
  ])("withholds impossible calendar or time fields instead of rolling them over: %s", (retrieved_at) => {
    expect(projectOfficialImage("op-op01-001-en", { ...row, retrieved_at })).toBeNull();
  });
});

describe("preserved catalog-photo transport boundary", () => {
  it("permits established self-hosted buckets without assigning image provenance", () => {
    for (const game of ["op", "pk", "db"]) {
      const url = `https://jp-${game}-photos.s3.us-east-1.amazonaws.com/cards/sample.webp`;
      expect(catalogImageUrl(url)).toBe(url);
    }
  });
  it.each([
    null, "", "javascript:example", "https://www.cardrush-op.jp/image.png",
    "https://jp-op-photos.s3.us-east-1.amazonaws.com.evil.invalid/image.png",
    "http://jp-op-photos.s3.us-east-1.amazonaws.com/image.png",
    "https://example:example@jp-op-photos.s3.us-east-1.amazonaws.com/image.png",
    "https://jp-op-photos.s3.us-east-1.amazonaws.com/a/../image.png",
    "https://jp-op-photos.s3.us-east-1.amazonaws.com/%2e%2e/image.png",
    "https://jp-op-photos.s3.us-east-1.amazonaws.com/image.png?signature=example",
    "https://jp-op-photos.s3.us-east-1.amazonaws.com/image.png#fragment",
  ])("withholds URLs outside the self-hosted fallback: %s", (url) => {
    expect(catalogImageUrl(url)).toBeNull();
  });
});
