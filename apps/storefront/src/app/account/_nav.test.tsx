import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ pathname: "/account" }));
vi.mock("next/navigation", () => ({ usePathname: () => current.pathname }));

import { AccountNav } from "./_nav";

describe("account navigation", () => {
  it.each([
    ["/account", "/account"],
    ["/account/portfolio/value", "/account/portfolio"],
    ["/account/trades/record-1", "/account/trades"],
    ["/account/trust", "/account/tools"],
  ])("marks the current destination on both layouts for %s", (pathname, href) => {
    current.pathname = pathname;
    const html = renderToStaticMarkup(<AccountNav />);
    const activeLinks = [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)];
    expect(activeLinks).toHaveLength(2);
    expect(activeLinks.every(([tag]) => tag.includes(`href="${href}"`))).toBe(true);
  });

  it("keeps existing obligations reachable with clear account labels", () => {
    current.pathname = "/account/refunds";
    const html = renderToStaticMarkup(<AccountNav badges={{ "/account/offers": 3 }} />);
    expect(html).toContain("Orders &amp; payments");
    expect(html).toContain("Your collection");
    expect(html).not.toContain("Shopping");
    for (const path of ["orders", "trades", "offers", "swaps", "refunds", "payouts", "messages"]) {
      expect(html).toContain(`href="/account/${path}"`);
    }
    expect(html.match(/aria-label="Account navigation"/g)).toHaveLength(2);
  });
});
