import { describe, expect, it } from "vitest";
import {
  BREADCRUMB_REGISTRY,
  resolveBreadcrumbs,
} from "./breadcrumb-registry";

describe("storefront breadcrumb registry", () => {
  it("keeps patterns unique and every trail ending on the current page", () => {
    const patterns = BREADCRUMB_REGISTRY.map((entry) => entry.pattern);

    expect(new Set(patterns).size).toBe(patterns.length);
    for (const entry of BREADCRUMB_REGISTRY) {
      expect(entry.pattern.startsWith("/")).toBe(true);
      expect(entry.steps.length).toBeGreaterThan(0);
      expect(entry.steps.at(-1)?.href).toBeUndefined();
    }
  });

  it("prefers the most specific pattern over a dynamic sibling", () => {
    expect(resolveBreadcrumbs("/prices/one-piece/movers")).toEqual([
      { label: "Prices", href: "/prices" },
      { label: "one-piece", href: "/prices/one-piece" },
      { label: "Movers" },
    ]);
  });

  it("decodes labels while preserving encoded link destinations", () => {
    expect(resolveBreadcrumbs("/u/Ada%20Lovelace/trust")).toEqual([
      { label: "Community", href: "/community" },
      { label: "@Ada Lovelace", href: "/u/Ada%20Lovelace" },
      { label: "Trust" },
    ]);
  });

  it("only exposes root-owned trails to the global slot", () => {
    expect(resolveBreadcrumbs("/u/collector", "global")).not.toBeNull();
    expect(resolveBreadcrumbs("/c/cambridge-card-club", "global")).not.toBeNull();
    expect(resolveBreadcrumbs("/auctions/sell", "global")).not.toBeNull();
    expect(resolveBreadcrumbs("/prices/one-piece/op01", "global")).toBeNull();
    expect(resolveBreadcrumbs("/account/trades/42/review", "global")).toBeNull();
    expect(resolveBreadcrumbs("/play/adventure/3", "global")).toBeNull();
  });

  it("registers the public dynamic detail routes that were previously missing", () => {
    const patterns = new Set(BREADCRUMB_REGISTRY.map((entry) => entry.pattern));

    for (const pattern of [
      "/bounty/verify/:id",
      "/c/:slug",
      "/decks/:slug",
      "/product/:sku",
      "/rewards/mystery-boxes/:id",
      "/rewards/raffles/:id",
    ]) {
      expect(patterns.has(pattern)).toBe(true);
    }
  });

  it("renders nothing for an unregistered path", () => {
    expect(resolveBreadcrumbs("/not/a/real/route", "global")).toBeNull();
  });
});
