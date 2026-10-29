import { describe, expect, it } from "vitest";
import {
  CARD_NAME_SCHEMA, CardNameError, cardKey, cardmarketName, cardName, cardNameKey, cardNameText, cardRushName,
  chooseCardName, isCardKey, printingName, sameCardName, tcgplayerName, type CardName, type CardNameInput,
} from "../names";

// Titles and product names are the source fixtures' identifiers, verbatim:
// packages/data-ingest/src/cardrush/__tests__/fixtures/*.html (<title>),
// tcgplayer/__tests__/fixtures/price-guide-*.json and the Cardmarket product
// in data-ingest/src/__tests__/member-prices.test.ts. No prices are used.
const at = "2026-10-29T00:00:00Z";
const record = (input: Partial<CardNameInput> = {}): CardName => cardName({
  card_key: "op-op01-001", lang: "en", text: "Roronoa Zoro", status: "official", source: "bandai-en", observed_at: at, rule: "verbatim", ...input,
});

describe("card keys", () => {
  it("drop the language and variant of a canonical SKU, so a parallel shares its base print's key", () => {
    expect(cardKey("op-op01-001-ja")).toBe("op-op01-001");
    expect(cardKey("op-op01-001-en-p1")).toBe("op-op01-001");
    expect(cardKey("pkm-svobf-006-en-rev-holo")).toBe("pkm-svobf-006");
  });
  it("normalize nothing and accept only registered games", () => {
    for (const value of ["OP-OP01-001-JP", "op-op01-001", "unknown-set-001-en", ""]) expect(cardKey(value)).toBeNull();
    expect(isCardKey("op-op01-001")).toBe(true);
    for (const value of ["op-op01-001-ja", "OP-OP01-001", "op-op01", "zz-op01-001", "op--001"]) expect(isCardKey(value)).toBe(false);
  });
});

describe("text form and match key", () => {
  it("keeps the printed form apart from NFC, trimming and single spaces", () => {
    expect(cardNameText("  Roronoa　　Zoro \n")).toBe("Roronoa Zoro");
    expect(cardNameText("モンキー・Ｄ・ルフィ")).toBe("モンキー・Ｄ・ルフィ");
    expect(cardNameText("Pokémon")).toBe("Pokémon");
  });
  it("matches across width, case, spacing and middle dots, and never matches empty text", () => {
    expect(cardNameKey("モンキー・Ｄ・ルフィ")).toBe(cardNameKey("モンキー・D・ルフィ"));
    expect(cardNameKey("モンキー・Ｄ・ルフィ")).toBe("モンキーdルフィ");
    expect(sameCardName("ロロノア・ゾロ", "ロロノアゾロ")).toBe(true);
    expect(sameCardName("ﾛﾛﾉｱ･ｿﾞﾛ", "ロロノア・ゾロ")).toBe(true);
    expect(sameCardName("Roronoa Zoro", "RORONOA ZORO")).toBe(true);
    expect(sameCardName("Roronoa Zoro", "Roronoa Zoro (001)")).toBe(false);
    expect(sameCardName("・", " ")).toBe(false);
  });
});

