import { describe, it, expect } from "vitest";

import {
  rfc3986,
  buildAuthorizationHeader,
  hasCardmarketCreds,
  cardmarketCredsFromEnv,
  type CardmarketCreds,
} from "./oauth1";
import { normalizeCardmarket, headlineEur, mapCardmarketSet, mapCardNumber, type CardmarketRaw } from "./normalize";
import type { CardmarketProduct } from "./types";

const CREDS: CardmarketCreds = {
  appToken: "app-tok",
  appSecret: "app-sec",
  accessToken: "acc-tok",
  accessTokenSecret: "acc-sec",
};
const URL = "https://apiv2.cardmarket.com/ws/v2.0/output.json/products/123?x=1&y=2";
const FIXED = { nonce: "fixed-nonce", timestamp: 1700000000 };

describe("cardmarket/oauth1", () => {
  it("rfc3986 escapes OAuth-significant specials", () => {
    expect(rfc3986("a!b*c'd(e)")).toBe("a%21b%2Ac%27d%28e%29");
  });

  it("signs deterministically for fixed nonce+timestamp", () => {
    const a = buildAuthorizationHeader("GET", URL, CREDS, FIXED);
    const b = buildAuthorizationHeader("GET", URL, CREDS, FIXED);
    expect(a).toBe(b);
  });

  it("is tamper-sensitive (different URL → different signature)", () => {
    const a = buildAuthorizationHeader("GET", URL, CREDS, FIXED);
    const b = buildAuthorizationHeader("GET", URL.replace("123", "456"), CREDS, FIXED);
    expect(a).not.toBe(b);
  });

  it("emits a well-formed OAuth header with all required fields", () => {
    const h = buildAuthorizationHeader("GET", URL, CREDS, FIXED);
    for (const f of [
      'realm="https://apiv2.cardmarket.com/ws/v2.0/output.json/products/123"',
      'oauth_consumer_key="app-tok"',
      'oauth_token="acc-tok"',
      'oauth_signature_method="HMAC-SHA1"',
      'oauth_version="1.0"',
      "oauth_signature=",
    ]) {
      expect(h).toContain(f);
    }
  });

  it("detects complete vs incomplete credentials", () => {
    expect(hasCardmarketCreds(CREDS)).toBe(true);
    expect(hasCardmarketCreds({ appToken: "x" })).toBe(false);
    expect(hasCardmarketCreds(undefined)).toBe(false);
  });

  it("reads creds from env, or returns undefined when incomplete", () => {
    expect(cardmarketCredsFromEnv({})).toBeUndefined();
    expect(
      cardmarketCredsFromEnv({
        CARDMARKET_APP_TOKEN: "a",
        CARDMARKET_APP_SECRET: "b",
        CARDMARKET_ACCESS_TOKEN: "c",
        CARDMARKET_ACCESS_TOKEN_SECRET: "d",
      }),
    ).toEqual({ appToken: "a", appSecret: "b", accessToken: "c", accessTokenSecret: "d" });
  });
});

const raw = (product: Partial<CardmarketProduct>): CardmarketRaw => ({
  product: product as CardmarketProduct,
  retrieved_at: "2026-06-10T00:00:00.000Z",
});

describe("cardmarket/normalize", () => {
  it("headlineEur prefers TREND → AVG → SELL → LOW", () => {
    expect(headlineEur({ TREND: 5, AVG: 4, SELL: 3, LOW: 2 })).toBe(5);
    expect(headlineEur({ AVG: 4, SELL: 3, LOW: 2 })).toBe(4);
    expect(headlineEur({ LOW: 2 })).toBe(2);
    expect(headlineEur(undefined)).toBeUndefined();
  });

  it("slugs the MKM expansion into a set segment", () => {
    expect(mapCardmarketSet({ expansion: { abbreviation: "SV-OBF" } } as CardmarketProduct)).toBe("svobf");
    expect(mapCardmarketSet({} as CardmarketProduct)).toBeUndefined();
  });

  it("collapses fraction collector numbers to the numerator (TCGplayer convention)", () => {
    expect(mapCardNumber("057/198")).toBe("057");
    expect(mapCardNumber("TG12/TG30")).toBe("tg12");
    expect(mapCardNumber("123a")).toBe("123a");
    expect(mapCardNumber("★")).toBeUndefined();
    expect(mapCardNumber("  ")).toBeUndefined();
  });

  it("builds the SKU number segment from the fraction numerator", () => {
    const r = normalizeCardmarket(
      raw({ idProduct: 7, idGame: 6, idLanguage: 7, number: "057/198", expansion: { abbreviation: "S12a" }, priceGuide: { TREND: 8 } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record.sku).toBe("pkm-s12a-057-ja");
  });

  it("normalizes a complete product into a canonical EUR price", () => {
    const r = normalizeCardmarket(
      raw({ idProduct: 42, idGame: 1, idLanguage: 1, number: "123", expansion: { abbreviation: "MH3" }, priceGuide: { TREND: 12.5, AVG: 11 } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.sku).toBe("mtg-mh3-123-en");
      expect(r.record.amount).toBe("12.50");
      expect(r.record.currency).toBe("EUR");
      expect(r.record.upstream_id).toBe("42");
      expect(r.record.observed_at).toBe("2026-06-10T00:00:00.000Z");
    }
  });

  it("falls back to AVG and resolves language from localization", () => {
    const r = normalizeCardmarket(
      raw({ idProduct: 1, idGame: 3, number: "1", localization: [{ idLanguage: 2 }], expansion: { abbreviation: "LOB" }, priceGuide: { AVG: 3.333 } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.sku).toBe("ygo-lob-1-fr");
      expect(r.record.amount).toBe("3.33");
    }
  });

  it.each([
    ["unknown-game", { idProduct: 1, idGame: 99, idLanguage: 1, number: "1", expansion: { abbreviation: "x" }, priceGuide: { TREND: 1 } }],
    ["unknown-language", { idProduct: 1, idGame: 1, idLanguage: 999, number: "1", expansion: { abbreviation: "x" }, priceGuide: { TREND: 1 } }],
    ["no-set-match", { idProduct: 1, idGame: 1, idLanguage: 1, number: "1", priceGuide: { TREND: 1 } }],
    ["no-card-number", { idProduct: 1, idGame: 1, idLanguage: 1, expansion: { abbreviation: "x" }, priceGuide: { TREND: 1 } }],
    ["empty-card-number", { idProduct: 1, idGame: 1, idLanguage: 1, number: "★", expansion: { abbreviation: "x" }, priceGuide: { TREND: 1 } }],
    ["no-price-guide", { idProduct: 1, idGame: 1, idLanguage: 1, number: "1", expansion: { abbreviation: "x" } }],
  ])("quarantines on %s", (kind, product) => {
    const r = normalizeCardmarket(raw(product as Partial<CardmarketProduct>));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(kind);
  });
});
