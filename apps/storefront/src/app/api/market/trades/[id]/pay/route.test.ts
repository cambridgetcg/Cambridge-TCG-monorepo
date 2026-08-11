import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  getStripe: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.getStripe }));

const TRADE_ID = "123e4567-e89b-42d3-a456-426614174001";
const BUYER_ID = "123e4567-e89b-42d3-a456-426614174002";
const context = { params: Promise.resolve({ id: TRADE_ID }) };
const trade = {
  id: TRADE_ID,
  buyer_id: BUYER_ID,
  escrow_status: "awaiting_payment",
  payment_expires_at: "2099-01-01T00:00:00.000Z",
  price: "10.00",
  quantity: 1,
  sku: "OP-OP01-001-JP",
  card_name: "Card",
  image_url: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ user: { id: BUYER_ID, email: "buyer@example.test" } });
  mocks.query.mockResolvedValue({ rows: [trade], rowCount: 1 });
  mocks.getStripe.mockReturnValue({ checkout: { sessions: { create: mocks.create } } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/market/trades/[id]/pay failure truth", () => {
  it("distinguishes a proven pre-egress configuration failure", async () => {
    mocks.getStripe.mockImplementationOnce(() => {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    });

    const response = await POST(new Request("https://example.test", { method: "POST" }), context);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "payments_unconfigured",
      error: expect.stringMatching(/No request was sent to the payment provider/i),
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    ["provider rejection", false],
    ["database write after provider success", true],
  ])("labels %s as outcome-unknown and forbids retry", async (_label, providerSucceeded) => {
    if (providerSucceeded) {
      mocks.create.mockResolvedValueOnce({ id: "cs_test", url: "https://checkout.stripe.test/session" });
      mocks.query
        .mockResolvedValueOnce({ rows: [trade], rowCount: 1 })
        .mockRejectedValueOnce(new Error("database unavailable"));
    } else {
      mocks.create.mockRejectedValueOnce(new Error("provider transport failed"));
    }

    const response = await POST(new Request("https://example.test", { method: "POST" }), context);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "checkout_outcome_unknown",
      error: expect.stringMatching(/may have reached.*Do not try again/i),
    });
  });
});
