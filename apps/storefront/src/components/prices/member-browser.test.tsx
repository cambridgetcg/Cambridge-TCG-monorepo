import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberPriceItem, MemberPricePage } from "@/lib/prices/member-feed-types";
import type { MemberPriceImage } from "@/lib/prices/member-images";
import { DISPLAY_ONLY_INPUT_PAGES_END, MemberPriceQueryError } from "@/lib/prices/member-feed-types";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), read: vi.fn(), parse: vi.fn(), collected: vi.fn(), images: vi.fn() }));
vi.mock("@/lib/prices/member-access", () => ({ getMemberSessionActor: mocks.actor }));
vi.mock("@/lib/prices/member-feed", async () => {
  const types = await import("@/lib/prices/member-feed-types");
  return { MemberPriceQueryError: types.MemberPriceQueryError, readMemberPrices: mocks.read, parseMemberPriceQuery: mocks.parse, displayOnlySourcesWithRows: mocks.collected };
});
vi.mock("@/lib/prices/member-images", () => ({ readMemberPriceImages: mocks.images }));
import { MemberPriceBrowser } from "./member-browser";
import { MemberPriceDisplayOnlyNote, MemberPriceDownloads, MemberPriceFilters, MemberPriceResults } from "./member-source-browser";
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
  // As today: no CardRush or TCGplayer row has been collected.
  mocks.collected.mockResolvedValue([]);
  mocks.images.mockResolvedValue({ byItem: new Map(), rowsLookedUp: 1 });
});

