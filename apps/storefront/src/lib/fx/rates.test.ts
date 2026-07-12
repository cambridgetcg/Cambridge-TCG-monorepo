import { describe, expect, it } from "vitest";
import { parseEcbRates } from "./rates";

const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01">
  <Cube>
    <Cube time="2026-07-10">
      <Cube currency="USD" rate="1.2"/>
      <Cube currency="JPY" rate="160"/>
      <Cube currency="GBP" rate="0.8"/>
      <Cube currency="HKD" rate="8.5"/>
      <Cube currency="CHF" rate="0.95"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("ECB display-rate parser", () => {
  it("transforms unmodified EUR quotes into a labelled GBP base", () => {
    const table = parseEcbRates(ECB_XML, "2026-07-12T10:00:00.000Z");

    expect(table).toMatchObject({
      base: "GBP",
      source: "ecb.europa.eu",
      as_of: "2026-07-10T00:00:00.000Z",
      fetched_at: "2026-07-12T10:00:00.000Z",
      is_fallback: false,
      rates: {
        GBP: 1,
        EUR: 1.25,
        USD: 1.5,
        JPY: 200,
        HKD: 10.625,
        CHF: 1.1875,
      },
    });
  });

  it("fails closed when a required quote is missing", () => {
    expect(parseEcbRates(ECB_XML.replace('<Cube currency="CHF" rate="0.95"/>', ""), "2026-07-12T10:00:00.000Z"))
      .toBeNull();
  });
});
