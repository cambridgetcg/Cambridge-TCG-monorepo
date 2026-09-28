import { describe, expect, it } from "vitest";
import {
  collectNavUrls, isNavItemActive, navItemAriaCurrent, navLabel, navDescription,
  navGroupHeading, MORE_NAV_FOOTER, MORE_NAV_GROUPS, PRIMARY_NAV_ITEMS, FOOTER_NAV_GROUPS,
} from "./menu-config";
import type { NavItem } from "./menu-config";
import type { UiLang } from "@/lib/lang-mode";

const moreItems: NavItem[] = MORE_NAV_GROUPS.flatMap((group) => [...group.items]);
const itemAt = (href: string) => [...PRIMARY_NAV_ITEMS, ...moreItems].find((item) => item.href === href)!;

describe("storefront navigation", () => {
  it("keeps a small set of human tasks with a separate agent entry", () => {
    expect(PRIMARY_NAV_ITEMS).toHaveLength(4);
    expect(PRIMARY_NAV_ITEMS.map((item) => item.href)).toEqual(["/prices", "/play", "/culture", "/community"]);
    expect(moreItems.find((item) => item.href === "/agents")).toMatchObject({
      label: "Agents & API", description: "Start with read-only discovery",
    });
    expect(collectNavUrls().length).toBeLessThanOrEqual(12);
  });

  it("avoids repeated header destinations and preserves the wider map", () => {
    const urls = [...PRIMARY_NAV_ITEMS, ...moreItems, ...MORE_NAV_FOOTER].map((item) => item.href);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("/map");
    expect(urls).toContain("/");
    expect(urls).not.toContain("/start");
    expect(urls).not.toContain("/welcome");
  });

  it("keeps new paid-commerce actions out of global navigation while retaining existing records", () => {
    const urls = [...collectNavUrls(), ...FOOTER_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href))];
    expect(urls).toContain("/account/trades");
    expect(urls).toContain("/account/portfolio");
    for (const retired of ["/market/list", "/auctions/sell", "/checkout", "/membership", "/market"]) {
      expect(urls).not.toContain(retired);
    }
  });

  it("keeps nested routes under the correct task without matching sibling prefixes", () => {
    expect(isNavItemActive(itemAt("/prices"), "/prices/one-piece/op01")).toBe(true);
    expect(isNavItemActive(itemAt("/play"), "/deck-builder")).toBe(true);
    expect(isNavItemActive(itemAt("/culture"), "/workshop")).toBe(true);
    expect(isNavItemActive(itemAt("/culture"), "/pulls/one-piece")).toBe(true);
    expect(isNavItemActive(itemAt("/community"), "/rewards/packs")).toBe(true);
    expect(isNavItemActive(itemAt("/agents"), "/api/v1/manifest")).toBe(true);
    expect(isNavItemActive(itemAt("/agents"), "/agents/guides/first-request")).toBe(true);
    expect(isNavItemActive(itemAt("/agents"), "/agents-extra")).toBe(false);
    expect(isNavItemActive(itemAt("/"), "/prices")).toBe(false);
  });

  it("distinguishes an exact page from an active section for assistive technology", () => {
    expect(navItemAriaCurrent(itemAt("/prices"), "/prices")).toBe("page");
    expect(navItemAriaCurrent(itemAt("/prices"), "/prices/search")).toBe("location");
    expect(navItemAriaCurrent(itemAt("/prices"), "/community")).toBeUndefined();
  });

  it.each(["ja", "es", "zh-Hans", "zh-Hant"] as UiLang[])("translates every visible navigation label and description in %s", (lang) => {
    const items: NavItem[] = [...PRIMARY_NAV_ITEMS, ...moreItems, ...MORE_NAV_FOOTER, ...FOOTER_NAV_GROUPS.flatMap((group) => [...group.items])];
    for (const item of items) {
      expect(item[lang as "ja" | "es" | "zh-Hans" | "zh-Hant"]).toBeTruthy();
      expect(navLabel(item, lang)).not.toBe(item.label);
      if (item.description) expect(navDescription(item, lang)).not.toBe(item.description);
    }
    for (const group of [...MORE_NAV_GROUPS, ...FOOTER_NAV_GROUPS]) {
      expect(navGroupHeading(group, lang)).not.toBe(group.heading);
    }
  });
});
