import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  getStripe: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.getStripe }));

const USER_ID = "123e4567-e89b-42d3-a456-426614174099";

function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("vary")).toBe("Cookie");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
  mocks.query.mockResolvedValue({
    rows: [
      {
        subscription_status: "cancelled",
        subscription_stripe_id: "sub_legacy",
        subscription_cancel_at_period_end: false,
        subscription_expires_at: "2026-07-21T00:00:00.000Z",
        subscription_plan: "monthly",
        subscription_payment_brand: "visa",
        subscription_payment_last4: "4242",
        stripe_customer_id: null,
        paid_tier_id: null,
        tier_id: null,
      },
    ],
  });
});

describe("legacy membership billing privacy", () => {
  it("marks authentication failures private and non-cacheable", async () => {
    mocks.auth.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expectPrivate(response);
    expect(await response.json()).toEqual({ error: "Sign in required." });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns only the signed-in account's brand and last four mirror", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(body.subscription).toMatchObject({
      status: "cancelled",
      plan: "monthly",
      paymentBrand: "visa",
      paymentLast4: "4242",
      hasCustomer: false,
    });
    expect(body).not.toHaveProperty("stripe_customer_id");
    expect(JSON.stringify(body)).not.toMatch(
      /subscription_stripe_id|payment_method|card_number|pan/i,
    );
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM users WHERE id = $1"),
      [USER_ID],
    );
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });
});
