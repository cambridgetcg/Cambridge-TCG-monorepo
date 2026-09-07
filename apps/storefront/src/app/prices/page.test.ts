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

  it("mounts the gated member browser before the unchanged public catalog", () => {
    expect(landingSource.indexOf("<MemberPriceBrowser")).toBeGreaterThan(-1);
    expect(landingSource.indexOf("<MemberPriceBrowser")).toBeLessThan(landingSource.indexOf("<CardPriceSearchForm"));
    expect(landingSource).not.toContain("readMemberPrices(");
    expect(landingSource).toContain("export const metadata: Metadata");
    expect(landingSource).not.toContain("generateMetadata");
  });

  it("keeps member reads out of the public hierarchy and its metadata", () => {
    for (const path of ["[game]/page.tsx", "[game]/[set]/page.tsx", "[game]/[set]/[number]/page.tsx"]) {
      const source = readFileSync(join(here, path), "utf8");
      expect(source).toContain("<MemberCatalogLink");
      expect(source).not.toContain("readMemberPrices");
      expect(source).not.toContain("getMemberSessionActor");
    }
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
