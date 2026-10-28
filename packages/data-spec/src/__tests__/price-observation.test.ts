import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {
  MONEY_SCHEMA, NATIVE_PRICE_OBSERVATION_SCHEMA, MEMBER_PRICE_OBSERVATION_SCHEMA, PAGE_SOURCE_COLLECTION_START,
  parseNativePriceAmount, assertPriceObservationValues, type NativePriceObservation,
} from "../index";
import { money } from "../../../pricing/src/money";

const ajv = new Ajv2020({ allErrors: true, strictTypes: false });
addFormats(ajv);
const validMoney = ajv.compile(MONEY_SCHEMA);
const validNative = ajv.compile(NATIVE_PRICE_OBSERVATION_SCHEMA);
const validMember = ajv.compile(MEMBER_PRICE_OBSERVATION_SCHEMA);
const observation: NativePriceObservation = {
  source: "cardmarket", sourceProductId: "123", sku: null, mappingStatus: "unmapped",
  game: "pokemon", setCode: null, productName: "Example", granularity: "source-product",
  finish: null, language: null, condition: null, metric: "trend", amount: "12.340000",
  currency: "EUR", underlyingMarket: "cardmarket", sourceUpdatedAt: "2026-09-06T00:00:00.000Z",
  retrievedAt: "2026-09-07T00:00:00.000Z", sourceUrl: "https://downloads.cardmarket.com/priceGuide.json",
  parserVersion: "test/1", crosswalkVersion: "test/1", evidenceVersion: "test/1", artifactSha256: "a".repeat(64),
  catalogSourceUrl: "https://downloads.cardmarket.com/catalog.json", catalogUpdatedAt: "2026-08-01T00:00:00.000Z",
  catalogArtifactSha256: "b".repeat(64), quality: "accepted",
};

