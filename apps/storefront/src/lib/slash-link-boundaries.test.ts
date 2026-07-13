import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("slash-bearing catalog identifiers", () => {
  it("encodes outgoing card-number and SKU path segments", () => {
    const setPage = source("src/app/prices/[game]/[set]/page.tsx");
    const cardPage = source("src/app/prices/[game]/[set]/[number]/page.tsx");
    const setApi = source(
      "src/app/api/v1/prices/games/[game]/sets/[set]/route.ts",
    );

    expect(setPage).toContain(
      "encodeURIComponent(card.card_number.toLowerCase())",
    );
    expect(setPage).toContain("encodeURIComponent(card.sku)");
    expect(cardPage).toContain("const encodedNumberSlug = encodeURIComponent(numberSlug)");
    expect(cardPage).toContain("const encodedSku = encodeURIComponent(card.sku)");
    expect(setApi).toContain("encodeURIComponent(c.card_number.toLowerCase())");
  });

  it("relies on Next route params without a second decode pass", () => {
    expect(existsSync(resolve(process.cwd(), "src/lib/http/params.ts"))).toBe(false);

    for (const path of [
      "src/app/api/v1/universal/card/[sku]/route.ts",
      "src/app/api/v1/universal/set/[code]/route.ts",
      "src/app/api/v1/prices/games/[game]/sets/[set]/cards/[number]/route.ts",
    ]) {
      expect(source(path)).not.toContain("decodeURIComponent");
      expect(source(path)).not.toContain("decodePathParam");
    }
  });

  it("uses a stable tie-breaker on the remaining paginated set query", () => {
    expect(source("src/app/api/v1/universal/set/[code]/route.ts")).toContain(
      "ORDER BY csc.card_number, csc.variant, csc.sku",
    );
  });
});
