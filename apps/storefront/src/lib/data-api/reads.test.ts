import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
import { DERIVED_MARKET_METHOD_VERSION as METHOD } from "@cambridge-tcg/data-spec";
import { entitlementFor } from "./plans";
import {
  DataApiQueryError, parseExportQuery, parseIndexQuery, parsePremiumQuery, parseReferenceHistoryQuery, parseReferenceQuery,
  readDerivedExport, readMarketIndices, readMarketPremiums, readReferenceHistory, readReferencePrices, serializeDerivedExport,
} from "./reads";

const q = (value: string) => new URLSearchParams(value);
const NOW = new Date("2026-10-28T12:00:00.000Z");
const free = entitlementFor(null);
const actor = { userId: "member" };
const evidence = { cardmarket: "cardmarket-derivation/2026-10-28.1", cardrush: "cardrush/2026-10-28.1", tcgplayer: "tcgplayer/2026-10-28.1" };
const reference = (fields: Record<string, unknown> = {}) => ({
  runId: "7", methodVersion: METHOD, asOf: "2026-10-27", game: "one-piece", setCode: "op01", sources: ["cardrush", "tcgplayer"], _evidence: evidence,
  sku: "op-op01-001-en", amount: "12.4", currency: "GBP", confidence: "medium", sourceCount: 2, ...fields,
});
const premium = (fields: Record<string, unknown> = {}) => ({
  runId: "7", methodVersion: METHOD, asOf: "2026-10-27", game: "one-piece", setCode: "op01", sources: ["cardmarket", "cardrush"], _evidence: evidence,
  market: "cardrush", baseMarket: "cardmarket", ratioP25: "1.1", ratioMedian: "1.2", ratioP75: "1.3", skuCount: 10, marketLanguages: ["ja"], baseLanguages: ["*"], ...fields,
});
const reply = (items: unknown[], extra: Record<string, unknown> = {}) => vi.fn().mockResolvedValue({ rows: [{ ceiling: "9", items, ...extra }] });
beforeEach(() => vi.stubEnv("AUTH_SECRET", "fixture-only-cursor-secret"));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("query parsing", () => {
  it("takes a SKU list or a game and set, never both", () => {
    expect(parseReferenceQuery(q("sku=op-op01-001-en,op-op01-002-en,op-op01-001-en"))).toEqual({ form: "skus", skus: ["op-op01-001-en", "op-op01-002-en"] });
    expect(parseReferenceQuery(q("game=one-piece&set=op01"))).toEqual({ form: "set", game: "one-piece", set: "op01", limit: 100 });
    for (const bad of ["sku=op-op01-001-en&game=one-piece", "game=one-piece", "set=op01", "", "sku=OP-OP01-001-EN", "sku=a,,b"]) {
      expect(() => parseReferenceQuery(q(bad)), bad).toThrow(DataApiQueryError);
    }
    expect(() => parseReferenceQuery(q(`sku=${Array.from({ length: 101 }, (_, i) => `op-op01-${i}-en`).join(",")}`))).toThrow(/At most 100/);
  });

  it.each([
    ["unknown parameters", () => parseReferenceHistoryQuery(q("sku=op-op01-001-en&mode=history"))],
    ["duplicates", () => parseIndexQuery(q("game=one-piece&game=pokemon"))],
    ["impossible dates", () => parseReferenceHistoryQuery(q("sku=op-op01-001-en&from=2026-02-30"))],
    ["reversed ranges", () => parseIndexQuery(q("game=one-piece&from=2026-10-02&to=2026-10-01"))],
    ["unknown markets", () => parseIndexQuery(q("game=one-piece&market=scryfall"))],
    ["oversized pages", () => parseExportQuery(q("date=2026-10-27&limit=5001"))],
    ["missing dates", () => parseExportQuery(q(""))],
    ["malformed cursors", () => parsePremiumQuery(q("game=one-piece&cursor=not a cursor"))],
  ])("refuses %s before any read", (_label, parse) => {
    expect(parse).toThrow(DataApiQueryError);
  });

  it("keeps optional filters absent rather than empty", () => {
    expect(parseIndexQuery(q("game=one-piece&set="))).toEqual({ game: "one-piece", limit: 500 });
    expect(parsePremiumQuery(q("game=one-piece&set=op01&date=2026-10-27&limit=5"))).toEqual({ game: "one-piece", set: "op01", date: "2026-10-27", limit: 5 });
  });
});

