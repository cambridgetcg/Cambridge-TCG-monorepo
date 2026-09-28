import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchGames } = vi.hoisted(() => ({ fetchGames: vi.fn() }));
vi.mock("@/lib/wholesale/client", () => ({ fetchGames }));
vi.mock("@/lib/fx/rates", () => ({ fetchRates: async () => ({}) }));
vi.mock("@/lib/fx/currency-server", () => ({ getDisplayCurrency: async () => "GBP" }));
vi.mock("@/components/prices/member-browser", () => ({
  MemberPriceBrowser: () => <section aria-label="Member prices">Existing member access</section>,
}));
vi.mock("@/components/CurrencySelector", () => ({
  CurrencySelector: () => <div>Currency selector</div>,
  RateTablePanel: () => <div>Recorded exchange rates</div>,
  CurrencyWhyLink: () => <a href="/methodology/currency">Currency methodology</a>,
}));
vi.mock("@/lib/ui", async () => {
  const { Card } = await import("@/lib/ui/Card");
  const { PageHeader } = await import("@/lib/ui/PageHeader");
  return {
    Card,
    PageHeader,
    Provenance: ({ kind }: { kind: string }) => <span>Source: {kind}</span>,
    WhyLink: ({ href, label }: { href: string; label: string }) => <a href={href}>{label}</a>,
  };
});

import PricesLandingPage from "./page";

describe("prices landing presentation", () => {
  beforeEach(() => { fetchGames.mockReset(); });

  it("shows a usable explanation when the catalog is unavailable without inventing counts", async () => {
    fetchGames.mockRejectedValue(new Error("local fixture: catalog unavailable"));
    const html = renderToStaticMarkup(await PricesLandingPage({ searchParams: Promise.resolve({}) }));

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Cards and prices");
    expect(html).toContain("The game catalog is unavailable");
    expect(html).toContain("Source: unavailable");
    expect(html).not.toContain("0 catalog records across");
    expect(html).toContain('href="/prices/coverage"');
    expect(html.indexOf('aria-label="Member prices"')).toBeLessThan(html.indexOf('aria-label="Find a card"'));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Find card<\/button>/);
  });

  it("keeps observed counts, search and source rules while currency tools start collapsed", async () => {
    fetchGames.mockResolvedValue([
      { code: "op", slug: "one-piece", name: "One Piece TCG", card_count: 12, image_url: null },
    ]);
    const html = renderToStaticMarkup(await PricesLandingPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("12 catalog records across");
    expect(html).toContain('href="/prices/one-piece"');
    expect(html).toContain('action="/prices/search"');
    expect(html).toContain('value="op" selected=""');
    expect(html).not.toContain("autofocus=");
    expect(html).not.toMatch(/<button[^>]*disabled=""/);
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Currency tools<\/summary>/);
    expect(html).not.toMatch(/<details[^>]*\bopen[= >]/);
    expect(html).toContain("authentication or mathematical transformation");
    expect(html).toContain("does not create publication permission");
  });
});
