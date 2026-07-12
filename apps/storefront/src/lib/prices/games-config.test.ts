/**
 * Coverage-truth contract (the honest ground, spec 2026-07-07 §1).
 * The config's cardrush.confirmed is DERIVED from the data-ingest
 * registry — never hand-written. Pinned so the digimon drift
 * (registry true / UI false, caught 2026-07-07) cannot recur.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { CARDRUSH_SUBDOMAINS } from "@cambridge-tcg/data-ingest";
import { GAMES, isGameCode } from "@cambridge-tcg/sku";
import {
  PRICE_GUIDE_GAMES,
  synthesizeConfigFromCatalog,
} from "./games-config";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "games-config.ts"), "utf8");

describe("cardrush coverage truth (spec 2026-07-07 §1)", () => {
  it("every non-null cardrush row points at a LIVE registry entry", () => {
    for (const g of PRICE_GUIDE_GAMES) {
      if (!g.cardrush) continue;
      const entry = CARDRUSH_SUBDOMAINS[g.cardrush.subdomain];
      expect(
        entry,
        `${g.slug}: ${g.cardrush.subdomain} not in CARDRUSH_SUBDOMAINS`,
      ).toBeDefined();
      expect(
        entry.role,
        `${g.slug}: ${g.cardrush.subdomain} is blocked/phantom — the row must be null`,
      ).not.toBe("blocked");
    }
  });

  it("phantom hosts yield null rows — no eternal probationary pills", () => {
    // ygo/lorcana/fab point at NXDOMAIN-dead hosts (verified 2026-07-07);
    // their rows must derive to null.
    for (const slug of ["yu-gi-oh", "lorcana", "flesh-and-blood"]) {
      const row = PRICE_GUIDE_GAMES.find((g) => g.slug === slug);
      expect(row, `${slug} row missing`).toBeDefined();
      expect(row!.cardrush, `${slug} should have null cardrush`).toBeNull();
    }
  });

  it("confirmed always equals the registry's word", () => {
    for (const g of PRICE_GUIDE_GAMES) {
      if (!g.cardrush) continue;
      expect(g.cardrush.confirmed, `${g.slug} drifted from the registry`).toBe(
        CARDRUSH_SUBDOMAINS[g.cardrush.subdomain].confirmed,
      );
    }
  });

  it("every row's (slug, game_code) pair matches the Atlas", () => {
    for (const g of PRICE_GUIDE_GAMES) {
      expect(isGameCode(g.game_code), `${g.slug}: unknown code ${g.game_code}`).toBe(true);
      expect(
        GAMES[g.game_code as keyof typeof GAMES].slug,
        `${g.slug}: Atlas pairs ${g.game_code} with a different slug`,
      ).toBe(g.slug);
      expect(g.coverage_status).toBe(
        GAMES[g.game_code as keyof typeof GAMES].confirmed
          ? "observed"
          : "anticipated",
      );
    }
  });

  it("public config copy makes no completeness, cadence, or retired house-price promise", () => {
    const forbidden =
      /daily-updated|updated daily|every set|every card|complete (?:price|coverage)|trade[- ]in|store credit|retail buy price|we buy/i;

    for (const g of PRICE_GUIDE_GAMES) {
      const publicCopy = [
        g.seo_title,
        g.seo_description,
        g.hero_paragraph,
        g.set_intro_template,
        g.pricing_note,
      ].join("\n");
      expect(publicCopy, `${g.slug} overclaims public coverage`).not.toMatch(
        forbidden,
      );
    }

    const synthesized = synthesizeConfigFromCatalog({
      slug: "test-live-game",
      display_name: "Test Live Game",
      game_code: "tlg",
    });
    expect(synthesized.coverage_status).toBe("observed");
    expect(
      [
        synthesized.seo_title,
        synthesized.seo_description,
        synthesized.hero_paragraph,
        synthesized.set_intro_template,
        synthesized.pricing_note,
      ].join("\n"),
    ).not.toMatch(forbidden);
  });

  it("no hand-written confirmed literal survives in the cardrush rows", () => {
    // The contract: a cardrush ROW is cardrushCoverage("…") or null —
    // never an inline object carrying its own confirmed. Scoped to the
    // array body: the interface's type annotation and prose copy may
    // legitimately carry the word "confirmed".
    const arrayStart = source.indexOf("const PRICE_GUIDE_GAME_DEFINITIONS");
    expect(arrayStart).toBeGreaterThan(-1);
    const arrayEnd = source.indexOf("export const PRICE_GUIDE_GAMES", arrayStart);
    expect(arrayEnd).toBeGreaterThan(arrayStart);
    const rows = source.slice(arrayStart, arrayEnd);
    expect(rows).not.toMatch(/cardrush:\s*\{[^}]*confirmed:/s);
    expect(rows).toMatch(/cardrush:\s*cardrushCoverage\(/);
  });
});
