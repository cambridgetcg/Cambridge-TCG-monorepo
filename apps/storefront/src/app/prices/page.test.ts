import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const landingSource = readFileSync(join(here, "page.tsx"), "utf8");

describe("prices landing task hierarchy", () => {
  it("keeps search and browse ahead of display-currency controls", () => {
    const searchIndex = landingSource.indexOf("<CardPriceSearchForm");
    const browseIndex = landingSource.indexOf('id="browse-by-game"');
    const currencyIndex = landingSource.indexOf("<CurrencySelector");

    expect(searchIndex).toBeGreaterThan(-1);
    expect(browseIndex).toBeGreaterThan(searchIndex);
    expect(currencyIndex).toBeGreaterThan(browseIndex);
  });

  it("describes sourced reference data without the retired merchant copy", () => {
    expect(landingSource).toMatch(/reference data, not\s+an offer/i);
    expect(landingSource).not.toMatch(/retail\s+buy\s+price/i);
    expect(landingSource).not.toMatch(/\bwe\s+buy\b/i);
    expect(landingSource).not.toMatch(/instant\s+store\s+credit/i);
    expect(landingSource).not.toMatch(/trade-in\s+store\s+credit/i);
    expect(landingSource).not.toContain("config.seo_description");
  });
});