describe("shared money and native observation schemas", () => {
  it("validates generic money including zero independently of source-price policy", () => {
    for (const value of ["0", "0.00", "12.340000", "999999999999.999999"]) {
      expect(validMoney(money(value, "GBP")), JSON.stringify(validMoney.errors)).toBe(true);
    }
    expect(validMoney({ amount: "1", currency: "GBP", unit: "minor" })).toBe(false);
    expect(validMoney({ amount: 100, currency: "GBP", unit: "major" })).toBe(false);
    expect(validMoney({ amount: "-1", currency: "GBP", unit: "major" })).toBe(false);
  });
  it("describes the actual native and enriched member fields without changing their shape", () => {
    expect(validNative(observation), JSON.stringify(validNative.errors)).toBe(true);
    const member = { ...observation, id: "1", permittedUses: ["member-api"], attribution: "Source-specific evidence" };
    expect(validMember(member), JSON.stringify(validMember.errors)).toBe(true);
    expect(validNative(member)).toBe(false);
    expect(() => assertPriceObservationValues(observation)).not.toThrow();
    expect(observation.amount).toBe("12.340000");
  });
  it.each(["0", "0.000000", "-1", "NaN", "Infinity", "1e2", "1.1234567", "1\n", "1\r", "1\u2028", "1\u2029", 1, null])(
    "rejects invalid native observation amount %s", amount => {
      const invalid = { ...observation, amount };
      expect(validNative(invalid)).toBe(false);
      expect(() => assertPriceObservationValues(invalid as NativePriceObservation)).toThrow();
    },
  );
  it("retains absence and source precision at ingestion", () => {
    expect(parseNativePriceAmount(null)).toBeNull();
    expect(parseNativePriceAmount(undefined)).toBeNull();
    expect(parseNativePriceAmount("12.340000")).toBe("12.340000");
    // Official files may use JSON numbers; only the raw parser coerces them.
    expect(parseNativePriceAmount(12.34)).toBe("12.34");
    expect(() => parseNativePriceAmount(0)).toThrow();
  });
  it.each([
    { mappingStatus: "exact" }, { sku: "op-op01-001-en" },
    { mappingStatus: "ambiguous", setCode: "op01" }, { mappingStatus: "unknown" },
    { mappingStatus: "exact", sku: 1, setCode: "op01" },
    { sourceProductId: 1 }, { metric: 1 }, { metric: "" },
    { currency: "GBP" }, { underlyingMarket: "tcgplayer" }, { granularity: "printing" },
    { language: "en" }, { condition: "near-mint" },
  ])("rejects incompatible identity, units or source scope %j", fields => {
    const invalid = { ...observation, ...fields };
    expect(validNative(invalid)).toBe(false);
    expect(validMember({ ...invalid, id: "1", permittedUses: ["member-display"], attribution: "Fixture" })).toBe(false);
    expect(() => assertPriceObservationValues(invalid as NativePriceObservation)).toThrow();
  });
  it.each([
    { granularity: "source-product" },
    { currency: "USD", underlyingMarket: "cardmarket" },
    { currency: "EUR", underlyingMarket: "tcgplayer" },
    { currency: "JPY", underlyingMarket: "cardrush", amount: "1500" },
  ])("rejects inconsistent Scryfall scope through runtime and schemas %j", fields => {
    const invalid = { ...observation, source: "scryfall", game: "magic", granularity: "printing", ...fields };
    expect(validNative(invalid)).toBe(false);
    expect(validMember({ ...invalid, id: "1", permittedUses: ["member-display"], attribution: "Fixture" })).toBe(false);
    expect(() => assertPriceObservationValues(invalid as NativePriceObservation)).toThrow();
  });
  it("accepts exact reviewed mappings and source-native printing observations", () => {
    const exact = { ...observation, mappingStatus: "exact", sku: "pkm-sv01-001-en", setCode: "sv01" };
    expect(validNative(exact), JSON.stringify(validNative.errors)).toBe(true);
    expect(() => assertPriceObservationValues(exact as NativePriceObservation)).not.toThrow();
    const scryfall = { ...observation, source: "scryfall", currency: "USD", underlyingMarket: "tcgplayer", granularity: "printing", metric: "usd_foil", finish: "foil" };
    expect(validNative(scryfall), JSON.stringify(validNative.errors)).toBe(true);
    expect(() => assertPriceObservationValues(scryfall as NativePriceObservation)).not.toThrow();
    const scryfallEur = { ...scryfall, currency: "EUR", underlyingMarket: "cardmarket", metric: "eur_foil" };
    expect(validNative(scryfallEur), JSON.stringify(validNative.errors)).toBe(true);
    expect(() => assertPriceObservationValues(scryfallEur as NativePriceObservation)).not.toThrow();
  });
  it("rejects JPY on Cardmarket, which publishes EUR only", () => {
    const invalid = { ...observation, currency: "JPY", underlyingMarket: "cardrush", amount: "1500" };
    expect(validNative(invalid)).toBe(false);
    expect(() => assertPriceObservationValues(invalid as NativePriceObservation)).toThrow();
  });
  it("keeps the source's own set key optional, non-empty when present, and out of member items", () => {
    for (const sourceSetKey of ["5229", "OP01", "3188", null]) {
      const row = { ...observation, sourceSetKey };
      expect(validNative(row), JSON.stringify(validNative.errors)).toBe(true);
      expect(() => assertPriceObservationValues(row)).not.toThrow();
    }
    // Absent is the stored-before-the-key case, and still valid.
    expect(NATIVE_PRICE_OBSERVATION_SCHEMA.required).not.toContain("sourceSetKey");
    for (const sourceSetKey of ["", " ", "\t", 5229]) {
      const row = { ...observation, sourceSetKey };
      expect(validNative(row)).toBe(false);
      expect(() => assertPriceObservationValues(row as NativePriceObservation)).toThrow("A source set key is non-empty text or null.");
    }
    // The member feed's items are what they were: no set key field.
    expect(validMember({ ...observation, sourceSetKey: "5229", id: "1", permittedUses: ["member-api"], attribution: "Fixture" })).toBe(false);
    expect(MEMBER_PRICE_OBSERVATION_SCHEMA.properties).not.toHaveProperty("sourceSetKey");
  });
  it("requires evidence and distinct valid source/retrieval timestamps", () => {
    expect(validNative({ ...observation, sourceUpdatedAt: "not-a-date" })).toBe(false);
    expect(validNative({ ...observation, artifactSha256: "unknown" })).toBe(false);
    expect(validMember({ ...observation, id: "1", permittedUses: ["public"], attribution: "Example" })).toBe(false);
  });
});

