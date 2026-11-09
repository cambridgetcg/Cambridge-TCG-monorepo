import { describe, expect, it } from "vitest";
import { catalogImageUrl, DEFAULT_CARD_IMAGE_CDN, officialImageUrl, officialMediaProvenance, projectOfficialImage, projectOfficialCardNumberImage, projectSameLanguageImage, type StoredOfficialImage } from "./image-publication";
import { OFFICIAL_IMAGE_LANES } from "./official-image-lanes";

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

describe("practice card-number image projection", () => {
  it.each(["", "-R1", "-P1"])("keeps the selected English row suffix %j and its credit together", (suffix) => {
    const selected = { ...row, sku: `${row.sku}${suffix}`, s3_key: `official/${row.sku}${suffix}.png` };
    const image = projectOfficialCardNumberImage("op", "OP01-001", selected)!;
    expect(image.url).toBe(`${DEFAULT_CARD_IMAGE_CDN}/${selected.s3_key}`);
    expect(image.attribution).toBe(row.attribution);
    expect(image.source_url).toBe(row.source_url);
    expect(image.retrieved_at).toBe("2026-07-13T09:00:00.000Z");
    expect(image.reference).toMatchObject({ requested_card_number: "OP01-001", depicted_sku: selected.sku, relationship: "reference", scope: "syntax_only" });
    expect(image.publication_policy).toBe("cambridge.official-en-media/2026-07-13");
    if (suffix) expect(projectOfficialImage("op-op01-001-ja", selected)).toBeNull();
  });

  it.each([
    { kind: "shop_scan" }, { takedown_status: "disputed" }, { takedown_status: "removed" },
    { source: "unknown" }, { lang: "ja" }, { attribution: "   " }, { source_url: null },
    { source_url: "https://www.dbs-cardgame.com/fw/en/cardlist/" },
    { source_url: "http://en.onepiece-cardgame.com/cardlist/" },
    { source_url: "https://en.onepiece-cardgame.com.evil.invalid/card.png" },
    { source_url: "https://en.onepiece-cardgame.com/card.png?api_key=example" },
    { retrieved_at: "yesterday" }, { retrieved_at: "2026-07-13T09:00:00" },
    { retrieved_at: "2026-02-30T00:00:00Z" }, { retrieved_at: null }, { retrieved_at: new Date(NaN) },
    { sku: "OP-OP01-002-EN" }, { sku: "DBF-OP01-001-EN" },
    { s3_key: null }, { s3_key: "" }, { s3_key: "official/../private.png" },
    { s3_key: "official/%2e%2e/private.png" }, { s3_key: "official/a.png?key=example" },
    { s3_key: "https://en.onepiece-cardgame.com/image.png" },
  ])("applies the same stored-source and transport checks to practice rows: %o", (change) => {
    expect(projectOfficialCardNumberImage("op", "OP01-001", { ...row, ...change })).toBeNull();
  });

  it("does not expand game, card-number or CDN scope through the new wrapper", () => {
    expect(projectOfficialCardNumberImage("dbf", "OP01-001", row)).toBeNull();
    expect(projectOfficialCardNumberImage("op", "OP01-001-P1", row)).toBeNull();
    expect(projectOfficialCardNumberImage("op", "OP01-001", row, "https://images.example.invalid")).toBeNull();
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

describe("language lanes bind by projector, never by the row [C5]", () => {
  const fwRow: StoredOfficialImage = {
    ...row, sku: "DBF-FB10-001-EN", s3_key: "official/DBF-FB10-001-EN.webp",
    source_url: "https://www.dbs-cardgame.com/fw/images/cards/card/en/FB10-001_f.webp",
  };
  it("accepts English Fusion World images and detail pages by their English paths, and nothing under /fw/jp", () => {
    expect(projectOfficialImage("FB-FB10-001-JP", fwRow)?.source_url).toBe(fwRow.source_url);
    // card_texts provenance: the source_url is the detail page.
    expect(officialMediaProvenance("FB-FB10-001-JP", { ...fwRow, source_url: "https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=FB10-001" })).not.toBeNull();
    for (const source_url of [
      "https://www.dbs-cardgame.com/fw/images/cards/card/jp/FB10-001_f.webp",
      "https://www.dbs-cardgame.com/fw/jp/cardlist/detail.php?card_no=FB10-001",
      "https://www.dbs-cardgame.com/images/FB10-001_f.webp",
    ]) expect(projectOfficialImage("FB-FB10-001-JP", { ...fwRow, source_url })).toBeNull();
  });

  it("keeps One Piece English provenance host-only, as before", () => {
    expect(officialMediaProvenance("op-op01-001-ja", { ...row, source_url: "https://en.onepiece-cardgame.com/cardlist/?series=569101" })).not.toBeNull();
  });

  it("refuses a Japanese row in the English projector, and an English row in the Japanese one, whatever they say", () => {
    const ja: StoredOfficialImage = {
      sku: "OP-OP01-001-JA", lang: "ja", source: "bandai-jp", kind: "official_sample", takedown_status: "clear",
      s3_key: "official/OP-OP01-001-JA.png", attribution: OFFICIAL_IMAGE_LANES.ja.credits.op,
      source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?261016",
      retrieved_at: "2026-10-30T10:27:20Z", license_note: OFFICIAL_IMAGE_LANES.ja.evidence,
    };
    expect(projectSameLanguageImage("OP-OP01-001-JP", ja)).not.toBeNull();
    expect(projectOfficialImage("OP-OP01-001-JP", ja)).toBeNull();
    expect(projectOfficialImage("OP-OP01-001-JP", { ...ja, lang: "en", source: "bandai-en" })).toBeNull();
    expect(projectSameLanguageImage("OP-OP01-001-JP", row)).toBeNull();
    expect(projectSameLanguageImage("OP-OP01-001-JP", { ...row, lang: "ja", source: "bandai-jp" })).toBeNull();
  });
});

describe("Japanese same-language projection", () => {
  const ja: StoredOfficialImage = {
    sku: "OP-OP01-001-JA", lang: "ja", source: "bandai-jp", kind: "official_sample", takedown_status: "clear",
    s3_key: "official/OP-OP01-001-JA.png", attribution: OFFICIAL_IMAGE_LANES.ja.credits.op,
    source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?261016",
    retrieved_at: "2026-10-30T10:27:20Z", license_note: "cambridge.official-ja-media/2026-10-30",
  };
  const fw: StoredOfficialImage = {
    ...ja, sku: "DBF-FB10-001-JA", s3_key: "official/DBF-FB10-001-JA.webp", attribution: OFFICIAL_IMAGE_LANES.ja.credits.dbf,
    source_url: "https://www.dbs-cardgame.com/fw/images/cards/card/jp/FB10-001_f.webp",
  };

  it("keeps the self-hosted URL, the Japanese credit and the same-language reference together", () => {
    const image = projectSameLanguageImage("OP-OP01-001-JP-V11DZ", ja)!;
    expect(image).toMatchObject({
      url: `${DEFAULT_CARD_IMAGE_CDN}/official/OP-OP01-001-JA.png`, attribution: "©尾田栄一郎／集英社 ©尾田栄一郎／集英社・フジテレビ・東映アニメーション",
      kind: "official_sample", source: "bandai-jp", language: "ja", source_url: ja.source_url,
      retrieved_at: "2026-10-30T10:27:20.000Z", publication_policy: "cambridge.official-ja-media/2026-10-30",
    });
    expect(image.reference).toEqual({
      requested_sku: "OP-OP01-001-JP-V11DZ", requested_canonical_sku: "op-op01-001-ja-v11dz",
      depicted_sku: "OP-OP01-001-JA", depicted_canonical_sku: "op-op01-001-ja",
      language: "ja", relationship: "reference", scope: "syntax_only", reason: "same_language_base_reference",
    });
    expect(projectSameLanguageImage("FB-FB10-001-JP-P1", fw)?.reference.depicted_sku).toBe("DBF-FB10-001-JA");
    expect(projectSameLanguageImage("FB-FB10-001-JP", { ...fw, source_url: "https://www.dbs-cardgame.com/fw/images/cards/card/jp/FB10-001.webp" })).not.toBeNull();
  });

  it.each([
    // [C3] the publisher file must be the row's own card
    { source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-002.png?261016" },
    { source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001_p2.png?261016" },
    // [C4] an empty query, or one bare numeric cache token, only
    { source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?x=1" },
    { source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?abc" },
    { source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?261016&v=2" },
    { source_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png" },
    { source_url: "https://www.onepiece-cardgame.com/renewal/images/OP01-001.png" },
    // the lane's own credit and evidence, exactly
    { attribution: "©Eiichiro Oda/Shueisha, Toei Animation" },
    { attribution: OFFICIAL_IMAGE_LANES.ja.credits.op.normalize("NFKC") },
    { license_note: null }, { license_note: "cambridge.official-en-media/2026-07-13" },
    // an object named for the row's own key
    { s3_key: "official/OP-OP01-001-EN.png" }, { s3_key: "official/OP-OP01-001-JA.webp" }, { s3_key: null },
    { takedown_status: "disputed" }, { kind: "shop_scan" }, { retrieved_at: "yesterday" },
    { sku: "OP-OP01-001-JA-P2", s3_key: "official/OP-OP01-001-JA-P2.png" },
  ])("withholds a Japanese row outside its lane: %o", (change) => {
    expect(projectSameLanguageImage("OP-OP01-001-JP", { ...ja, ...change })).toBeNull();
  });

  it.each(["", "?261016"])("accepts One Piece's query %j", (query) => {
    expect(projectSameLanguageImage("OP-OP01-001-JP", { ...ja, source_url: `https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png${query}` })).not.toBeNull();
  });

  it("refuses a Fusion World query, a back face, and an English or a non-Japanese request", () => {
    expect(projectSameLanguageImage("FB-FB10-001-JP", { ...fw, source_url: `${fw.source_url}?261016` })).toBeNull();
    expect(projectSameLanguageImage("FB-FB10-001-JP", { ...fw, source_url: "https://www.dbs-cardgame.com/fw/images/cards/card/jp/FB10-001_b.webp" })).toBeNull();
    expect(projectSameLanguageImage("op-op01-001-en", ja)).toBeNull();
    expect(projectSameLanguageImage("op-op01-001-ko", ja)).toBeNull();
    expect(projectSameLanguageImage("OP-OP01-001-JP", ja, "https://images.example.invalid")).toBeNull();
  });
});
