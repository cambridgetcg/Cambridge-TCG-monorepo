import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberPriceItem, MemberPricePage } from "./member-feed-types";
import { MemberPriceQueryError } from "./member-feed-types";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), bearer: vi.fn(), read: vi.fn(), parse: vi.fn(), mint: vi.fn(), list: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/prices/member-access", () => ({ getMemberSessionActor: mocks.session }));
vi.mock("@/lib/prices/member-feed", async () => ({ ...await import("./member-feed-types"), readMemberPrices: mocks.read, parseMemberPriceQuery: mocks.parse }));
vi.mock("@/lib/datafeed/member-keys", () => ({
  resolveMemberBearer: mocks.bearer, createMemberKey: mocks.mint, listMemberKeys: mocks.list, revokeMemberKey: mocks.revoke,
  MemberKeyError: class extends Error {},
}));
import * as feed from "@/app/api/v1/member-prices/route";
import * as download from "@/app/api/account/prices/export/route";
import * as keys from "@/app/api/account/data/keys/route";
import { MEMBER_CSV_COLUMNS, memberCsvCell } from "./member-export";

const item: MemberPriceItem = {
  id: "1", source: "cardmarket", sourceProductId: "123", sku: null, mappingStatus: "unmapped", game: "pokemon", setCode: null,
  productName: 'A "quoted", card\nname', granularity: "source-product", finish: null, language: null, condition: null,
  metric: "trend", amount: "12.34", currency: "EUR", underlyingMarket: "cardmarket",
  sourceUpdatedAt: "2026-09-06T00:00:00.000Z", retrievedAt: "2026-09-07T00:00:00.000Z",
  sourceUrl: "https://downloads.cardmarket.com/priceGuide.json", parserVersion: "test/1", crosswalkVersion: "test/1", evidenceVersion: "test/1", artifactSha256: "a".repeat(64),
  catalogSourceUrl: "https://downloads.cardmarket.com/catalog.json", catalogUpdatedAt: "2026-08-01T00:00:00.000Z", catalogArtifactSha256: "b".repeat(64),
  quality: "accepted", permittedUses: ["member-display", "member-api", "member-download"], attribution: "Cardmarket official dataset",
};
const page: MemberPricePage = { status: "available", items: [item], count: 1, total: 2, complete: false, nextCursor: "opaque.cursor", watermark: "1", asOf: "2026-09-07T10:00:00.000Z" };
const url = "https://cambridgetcg.com";
function request(path: string, headers?: HeadersInit) { return new Request(url + path, { headers }); }
function privateResponse(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(null);
  mocks.bearer.mockResolvedValue({ ok: false, status: 401 });
  mocks.read.mockResolvedValue(page);
  mocks.parse.mockReturnValue({ mode: "current", limit: 100 });
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", url);
});
afterEach(() => vi.unstubAllEnvs());