describe("live retail page observations", () => {
  const readAt = "2026-10-28T09:15:00.000Z";
  const cardrush: NativePriceObservation = {
    ...observation, source: "cardrush", sourceProductId: "cardrush-op.jp/product/1234", game: "one-piece",
    productName: "ロロノア・ゾロ [P] OP01-001", granularity: "printing", finish: "parallel", language: "ja",
    metric: "sell", amount: "1500", currency: "JPY", underlyingMarket: "cardrush",
    sourceUpdatedAt: readAt, retrievedAt: readAt, sourceUrl: "https://www.cardrush-op.jp/product/1234",
    catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null,
  };
  const tcgplayer: NativePriceObservation = {
    ...cardrush, source: "tcgplayer", sourceProductId: "tcgplayer:453017", productName: "Roronoa Zoro (Parallel)",
    language: "en", condition: "near-mint", metric: "market", amount: "12.34", currency: "USD", underlyingMarket: "tcgplayer",
    sourceUrl: "https://www.tcgplayer.com/product/453017",
  };
  const member = (row: object) => ({ ...row, id: "1", permittedUses: ["member-display"], attribution: "Fixture" });

  it.each([
    ["CardRush", cardrush], ["CardRush stored scale", { ...cardrush, amount: "1500.000000" }],
    ["CardRush exact", { ...cardrush, mappingStatus: "exact", sku: "op-op01-001-ja-p1", setCode: "op01" }],
    ["CardRush stated grade", { ...cardrush, condition: "B" }],
    ["TCGplayer", tcgplayer], ["TCGplayer listed median", { ...tcgplayer, metric: "listed-median", amount: "11.5" }],
  ])("accepts a %s observation through runtime and schemas", (_name, row) => {
    expect(validNative(row), JSON.stringify(validNative.errors)).toBe(true);
    expect(validMember(member(row)), JSON.stringify(validMember.errors)).toBe(true);
    expect(() => assertPriceObservationValues(row as NativePriceObservation)).not.toThrow();
  });

  it.each([
    ["CardRush in USD", cardrush, { currency: "USD", underlyingMarket: "tcgplayer" }],
    ["CardRush in EUR", cardrush, { currency: "EUR", underlyingMarket: "cardmarket" }],
    ["CardRush relabelled as TCGplayer", cardrush, { underlyingMarket: "tcgplayer" }],
    ["CardRush product aggregate", cardrush, { granularity: "source-product" }],
    ["fractional yen", cardrush, { amount: "1.5" }],
    ["fractional yen at stored scale", cardrush, { amount: "1500.000001" }],
    ["TCGplayer in JPY", tcgplayer, { currency: "JPY", underlyingMarket: "cardrush", amount: "1500" }],
    ["TCGplayer in EUR", tcgplayer, { currency: "EUR", underlyingMarket: "cardmarket" }],
    ["TCGplayer relabelled as Cardmarket", tcgplayer, { underlyingMarket: "cardmarket" }],
    ["TCGplayer product aggregate", tcgplayer, { granularity: "source-product" }],
    ["unknown source", tcgplayer, { source: "ebay" }],
  ])("rejects %s through runtime and schemas", (_name, base, fields) => {
    const invalid = { ...base, ...fields };
    expect(validNative(invalid)).toBe(false);
    expect(validMember(member(invalid))).toBe(false);
    expect(() => assertPriceObservationValues(invalid as NativePriceObservation)).toThrow();
  });

  it.each([["CardRush", cardrush], ["TCGplayer", tcgplayer]])("refuses a %s source time other than the read itself", (_name, row) => {
    const invented = { ...row, sourceUpdatedAt: "2026-10-27T00:00:00.000Z" };
    expect(() => assertPriceObservationValues(invented)).toThrow(/sourceUpdatedAt equal to retrievedAt/);
    // JSON Schema cannot compare two fields; the runtime boundary is the guard.
    expect(validNative(invented)).toBe(true);
    // The same instant in another ISO spelling is the same time.
    expect(() => assertPriceObservationValues({ ...row, sourceUpdatedAt: "2026-10-28T09:15:00Z" })).not.toThrow();
  });

  it.each([["CardRush", cardrush], ["TCGplayer", tcgplayer]])("refuses a %s page read before collection was permitted", (_name, row) => {
    expect(PAGE_SOURCE_COLLECTION_START).toBe("2026-10-28T00:00:00Z");
    for (const before of ["2026-10-27T23:59:59.999Z", "2026-10-28T08:59:59+09:00", "2026-07-12T00:00:00.000Z"]) {
      expect(() => assertPriceObservationValues({ ...row, sourceUpdatedAt: before, retrievedAt: before })).toThrow(/retrieved at or after 2026-10-28T00:00:00Z/);
    }
    for (const from of ["2026-10-28T00:00:00.000Z", "2026-10-28T09:00:00+09:00"]) {
      expect(() => assertPriceObservationValues({ ...row, sourceUpdatedAt: from, retrievedAt: from })).not.toThrow();
    }
    expect(() => assertPriceObservationValues({ ...row, sourceUpdatedAt: "not-a-date", retrievedAt: "not-a-date" })).toThrow();
  });

  it("leaves Cardmarket and Scryfall retrieval times as they were", () => {
    expect(observation.retrievedAt < PAGE_SOURCE_COLLECTION_START).toBe(true);
    expect(() => assertPriceObservationValues(observation)).not.toThrow();
    const scryfall = { ...observation, source: "scryfall", currency: "USD", underlyingMarket: "tcgplayer", granularity: "printing", metric: "usd" } as NativePriceObservation;
    expect(() => assertPriceObservationValues(scryfall)).not.toThrow();
  });

  it("is the line migration 0139 holds in storage", () => {
    const migration = readFileSync(new URL("../../../../apps/storefront/drizzle/0139_widen_price_sources.sql", import.meta.url), "utf8");
    expect(migration).toContain(`CHECK (source NOT IN ('cardrush','tcgplayer') OR retrieved_at >= timestamptz '${PAGE_SOURCE_COLLECTION_START}')`);
  });
});