describe("derived readers", () => {
  it("reads every row through the release-row revocation join, the exportability rule and the plan's window", async () => {
    const run = reply([reference()]);
    const page = await readReferencePrices(actor, free, parseReferenceQuery(q("sku=op-op01-001-en")), { now: NOW, runQuery: run });
    expect(page).toMatchObject({ status: "available", count: 1, complete: true, ceiling: "9", history: { days: 365, start: "2025-10-28", clipped: false } });
    expect(page.items[0]).toEqual({ runId: "7", methodVersion: METHOD, asOf: "2026-10-27", sku: "op-op01-001-en", game: "one-piece", setCode: "op01", amount: "12.4", currency: "GBP", confidence: "medium", sources: ["cardrush", "tcgplayer"], sourceCount: 2 });
    const [sql, params] = run.mock.calls[0]!;
    expect(sql).toContain("WHERE r.revoked_at IS NULL AND r.derivation");
    expect(sql).toContain("a.version = r.input_evidence ->> s.source");
    expect(sql).toContain("r.member_api OR r.member_download");
    expect(params.slice(2, 4)).toEqual([METHOD, "2025-10-28"]);
    expect(JSON.parse(params[1])).toEqual([
      { source: "cardmarket", version: evidence.cardmarket, evidenceUrl: "repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#cardmarket" },
      { source: "cardrush", version: evidence.cardrush, evidenceUrl: "repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#cardrush" },
      { source: "tcgplayer", version: evidence.tcgplayer, evidenceUrl: "repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#tcgplayer" },
    ]);
  });

  it.each([
    ["42P01", 'relation "market_reference_prices" does not exist'],
    ["42703", "column r.derivation_evidence_version does not exist"],
    ["42703", 'column "derivation" does not exist'],
    ["42703", "column r.derivation_evidence_url does not exist"],
  ])("reports %s (%s) as not provisioned", async (code, message) => {
    const run = vi.fn().mockRejectedValue(Object.assign(new Error(message), { code }));
    const page = await readReferenceHistory(actor, free, parseReferenceHistoryQuery(q("sku=op-op01-001-en")), { now: NOW, runQuery: run });
    expect(page).toMatchObject({ status: "not-provisioned", items: [], complete: false });
    expect((await readDerivedExport(actor, free, parseExportQuery(q("date=2026-10-27")), { now: NOW, runQuery: run })).status).toBe("not-provisioned");
  });

  it.each([
    "column m.amount_gbp does not exist",
    'column "market_languages" of relation "market_premiums" does not exist',
    "undefined column",
  ])("reports any other undefined column (%s) as unavailable: a defect, not missing storage", async message => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn().mockRejectedValue(Object.assign(new Error(message), { code: "42703" }));
    expect(await readReferenceHistory(actor, free, parseReferenceHistoryQuery(q("sku=op-op01-001-en")), { now: NOW, runQuery: run })).toMatchObject({ status: "unavailable" });
  });

  it("serves each premium side's language basis, as stored", async () => {
    const run = reply([premium(), premium({ market: "tcgplayer", sources: ["cardmarket", "tcgplayer"], marketLanguages: ["en", "ja"] })]);
    const page = await readMarketPremiums(actor, free, parsePremiumQuery(q("game=one-piece&set=op01")), { now: NOW, runQuery: run });
    expect(page.items.map(item => [item.market, item.marketLanguages, item.baseLanguages])).toEqual([["cardrush", ["ja"], ["*"]], ["tcgplayer", ["en", "ja"], ["*"]]]);
    expect(run.mock.calls[0]![0]).toContain("'marketLanguages', to_jsonb(p.market_languages), 'baseLanguages', to_jsonb(p.base_languages)");
  });

  it.each([
    ["no market language basis", { marketLanguages: undefined }],
    ["an empty basis", { baseLanguages: [] }],
    ["a basis out of order", { marketLanguages: ["ja", "en"] }],
    ["a language that is not ISO 639-1", { baseLanguages: ["jpn"] }],
  ])("refuses the whole premium page when a row carries %s", async (_label, fields) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = reply([premium(), premium(fields)]);
    expect(await readMarketPremiums(actor, free, parsePremiumQuery(q("game=one-piece")), { now: NOW, runQuery: run })).toMatchObject({ status: "unavailable", items: [] });
  });

  it("reports other failures as unavailable without their detail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn().mockRejectedValue(new Error("postgres://user:secret@host refused"));
    const page = await readMarketIndices(actor, free, parseIndexQuery(q("game=one-piece")), { now: NOW, runQuery: run });
    expect(page).toMatchObject({ status: "unavailable", complete: false });
    expect(JSON.stringify([page, error.mock.calls])).not.toContain("secret");
  });

  it.each([
    ["a provider value with too many figures", { amount: "12.34" }],
    ["one unexported source", { sources: ["cardmarket", "cardrush"] }],
    ["Scryfall", { sources: ["cardrush", "scryfall"] }],
    ["unsorted sources", { sources: ["tcgplayer", "cardrush"] }],
    ["high confidence from two sources", { confidence: "high" }],
    ["stale derivation evidence", { _evidence: { ...evidence, cardrush: "cardrush/2026-01-01.0" } }],
    ["another method version", { methodVersion: "ctcg.market-derived/v2" }],
  ])("refuses the whole page when a row carries %s", async (_label, fields) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = reply([reference(), reference(fields)]);
    expect(await readReferencePrices(actor, free, parseReferenceQuery(q("sku=op-op01-001-en,op-op01-002-en")), { now: NOW, runQuery: run })).toMatchObject({ status: "unavailable", items: [] });
  });

  it("refuses dates before the plan's window instead of answering empty", async () => {
    const run = reply([]);
    await expect(readDerivedExport(actor, free, parseExportQuery(q("date=2025-10-27")), { now: NOW, runQuery: run })).rejects.toMatchObject({ status: 403, code: "INSUFFICIENT_TIER" });
    expect(run).not.toHaveBeenCalled();
    await readDerivedExport(actor, entitlementFor("pro"), parseExportQuery(q("date=2025-10-27")), { now: NOW, runQuery: run });
    expect(run.mock.calls[0]![1][3]).toBeNull();
  });

  it("does not accept a member-price cursor, a cursor for other filters, or another account's", async () => {
    const run = reply([reference(), reference({ sku: "op-op01-002-en" })]);
    const first = await readReferencePrices(actor, free, parseReferenceQuery(q("game=one-piece&set=op01&limit=1")), { now: NOW, runQuery: run });
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const body = first.nextCursor!.split(".")[0]!;
    const memberStyle = `${body}.${createHmac("sha256", "fixture-only-cursor-secret").update(body).digest("base64url")}`;
    for (const [who, params] of [[actor, `game=one-piece&set=op01&limit=1&cursor=${memberStyle}`], [actor, `game=one-piece&set=op02&limit=1&cursor=${first.nextCursor}`], [{ userId: "other" }, `game=one-piece&set=op01&limit=1&cursor=${first.nextCursor}`]] as const) {
      await expect(readReferencePrices(who, free, parseReferenceQuery(q(params)), { now: NOW, runQuery: run })).rejects.toThrow(DataApiQueryError);
    }
    const second = await readReferencePrices(actor, free, parseReferenceQuery(q(`game=one-piece&set=op01&limit=1&cursor=${first.nextCursor}`)), { now: NOW, runQuery: run });
    expect(run.mock.calls.at(-1)![1].slice(0, 1)).toEqual(["9"]);
    expect(run.mock.calls.at(-1)![1][6]).toBe("op-op01-001-en");
    expect(second.asOf).toBe(first.asOf);
  });

  it("serializes an export page completely: manifest with rights, rows, footer", () => {
    const text = serializeDerivedExport({
      status: "available", items: [{ type: "premium", runId: "7", methodVersion: METHOD, asOf: "2026-10-27", game: "one-piece", setCode: "op01", market: "cardrush", baseMarket: "cardmarket", ratioP25: "1.1", ratioMedian: "1.2", ratioP75: "1.3", skuCount: 10, sources: ["cardmarket", "cardrush"], marketLanguages: ["ja"], baseLanguages: ["*"] }],
      nextCursor: null, ceiling: "9", asOf: NOW.toISOString(), count: 1, complete: true, history: { days: 365, start: "2025-10-28", clipped: false }, run: null, total: 1,
    }, "rights text");
    const lines = text.trimEnd().split("\n").map(line => JSON.parse(line));
    expect(text.endsWith("\n")).toBe(true);
    expect(lines.map(line => line.type)).toEqual(["manifest", "premium", "footer"]);
    expect(lines[1]).toMatchObject({ marketLanguages: ["ja"], baseLanguages: ["*"] });
    expect(lines[0]).toMatchObject({ schema: METHOD, rights: "rights text", total: 1 });
    expect(lines[0]).not.toHaveProperty("items");
    expect(lines[2]).toEqual({ type: "footer", count: 1, total: 1, complete: true, nextCursor: null, pageComplete: true });
  });
});