describe("cardrush-title/names-1", () => {
  it.each([
    ["〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}", { text: "お玉", illustrator: "sowsow", markers: ["状態C"] }],
    ["ロロノア・ゾロ(パラレル/漫画絵)【L/P】{OP01-001}", { text: "ロロノア・ゾロ", markers: ["パラレル", "漫画絵"] }],
    ["マゼラン(パラレル/illust:Anderson)【SP】{OP02-085[OP04]}", { text: "マゼラン", illustrator: "Anderson", markers: ["パラレル"] }],
    ["〔状態A-〕ナミ(パラレル/和柄/illust:S-KINOKO)【SP】{OP01-016[OP05]}", { text: "ナミ", illustrator: "S-KINOKO", markers: ["状態A-", "パラレル", "和柄"] }],
    ["〔PSA10鑑定済〕シャーロット・プリン(パラレル/illust:Hashimoto Q)【SP】{OP06-047}", { text: "シャーロット・プリン", illustrator: "Hashimoto Q", markers: ["PSA10鑑定済", "パラレル"] }],
    ["〔PSA10鑑定済〕モンキー・Ｄ・ルフィ(パラレル/illust:Hachi Takashi)【R/P】{OP16-034}", { text: "モンキー・Ｄ・ルフィ", illustrator: "Hachi Takashi", markers: ["PSA10鑑定済", "パラレル"] }],
  ])("takes the name out of %s", (title, expected) => {
    expect(cardRushName(title)).toEqual({ rule: "cardrush-title/names-1", ...expected });
  });
  it("keeps the publisher's width in the text and matches on the key", () => {
    const luffy = cardRushName("〔PSA10鑑定済〕モンキー・Ｄ・ルフィ(パラレル/illust:Hachi Takashi)【R/P】{OP16-034}");
    if ("reason" in luffy) throw new Error(luffy.reason);
    expect(luffy.text).toContain("Ｄ");
    expect(cardNameKey(luffy.text)).toBe(cardNameKey("モンキー・D・ルフィ"));
  });
  it("removes bracketed language markers the collector reads and reports them", () => {
    expect(cardRushName("ナミ(英語版)【SR】{OP01-016}")).toEqual({ rule: "cardrush-title/names-1", text: "ナミ", markers: ["英語版"] });
    expect(cardRushName("ナミ【英語版】【SR】{OP01-016}")).toEqual({ rule: "cardrush-title/names-1", text: "ナミ", markers: ["英語版"] });
  });
  it.each([
    ["", "empty_title"],
    ["ロロノア・ゾロ(パラレル)", "not_a_card_title"],
    ["ロロノア・ゾロ(パラレル/SP仕様)【L/P】{OP01-001}", "unrecognised_marker"],
    ["ロロノア・ゾロ(/漫画絵)【L/P】{OP01-001}", "unrecognised_marker"],
    ["お玉(illust:)【UC】{OP01-006}", "unrecognised_marker"],
    ["お玉(illust:sowsow/illust:Anderson)【UC】{OP01-006}", "conflicting_illustrators"],
    ["ロロノア・ゾロ（パラレル）【L/P】{OP01-001}", "unexpected_bracket"],
    ["ロロノア(ゾロ)・ゾロ(パラレル)【L/P】{OP01-001}", "unexpected_bracket"],
    ["お玉〔状態C〕【UC】{OP01-006}", "unexpected_bracket"],
    ["〔状態C〕(illust:sowsow)【UC】{OP01-006}", "empty_name"],
  ])("refuses %s rather than guess", (title, reason) => {
    expect(cardRushName(title)).toMatchObject({ rule: "cardrush-title/names-1", reason });
  });
});

describe("tcgplayer-product/names-1 and cardmarket-product/names-1", () => {
  it.each([
    ["Roronoa Zoro (001)", "Roronoa Zoro", []],
    ["Roronoa Zoro (001) (Parallel)", "Roronoa Zoro", ["Parallel"]],
    ["Alvida (Box Topper)", "Alvida", ["Box Topper"]],
    ["DON!! Card (Manga) (Alternate Art)", "DON!! Card", ["Manga", "Alternate Art"]],
    ["Boss's Orders - 069/073", "Boss's Orders", []],
    ["Amoonguss", "Amoonguss", []],
  ])("takes the name out of %s", (productName, text, markers) => {
    expect(tcgplayerName(productName)).toEqual({ rule: "tcgplayer-product/names-1", text, markers });
  });
  it.each([
    ["Roronoa Zoro (Signed)", "unrecognised_marker"],
    ["Roronoa Zoro (001) (Parallel) [Foil]", "unexpected_bracket"],
    ["(001)", "empty_name"],
    ["   ", "empty_title"],
  ])("refuses %s rather than guess", (productName, reason) => {
    expect(tcgplayerName(productName)).toMatchObject({ rule: "tcgplayer-product/names-1", reason });
  });
  it("removes one Cardmarket collector number and keeps the rest verbatim", () => {
    expect(cardmarketName("Roronoa Zoro (OP01-001)")).toEqual({ rule: "cardmarket-product/names-1", text: "Roronoa Zoro", markers: [] });
    expect(cardmarketName("Roronoa Zoro (Parallel)")).toEqual({ rule: "cardmarket-product/names-1", text: "Roronoa Zoro (Parallel)", markers: [] });
    expect(cardmarketName("")).toMatchObject({ reason: "empty_title" });
  });
  it("gives the English sources' names one key with the official name", () => {
    const official = record();
    for (const name of [tcgplayerName("Roronoa Zoro (001) (Parallel)"), cardmarketName("Roronoa Zoro (OP01-001)")]) {
      if ("reason" in name) throw new Error(name.reason);
      expect(cardNameKey(name.text)).toBe(official.key);
    }
  });
});

