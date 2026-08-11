import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));

const TRADE_ID = "123e4567-e89b-42d3-a456-426614174001";
const USER_ID = "123e4567-e89b-42d3-a456-426614174002";
const context = (id = TRADE_ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
  mocks.query.mockResolvedValue({
    rows: [{
      escrow_status: "awaiting_payment",
      payment_expires_at: "2099-01-01T00:00:00.000Z",
      admin_notes: "operator only",
      stripe_session_id: "cs_secret",
      payout_reference: "po_secret",
      shipping_address: { line1: "private" },
    }],
    rowCount: 1,
  });
});

describe("GET /api/market/trades/[id]/payment-status", () => {
  it("returns only payment status and deadline with a private no-store policy", async () => {
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      trade: {
        escrow_status: "awaiting_payment",
        payment_expires_at: "2099-01-01T00:00:00.000Z",
      },
    });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("buyer_id = $2"), [
      TRADE_ID,
      USER_ID,
    ]);
  });

  it("does not reveal whether an absent/outsider trade exists", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects malformed references and unauthenticated reads before querying", async () => {
    const malformed = await GET(new Request("https://example.test"), context("not-a-uuid"));
    expect(malformed.status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();

    mocks.auth.mockResolvedValueOnce(null);
    const unauthenticated = await GET(new Request("https://example.test"), context());
    expect(unauthenticated.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
