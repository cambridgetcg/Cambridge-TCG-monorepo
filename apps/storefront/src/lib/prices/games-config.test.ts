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
import { PRICE_GUIDE_GAMES } from "./games-config";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "games-config.ts"), "utf8");

describe("cardrush coverage truth (spec 2026-07-07 §1)", () => {
  it("every configured subdomain exists in the registry", () => {
    for (const g of PRICE_GUIDE_GAMES) {
      if (!g.cardrush) continue;
      expect(
        CARDRUSH_SUBDOMAINS[g.cardrush.subdomain],
        `${g.slug}: ${g.cardrush.subdomain} not in CARDRUSH_SUBDOMAINS`,
      ).toBeDefined();
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

  it("no hand-written confirmed literal survives in the cardrush rows", () => {
    // The contract: a cardrush ROW is cardrushCoverage("…") or null —
    // never an inline object carrying its own confirmed. Scoped to the
    // array body: the interface's type annotation and prose copy may
    // legitimately carry the word "confirmed".
    const arrayStart = source.indexOf("export const PRICE_GUIDE_GAMES");
    expect(arrayStart).toBeGreaterThan(-1);
    const rows = source.slice(arrayStart);
    expect(rows).not.toMatch(/cardrush:\s*\{[^}]*confirmed:/s);
    expect(rows).toMatch(/cardrush:\s*cardrushCoverage\(/);
  });
});
