import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/market/db", () => ({
  updateEscrowStatus: vi.fn(),
  listTradePhotos: vi.fn(),
  reviewTradePhoto: vi.fn(),
}));
vi.mock("@/lib/market/completion", () => ({
  computeAutoCompleteAt: vi.fn(() => null),
  defaultDisputeWindowHours: vi.fn(async () => ({ full_escrow: 168 })),
  isBuyerConfirmableState: vi.fn(() => false),
}));

const TRADE_ID = "123e4567-e89b-42d3-a456-426614174001";
const BUYER_ID = "123e4567-e89b-42d3-a456-426614174002";
const SELLER_ID = "123e4567-e89b-42d3-a456-426614174003";

function context() {
  return { params: Promise.resolve({ id: TRADE_ID }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: BUYER_ID } });
  mocks.query.mockResolvedValue({
    rows: [{
      id: TRADE_ID,
      buyer_id: BUYER_ID,
      seller_id: SELLER_ID,
      escrow_status: "awaiting_payment",
      payment_expires_at: "2099-01-01T00:00:00.000Z",
      admin_notes: "operator only",
      stripe_session_id: "cs_secret",
      stripe_payment_intent: "pi_secret",
      payout_reference: "po_secret",
    }],
    rowCount: 1,
  });
});

describe("GET /api/market/trades/[id]", () => {
  it("keeps the participant payment-status read private and uncached", async () => {
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.trade).toMatchObject({
      id: TRADE_ID,
      current_user_role: "buyer",
      escrow_status: "awaiting_payment",
    });
    expect(body.trade).not.toHaveProperty("admin_notes");
    expect(body.trade).not.toHaveProperty("stripe_session_id");
    expect(body.trade).not.toHaveProperty("stripe_payment_intent");
    expect(body.trade).not.toHaveProperty("payout_reference");
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("t.buyer_id = $2"), [
      TRADE_ID,
      BUYER_ID,
    ]);
  });

  it("does not expose status to an outsider", async () => {
    mocks.auth.mockResolvedValueOnce({
      user: { id: "123e4567-e89b-42d3-a456-426614174004" },
    });
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects an unauthenticated return before querying the trade", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