describe("member route authentication before pricing", () => {
  it("anonymous, forged-cookie and cookie-only feed requests never parse or read prices", async () => {
    for (const headers of [{}, { cookie: "authjs.session-token=forged" }] as HeadersInit[]) {
      const response = await feed.GET(request("/api/v1/member-prices?limit=bad", headers));
      expect(response.status).toBe(401); privateResponse(response);
    }
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("invalid session and bearer-only download requests never parse or read prices", async () => {
    const response = await download.GET(request("/api/account/prices/export?format=bad", { authorization: "Bearer ctcg_member_abc", cookie: "authjs.session-token=forged" }));
    expect(response.status).toBe(401); privateResponse(response);
    expect(mocks.bearer).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rate-limited keys receive private retry information before source parsing", async () => {
    mocks.bearer.mockResolvedValue({ ok: false, status: 429, resetSeconds: 12 });
    const response = await feed.GET(request("/api/v1/member-prices"));
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("12"); privateResponse(response);
    expect(mocks.parse).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("authenticated feed requests use only the API projection and preserve the envelope", async () => {
    mocks.bearer.mockResolvedValue({ ok: true, actor: { userId: "member" }, remaining: 29, resetSeconds: 20 });
    const response = await feed.GET(request("/api/v1/member-prices?game=pokemon"));
    expect(response.status).toBe(200); privateResponse(response);
    const body = await response.json();
    expect(body.data).toEqual(page); expect(body._meta.license).toBe("NOASSERTION");
    expect(body._meta.next_link).toContain("game=pokemon&cursor=opaque.cursor");
    expect(mocks.read).toHaveBeenCalledWith({ userId: "member" }, { mode: "current", limit: 100 }, "member-api");
  });
  it("query failures and backend outages are private and non-disclosing", async () => {
    mocks.bearer.mockResolvedValue({ ok: true, actor: { userId: "member" }, remaining: 29, resetSeconds: 20 });
    mocks.parse.mockImplementationOnce(() => { throw new MemberPriceQueryError("Invalid cursor."); });
    const invalid = await feed.GET(request("/api/v1/member-prices?cursor=bad"));
    expect(invalid.status).toBe(400); privateResponse(invalid); expect(mocks.read).not.toHaveBeenCalled();
    mocks.read.mockRejectedValueOnce(new Error("DATABASE_URL=secret"));
    const unavailable = await feed.GET(request("/api/v1/member-prices"));
    expect(unavailable.status).toBe(503); privateResponse(unavailable); expect(await unavailable.text()).not.toContain("secret");
  });
});

describe("bounded member export consistency", () => {
  it("CSV and NDJSON carry the same complete record fields and explicit continuation", async () => {
    mocks.session.mockResolvedValue({ userId: "member" });
    const csv = await download.GET(request("/api/account/prices/export?format=csv"));
    expect(csv.status).toBe(200); privateResponse(csv);
    expect(csv.headers.get("x-next-cursor")).toBe("opaque.cursor");
    expect(csv.headers.get("x-price-complete")).toBe("false"); expect(csv.headers.get("x-price-total")).toBe("2");
    const csvText = await csv.text();
    expect(csvText).toContain('"A ""quoted"", card\nname"');
    expect([...MEMBER_CSV_COLUMNS].sort()).toEqual(Object.keys(item).sort());
    const ndjson = await download.GET(request("/api/account/prices/export?format=ndjson"));
    const [manifest, observation, footer] = (await ndjson.text()).trim().split("\n").map(line => JSON.parse(line));
    expect(observation).toEqual({ type: "observation", ...item });
    expect(manifest.nextCursor).toBe("opaque.cursor"); expect(manifest.asOf).toBe(page.asOf);
    expect(footer).toMatchObject({ type: "footer", pageComplete: true, complete: false, count: 1, total: 2 });
    for (const call of mocks.read.mock.calls) expect(call[2]).toBe("member-download");
    expect(mocks.parse.mock.calls[0][0].has("format")).toBe(false);
  });
  it.each(["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", " \t=CMD()", "\tplain"])("neutralizes spreadsheet formulas %s", value => {
    expect(memberCsvCell(value)).toBe(`"'${value}"`);
  });
  it("does not stream or label an unavailable reader as a completed download", async () => {
    mocks.session.mockResolvedValue({ userId: "member" });
    mocks.read.mockResolvedValue({ ...page, status: "unavailable", items: [], count: 0, complete: false });
    const response = await download.GET(request("/api/account/prices/export?format=csv"));
    expect(response.status).toBe(503); privateResponse(response);
    expect(response.headers.has("content-disposition")).toBe(false);
  });
  it("rejects duplicate or unknown formats before source reads", async () => {
    mocks.session.mockResolvedValue({ userId: "member" });
    for (const suffix of ["format=xml", "format=csv&format=ndjson"]) {
      const response = await download.GET(request(`/api/account/prices/export?${suffix}`));
      expect(response.status).toBe(400); privateResponse(response);
    }
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

describe("session-only key management", () => {
  it("denies unauthenticated key operations even when a bearer exists", async () => {
    const response = await keys.POST(new Request(url + "/api/account/data/keys", { method: "POST", headers: { authorization: "Bearer key" } }));
    expect(response.status).toBe(401); privateResponse(response); expect(mocks.mint).not.toHaveBeenCalled();
    expect((await keys.GET()).status).toBe(401); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("denies a forged matching Host/Origin before reading the mutation body", async () => {
    mocks.session.mockResolvedValue({ userId: "member" });
    const response = await keys.POST(new Request("https://evil.example/api/account/data/keys", { method: "POST", headers: { host: "evil.example", origin: "https://evil.example", "content-type": "application/json" }, body: '{"name":"key"}' }));
    expect(response.status).toBe(403); privateResponse(response); expect(mocks.mint).not.toHaveBeenCalled();
  });
  it("mints for the authenticated owner, never for a submitted user ID", async () => {
    mocks.session.mockResolvedValue({ userId: "member" });
    mocks.mint.mockResolvedValue({ key: { id: "new" }, token: "shown-once" });
    const req = (body: unknown) => new Request(url + "/api/account/data/keys", { method: "POST", headers: { origin: url, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await keys.POST(req({ name: "key", userId: "other" }))).status).toBe(400);
    expect(mocks.mint).not.toHaveBeenCalled();
    const response = await keys.POST(req({ name: "key" }));
    expect(response.status).toBe(201); privateResponse(response);
    expect(mocks.mint).toHaveBeenCalledWith("member", "key");
  });
  it("revoke has owner scope and never reports success after server refusal", async () => {
    mocks.session.mockResolvedValue({ userId: "member" }); mocks.revoke.mockResolvedValue(false);
    const response = await keys.DELETE(new Request(url + "/api/account/data/keys", { method: "DELETE", headers: { origin: url, "content-type": "application/json" }, body: '{"keyId":"other-key"}' }));
    expect(response.status).toBe(404); privateResponse(response);
    expect(mocks.revoke).toHaveBeenCalledWith("member", "other-key");
    expect(await response.json()).not.toHaveProperty("revoked");
  });
  it("explicitly returns private errors for unsupported verbs, including OPTIONS", () => {
    for (const route of [feed, download, keys]) for (const method of [route.PUT, route.PATCH, route.HEAD, route.OPTIONS]) {
      const response = method(); expect(response.status).toBe(405); privateResponse(response);
    }
  });
});
