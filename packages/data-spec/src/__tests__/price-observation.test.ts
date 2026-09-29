import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {
  MONEY_SCHEMA, NATIVE_PRICE_OBSERVATION_SCHEMA, MEMBER_PRICE_OBSERVATION_SCHEMA,
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
  it.each(["0", "0.000000", "-1", "NaN", "Infinity", "1e2", "1.1234567", 1, null])(
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
    expect(() => parseNativePriceAmount(0)).toThrow();
  });
  it.each([
    { mappingStatus: "exact" }, { sku: "op-op01-001-en" },
    { currency: "GBP" }, { underlyingMarket: "tcgplayer" }, { granularity: "printing" },
  ])("rejects incompatible identity, units or source scope %j", fields => {
    const invalid = { ...observation, ...fields };
    expect(validNative(invalid)).toBe(false);
    expect(() => assertPriceObservationValues(invalid as NativePriceObservation)).toThrow();
  });
  it("accepts exact reviewed mappings and source-native printing observations", () => {
    const exact = { ...observation, mappingStatus: "exact", sku: "pkm-sv01-001-en", setCode: "sv01" };
    expect(validNative(exact), JSON.stringify(validNative.errors)).toBe(true);
    const scryfall = { ...observation, source: "scryfall", currency: "USD", underlyingMarket: "tcgplayer", granularity: "printing", metric: "usd_foil", finish: "foil" };
    expect(validNative(scryfall), JSON.stringify(validNative.errors)).toBe(true);
  });
  it("requires evidence and distinct valid source/retrieval timestamps", () => {
    expect(validNative({ ...observation, sourceUpdatedAt: "not-a-date" })).toBe(false);
    expect(validNative({ ...observation, artifactSha256: "unknown" })).toBe(false);
    expect(validMember({ ...observation, id: "1", permittedUses: ["public"], attribution: "Example" })).toBe(false);
  });
});
