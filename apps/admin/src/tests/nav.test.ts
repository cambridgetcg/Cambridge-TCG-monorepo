/**
 * Navigation structure test.
 *
 * Verifies the sidebar navigation is internally consistent:
 * - Every href (top-level AND sub-item) is unique
 * - All hrefs are well-formed lowercase kebab-case paths
 * - Each group has at least one item
 * - No duplicate labels within a group
 * - Sub-item hrefs are nested under their parent
 * - A few load-bearing routes are present (catches accidental removal)
 *
 * This imports the REAL NAV from the component module (../components/layout/nav)
 * rather than a hand-copied duplicate, so it actually catches drift. The
 * previous version inlined a stale copy and asserted a magic "27 items" count
 * that had already diverged from the live sidebar (28 + sub-items). A green
 * test that validates nothing is a substrate-honesty violation; this one
 * validates the artifact that actually ships.
 */

import { describe, it, expect } from "vitest";
import { NAV } from "@/components/layout/nav";

describe("Admin dashboard navigation", () => {
  const topLevel = NAV.flatMap((g) => g.items);
  const subItems = topLevel.flatMap((i) => i.subItems ?? []);
  const allHrefs = [...topLevel.map((i) => i.href), ...subItems.map((s) => s.href)];

  it("has 7 navigation groups", () => {
    expect(NAV).toHaveLength(7);
  });

  it("every group has at least one item", () => {
    for (const group of NAV) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate hrefs (including sub-items)", () => {
    const unique = new Set(allHrefs);
    expect(unique.size).toBe(allHrefs.length);
  });

  it("all hrefs are lowercase kebab-case paths starting with /", () => {
    for (const href of allHrefs) {
      expect(href).toMatch(/^\/[a-z0-9/\-]+$/);
    }
  });

  it("no duplicate labels within a group", () => {
    for (const group of NAV) {
      const labels = group.items.map((i) => i.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("sub-item hrefs are nested under their parent href", () => {
    for (const item of topLevel) {
      for (const sub of item.subItems ?? []) {
        expect(sub.href.startsWith(item.href + "/")).toBe(true);
      }
    }
  });

  it("every nav item carries an icon component", () => {
    for (const item of topLevel) {
      // lucide icons are forwardRef components (objects), not plain functions.
      expect(item.icon).toBeTruthy();
    }
  });

  it("includes the load-bearing routes that have regressed before", () => {
    // /trust/agents and /system/deploys were both missing from the old
    // hand-copied test; assert they exist so their removal fails CI.
    for (const href of ["/overview", "/trust/agents", "/system/deploys", "/catalog/cards/classify"]) {
      expect(allHrefs).toContain(href);
    }
  });
});
