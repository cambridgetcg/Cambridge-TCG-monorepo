import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const testDoubles = vi.hoisted(() => {
  class StoreError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(code: string, status: number) {
      super(code);
      this.code = code;
      this.status = status;
    }
  }
  return {
    StoreError,
    mocks: {
      auth: vi.fn(),
      getInterest: vi.fn(),
      hasInvitation: vi.fn(),
      readConfig: vi.fn(),
      getClient: vi.fn(),
      priceProblems: vi.fn(),
      accountProblems: vi.fn(),
      reserve: vi.fn(),
      attach: vi.fn(),
      retrieveAccount: vi.fn(),
      retrievePrice: vi.fn(),
      createCheckout: vi.fn(),
    },
  };
});
const { mocks, StoreError: MockStoreError } = testDoubles;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: testDoubles.mocks.auth }));
vi.mock("@/lib/prism-signals/beta-interest.server", () => ({
  getPrismSignalsBetaInterest: testDoubles.mocks.getInterest,
}));
vi.mock("@/lib/prism-signals/stripe/invitation.server", () => ({
  hasActivePrismStripeSandboxInvitation: testDoubles.mocks.hasInvitation,
}));
vi.mock("@/lib/prism-signals/stripe", () => ({
  PRISM_STRIPE_CHECKOUT_METADATA_TYPE: "prism_signals_all_test_v1",
  PrismStripeStoreError: testDoubles.StoreError,
  readPrismStripeSandboxConfig: testDoubles.mocks.readConfig,
  getPrismStripeTestClient: testDoubles.mocks.getClient,
  prismStripeAccountProblems: testDoubles.mocks.accountProblems,
  prismStripePriceProblems: testDoubles.mocks.priceProblems,
  reservePrismStripeCheckoutAttempt: testDoubles.mocks.reserve,
  attachPrismStripeCheckoutSession: testDoubles.mocks.attach,
}));

const config = {
  environment: "test",
  accountId: "acct_prismtest123",
  priceId: "price_prismtest123",
  currency: "gbp",
  unitAmountMinor: 500,
  checkoutIntakeEnabled: true,
  webhookProcessingEnabled: true,
};
const attemptRef = "pf_checkout_attempt_123456789";
const expiresAt = 1_788_500_000;
const checkoutParams = {
  mode: "subscription",
  payment_method_types: ["card"],
  client_reference_id: attemptRef,
  line_items: [{ price: config.priceId, quantity: 1 }],
  success_url: "https://cambridgetcg.com/prism-signals/checkout/return",
  cancel_url: "https://cambridgetcg.com/prism-signals/account",
  expires_at: expiresAt,
  metadata: {
    type: "prism_signals_all_test_v1",
    attempt_ref: attemptRef,
  },
  subscription_data: {
    metadata: {
      type: "prism_signals_all_test_v1",
      attempt_ref: attemptRef,
    },
  },
};
const attempt = {
  attemptRef,
  idempotencyKey: "prism-checkout-stable-key-123",
  checkoutParams,
};

function request(
  body = "{}",
  options: { origin?: string | null; contentType?: string } = {},
): Request {
  const headers = new Headers({
    "content-type": options.contentType ?? "application/json",
    "sec-fetch-site": "same-origin",
  });
  const origin = options.origin === undefined
    ? "https://cambridgetcg.com"
    : options.origin;
  if (origin !== null) headers.set("origin", origin);
  return new Request(
    "https://cambridgetcg.com/api/prism-signals/stripe/checkout",
    { method: "POST", headers, body },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.auth.mockResolvedValue({ user: { id: "user-a" } });
  mocks.getInterest.mockResolvedValue({ product_id: "prism-signals" });
  mocks.hasInvitation.mockResolvedValue(true);
  mocks.readConfig.mockReturnValue(config);
  mocks.priceProblems.mockReturnValue([]);
  mocks.accountProblems.mockImplementation((account) =>
    account.id === config.accountId ? [] : ["wrong_account"],
  );
  mocks.retrieveAccount.mockResolvedValue({ id: config.accountId });
  mocks.retrievePrice.mockResolvedValue({ id: config.priceId });
  mocks.reserve.mockResolvedValue({ kind: "reserved", attempt });
  mocks.attach.mockResolvedValue(attempt);
  mocks.createCheckout.mockResolvedValue({
    id: "cs_test_prism123",
    livemode: false,
    mode: "subscription",
    status: "open",
    payment_status: "unpaid",
    payment_method_types: ["card"],
    client_reference_id: attemptRef,
    metadata: checkoutParams.metadata,
    currency: "gbp",
    amount_total: 500,
    expires_at: expiresAt,
    url: "https://checkout.stripe.com/c/pay/test_prism123",
  });
  mocks.getClient.mockReturnValue({
    accounts: { retrieve: mocks.retrieveAccount },
    prices: { retrieve: mocks.retrievePrice },
    checkout: { sessions: { create: mocks.createCheckout } },
  });
});

