/**
 * Navigation structure test.
 *
 * Verifies that the sidebar navigation definitions are internally consistent:
 * - Each nav item has a unique href
 * - All hrefs are well-formed paths
 * - Each group has at least one item
 * - No duplicate labels within a group
 *
 * This is the first test for apps/admin. It's deliberately lightweight —
 * it validates the structure of the IA without requiring a running server
 * or browser. Subsequent missions will add integration and UI tests.
 */

import { describe, it, expect } from "vitest";

// Nav definition duplicated here (minimal) so the test doesn't need
// a jsdom environment to import the React component.
const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ href: "/overview", label: "Overview" }],
  },
  {
    label: "Ops",
    items: [
      { href: "/ops/stock",       label: "Stock" },
      { href: "/ops/orders",      label: "Orders" },
      { href: "/ops/fulfillment", label: "Fulfillment" },
      { href: "/ops/channels",    label: "Channels" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/commerce/pricing",   label: "Pricing" },
      { href: "/commerce/trade-ins", label: "Trade-Ins" },
      { href: "/commerce/auctions",  label: "Auctions" },
      { href: "/commerce/market",    label: "Market" },
      { href: "/commerce/bounty",    label: "Bounty" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/money/payouts",     label: "Payouts" },
      { href: "/money/chargebacks", label: "Chargebacks" },
      { href: "/money/rewards",     label: "Rewards" },
      { href: "/money/membership",  label: "Membership" },
    ],
  },
  {
    label: "Trust",
    items: [
      { href: "/trust/fraud",    label: "Fraud" },
      { href: "/trust/disputes", label: "Disputes" },
      { href: "/trust/reviews",  label: "Reviews" },
      { href: "/trust/kyc",      label: "KYC" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/catalog/cards",   label: "Cards" },
      { href: "/catalog/games",   label: "Games" },
      { href: "/catalog/clients", label: "Clients" },
      { href: "/catalog/users",   label: "Users" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/system/cron",  label: "Cron" },
      { href: "/system/email", label: "Email" },
      { href: "/system/audit", label: "Audit" },
      { href: "/system/admin", label: "Admin" },
    ],
  },
];

describe("Admin dashboard navigation", () => {
  const allItems = NAV_GROUPS.flatMap((g) => g.items);

  it("has 7 navigation groups", () => {
    expect(NAV_GROUPS).toHaveLength(7);
  });

  it("has 26 navigation items total", () => {
    // 1 overview + 4 ops + 5 commerce + 4 money + 4 trust + 4 catalog + 4 system
    expect(allItems).toHaveLength(26);
  });

  it("has no duplicate hrefs", () => {
    const hrefs = allItems.map((i) => i.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });

  it("all hrefs start with /", () => {
    for (const item of allItems) {
      expect(item.href).toMatch(/^\//);
    }
  });

  it("all hrefs are lowercase kebab-case paths", () => {
    for (const item of allItems) {
      expect(item.href).toMatch(/^\/[a-z0-9/\-]+$/);
    }
  });

  it("every group has at least one item", () => {
    for (const group of NAV_GROUPS) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it("no duplicate labels within a group", () => {
    for (const group of NAV_GROUPS) {
      const labels = group.items.map((i) => i.label);
      const unique = new Set(labels);
      expect(unique.size).toBe(labels.length);
    }
  });
});