describe("member price server gate", () => {
  it("never parses or reads private observations for a guest and preserves the login destination", async () => {
    mocks.actor.mockResolvedValue(null);
    const html = renderToStaticMarkup(await MemberPriceBrowser({ search: { game: "magic", q: "Black Lotus", mode: "history", next: "https://evil.example" } }));
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.collected).not.toHaveBeenCalled();
    expect(html).toContain("Sign in for free price access");
    expect(html).toContain(encodeURIComponent("/prices?q=Black+Lotus&game=magic&mode=history"));
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("12.34");
    expect(html).toContain("Source prices &amp; history");
    expect(html).toContain("Sign in with an existing account");
    expect(html).toContain("Free to use.");
    expect(html).toContain("Availability depends on imported data.");
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Sources and downloads<\/summary>/);
    expect(html).not.toMatch(/<details[^>]*\bopen[= >]/);
    expect(html).toContain("Scryfall is view-only");
    expect(html).toContain("/methodology/member-pricing");
  });

  it("says what Cambridge collects on a schedule from the collection flags", async () => {
    try {
      vi.stubEnv("DATA_COLLECT_CARDMARKET", undefined);
      const manual = renderToStaticMarkup(await MemberPriceBrowser({ search: {} }));
      expect(manual).toContain("Cambridge has no scheduled refresh for these sources; imports are manual.");
      vi.stubEnv("DATA_COLLECT_CARDMARKET", "on");
      const scheduled = renderToStaticMarkup(await MemberPriceBrowser({ search: {} }));
      expect(scheduled).toContain("Cambridge collects Cardmarket&#x27;s One Piece files daily; imports from other sources are manual.");
      expect(scheduled).not.toContain("no scheduled refresh");
    } finally {
      vi.unstubAllEnvs();
    }
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
    // The page's rows, once read, are looked up for identity images.
    expect(mocks.images).toHaveBeenCalledWith(page.items);
  });

  it("looks up no images for a page that is not available, and shows the images it is given", async () => {
    mocks.read.mockResolvedValue({ ...page, status: "unavailable", items: [], count: 0, total: 0 });
    renderToStaticMarkup(await MemberPriceBrowser({ search: {} }));
    expect(mocks.images).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue(page);
    mocks.images.mockResolvedValue({ byItem: new Map([[item.id, { official: { url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-006-EN.png", attribution: "Publisher credit" } }]]), rowsLookedUp: 1 });
    const html = renderToStaticMarkup(await MemberPriceBrowser({ search: {} }));
    expect(html).toContain('src="https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-006-EN.png"');
    expect(html).toContain("Publisher credit");
  });

  it.each([
    [{ mode: "history", q: "Zoro" }, { mode: "history", limit: 100, q: "Zoro" }, "CardRush and TCGplayer prices are not in this view", "/prices?q=Zoro&amp;mode=current&amp;limit=50"],
    [{ limit: "100", sku: "op-op01-001-en" }, { mode: "current", limit: 100, sku: "op-op01-001-en" }, "CardRush and TCGplayer prices are not in this view", "/prices?sku=op-op01-001-en&amp;limit=50&amp;mode=current"],
    [{ source: "cardrush", game: "one-piece", set: "op01", mode: "history", limit: "500" }, { source: "cardrush", game: "one-piece", set: "op01", mode: "history", limit: 500 }, "CardRush prices are not in this view", "/prices?source=cardrush&amp;game=one-piece&amp;set=op01&amp;mode=current&amp;limit=50"],
  ])("says when collected CardRush and TCGplayer rows are left out of a narrowed %j, and links the view that shows them", async (search, query, text, href) => {
    mocks.collected.mockResolvedValue(["cardrush", "tcgplayer"]);
    mocks.parse.mockReturnValue(query);
    const html = renderToStaticMarkup(await MemberPriceBrowser({ search }));
    expect(html).toContain(text);
    expect(html).toContain("looking at, not collecting");
    expect(html).toContain("narrowed by product name, SKU, or set and game, at most 50 rows a page and 3 pages");
    expect(html).toContain(`href="${href}"`);
  });

  it.each([[{ mode: "current", limit: 100 }], [{ mode: "current", limit: 50 }], [{ mode: "current", limit: 50, game: "one-piece" }], [{ mode: "history", limit: 50, set: "op01" }]])(
    "explains an unnarrowed %j without a link that would still leave them out", async query => {
      mocks.collected.mockResolvedValue(["cardrush", "tcgplayer"]);
      mocks.parse.mockReturnValue(query);
      const html = renderToStaticMarkup(await MemberPriceBrowser({ search: {} }));
      expect(html).toContain("CardRush and TCGplayer prices are not in this view");
      expect(html).not.toContain("Show this search at 50 rows a page");
    },
  );

  it("implies no CardRush or TCGplayer prices in the default view, filter or note while none are stored", async () => {
    const html = renderToStaticMarkup(await MemberPriceBrowser({ search: {} }));
    expect(mocks.collected).toHaveBeenCalledOnce();
    for (const text of ["not in this view", 'value="cardrush"', 'value="tcgplayer"', "CardRush · display only", "TCGplayer · display only"]) expect(html).not.toContain(text);
    expect(html).toContain('value="cardmarket"');
    expect(html).toContain('value="scryfall"');
    // One source collected: it alone is named and offered.
    mocks.collected.mockResolvedValue(["tcgplayer"]);
    const one = renderToStaticMarkup(await MemberPriceBrowser({ search: {} }));
    expect(one).toContain("TCGplayer prices are not in this view");
    expect(one).not.toContain("CardRush and TCGplayer prices");
    expect(one).toContain("TCGplayer · display only");
    expect(one).not.toContain('value="cardrush"');
  });

  it.each([
    [{ mode: "current", limit: 50, q: "Zoro" }], [{ source: "cardmarket", mode: "history", limit: 500 }],
    [{ source: "scryfall", mode: "history", limit: 500 }], [{ source: "tcgplayer", mode: "current", limit: 50, sku: "op-op01-001-en" }],
  ])("adds no note to a view that already includes every source it asks for %j", async query => {
    mocks.collected.mockResolvedValue(["cardrush", "tcgplayer"]);
    mocks.parse.mockReturnValue(query);
    const html = renderToStaticMarkup(await MemberPriceBrowser({ search: {} }));
    expect(html).not.toContain("not in this view");
    expect(html).toContain("12.34");
  });

  it("names only policy sources in the note, never URL text", () => {
    const html = renderToStaticMarkup(<MemberPriceDisplayOnlyNote params={new URLSearchParams({ source: "Call us now", mode: "history" })} sources={["cardrush", "tcgplayer"]} narrowed={false} />);
    expect(html).not.toContain("Call us now prices");
    expect(html).toContain("CardRush and TCGplayer prices are not in this view");
    expect(renderToStaticMarkup(<MemberPriceDisplayOnlyNote params={new URLSearchParams()} sources={[]} narrowed />)).toBe("");
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

  it.each([
    ["1500.000000", "1500"],
    ["1500", "1500"],
    ["980.000000", "980"],
  ])("shows yen as whole yen: raw %s as %s", (raw, displayed) => {
    const yen = { ...item, source: "cardrush" as const, currency: "JPY" as const, underlyingMarket: "cardrush" as const, amount: raw };
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [yen] }} params={new URLSearchParams()} />);
    expect(html).toContain(`${displayed} JPY</td>`);
    expect(html).not.toContain(`${displayed}.00 JPY`);
  });

  it.each([
    ["cardrush", "CardRush", "JPY", "cardrush", "1500"],
    ["tcgplayer", "TCGplayer", "USD", "tcgplayer", "12.34"],
  ] as const)("names %s and its market, and keeps it view-only", (source, name, currency, market, amount) => {
    const row = { ...item, source, currency, underlyingMarket: market, amount, granularity: "printing" as const, permittedUses: ["member-display" as const], attribution: `${name} fixture attribution` };
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [row] }} params={new URLSearchParams()} />);
    expect(html).toContain(`>${name}</a>`);
    expect(html).toContain(`Market: ${name}`);
    expect(html).toContain(`${name} fixture attribution`);
    expect(html).toContain("View only");
    expect(html).not.toContain("Scryfall");
    const downloads = renderToStaticMarkup(<MemberPriceDownloads params={new URLSearchParams({ source })} />);
    expect(downloads).toContain(`Downloads are unavailable for the ${name}-only filter.`);
    expect(downloads).not.toContain("href=\"/api/account/prices/export");
  });

  it("never echoes an unknown source filter into the downloads note", () => {
    const downloads = renderToStaticMarkup(<MemberPriceDownloads params={new URLSearchParams({ source: "Call us now" })} />);
    expect(downloads).not.toContain("Call us now");
    const filters = (params: Record<string, string>, displayOnly: ("cardrush" | "tcgplayer")[]) => renderToStaticMarkup(<MemberPriceFilters params={new URLSearchParams(params)} displayOnly={displayOnly} />);
    expect(filters({}, ["cardrush"])).toContain('value="cardrush"');
    expect(filters({}, ["cardrush"])).not.toContain('value="tcgplayer"');
    expect(filters({ source: "Call us now" }, [])).not.toContain("Call us now");
    // The filter in use stays selectable, so the form shows the search it ran.
    expect(filters({ source: "tcgplayer" }, [])).toContain('value="tcgplayer"');
  });

  it("ends a display-only chain with a note, not a Next link", () => {
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, complete: false, nextCursor: null, reason: DISPLAY_ONLY_INPUT_PAGES_END }} params={new URLSearchParams({ q: "Zoro", limit: "50", cursor: "third" })} />);
    expect(html).toContain(DISPLAY_ONLY_INPUT_PAGES_END);
    expect(html).toContain("More results match than this view shows.");
    expect(html).not.toContain("More results follow.");
    expect(html).not.toContain("Next page");
    expect(html).toContain("Back to first page");
    // A view that pages on, or has ended, says nothing of the kind.
    for (const other of [{ ...page, complete: false, nextCursor: "next" }, page]) expect(renderToStaticMarkup(<MemberPriceResults page={other} params={new URLSearchParams()} />)).not.toContain("for looking at, not collecting");
  });

  const listingUrl = `https://www.cardrush-op.jp/data/cardrush-op/_/${Buffer.from("product/SYNTHETIC_15600.jpg").toString("hex")}.jpg`;
  const listing = { ...item, id: "cardrush-1", source: "cardrush" as const, sourceProductId: "www.cardrush-op.jp/product/15600", sourceUrl: "https://www.cardrush-op.jp/product/15600",
    productName: "〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}", currency: "JPY" as const, underlyingMarket: "cardrush" as const, amount: "123", granularity: "printing" as const, permittedUses: ["member-display" as const] };
  const reference = { ...item, id: "cardmarket-1", sku: "op-op01-006-ja", mappingStatus: "exact" as const };
  const imagesFor = (entries: [string, MemberPriceImage][], rowsLookedUp = entries.length) => ({ byItem: new Map(entries), rowsLookedUp });

  it("offers a CardRush listing image at CardRush's own URL only behind a closed details element, lazily, fixed-size and credited to the listing", () => {
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [listing] }} params={new URLSearchParams()} images={imagesFor([[listing.id, { listing: listingUrl }]])} />);
    // Closed and lazy: the member's browser asks CardRush only when the member opens it.
    const details = /<details[^>]*>[\s\S]*?<\/details>/.exec(html)![0];
    expect(details).not.toMatch(/<details[^>]*\bopen\b/);
    expect(details).toContain("Show CardRush&#x27;s listing image");
    expect(details).toContain("Loads from CardRush, which then sees your IP address.");
    const img = /<img [^>]*>/.exec(details)![0];
    expect(img).toContain(`src="${listingUrl}"`);
    for (const attribute of ['loading="lazy"', 'decoding="async"', 'width="56"', 'height="78"', 'referrerPolicy="no-referrer"', 'alt="〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}: CardRush listing image"']) expect(img).toContain(attribute);
    // A plain img: never next/image, its optimiser or any other proxy.
    expect(html).not.toContain("/_next/image");
    expect(html).not.toContain("srcSet");
    expect(html).not.toContain("srcset");
    expect(html).toContain('<a href="https://www.cardrush-op.jp/product/15600" target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-4">Image: CardRush</a>');
    expect(html).not.toContain("Official image");
  });

  it("labels an official image as an English base reference with its credit, and shows nothing for a row without one", () => {
    const official = { url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-006-EN.png", attribution: "©Eiichiro Oda/Shueisha, Toei Animation ©BANDAI CO., LTD." };
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [reference, item] }} params={new URLSearchParams()} images={imagesFor([[reference.id, { official }]], 2)} />);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain(`src="${official.url}"`);
    expect(html).toContain("Official image · English base reference");
    expect(html).toContain(official.attribution);
    expect(html).toContain("official English base reference image, printing not verified");
    expect(html).not.toContain("Image: CardRush");
    // No images at all: no img and no placeholder that implies one.
    const none = renderToStaticMarkup(<MemberPriceResults page={page} params={new URLSearchParams()} images={imagesFor([], 1)} />);
    expect(none).not.toContain("<img");
    expect(none).not.toMatch(/No image|N\/A|placeholder/i);
    expect(renderToStaticMarkup(<MemberPriceResults page={page} params={new URLSearchParams()} />)).not.toContain("<img");
  });

  it("shows a mapped CardRush row its official reference inline and its listing image behind the member's click", () => {
    const official = { url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-006-EN.png", attribution: "Publisher credit" };
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [{ ...listing, sku: "op-op01-006-ja", mappingStatus: "exact" as const }] }} params={new URLSearchParams()} images={imagesFor([[listing.id, { official, listing: listingUrl }]])} />);
    const details = /<details[^>]*>[\s\S]*?<\/details>/.exec(html)![0];
    // The official image sits outside the details element; the CardRush one inside it.
    expect(html.replace(details, "")).toContain(`src="${official.url}"`);
    expect(html.replace(details, "")).not.toContain(listingUrl);
    expect(details).toContain(`src="${listingUrl}"`);
    expect(html).toContain("Official image · English base reference");
  });

  it("says when a page has more rows than were looked up for images", () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({ ...item, id: `row-${index}` }));
    expect(renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: rows, count: 3 }} params={new URLSearchParams()} images={imagesFor([], 2)} />)).toContain("Images are looked up for the first 2 rows of a page.");
    expect(renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: rows, count: 3 }} params={new URLSearchParams()} images={imagesFor([], 3)} />)).not.toContain("Images are looked up");
  });

  it("provides labelled name, source, game, metric and history filters with no stale cursor", () => {
    const html = renderToStaticMarkup(<MemberPriceFilters params={new URLSearchParams({ q: "Example", cursor: "old" })} displayOnly={[]} />);
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
