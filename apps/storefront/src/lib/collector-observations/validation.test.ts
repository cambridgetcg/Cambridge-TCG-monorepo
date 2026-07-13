import { describe, expect, it } from "vitest";
import {
  parseCreateCollectorObservation,
  parseExactPrice,
  parsePatchCollectorObservation,
} from "./validation";

const TODAY = new Date("2026-07-12T12:00:00.000Z");

function validCreate(overrides: Record<string, unknown> = {}) {
  return {
    submission_key: "123e4567-e89b-42d3-a456-426614174000",
    sku: "op-op01-001-ja",
    observation_kind: "purchase",
    condition: "NM",
    price_amount: "12.3",
    price_currency: "GBP",
    observed_on: "2026-07-11",
    first_party_attested: true,
    ...overrides,
  };
}

describe("collector observation validation", () => {
  it("defaults to private, normalizes safe values, and keeps price exact", () => {
    const result = parseCreateCollectorObservation(
      validCreate({ sku: "OP-OP01-001-JP", condition: "lp", price_currency: "gbp" }),
      TODAY,
    );

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        sku: "op-op01-001-ja",
        condition: "LP",
        price_amount: "12.30",
        price_currency: "GBP",
        sharing_mode: "private",
        first_party_attested: true,
      }),
    });
  });

  it("requires a first-party attestation", () => {
    const result = parseCreateCollectorObservation(
      validCreate({ first_party_attested: false }),
      TODAY,
    );
    expect(result).toMatchObject({ ok: false, field: "first_party_attested" });
  });

  it("requires explicit acknowledgement for CC0 and nowhere else", () => {
    expect(
      parseCreateCollectorObservation(validCreate({ sharing_mode: "cc0" }), TODAY),
    ).toMatchObject({ ok: false, field: "cc0_acknowledged" });

    expect(
      parseCreateCollectorObservation(
        validCreate({ sharing_mode: "cc0", cc0_acknowledged: true }),
        TODAY,
      ),
    ).toMatchObject({
      ok: true,
      value: { sharing_mode: "cc0", cc0_acknowledged: true },
    });

    expect(
      parseCreateCollectorObservation(
        validCreate({ sharing_mode: "private", cc0_acknowledged: true }),
        TODAY,
      ),
    ).toMatchObject({ ok: false, field: "cc0_acknowledged" });
  });

  it("accepts decimal strings only and never rounds extra precision", () => {
    expect(parseExactPrice("0.01")).toEqual({ ok: true, value: "0.01" });
    expect(parseExactPrice("12")).toEqual({ ok: true, value: "12.00" });
    expect(parseExactPrice(12.34)).toMatchObject({ ok: false, field: "price_amount" });
    expect(parseExactPrice("12.345")).toMatchObject({ ok: false, field: "price_amount" });
    expect(parseExactPrice("0.00")).toMatchObject({ ok: false, field: "price_amount" });
  });

  it("rejects impossible or future dates", () => {
    expect(
      parseCreateCollectorObservation(validCreate({ observed_on: "2026-02-30" }), TODAY),
    ).toMatchObject({ ok: false, field: "observed_on" });
    expect(
      parseCreateCollectorObservation(validCreate({ observed_on: "2026-07-13" }), TODAY),
    ).toMatchObject({ ok: false, field: "observed_on" });
  });

  it("refuses receipt, URL, note, and identity-shaped extra fields", () => {
    for (const field of ["receipt", "source_url", "note", "email"]) {
      const result = parseCreateCollectorObservation(validCreate({ [field]: "secret" }), TODAY);
      expect(result).toMatchObject({ ok: false, field });
    }
  });

  it("accepts the unchanged attestation on PATCH but rejects changing it", () => {
    expect(
      parsePatchCollectorObservation(
        { revision: 2, price_amount: "13", first_party_attested: true },
        TODAY,
      ),
    ).toMatchObject({ ok: true, value: { revision: 2, price_amount: "13.00" } });

    expect(
      parsePatchCollectorObservation(
        { revision: 2, price_amount: "13", first_party_attested: false },
        TODAY,
      ),
    ).toMatchObject({ ok: false, field: "first_party_attested" });
  });

  it("requires optimistic revision and at least one actual change", () => {
    expect(parsePatchCollectorObservation({ price_amount: "13" }, TODAY)).toMatchObject({
      ok: false,
      field: "revision",
    });
    expect(parsePatchCollectorObservation({ revision: 1 }, TODAY)).toMatchObject({
      ok: false,
      field: "body",
    });
  });
});
