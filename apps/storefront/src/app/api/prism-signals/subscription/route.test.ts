import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  publicPosture: vi.fn(),
  expectedPriceRef: vi.fn(),
  readStatus: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prism-signals/stripe", () => ({
  prismStripeSandboxPublicPosture: mocks.publicPosture,
  prismStripeSandboxExpectedPriceRef: mocks.expectedPriceRef,
  readPrismStripeOwnerStatus: mocks.readStatus,
}));

const posture = {
  configured: true,
  processing_available: true,
  checkout_available: true,
  portal_available: true,
  reason: "available",
};
const allStatus = {
  schema: "cambridgetcg.prism-subscription-status/1",
  sandbox: true,
  plan: "all",
  access: {
    allowed: true,
    reason: "active_paid_period",
    active_until: "2026-10-03T00:00:00.000Z",
  },
  subscription: {
    status: "active",
    cancel_at_period_end: false,
    current_period_end: "2026-10-03T00:00:00.000Z",
    reconciliation: null,
  },
  checkout: { available: false, reason: "already_subscribed" },
  portal: { available: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.auth.mockResolvedValue({ user: { id: "user-a" } });
  mocks.publicPosture.mockReturnValue(posture);
  mocks.expectedPriceRef.mockReturnValue("pf_expected_price_123456789");
  mocks.readStatus.mockResolvedValue(allStatus);
});

describe("PRISM Signals owner subscription API", () => {
  it("requires authenticated owner authority before config or storage", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.publicPosture).not.toHaveBeenCalled();
    expect(mocks.readStatus).not.toHaveBeenCalled();
  });

  it("returns only the safe owner DTO with private no-store headers", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.json()).toEqual(allStatus);
    expect(mocks.readStatus).toHaveBeenCalledWith({
      userId: "user-a",
      evaluatedAt: expect.stringMatching(/Z$/),
      posture,
      expectedPriceRef: "pf_expected_price_123456789",
    });
    expect(JSON.stringify(allStatus)).not.toMatch(
      /user-a|cus_|sub_|price_|prod_|pf_|@/,
    );
  });

  it("keeps stored status inspectable when provider configuration drifts", async () => {
    const unavailablePosture = {
      configured: false,
      processing_available: false,
      checkout_available: false,
      portal_available: false,
      reason: "invalid_configuration",
    };
    mocks.publicPosture.mockReturnValueOnce(unavailablePosture);
    mocks.expectedPriceRef.mockReturnValueOnce(null);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.readStatus).toHaveBeenCalledWith({
      userId: "user-a",
      evaluatedAt: expect.stringMatching(/Z$/),
      posture: unavailablePosture,
      expectedPriceRef: null,
    });
  });

  it("fails visibly when owner storage is unavailable", async () => {
    mocks.readStatus.mockRejectedValueOnce(new Error("private failure detail"));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "subscription_unavailable",
        message: "Your PRISM Signals subscription status is not available right now.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("private failure detail");
  });
});
