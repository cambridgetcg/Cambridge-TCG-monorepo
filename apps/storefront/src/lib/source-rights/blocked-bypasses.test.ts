import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "..", "..");

describe("retired source-rights bypasses", () => {
  it("keeps the Cardmarket proxy proof-of-concept network-free", () => {
    const script = readFileSync(
      resolve(repoRoot, "apps/storefront/scripts/_e2e-cardmarket.ts"),
      "utf8",
    );

    expect(script).toContain("RETIRED");
    expect(script).not.toContain("createFetcher");
    expect(script).not.toMatch(/\bfetch\s*\(/);
    expect(script).not.toContain("CARDMARKET_BRIGHT_DATA");
    expect(script).not.toContain("gunzipSync");
  });

  it("does not claim Cardmarket downloads are currently legitimate", () => {
    const intake = readFileSync(
      resolve(repoRoot, "docs/methodology/source-intake.md"),
      "utf8",
    );

    expect(intake).not.toContain("legitimately downloadable now");
    expect(intake).toContain("The source stays blocked/no-fetch");
  });

  it("keeps the TCGCollector runner and cron free of network and storage imports", () => {
    const runner = readFileSync(
      resolve(repoRoot, "apps/wholesale/src/lib/tcgcollector-discovery.ts"),
      "utf8",
    );
    const cron = readFileSync(
      resolve(
        repoRoot,
        "apps/wholesale/src/app/api/cron/discover/tcgcollector/route.ts",
      ),
      "utf8",
    );

    for (const source of [runner, cron]) {
      expect(source).not.toContain('from "@/lib/db"');
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toContain("createFetcher");
    }
    expect(cron).not.toContain("runTcgcollectorDiscovery");
  });

  it("does not build the sitemap from restricted wholesale catalog rows", () => {
    const sitemap = readFileSync(
      resolve(repoRoot, "apps/storefront/src/app/sitemap.ts"),
      "utf8",
    );
    const robots = readFileSync(
      resolve(repoRoot, "apps/storefront/src/app/robots.txt/route.ts"),
      "utf8",
    );

    expect(sitemap).not.toContain("fetchGames");
    expect(sitemap).not.toContain("fetchSets");
    expect(sitemap).not.toContain("fetchPrices");
    expect(sitemap).not.toContain("/product/${");
    expect(sitemap).not.toContain("/prices/${");
    expect(robots).toContain("Disallow: /catalog");
    expect(robots).toContain("Disallow: /product/");
    expect(robots).toContain("Disallow: /prices");
  });

  it("keeps crawler-visible catalog and price indexes value-free", () => {
    const pages = [
      "apps/storefront/src/app/catalog/page.tsx",
      "apps/storefront/src/app/prices/page.tsx",
      "apps/storefront/src/app/prices/coverage/page.tsx",
      "apps/storefront/src/app/prices/[game]/page.tsx",
      "apps/storefront/src/app/prices/[game]/[set]/page.tsx",
      "apps/storefront/src/app/prices/[game]/movers/page.tsx",
    ];

    for (const page of pages) {
      const source = readFileSync(resolve(repoRoot, page), "utf8");
      expect(source).not.toContain("fetchPrices");
      expect(source).not.toContain("fetchSets");
      expect(source).not.toContain("fetchAggregatorCoverage");
      expect(source).toContain("robots: { index: false");
    }
  });

  it("keeps per-card HTML free of imported display and price fields", () => {
    const product = readFileSync(
      resolve(repoRoot, "apps/storefront/src/app/product/[sku]/page.tsx"),
      "utf8",
    );
    const priceCard = readFileSync(
      resolve(
        repoRoot,
        "apps/storefront/src/app/prices/[game]/[set]/[number]/page.tsx",
      ),
      "utf8",
    );

    for (const source of [product, priceCard]) {
      expect(source).toContain("robots: { index: false");
      expect(source).not.toContain("card.image_url");
      expect(source).not.toContain("card.price_gbp");
      expect(source).not.toContain("card.name_en");
      expect(source).not.toContain("card.set_name");
      expect(source).not.toContain("setMeta.name");
      expect(source).not.toContain("open data");
    }
  });

  it("keeps the homepage and public market reads off restricted wholesale fields", () => {
    const home = readFileSync(
      resolve(repoRoot, "apps/storefront/src/app/page.tsx"),
      "utf8",
    );
    const catalog = readFileSync(
      resolve(repoRoot, "apps/storefront/src/app/api/market/catalog/route.ts"),
      "utf8",
    );
    const unified = readFileSync(
      resolve(repoRoot, "apps/storefront/src/lib/market/unified.ts"),
      "utf8",
    );
    const cardMarket = readFileSync(
      resolve(repoRoot, "apps/storefront/src/lib/market/card-market.ts"),
      "utf8",
    );

    expect(home).not.toContain("fetchGames");
    expect(home).not.toContain("fetchPrices");
    expect(home).not.toContain("fetchSets");
    expect(catalog).not.toContain("fetchPrices");
    expect(catalog).not.toContain("wholesale/client");
    expect(unified).not.toContain("wholesale/client");
    expect(unified).not.toContain("fetchCard(");
    expect(cardMarket).not.toContain("seller_id::text");
    expect(cardMarket).not.toContain("seller_anon_id");
    expect(cardMarket).not.toContain("seller_trust_score");
    expect(cardMarket).not.toContain("LEFT JOIN trust_profiles");
  });

  it("gates CardRush audit and probe scripts before their main work", () => {
    const scripts = [
      "apps/storefront/scripts/cardrush-discovery-health.ts",
      "apps/storefront/scripts/cardrush-probe.ts",
    ];
    for (const script of scripts) {
      const source = readFileSync(resolve(repoRoot, script), "utf8");
      const main = source.slice(source.indexOf("async function main"));
      expect(source).toContain('from "./source-approval"');
      expect(main).toMatch(
        /async function main[^]*?requireScriptSourceApproval\("cardrush",/,
      );
      expect(main).toContain("zero network");
    }
  });
});