describe("PRISM Signals Stripe sandbox Checkout", () => {
  it("rejects cross-origin and caller-selected plans before auth", async () => {
    for (const [input, expectedStatus] of [
      [request("{}", { origin: "https://evil.example" }), 403],
      [request('{"plan":"all"}'), 400],
    ] as const) {
      const response = await POST(input);
      expect(response.status).toBe(expectedStatus);
    }
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("requires auth before configuration, eligibility, or Stripe", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.readConfig).not.toHaveBeenCalled();
    expect(mocks.getInterest).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("pauses only new Checkout intake before eligibility or Stripe", async () => {
    mocks.readConfig.mockReturnValue({
      ...config,
      checkoutIntakeEnabled: false,
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("checkout_paused");
    expect(mocks.getInterest).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("requires an active beta-interest owner before provider calls", async () => {
    mocks.getInterest.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("beta_interest_required");
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.hasInvitation).not.toHaveBeenCalled();
  });

  it("requires a distinct active invitation before any Stripe or reservation call", async () => {
    mocks.hasInvitation.mockResolvedValueOnce(false);
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "sandbox_invitation_required",
        message:
          "An active PRISM Signals Stripe sandbox invitation is required.",
      },
    });
    expect(mocks.hasInvitation).toHaveBeenCalledWith({
      userId: "user-a",
      evaluatedAt: expect.stringMatching(/Z$/),
    });
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.retrieveAccount).not.toHaveBeenCalled();
    expect(mocks.retrievePrice).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.createCheckout).not.toHaveBeenCalled();
    expect(mocks.attach).not.toHaveBeenCalled();
  });

  it("fails closed before Stripe when invitation storage is unavailable", async () => {
    mocks.hasInvitation.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("checkout_unavailable");
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it.each([
    ["account", () => mocks.retrieveAccount.mockResolvedValueOnce({ id: "acct_wrong123" })],
    ["Price", () => mocks.priceProblems.mockReturnValueOnce(["wrong_amount"])],
  ] as const)("remotely rejects a drifting %s before reservation", async (_label, arrange) => {
    arrange();
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "price_configuration_mismatch",
    );
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("reserves first, creates an exact hosted subscription, then attaches it", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.retrievePrice).toHaveBeenCalledWith(config.priceId);
    expect(mocks.reserve).toHaveBeenCalledWith({
      userId: "user-a",
      origin: "https://cambridgetcg.com",
      occurredAt: expect.stringMatching(/Z$/),
      config,
    });
    expect(mocks.hasInvitation.mock.calls[0]?.[0]?.evaluatedAt).toBe(
      mocks.reserve.mock.calls[0]?.[0]?.occurredAt,
    );
    expect(mocks.getInterest.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.hasInvitation.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.hasInvitation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.retrieveAccount.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.createCheckout).toHaveBeenCalledWith(checkoutParams, {
      idempotencyKey: attempt.idempotencyKey,
    });
    expect(mocks.attach).toHaveBeenCalledWith({
      config,
      attemptRef,
      sessionId: "cs_test_prism123",
      expiresAtEpochSeconds: expiresAt,
    });
    expect(await response.json()).toEqual({
      schema: "cambridgetcg.prism-stripe-redirect/1",
      kind: "checkout",
      url: "https://checkout.stripe.com/c/pay/test_prism123",
    });

    const sent = JSON.stringify(mocks.createCheckout.mock.calls[0]);
    expect(sent).not.toContain("user-a");
    expect(sent).not.toMatch(/email|entitlement|subject|offer_id/);
  });

  it("reuses the stable attempt and Stripe idempotency key on retry", async () => {
    mocks.reserve.mockResolvedValueOnce({ kind: "reused", attempt });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.createCheckout).toHaveBeenCalledWith(checkoutParams, {
      idempotencyKey: attempt.idempotencyKey,
    });
  });

  it("rejects DAL metadata drift before creating a provider session", async () => {
    mocks.reserve.mockResolvedValueOnce({
      kind: "reserved",
      attempt: {
        ...attempt,
        checkoutParams: {
          ...checkoutParams,
          metadata: { ...checkoutParams.metadata, user_id: "user-a" },
        },
      },
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "checkout_contract_mismatch",
    );
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("rejects a delayed or dashboard-selected payment method", async () => {
    mocks.reserve.mockResolvedValueOnce({
      kind: "reserved",
      attempt: {
        ...attempt,
        checkoutParams: {
          ...checkoutParams,
          payment_method_types: ["card", "bacs_debit"],
        },
      },
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "checkout_contract_mismatch",
    );
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it.each([
    ["live mode", { livemode: true }],
    ["wrong client reference", { client_reference_id: "pf_wrong_reference" }],
    ["wrong amount", { amount_total: 999 }],
    ["non-Stripe redirect", { url: "https://evil.example/pay" }],
  ] as const)("does not attach a returned session with %s", async (_label, drift) => {
    mocks.createCheckout.mockResolvedValueOnce({
      id: "cs_test_prism123",
      livemode: false,
      mode: "subscription",
      status: "open",
      payment_status: "unpaid",
      payment_method_types: ["card"],
      client_reference_id: attemptRef,
      metadata: checkoutParams.metadata,
      currency: "gbp",
      amount_total: 500,
      expires_at: expiresAt,
      url: "https://checkout.stripe.com/c/pay/test_prism123",
      ...drift,
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "checkout_session_mismatch",
    );
    expect(mocks.attach).not.toHaveBeenCalled();
  });

  it("returns 5xx without a redirect when attachment storage fails", async () => {
    mocks.attach.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error.code).toBe("checkout_unavailable");
    expect(JSON.stringify(body)).not.toContain("database unavailable");
  });

  it.each([
    ["not_eligible", 403, "beta_interest_required"],
    ["already_active", 409, "already_subscribed"],
    ["checkout_conflict", 409, "checkout_requires_review"],
  ] as const)("maps the safe store conflict %s", async (code, status, publicCode) => {
    mocks.reserve.mockRejectedValueOnce(new MockStoreError(code, status));
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(publicCode);
  });
});