describe("name records", () => {
  it("normalizes text and computes the key, keeping optional fields only when present", () => {
    const zoro = record({ text: " Roronoa  Zoro " });
    expect(zoro).toEqual({
      spec_version: "ctcg.card-name/1", card_key: "op-op01-001", lang: "en", text: "Roronoa Zoro", key: "roronoazoro",
      status: "official", source: "bandai-en", observed_at: at, rule: "verbatim",
    });
    const otama = cardRushName("〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}");
    if ("reason" in otama) throw new Error(otama.reason);
    expect(cardName({
      card_key: "op-op01-006", lang: "ja", text: otama.text, illustrator: otama.illustrator, status: "vendor",
      source: "cardrush", source_url: "https://www.cardrush-op.jp/product/15600", observed_at: at, rule: otama.rule,
    })).toMatchObject({ text: "お玉", key: "お玉", illustrator: "sowsow", status: "vendor", rule: "cardrush-title/names-1" });
  });
  it.each([
    [{ card_key: "op-op01-001-en" }, "card_key"],
    [{ lang: "jp" }, "lang"],
    [{ lang: "EN" }, "lang"],
    [{ script: "latn" }, "script"],
    [{ text: " ・ " }, "text"],
    [{ status: "verified" as never }, "status"],
    [{ source: "Bandai EN" }, "source"],
    [{ source_url: "http://example.test/card" }, "source_url"],
    [{ source_url: "https://user:pass@example.test/card" }, "source_url"],
    [{ observed_at: "2026-10-29" }, "observed_at"],
    [{ rule: "cardrush-title" }, "rule"],
    [{ illustrator: "  " }, "illustrator"],
    [{ sku: "op-op01-002-en" }, "sku"],
    [{ sku: "op-op01-001-ja-p1" }, "sku"],
    [{ sku: "OP-OP01-001-EN" }, "sku"],
  ])("refuses %o, naming the field", (input, field) => {
    expect(() => record(input)).toThrow(CardNameError);
    try { record(input); } catch (error) { expect((error as CardNameError).field).toBe(field); }
  });
});

describe("choosing the name to show", () => {
  const official = record();
  const vendor = record({ text: "Roronoa Zoro", status: "vendor", source: "tcgplayer", rule: "tcgplayer-product/names-1" });
  const community = record({ text: "Zoro", status: "community", source: "optcg-community" });

  it("ranks official above every other status, and agreement never promotes one", () => {
    expect(chooseCardName([community, vendor, official], { card_key: "op-op01-001", lang: "en" })).toEqual({ state: "named", status: "official", name: official });
    const agreeing = [vendor, record({ status: "vendor", source: "cardmarket", rule: "cardmarket-product/names-1" })];
    expect(chooseCardName(agreeing, { card_key: "op-op01-001", lang: "en" })).toMatchObject({ state: "named", status: "vendor" });
    expect(chooseCardName([community], { card_key: "op-op01-001", lang: "en" })).toMatchObject({ state: "named", status: "community" });
  });
  it("reports a missing name, including a missing official translation, rather than borrowing another language", () => {
    expect(chooseCardName([official], { card_key: "op-op01-001", lang: "ja" })).toEqual({ state: "missing" });
    expect(chooseCardName([official], { card_key: "op-op01-002", lang: "en" })).toEqual({ state: "missing" });
    expect(chooseCardName([official], { card_key: "op-op01-001", lang: "en", script: "Latn" })).toEqual({ state: "missing" });
  });
  it("reports disagreement within the top status as a conflict, and shows the latest of agreeing forms", () => {
    const other = record({ text: "Zoro Roronoa", observed_at: "2026-10-30T00:00:00Z" });
    expect(chooseCardName([official, other], { card_key: "op-op01-001", lang: "en" })).toEqual({ state: "conflict", status: "official", candidates: [official, other] });
    const wide = record({ lang: "ja", card_key: "op-op16-034", text: "モンキー・Ｄ・ルフィ" });
    const narrow = record({ lang: "ja", card_key: "op-op16-034", text: "モンキー・D・ルフィ", observed_at: "2026-10-30T00:00:00Z" });
    expect(chooseCardName([wide, narrow], { card_key: "op-op16-034", lang: "ja" })).toEqual({ state: "named", status: "official", name: narrow });
  });
  it("names a printing by its card key and language, with its own override first within a status", () => {
    const override = record({ text: "Roronoa Zoro (Special)", sku: "op-op01-001-en-p1" });
    expect(printingName([official, override], "op-op01-001-en-p1")).toEqual({ state: "named", status: "official", name: override });
    expect(printingName([official, override], "op-op01-001-en")).toEqual({ state: "named", status: "official", name: official });
    expect(printingName([vendor, override], "op-op01-001-en-p1")).toMatchObject({ status: "official", name: override });
    expect(printingName([official], "op-op01-001-ja")).toEqual({ state: "missing" });
    expect(printingName([official], "OP-OP01-001-EN")).toEqual({ state: "missing" });
  });
});

describe("CardName schema", () => {
  it("declares its public identifier and the fields cardName() emits", () => {
    expect(CARD_NAME_SCHEMA.$id).toBe("https://cambridgetcg.com/spec/v1/CardName.schema.json");
    expect(Object.keys(CARD_NAME_SCHEMA.properties).sort()).toEqual([
      "card_key", "illustrator", "key", "lang", "observed_at", "rule", "script", "sku", "source", "source_url", "spec_version", "status", "text",
    ]);
    for (const field of CARD_NAME_SCHEMA.required) expect(record()).toHaveProperty(field);
  });
});
