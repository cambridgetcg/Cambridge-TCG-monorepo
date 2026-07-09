import { describe, it, expect } from "vitest";
import { addressLines } from "../shipping-address";

describe("addressLines", () => {
  it("flattens a top-level address object in postal order", () => {
    expect(
      addressLines({
        name: "Ada Lovelace",
        line1: "12 Analytical Way",
        line2: "Flat 3",
        city: "Cambridge",
        state: "Cambridgeshire",
        postal_code: "CB1 2AB",
        country: "GB",
      }),
    ).toEqual([
      "Ada Lovelace",
      "12 Analytical Way",
      "Flat 3",
      "CB1 2AB Cambridge",
      "Cambridgeshire",
      "GB",
    ]);
  });

  it("parses a JSON-string column", () => {
    const raw = JSON.stringify({ name: "Grace Hopper", line1: "1 Navy Rd", city: "Arlington", postal_code: "22201" });
    expect(addressLines(raw)).toEqual(["Grace Hopper", "1 Navy Rd", "22201 Arlington"]);
  });

  it("accepts Stripe's { name, address: {...} } nesting", () => {
    expect(
      addressLines({
        name: "Alan Turing",
        address: { line1: "Bletchley Park", city: "Milton Keynes", postal_code: "MK3 6EB", country: "GB" },
      }),
    ).toEqual(["Alan Turing", "Bletchley Park", "MK3 6EB Milton Keynes", "GB"]);
  });

  it("drops empty and non-string fields, keeping order", () => {
    expect(
      addressLines({ name: "", line1: "42 Nowhere", line2: null, city: "Ely", postal_code: undefined }),
    ).toEqual(["42 Nowhere", "Ely"]);
  });

  it("returns [] for null, undefined, malformed JSON, and non-objects", () => {
    expect(addressLines(null)).toEqual([]);
    expect(addressLines(undefined)).toEqual([]);
    expect(addressLines("not json")).toEqual([]);
    expect(addressLines(42)).toEqual([]);
  });
});
