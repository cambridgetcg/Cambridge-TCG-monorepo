import { describe, expect, it } from "vitest";
import { DEFAULTS } from "@cambridge-tcg/pricing";
import { channelPriceForRow } from "../db-source";

describe("stored/derived channel price distinction", () => {
  const row = { cardrush_jpy: 600, gbp_jpy_rate: 185, category: "singles", price_gbp: 999 };
  it("uses a valid source observation and rate with the shared computation", () => {
    expect(channelPriceForRow(row, DEFAULTS.cambridgetcg!)).toBe(5.1);
  });
  it.each([{ cardrush_jpy: 0 }, { cardrush_jpy: Infinity }, { gbp_jpy_rate: 0 },
    { gbp_jpy_rate: -1 }, { gbp_jpy_rate: null }, { gbp_jpy_rate: NaN }])(
    "does not replace invalid/incomplete source inputs with the unrelated stored price %j", invalid => {
      expect(channelPriceForRow({ ...row, ...invalid }, DEFAULTS.cambridgetcg!)).toBeNull();
    },
  );
  it("uses the stored GBP quote only when no source observation exists", () => {
    expect(channelPriceForRow({ ...row, cardrush_jpy: null, price_gbp: 4.2 }, DEFAULTS.cambridgetcg!)).toBe(4.2);
    for (const amount of [null, 0, -1, NaN, Infinity]) {
      expect(channelPriceForRow({ ...row, cardrush_jpy: null, price_gbp: amount }, DEFAULTS.cambridgetcg!)).toBeNull();
    }
  });
});
