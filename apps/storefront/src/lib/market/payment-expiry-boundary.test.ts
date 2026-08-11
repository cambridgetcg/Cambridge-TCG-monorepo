import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("market payment expiry boundary", () => {
  it("keeps ambiguous payment expiry from mutating matched trades on reads or cron", () => {
    const sweepStart = source.indexOf("async function sweepExpired");
    const sweepEnd = source.indexOf("// ── Place order + attempt match ──");
    const sweep = source.slice(sweepStart, sweepEnd);

    expect(sweepStart).toBeGreaterThan(0);
    expect(sweepEnd).toBeGreaterThan(sweepStart);
    expect(sweep).not.toContain("UPDATE market_trades");
    expect(sweep).not.toContain("TRADE_PAYMENT_DEFAULT");
    expect(sweep).not.toContain("seller's listing is back");
    expect(sweep).toContain("remains held for reconciliation");
    expect(source).toContain("runMarketMaintenance");
    expect(source).toContain("await sweepExpired(true)");
  });
});
