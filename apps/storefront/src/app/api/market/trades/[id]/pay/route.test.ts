import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  getStripe: vi.fn(),
  availability: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.getStripe }));
vi.mock("@/lib/release/market-payment-creation", () => ({
  getMarketPaymentCreationAvailability: mocks.availability,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    user: {
      id: "123e4567-e89b-42d3-a456-426614174000",
      email: "buyer@example.test",
    },
  });
  mocks.availability.mockReturnValue({
    mode: "paused",
    enabled: false,
    reason: "settlement_upgrade_quiesce",
  });
});

describe("POST market trade pay quiesce", () => {
  it("fails before reading the trade or calling Stripe while paused", async () => {
    const response = await POST(
      new Request("https://cambridgetcg.com/api/market/trades/123/pay", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "123" }) },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      code: "market_payment_creation_paused",
    });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });

  it("still authenticates before revealing the operational pause", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const response = await POST(
      new Request("https://cambridgetcg.com/api/market/trades/123/pay", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "123" }) },
    );
    expect(response.status).toBe(401);
    expect(mocks.availability).not.toHaveBeenCalled();
  });
});
