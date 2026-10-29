import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { CARD_NAME_SCHEMA, cardName, cardRushName, tcgplayerName, type CardName } from "../../../sku/src/names";

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
    ["a date without a time", { observed_at: "2026-10-29" }],
    ["an unversioned rule", { rule: "cardrush-title" }],
    ["a non-canonical printing", { sku: "OP-OP01-001-EN" }],
  ])("rejects %s", (_, change) => {
    expect(validate({ ...records[0], ...change })).toBe(false);
  });

  it("requires every field cardName() always emits", () => {
    const { key: _key, ...withoutKey } = records[0]!;
    expect(validate(withoutKey)).toBe(false);
  });
});
