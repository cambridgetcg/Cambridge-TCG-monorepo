import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  derive: vi.fn(),
  quotes: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: mocks.auth }));
vi.mock("@/lib/market-derived/derive", () => ({ runMarketDerivation: mocks.derive }));
vi.mock("@/lib/fx/rates", () => ({ fetchEcbEuroQuotes: mocks.quotes }));
import { GET, maxDuration } from "./route";

const request = () => new Request("https://cambridgetcg.com/api/cron/derive/market");
const quotes = { source: "ecb.europa.eu", as_of: "2026-10-27", fetched_at: "2026-10-28T07:00:00.000Z", perEur: { GBP: "0.8672", JPY: "162.53", USD: "1.0812" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.auth.mockReturnValue(null);
  mocks.quotes.mockResolvedValue(quotes);
  vi.stubEnv("DATA_DERIVE_MARKET", "on");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("market derivation cron", () => {
  it("runs nothing when cron auth denies", async () => {
    const denied = new Response("denied", { status: 401 });
    mocks.auth.mockReturnValue(denied);
    expect(await GET(request())).toBe(denied);
    expect(mocks.quotes).not.toHaveBeenCalled();
    expect(mocks.derive).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "off", "ON", "true", " on"])("stays inert with DATA_DERIVE_MARKET=%j: no database, no ECB", async flag => {
    if (flag === undefined) vi.stubEnv("DATA_DERIVE_MARKET", undefined as unknown as string);
    else vi.stubEnv("DATA_DERIVE_MARKET", flag);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ ok: true, ran: false, reason: "disabled" });
    expect(mocks.quotes).not.toHaveBeenCalled();
    expect(mocks.derive).not.toHaveBeenCalled();
  });

  it("derives today's UTC date with ECB's quotes when on", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-28T23:30:00-05:00"), toFake: ["Date"] });
    mocks.derive.mockResolvedValue({ ok: true, ran: true, asOf: "2026-10-29", runId: "7" });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, ran: true, runId: "7" });
    expect(mocks.derive).toHaveBeenCalledOnce();
    const [input] = mocks.derive.mock.calls[0]!;
    expect(input).toMatchObject({ asOf: "2026-10-29", fx: quotes });
    expect(input.now.toISOString()).toBe("2026-10-29T04:30:00.000Z");
  });

  it("answers a repeat run as already derived, still a success", async () => {
    mocks.derive.mockResolvedValue({ ok: true, ran: false, reason: "already-derived", runId: "7" });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ran: false, reason: "already-derived" });
  });

  it.each(["not-provisioned", "fx-unavailable", "no-inputs", "out-of-order"])("reports %s as a 503, never an empty success", async reason => {
    mocks.derive.mockResolvedValue({ ok: false, ran: false, reason, detail: "why" });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, ran: false, reason });
  });

  it("passes an unreadable ECB through as null for the job to refuse", async () => {
    mocks.quotes.mockResolvedValue(null);
    mocks.derive.mockResolvedValue({ ok: false, ran: false, reason: "fx-unavailable", detail: "ECB quotes are unavailable." });
    expect((await GET(request())).status).toBe(503);
    expect(mocks.derive.mock.calls[0]![0].fx).toBeNull();
  });

  it("fails with 503 and no detail of the error when the job throws", async () => {
    mocks.derive.mockRejectedValue(Object.assign(new Error("relation secret_table at host db.internal"), { name: "PostgresError" }));
    const response = await GET(request());
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ ok: false, ran: false, reason: "unavailable" });
    expect(body).not.toContain("db.internal");
    expect(console.error).toHaveBeenCalledWith("[cron/derive/market] unavailable", "PostgresError");
  });

  it("allows a long cron run", () => {
    expect(maxDuration).toBe(300);
  });
});
