import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { CARD_NAME_SCHEMA, CardNameError, cardName, cardRushName, tcgplayerName, type CardName, type CardNameInput } from "../../../sku/src/names";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(CARD_NAME_SCHEMA);
const at = "2026-10-29T00:00:00Z";

function extracted(result: ReturnType<typeof cardRushName>) {
  if ("reason" in result) throw new Error(result.reason);
  return result;
}

describe("shared CardName schema", () => {
  const otama = extracted(cardRushName("〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}"));
  const zoro = extracted(tcgplayerName("Roronoa Zoro (001) (Parallel)"));
  const records: CardName[] = [
    cardName({ card_key: "op-op01-001", lang: "en", text: "Roronoa Zoro", status: "official", source: "bandai-en", observed_at: at, rule: "verbatim" }),
    cardName({ card_key: "op-op01-006", lang: "ja", text: otama.text, illustrator: otama.illustrator, status: "vendor", source: "cardrush",
      source_url: "https://www.cardrush-op.jp/product/15600", observed_at: at, rule: otama.rule }),
    cardName({ card_key: "op-op01-001", lang: "en", text: zoro.text, status: "vendor", source: "tcgplayer", observed_at: "2026-10-29T09:30:00+09:00", rule: zoro.rule }),
    cardName({ card_key: "op-op16-034", lang: "ja", script: "Latn", text: "Monkey D. Luffy", status: "machine", source: "ctcg-transliteration", observed_at: at, rule: "verbatim", sku: "op-op16-034-ja-p1" }),
  ];

  it.each(records.map((record) => [record.text, record]))("describes the record cardName() builds for %s", (_, record) => {
    expect(validate(record), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each([
    ["an undeclared field", { verified: true }],
    ["another spec version", { spec_version: "ctcg.card-name/2" }],
    ["a status outside the four", { status: "verified" }],
    ["a card key with a language", { card_key: "op-op01-001-en" }],
    ["an unregistered game", { card_key: "zz-op01-001" }],
    ["a language name", { lang: "English" }],
    ["untrimmed text", { text: " Roronoa Zoro" }],
    ["doubled spaces", { text: "Roronoa  Zoro" }],
    ["a key with a middle dot", { key: "ロロノア・ゾロ" }],
    ["an http source", { source_url: "http://example.test/card" }],
    ["a source URL with a space", { source_url: "https://example.test/a b" }],
    ["a source URL that is not percent-encoded", { source_url: "https://www.cardrush-op.jp/product-list?keyword=ナミ" }],
    ["a source URL with credentials", { source_url: "https://user:pass@example.test/card" }],
    ["a date without a time", { observed_at: "2026-10-29" }],
    ["a day the calendar lacks", { observed_at: "2026-02-30T00:00:00Z" }],
    ["an unversioned rule", { rule: "cardrush-title" }],
    ["an official name taken through a vendor rule", { rule: "cardrush-title/names-1" }],
    ["a non-canonical printing", { sku: "OP-OP01-001-EN" }],
  ])("rejects %s", (_, change) => {
    expect(validate({ ...records[0], ...change })).toBe(false);
  });

  // cardName() checks more than the schema can, never less: whatever it
  // builds, the published schema accepts.
  it.each<[string, Partial<CardNameInput>]>([
    ["a leap day with an offset", { observed_at: "2028-02-29T23:59:59.5+09:00" }],
    ["February 30", { observed_at: "2026-02-30T00:00:00Z" }],
    ["hour 24", { observed_at: "2026-10-29T24:00:00Z" }],
    ["a leap second", { observed_at: "2026-12-31T23:59:60Z" }],
    ["a percent-encoded query", { source_url: "https://www.cardrush-op.jp/product-list?keyword=%E3%83%8A%E3%83%9F" }],
    ["a raw Japanese query", { source_url: "https://www.cardrush-op.jp/product-list?keyword=ナミ" }],
    ["a trailing space", { source_url: "https://www.cardrush-op.jp/product/15600 " }],
    ["an inner space", { source_url: "https://www.cardrush-op.jp/a b" }],
    ["a pipe in the path", { source_url: "https://example.test/a|b" }],
    ["an IPv6 host", { source_url: "https://[::1]/card" }],
    ["a fragment", { source_url: "https://example.test/card#name" }],
    ["a vendor rule on an official name", { rule: "tcgplayer-product/names-1" }],
    ["a vendor rule on a vendor name", { status: "vendor", rule: "tcgplayer-product/names-1" }],
  ])("accepts in the schema what cardName() builds: %s", (_, change) => {
    let record: CardName;
    try {
      record = cardName({ card_key: "op-op01-001", lang: "en", text: "Roronoa Zoro", status: "official", source: "bandai-en", observed_at: at, rule: "verbatim", ...change });
    } catch (error) {
      expect(error).toBeInstanceOf(CardNameError);
      return;
    }
    expect(validate(record), JSON.stringify(validate.errors)).toBe(true);
  });

  it("requires every field cardName() always emits", () => {
    const { key: _key, ...withoutKey } = records[0]!;
    expect(validate(withoutKey)).toBe(false);
  });
});
