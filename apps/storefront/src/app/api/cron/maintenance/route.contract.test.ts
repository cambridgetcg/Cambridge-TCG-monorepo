import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("maintenance cron health contract", () => {
  it("surfaces a rejected market maintenance lane as a failing HTTP status", () => {
    expect(source).toContain('market.status === "rejected" ? 503 : 200');
    expect(source).toContain("const results = await Promise.allSettled");
    expect(source).toContain("runMarketMaintenance()");
  });
});
