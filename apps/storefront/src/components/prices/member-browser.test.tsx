import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberPriceItem, MemberPricePage } from "@/lib/prices/member-feed-types";
import { MemberPriceQueryError } from "@/lib/prices/member-feed-types";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), read: vi.fn(), parse: vi.fn() }));
vi.mock("@/lib/prices/member-access", () => ({ getMemberSessionActor: mocks.actor }));
vi.mock("@/lib/prices/member-feed", async () => {
  const types = await import("@/lib/prices/member-feed-types");
  return { MemberPriceQueryError: types.MemberPriceQueryError, readMemberPrices: mocks.read, parseMemberPriceQuery: mocks.parse };
});
import { MemberPriceBrowser } from "./member-browser";
import { MemberPriceDownloads, MemberPriceFilters, MemberPriceResults } from "./member-source-browser";
import { MemberCatalogLink } from "./member-catalog-link";
import { memberPriceExportHref, memberPriceHref, memberPriceParams } from "./member-query";

const item: MemberPriceItem = {
  id: "observation-1", source: "cardmarket", sourceProductId: "123", sku: null,
  mappingStatus: "unmapped", game: "magic", setCode: null, productName: "Example product",
  granularity: "source-product", finish: null, language: null, condition: null,
  metric: "trend", amount: "12.34", currency: "EUR", underlyingMarket: "cardmarket",
  sourceUpdatedAt: "2026-09-01T00:00:00.000Z", retrievedAt: "2026-09-02T00:00:00.000Z",
  sourceUrl: "https://www.cardmarket.com/", parserVersion: "fixture/1", crosswalkVersion: "fixture/1",
  evidenceVersion: "fixture/1", artifactSha256: "a".repeat(64), quality: "accepted",
  catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null,
  permittedUses: ["member-display", "member-api", "member-download"], attribution: "Cardmarket fixture attribution",
};
const page: MemberPricePage = {
  status: "available", items: [item], nextCursor: null, watermark: "1",
  asOf: "2026-09-07T12:00:00.000Z", total: 1, count: 1, complete: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ userId: "free-member" });
  mocks.parse.mockReturnValue({ mode: "current", limit: 100 });
  mocks.read.mockResolvedValue(page);
});

