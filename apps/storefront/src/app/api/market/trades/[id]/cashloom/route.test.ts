import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeCashloomTradeSeller,
  getCashloomTradeHandoffView,
  isCashloomSettlementMigrationMissing,
  prepareCashloomTradeHandoff,
} from "@/lib/cashloom/db";
import { GET, POST } from "./route";

const authMocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: authMocks.auth }));
vi.mock("@/lib/cashloom/db", () => ({
  authorizeCashloomTradeSeller: vi.fn(),
  getCashloomTradeHandoffView: vi.fn(),
  isCashloomSettlementMigrationMissing: vi.fn(),
  prepareCashloomTradeHandoff: vi.fn(),
}));

const TRADE_ID = "123e4567-e89b-42d3-a456-426614174001";
const SESSION = {
  user: { id: "123e4567-e89b-42d3-a456-426614174000", email: "seller@example.test" },
  expires: "2099-01-01T00:00:00.000Z",
};
const VIEW = {
  handoff: null,
  role: "seller" as const,
  can_prepare: true,
};

function context(id = TRADE_ID) {
  return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown) {
  return new Request(`https://example.test/api/market/trades/${TRADE_ID}/cashloom`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  authMocks.auth.mockResolvedValue(SESSION);
  vi.mocked(authorizeCashloomTradeSeller).mockResolvedValue({ ok: true });
  vi.mocked(isCashloomSettlementMigrationMissing).mockReturnValue(false);
});

describe("/api/market/trades/[id]/cashloom", () => {
  it("requires authentication and applies private no-store", async () => {
    authMocks.auth.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getCashloomTradeHandoffView).not.toHaveBeenCalled();
  });

  it("rejects a malformed dynamic UUID before querying Postgres", async () => {
    const response = await GET(new Request("https://example.test"), context("not-a-uuid"));
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getCashloomTradeHandoffView).not.toHaveBeenCalled();
  });

  it("enforces participant-only reads", async () => {
    vi.mocked(getCashloomTradeHandoffView).mockResolvedValueOnce({
      ok: false,
      reason: "forbidden",
    });
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns the stable handoff readiness shape", async () => {
    vi.mocked(getCashloomTradeHandoffView).mockResolvedValueOnce({ ok: true, value: VIEW });
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(VIEW);
  });

  it("accepts only the closed prepare action", async () => {
    const response = await POST(postRequest({ action: "prepare", pay: true }), context());
    expect(response.status).toBe(422);
    expect(prepareCashloomTradeHandoff).not.toHaveBeenCalled();
  });

  it("authorizes the seller before reading any request body bytes", async () => {
    vi.mocked(authorizeCashloomTradeSeller).mockResolvedValueOnce({
      ok: false,
      reason: "forbidden",
    });
    const unreadRequest = {
      headers: new Headers({ "content-type": "application/json" }),
      get body(): never {
        throw new Error("body must not be read before authorization");
      },
    } as unknown as Request;

    const response = await POST(unreadRequest, context());

    expect(response.status).toBe(403);
    expect(prepareCashloomTradeHandoff).not.toHaveBeenCalled();
  });

  it("caps JSON bodies before parsing", async () => {
    const response = await POST(postRequest({ action: "prepare", padding: "x".repeat(1100) }), context());

    expect(response.status).toBe(413);
    expect(prepareCashloomTradeHandoff).not.toHaveBeenCalled();
  });

  it("returns the stored winner and never makes an outbound call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.mocked(prepareCashloomTradeHandoff).mockResolvedValueOnce({
      ok: true,
      value: { ...VIEW, can_prepare: false, unavailable_reason: "handoff_already_prepared" },
      reused: true,
    });
    const response = await POST(postRequest({ action: "prepare" }), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      ...VIEW,
      can_prepare: false,
      unavailable_reason: "handoff_already_prepared",
      reused: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("maps an expired trade to a conflict without preparing anything", async () => {
    vi.mocked(prepareCashloomTradeHandoff).mockResolvedValueOnce({
      ok: false,
      reason: "payment_window_expired",
    });
    const response = await POST(postRequest({ action: "prepare" }), context());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("PAYMENT_WINDOW_EXPIRED");
  });
});
