import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(`${process.cwd()}/${path}`, "utf8");

describe("paused catalog discovery consistency", () => {
  it("does not offer a working resolver form or promise from public UI", () => {
    const home = read("src/app/page.tsx");
    const nav = read("src/lib/nav/menu-config.ts");
    const catalog = read("src/app/catalog/page.tsx");

    expect(home).toContain("Card search is paused");
    expect(home).not.toContain('<form action="/prices/search"');
    expect(nav).toContain("Search boundary");
    expect(nav).not.toContain("Card number → price, history, sources, variants");
    expect(catalog).toContain("Search boundary (paused)");
    expect(catalog).not.toContain("Resolve a game and number shape");
  });

  it("describes paused price, coverage, and deck contracts as static gaps", () => {
    const manifest = read("src/lib/manifest.ts");
    const wellKnown = read("src/app/.well-known/cambridge-tcg.json/route.ts");

    expect(manifest).toContain("Paused observed-coverage boundary");
    expect(manifest).toContain("Legacy browse route paused");
    expect(manifest).toContain("Static paused search page");
    expect(manifest).not.toContain("What the observation archive has actually accumulated");
    expect(wellKnown).toContain("Paused validator. POST returns HTTP 503");
    expect(wellKnown).toContain("Paused explanation page for the deck-validation rights boundary");
  });
});
