import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { soldCompsPausedData } from "@/lib/sold-comps/query";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("sold-comps publication boundary", () => {
  it("publishes policy status without transaction observations", () => {
    expect(soldCompsPausedData()).toMatchObject({
      status: "paused",
      buckets: [],
      published_bucket_count: 0,
    });
    expect(JSON.stringify(soldCompsPausedData("op-test"))).not.toMatch(
      /price_gbp|sale_count|last_sold|condition|min_price|median_price|max_price/i,
    );
  });

  it("keeps both public routes off the transaction database and CC0", () => {
    for (const path of [
      "src/app/api/v1/sold-comps/route.ts",
      "src/app/api/v1/sold-comps/[sku]/route.ts",
    ]) {
      const route = source(path);
      expect(route).toContain('license: "NOASSERTION"');
      expect(route).toContain('source_license: ["internal-only"]');
      expect(route).toContain("soldCompsPausedData");
      expect(route).toContain("no_cache: true");
      expect(route).not.toContain('from "@/lib/db"');
      expect(route).not.toContain("market_trades");
      expect(route).not.toContain("p2p_sold_comps");
      expect(route).not.toContain("CC0-1.0");
    }

    const queryLayer = source("src/lib/sold-comps/query.ts");
    expect(queryLayer).not.toContain("query(");
    expect(queryLayer).not.toContain("MIN(");
    expect(queryLayer).not.toContain("PERCENTILE_CONT");
  });
});
