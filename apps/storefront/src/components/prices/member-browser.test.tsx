import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GAMES } from "@cambridge-tcg/sku";
import type { MemberPriceItem, MemberPricePage } from "@/lib/prices/member-feed-types";
import type { MemberPriceImage } from "@/lib/prices/member-images";
import { DISPLAY_ONLY_INPUT_PAGES_END, MemberPriceQueryError } from "@/lib/prices/member-feed-types";

vi.mock("server-only", () => ({}));
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
    mocks.images.mockResolvedValue({ byItem: new Map([[item.id, { official: { url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-006-EN.png", attribution: "Publisher credit", imageLang: "en", depictedSku: "op-op01-006-en", scope: "syntax_only", relationship: "other-language", rowLang: "ja", rowVariant: null } }]]), rowsLookedUp: 1 });
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
  // A printing-level row with an exact SKU, as TCGplayer writes them.
  const reference = { ...item, id: "tcgplayer-1", source: "tcgplayer" as const, sourceProductId: "456", game: "one-piece", sku: "op-op01-006-ja", setCode: "op01", mappingStatus: "exact" as const,
    granularity: "printing" as const, language: "ja", metric: "market", currency: "USD" as const, underlyingMarket: "tcgplayer" as const, permittedUses: ["member-display" as const] };
  const imagesFor = (entries: [string, MemberPriceImage][], rowsLookedUp = entries.length) => ({ byItem: new Map(entries), rowsLookedUp });
  const linked = (lang: string | null = "ja") => ({ url: listingUrl, lang, relationship: "same-listing" as const });
  type Official = NonNullable<MemberPriceImage["official"]>;
  const shownOfficial = { url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-006-EN.png", imageLang: "en" as const, depictedSku: "op-op01-006-en", scope: "syntax_only" as const };
  const officialFor = (relationship: Exclude<Official["relationship"], "pooled-row">, rowLang: string, rowVariant: string | null = null, attribution = "©Eiichiro Oda/Shueisha, Toei Animation ©BANDAI CO., LTD."): Official => ({
    ...shownOfficial, attribution, relationship, rowLang, rowVariant,
  });

  it("offers a CardRush listing image at CardRush's own URL only behind a closed details element, lazily, fixed-size and credited to the listing", () => {
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [listing] }} params={new URLSearchParams()} images={imagesFor([[listing.id, { listing: linked() }]])} />);
    // Closed and lazy: the member's browser asks CardRush only when the member opens it.
    const details = /<details[^>]*>[\s\S]*?<\/details>/.exec(html)![0];
    expect(details).not.toMatch(/<details[^>]*\bopen\b/);
    expect(details).toContain("Show CardRush&#x27;s listing image (this listing)");
    expect(details).toContain("Loads from CardRush, which then sees your IP address.");
    const img = /<img [^>]*>/.exec(details)![0];
    expect(img).toContain(`src="${listingUrl}"`);
    for (const attribute of ['loading="lazy"', 'decoding="async"', 'width="56"', 'height="78"', 'referrerPolicy="no-referrer"', 'alt="〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}: CardRush listing image"']) expect(img).toContain(attribute);
    // For an agent reading the HTML: the listing's own image, in the listing's language.
    for (const attribute of ['data-image-source="cardrush-listing"', 'data-image-lang="ja"', 'data-row-lang="ja"', 'data-relationship="same-listing"']) expect(img).toContain(attribute);
    expect(img).not.toContain("data-depicted-sku");
    // A plain img: never next/image, its optimiser or any other proxy.
    expect(html).not.toContain("/_next/image");
    expect(html).not.toContain("srcSet");
    expect(html).not.toContain("srcset");
    expect(html).toContain('<a href="https://www.cardrush-op.jp/product/15600" target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-4">Image: CardRush</a>');
    expect(html).not.toContain("Official image");
    expect(html).not.toContain('data-image-source="official"');
  });

  it("gives a listing image of unknown language no language", () => {
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [{ ...listing, language: null }] }} params={new URLSearchParams()} images={imagesFor([[listing.id, { listing: linked(null) }]])} />);
    const img = /<img [^>]*>/.exec(html)![0];
    for (const attribute of ['data-image-lang="unknown"', 'data-row-lang="unknown"', 'data-relationship="same-listing"']) expect(img).toContain(attribute);
  });

  it("labels an official image with its credit, and shows nothing for a row without one", () => {
    const official = officialFor("other-language", "ja");
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [reference, item] }} params={new URLSearchParams()} images={imagesFor([[reference.id, { official }]], 2)} />);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain(`src="${official.url}"`);
    expect(html).toContain(official.attribution);
    expect(html).not.toContain("Image: CardRush");
    // No images at all: no img and no placeholder that implies one.
    const none = renderToStaticMarkup(<MemberPriceResults page={page} params={new URLSearchParams()} images={imagesFor([], 1)} />);
    expect(none).not.toContain("<img");
    expect(none).not.toMatch(/No image|N\/A|placeholder/i);
    expect(renderToStaticMarkup(<MemberPriceResults page={page} params={new URLSearchParams()} />)).not.toContain("<img");
  });

  it.each([
    ["an English base row", "op-op01-006-en", officialFor("same-printing", "en"), "Official image · this printing (English), matched by SKU, not verified", "Official image; this printing (English), matched by SKU, not verified"],
    ["an English parallel", "op-op01-006-en-p1", officialFor("same-language-base-print", "en", "p1"), "Official English base print · this row is a parallel, art may differ", "Official English base print; this row is a parallel, art may differ"],
    ["an English reprint", "op-op01-006-en-r1", officialFor("same-language-base-print", "en", "r1"), "Official English base print · this row is a reprint, art may differ", "Official English base print; this row is a reprint, art may differ"],
    ["a Japanese row", "op-op01-006-ja", officialFor("other-language", "ja"), "Official English image · this row is Japanese (ja): language differs", "Official English image; this row is Japanese (ja): language differs"],
    ["a Japanese parallel", "op-op01-006-ja-p1", officialFor("other-language", "ja", "p1"), "Official English base print · this row is Japanese (ja), a parallel: language differs, art may differ", "Official English base print; this row is Japanese (ja), a parallel: language differs, art may differ"],
    ["a code the registry does not know", "op-op01-006-xx", officialFor("other-language", "xx"), "Official English image · this row is in language xx: language differs", "Official English image; this row is in language xx: language differs"],
  ] as const)("says plainly how the official image relates to %s (%s), in its label, alt text and data attributes", (_name, sku, official, label, alt) => {
    const row = { ...reference, sku, language: official.rowLang };
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [row] }} params={new URLSearchParams()} images={imagesFor([[row.id, { official }]])} />);
    expect(html).toContain(`${label}<span`);
    expect(html).not.toContain("English base reference");
    const img = /<img [^>]*>/.exec(html)![0];
    expect(img).toContain(`alt="Example product: ${alt}"`);
    // Every relationship, a matching SKU included, is the reference's syntax-only match.
    for (const attribute of ['data-image-source="official"', 'data-image-lang="en"', `data-row-lang="${official.rowLang}"`, `data-relationship="${official.relationship}"`, 'data-depicted-sku="op-op01-006-en"', 'data-scope="syntax_only"']) expect(img).toContain(attribute);
  });

  it.each([
    ["a Japanese base row", "op-op01-006-ja", "same-printing", null, "Official image · this printing (Japanese), matched by SKU, not verified"],
    ["a Japanese parallel", "op-op01-006-ja-p1", "same-language-base-print", "p1", "Official Japanese base print · this row is a parallel, art may differ"],
  ] as const)("labels a Japanese official image truthfully for %s (%s), with its credit marked Japanese", (_name, sku, relationship, rowVariant, label) => {
    const credit = "©尾田栄一郎／集英社 ©尾田栄一郎／集英社・フジテレビ・東映アニメーション";
    const official: Official = { url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-006-JA.png", imageLang: "ja", depictedSku: "op-op01-006-ja", scope: "syntax_only", attribution: credit, relationship, rowLang: "ja", rowVariant };
    const row = { ...reference, sku };
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [row] }} params={new URLSearchParams()} images={imagesFor([[row.id, { official }]])} />);
    expect(html).toContain(`${label}<span lang="ja"`);
    expect(html).toContain(credit);
    expect(html).not.toContain("English");
    const img = /<img [^>]*>/.exec(html)![0];
    for (const attribute of ['data-image-source="official"', 'data-image-lang="ja"', 'data-row-lang="ja"', `data-relationship="${relationship}"`, 'data-depicted-sku="op-op01-006-ja"']) expect(img).toContain(attribute);
  });

  it("never tells a source-product aggregate the image is its printing or language", () => {
    const aggregate = { ...item, id: "cardmarket-1", game: "one-piece", sku: "op-op01-006-en", setCode: "op01", mappingStatus: "exact" as const };
    const official: Official = { ...shownOfficial, attribution: "Publisher credit", relationship: "pooled-row", rowLang: null, rowVariant: null };
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [aggregate] }} params={new URLSearchParams()} images={imagesFor([[aggregate.id, { official }]])} />);
    expect(html).toContain("Official English base print · this row is a source-product aggregate: language and art may differ<span");
    expect(html).not.toContain("this printing");
    // The label agrees with the row's own Specificity column.
    expect(html).toContain("Source-product aggregate");
    expect(html).toContain("Language: unknown");
    const img = /<img [^>]*>/.exec(html)![0];
    expect(img).toContain('alt="Example product: Official English base print; this row is a source-product aggregate: language and art may differ"');
    for (const attribute of ['data-image-source="official"', 'data-image-lang="en"', 'data-row-lang="unknown"', 'data-relationship="pooled-row"', 'data-depicted-sku="op-op01-006-en"', 'data-scope="syntax_only"']) expect(img).toContain(attribute);
  });

  it("names every language the SKU registry knows", () => {
    const codes = [...new Set(Object.values(GAMES).flatMap(game => game.languages))].filter(code => code !== "en");
    expect(codes).toContain("ja");
    for (const code of codes) {
      const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [reference] }} params={new URLSearchParams()} images={imagesFor([[reference.id, { official: officialFor("other-language", code) }]])} />);
      expect(html, code).toMatch(new RegExp(`this row is [A-Z][a-z]+ \\(${code}\\): language differs`));
    }
  });

  it("shows a mapped CardRush row its official reference inline and its listing image behind the member's click", () => {
    const official = officialFor("other-language", "ja", null, "Publisher credit");
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [{ ...listing, sku: "op-op01-006-ja", mappingStatus: "exact" as const }] }} params={new URLSearchParams()} images={imagesFor([[listing.id, { official, listing: linked() }]])} />);
    const details = /<details[^>]*>[\s\S]*?<\/details>/.exec(html)![0];
    // The official image sits outside the details element; the CardRush one inside it.
    expect(html.replace(details, "")).toContain(`src="${official.url}"`);
    expect(html.replace(details, "")).not.toContain(listingUrl);
    expect(details).toContain(`src="${listingUrl}"`);
    expect(html).toContain("Official English image · this row is Japanese (ja): language differs");
    // Each image says its own source and relationship; only the official one names a depicted SKU.
    const [inline, behind] = [...html.matchAll(/<img [^>]*>/g)].map(match => match[0]);
    for (const attribute of ['data-image-source="official"', 'data-relationship="other-language"', 'data-depicted-sku="op-op01-006-en"']) expect(inline).toContain(attribute);
    for (const attribute of ['data-image-source="cardrush-listing"', 'data-relationship="same-listing"']) expect(behind).toContain(attribute);
    expect(behind).not.toContain("data-depicted-sku");
  });

  it("says when a page has more rows than were looked up for images", () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({ ...item, id: `row-${index}` }));
    expect(renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: rows, count: 3 }} params={new URLSearchParams()} images={imagesFor([], 2)} />)).toContain("Images are looked up for the first 2 rows of a page.");
    expect(renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: rows, count: 3 }} params={new URLSearchParams()} images={imagesFor([], 3)} />)).not.toContain("Images are looked up");
  });

  // Titles are the source fixtures' identifiers, as packages/sku/src/__tests__/names.test.ts uses them.
  const nameOf = (html: string) => /<p [^>]*data-name="[^>]*>[\s\S]*?<\/p>/.exec(html)?.[0];
  const titleOf = (title: string) => `<p class="font-medium text-ink">${title}</p>`;

  it("shows a CardRush row's vendor name under its raw title, with its status, its illustrator and attributes for agents", () => {
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [listing] }} params={new URLSearchParams()} />);
    const name = nameOf(html)!;
    // The raw title stays exactly as the source wrote it, with the name directly under it.
    expect(html).toContain(titleOf("〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}") + name);
    for (const attribute of ['data-name="お玉"', 'data-name-key="お玉"', 'data-name-lang="ja"', 'data-name-status="vendor"', 'data-name-rule="cardrush-title/names-1"']) expect(name).toContain(attribute);
    expect(name).toContain('Name: <span lang="ja" class="text-ink">お玉</span>');
    expect(name).toContain("vendor · CardRush");
    expect(name).toContain("Illustrator: sowsow");
    expect(name).not.toMatch(/official/i);
    expect(html).toContain("A name marked vendor is the source&#x27;s own title");
    expect(html).toContain('href="/methodology/card-names"');
  });

  it("names a TCGplayer row of a Japanese printing in English, the language its title is written in", () => {
    const row = { ...reference, productName: "Roronoa Zoro (001) (Parallel)", language: "ja" };
    const name = nameOf(renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [row] }} params={new URLSearchParams()} />))!;
    for (const attribute of ['data-name="Roronoa Zoro"', 'data-name-key="roronoazoro"', 'data-name-lang="en"', 'data-name-status="vendor"', 'data-name-rule="tcgplayer-product/names-1"']) expect(name).toContain(attribute);
    expect(name).toContain('Name: <span lang="en" class="text-ink">Roronoa Zoro</span>');
    expect(name).toContain("vendor · TCGplayer");
    expect(name).not.toContain("Illustrator");
    expect(name).not.toMatch(/official/i);
  });

  it("shows nothing extra for a refused title, a row without a title or a Scryfall row, and keeps each raw title", () => {
    const refused = [
      { ...listing, id: "cardrush-refused", productName: "ロロノア・ゾロ(パラレル/SP仕様)【L/P】{OP01-001}" },
      { ...listing, id: "cardrush-english", productName: "ナミ(英語版)【SR】{OP01-016}", language: "en" },
      { ...item, id: "cardmarket-refused", productName: "Roronoa Zoro (Parallel)" },
      { ...item, id: "no-title", productName: null },
      { ...item, id: "scryfall", source: "scryfall" as const, underlyingMarket: "tcgplayer" as const, productName: "Black Lotus", permittedUses: ["member-display" as const] },
    ];
    const html = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: refused, count: refused.length }} params={new URLSearchParams()} />);
    expect(html).not.toContain("data-name");
    expect(html).not.toContain("Name:");
    expect(html).not.toContain("A name marked vendor");
    for (const title of ["ロロノア・ゾロ(パラレル/SP仕様)【L/P】{OP01-001}", "ナミ(英語版)【SR】{OP01-016}", "Roronoa Zoro (Parallel)", "Source product name unknown", "Black Lotus"]) expect(html).toContain(titleOf(title));
    // Beside a named row, a refused one still shows none.
    const mixed = renderToStaticMarkup(<MemberPriceResults page={{ ...page, items: [listing, ...refused] }} params={new URLSearchParams()} />);
    expect(mixed.match(/data-name="/g)).toHaveLength(1);
    expect(mixed.match(/A name marked vendor/g)).toHaveLength(1);
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
