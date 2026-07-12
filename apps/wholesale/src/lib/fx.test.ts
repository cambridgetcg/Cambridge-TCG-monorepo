import { describe, expect, it } from "vitest";
import { parseEcbGbpRate } from "./fx";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01">
  <Cube>
    <Cube time="2026-07-10">
      <Cube currency="USD" rate="1.2000"/>
      <Cube currency="GBP" rate="0.8000"/>
      <Cube currency="JPY" rate="160.0000"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("ECB GBP rate transformation", () => {
  it("rebases EUR quotes to units per GBP", () => {
    expect(parseEcbGbpRate(XML, "JPY")).toEqual({
      currency: "JPY",
      rate: 200,
      as_of: "2026-07-10",
      source: "ecb.europa.eu",
    });
    expect(parseEcbGbpRate(XML, "USD")?.rate).toBeCloseTo(1.5);
    expect(parseEcbGbpRate(XML, "EUR")?.rate).toBe(1.25);
    expect(parseEcbGbpRate(XML, "GBP")?.rate).toBe(1);
  });

  it("returns null for missing or invalid quotes", () => {
    expect(parseEcbGbpRate(XML, "CHF")).toBeNull();
    expect(parseEcbGbpRate(XML, "not-a-currency")).toBeNull();
    expect(parseEcbGbpRate("<not-ecb />", "JPY")).toBeNull();
  });
});
