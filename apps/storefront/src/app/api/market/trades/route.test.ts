import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isAdmin: vi.fn(),
  getUserTrades: vi.fn(),
  getAllTrades: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/market/db", () => ({
  getUserTrades: mocks.getUserTrades,
  getAllTrades: mocks.getAllTrades,
}));

const USER_ID = "123e4567-e89b-42d3-a456-426614174002";
const SELLER_ID = "123e4567-e89b-42d3-a456-426614174003";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
  mocks.getUserTrades.mockResolvedValue([{
    id: "123e4567-e89b-42d3-a456-426614174001",
    buyer_id: USER_ID,
    seller_id: SELLER_ID,
    sku: "OP-OP01-001-JP",
    price: "10.00",
    quantity: 1,
    escrow_status: "awaiting_payment",
    escrow_tier: "direct",
    requires_photos: false,
    payment_expires_at: "2099-01-01T00:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    buyer_username: "buyer",
    seller_username: "seller",
    card_name: "Card",
    image_url: null,
    admin_notes: "operator only",
    stripe_session_id: "cs_secret",
    stripe_payment_intent: "pi_secret",
    payout_reference: "po_secret",
    shipping_address: { line1: "private" },
  }]);
});

describe("GET /api/market/trades", () => {
  it("returns an allowlisted private participant summary", async () => {
    const response = await GET(new Request("https://example.test/api/market/trades"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.trades[0]).toMatchObject({
      current_user_role: "buyer",
      card_name: "Card",
      escrow_status: "awaiting_payment",
    });
    for (const secret of [
      "admin_notes",
      "stripe_session_id",
      "stripe_payment_intent",
      "payout_reference",
      "shipping_address",
    ]) {
      expect(body.trades[0]).not.toHaveProperty(secret);
    }
  });

  it("rejects an unauthenticated account list without querying trades", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://example.test/api/market/trades"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getUserTrades).not.toHaveBeenCalled();
  });
});
