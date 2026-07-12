import { describe, expect, it } from "vitest";
import {
  collectNavUrls,
  isNavItemActive,
  navItemAriaCurrent,
  MORE_NAV_FOOTER,
  MORE_NAV_GROUPS,
  PRIMARY_NAV_ITEMS,
} from "./menu-config";
import type { NavItem } from "./menu-config";

describe("storefront navigation", () => {
  it("keeps the global header within a human-scannable link budget", () => {
    expect(PRIMARY_NAV_ITEMS).toHaveLength(4);
    expect(
      MORE_NAV_GROUPS.reduce((total, group) => total + group.items.length, 0),
    ).toBe(6);
    expect(MORE_NAV_FOOTER).toHaveLength(2);
    expect(collectNavUrls().length).toBeLessThanOrEqual(12);
  });

  it("does not repeat destinations", () => {
    const urls: string[] = PRIMARY_NAV_ITEMS.map((item) => item.href);
    for (const group of MORE_NAV_GROUPS) {
      for (const item of group.items) urls.push(item.href);
    }
    for (const item of MORE_NAV_FOOTER) urls.push(item.href);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("keeps deeper routes attached to their human-facing section", () => {
    expect(isNavItemActive(PRIMARY_NAV_ITEMS[0], "/auctions/123")).toBe(true);
    expect(isNavItemActive(PRIMARY_NAV_ITEMS[1], "/prices/one-piece/op01")).toBe(true);
    expect(isNavItemActive(PRIMARY_NAV_ITEMS[2], "/deck-builder")).toBe(true);
    expect(isNavItemActive(PRIMARY_NAV_ITEMS[3], "/rewards/packs")).toBe(true);
    expect(isNavItemActive(PRIMARY_NAV_ITEMS[0], "/community")).toBe(false);
  });

  it("distinguishes the current page from its active section", () => {
    expect(navItemAriaCurrent(PRIMARY_NAV_ITEMS[0], "/market")).toBe("page");
    expect(navItemAriaCurrent(PRIMARY_NAV_ITEMS[0], "/market/list")).toBe("location");
    expect(navItemAriaCurrent(PRIMARY_NAV_ITEMS[0], "/community")).toBeUndefined();
  });

  it("names access, rights, and proof limits without broad promises", () => {
    const items: NavItem[] = [];
    for (const group of MORE_NAV_GROUPS) items.push(...group.items);
    expect(items.find((item) => item.href === "/data")).toMatchObject({
      label: "Data directory",
      description: "API access and rights",
    });
    expect(items.find((item) => item.href === "/verify")).toMatchObject({
      label: "Draw proof checks",
      description: "Consistency evidence and stated limits",
    });
  });
});