describe("member price server gate", () => {
  it("never parses or reads private observations for a guest and preserves the login destination", async () => {
    mocks.actor.mockResolvedValue(null);
    const html = renderToStaticMarkup(await MemberPriceBrowser({ search: { game: "magic", q: "Black Lotus", mode: "history", next: "https://evil.example" } }));
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(html).toContain("Sign in for free price access");
    expect(html).toContain(encodeURIComponent("/prices?q=Black+Lotus&game=magic&mode=history"));
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("12.34");
    expect(html).toContain("public catalog below remains open");
  });

  it("contains authentication outages without throwing or reading private prices", async () => {
    mocks.actor.mockRejectedValue(new Error("private authentication database details"));
    const html = renderToStaticMarkup(await MemberPriceBrowser({ search: { game: "magic" } }));
    expect(html).toContain("Member sign-in unavailable");
    expect(html).toContain("public catalog below remains open");
    expect(html).not.toContain("private authentication database details");
    expect(html).not.toContain("Sign in for free price access");
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("renders approved observations for an ordinary free session only after authentication", async () => {
    mocks.read.mockImplementation(async (actor, _query, use) => {
      expect(mocks.actor).toHaveBeenCalledOnce();
      expect(actor).toEqual({ userId: "free-member" });
      expect(use).toBe("member-display");
      return page;
    });
    const html = renderToStaticMarkup(await MemberPriceBrowser({ search: {} }));
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(html).toContain("12.34");
    expect(html).toContain("EUR");
    expect(html).toContain("Member source browser");
    expect(html).toContain("/account/data");
    expect(html).toContain("/methodology/member-pricing");
  });

  it("invalid filters never reach the reader", async () => {
    mocks.parse.mockImplementation(() => { throw new MemberPriceQueryError("invalid cursor"); });
    const html = renderToStaticMarkup(await MemberPriceBrowser({ search: { cursor: "broken" } }));
    expect(mocks.read).not.toHaveBeenCalled();
    expect(html).toContain("These price filters could not be used");
  });
});

describe("member price rendering", () => {
  it("distinguishes a readable empty store from unavailable setup or service", () => {
    const empty = renderToStaticMarkup(<MemberPriceResults page={{ ...page, status: "empty", items: [], count: 0, total: 0 }} params={new URLSearchParams()} />);
    const outage = renderToStaticMarkup(<MemberPriceResults page={{ ...page, status: "unavailable", items: [], count: 0, total: 0, reason: "private internal error" }} params={new URLSearchParams()} />);
    expect(empty).toContain("No eligible observations match");
    expect(empty).not.toContain("source unavailable");
    expect(outage).toContain("Member price source unavailable");
    expect(outage).not.toContain("No eligible observations match");
    expect(outage).not.toContain("private internal error");
  });

  it("labels native amounts, vendor identity, unknown condition, scope and distinct times", () => {
    const html = renderToStaticMarkup(<MemberPriceResults page={page} params={new URLSearchParams()} />);
    for (const text of ["12.34", "EUR", "trend", "Source-product aggregate", "unmapped", "Condition: unknown", "not condition-adjusted", "2026-09-01", "2026-09-02", "not source freshness", "not a live quote", "Cardmarket fixture attribution", "Market: Cardmarket"]) expect(html).toContain(text);
  });

  it.each([
    ["2.310000", "2.31"],
    ["2.300000", "2.30"],
    ["2", "2.00"],
    ["2.123456", "2.123456"],
    ["999999999999.123456", "999999999999.123456"],
  ])("formats raw %s as %s in display only", (raw, displayed) => {
    const observation = { ...item, amount: raw };
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [observation] }} params={new URLSearchParams()} />);
    expect(html).toContain(`${displayed} EUR</td>`);
    if (raw !== displayed) expect(html).not.toContain(`${raw} EUR</td>`);
    expect(observation.amount).toBe(raw);
    expect(html).not.toContain("£");
  });

  it("renders Scryfall as display-only without download buttons for that source", () => {
    const scryfall = { ...item, source: "scryfall" as const, underlyingMarket: "tcgplayer" as const, permittedUses: ["member-display" as const] };
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [scryfall] }} params={new URLSearchParams()} />);
    expect(html).toContain("View only");
    expect(html).toContain("Market: TCGplayer");
    const downloads = renderToStaticMarkup(<MemberPriceDownloads params={new URLSearchParams({ source: "scryfall" })} />);
    expect(downloads).toContain("Downloads are unavailable");
    expect(downloads).not.toContain("href=\"/api/account/prices/export");
  });

  it("provides labelled name, source, game, metric and history filters with no stale cursor", () => {
    const html = renderToStaticMarkup(<MemberPriceFilters params={new URLSearchParams({ q: "Example", cursor: "old" })} />);
    for (const name of ["q", "source", "game", "metric", "mode", "set", "sku"]) expect(html).toContain(`name="${name}"`);
    expect(html).toContain("History");
    expect(html).not.toContain('name="cursor"');
  });
});

describe("filter-preserving navigation", () => {
  const params = new URLSearchParams({ q: "A & B", source: "cardmarket", game: "magic", set: "ABC", sku: "MTG-ABC-1", metric: "trend", mode: "history", limit: "50", cursor: "old" });
  it("keeps every filter on the next page and resets only the cursor on the first", () => {
    const next = new URL(memberPriceHref(params, "new-cursor"), "https://example.com");
    for (const [key, value] of params) expect(next.searchParams.get(key)).toBe(key === "cursor" ? "new-cursor" : value);
    expect(new URL(memberPriceHref(params), "https://example.com").searchParams.has("cursor")).toBe(false);
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, complete: false, nextCursor: "new-cursor" }} params={params} />);
    expect(html).toContain("Next page");
    expect(html).toContain("Back to first page");
  });
  it("exports the same filters but not a display cursor", () => {
    for (const format of ["csv", "ndjson"] as const) {
      const url = new URL(memberPriceExportHref(params, format), "https://example.com");
      for (const [key, value] of params) if (key !== "cursor") expect(url.searchParams.get(key)).toBe(value);
      expect(url.searchParams.has("cursor")).toBe(false);
      expect(url.searchParams.get("format")).toBe(format);
    }
  });
  it("links hierarchy to exact-mapping filters without reading private data", () => {
    const html = renderToStaticMarkup(<MemberCatalogLink game="magic" set="ABC" sku="MTG-ABC-1" />);
    expect(html).toContain("/prices?game=magic&amp;set=ABC&amp;sku=MTG-ABC-1");
    expect(html).toContain("only exact catalog mappings");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("keeps only recognized params and retains duplicates for parser rejection", () => {
    const result = memberPriceParams({ game: ["magic", "pokemon"], source: " cardmarket ", tier: "paid", next: "//evil" });
    expect(result.getAll("game")).toEqual(["magic", "pokemon"]);
    expect(result.get("source")).toBe("cardmarket");
    expect(result.has("tier")).toBe(false);
    expect(result.has("next")).toBe(false);
  });
});
