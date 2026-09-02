import { describe, expect, it } from "vitest";
import {
  collectNavUrls,
  isNavItemActive,
  navItemAriaCurrent,
  MORE_NAV_FOOTER,
  MORE_NAV_GROUPS,
  PRIMARY_NAV_ITEMS,
  navDescription,
} from "./menu-config";
import type { NavItem } from "./menu-config";

describe("storefront navigation", () => {
  it("keeps the global header within a human-scannable link budget", () => {
    // Five doors since 2026-07-28: Culture joined Market/Prices/Play/
    // Community when the culture wings became the house's focus. The
    // budget moved 12 → 13 for that one door. Kingdom-110 adds one bounded
    // More-menu link for the first extraction-ready product preview, moving
    // the ceiling to 14 without adding another primary door.
    expect(PRIMARY_NAV_ITEMS).toHaveLength(5);
    expect(
      MORE_NAV_GROUPS.reduce((total, group) => total + group.items.length, 0),
    ).toBe(7);
    expect(MORE_NAV_FOOTER).toHaveLength(2);
    expect(collectNavUrls().length).toBeLessThanOrEqual(14);
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
    expect(isNavItemActive(PRIMARY_NAV_ITEMS[3], "/workshop")).toBe(true);
    expect(isNavItemActive(PRIMARY_NAV_ITEMS[3], "/pulls/one-piece")).toBe(true);
    expect(isNavItemActive(PRIMARY_NAV_ITEMS[4], "/rewards/packs")).toBe(true);
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
    expect(items.find((item) => item.href === "/prism-signals")).toMatchObject({
      label: "PRISM Signals",
      description: "Synthetic deal-signal preview",
    });
    const prism = items.find((item) => item.href === "/prism-signals")!;
    expect(navDescription(prism, "ja")).toBe("合成ディールシグナルのプレビュー");
    expect(navDescription(prism, "es")).toBe(
      "Vista previa sintética de señales de oportunidad",
    );
    expect(navDescription(prism, "zh-Hans")).toBe("合成潜在交易信号预览");
    expect(navDescription(prism, "zh-Hant")).toBe("合成潛在交易訊號預覽");
  });
});
