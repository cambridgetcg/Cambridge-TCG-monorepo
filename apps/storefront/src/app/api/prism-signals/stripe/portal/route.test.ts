import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  readConfig: vi.fn(),
  findBinding: vi.fn(),
  getClient: vi.fn(),
  accountProblems: vi.fn(),
  portalProblems: vi.fn(),
  retrieveAccount: vi.fn(),
  retrieveConfiguration: vi.fn(),
  createPortal: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prism-signals/stripe", () => ({
  readPrismStripeSandboxConfig: mocks.readConfig,
  findPrismStripePortalBinding: mocks.findBinding,
  getPrismStripeTestClient: mocks.getClient,
  prismStripeAccountProblems: mocks.accountProblems,
  prismStripePortalConfigurationProblems: mocks.portalProblems,
}));

const config = {
  environment: "test",
  accountId: "acct_prismtest123",
  portalConfigurationId: "bpc_prismtest123",
};
const binding = {
  customerId: "cus_test_owner_a",
  portalConfigurationId: config.portalConfigurationId,
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
    "https://cambridgetcg.com/api/prism-signals/stripe/portal",
    { method: "POST", headers, body },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.auth.mockResolvedValue({ user: { id: "user-a" } });
  mocks.readConfig.mockReturnValue(config);
  mocks.findBinding.mockResolvedValue(binding);
  mocks.portalProblems.mockReturnValue([]);
  mocks.accountProblems.mockImplementation((account) =>
    account.id === config.accountId ? [] : ["wrong_account"],
  );
  mocks.retrieveAccount.mockResolvedValue({ id: config.accountId });
  mocks.retrieveConfiguration.mockResolvedValue({
    id: config.portalConfigurationId,
  });
  mocks.createPortal.mockResolvedValue({
    id: "bps_test_123",
    livemode: false,
    customer: binding.customerId,
    configuration: config.portalConfigurationId,
    return_url: "https://cambridgetcg.com/prism-signals/account",
    url: "https://billing.stripe.com/p/session/test_123",
  });
  mocks.getClient.mockReturnValue({
    accounts: { retrieve: mocks.retrieveAccount },
    billingPortal: {
      configurations: { retrieve: mocks.retrieveConfiguration },
      sessions: { create: mocks.createPortal },
    },
  });
});

describe("PRISM Signals Stripe sandbox portal", () => {
  it("rejects cross-origin or non-empty input before auth and storage", async () => {
    for (const [req, expectedStatus] of [
      [request("{}", { origin: "https://evil.example" }), 403],
      [request('{"customer":"cus_attack"}'), 400],
    ] as const) {
      const response = await POST(req);
      expect(response.status).toBe(expectedStatus);
    }
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.findBinding).not.toHaveBeenCalled();
  });

  it("requires auth before configuration, lookup, or Stripe", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.readConfig).not.toHaveBeenCalled();
    expect(mocks.findBinding).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("requires a locally owner-bound sandbox customer", async () => {
    mocks.findBinding.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("attests the account and no-switch portal before minting a session", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.retrieveAccount).toHaveBeenCalledOnce();
    expect(mocks.retrieveConfiguration).toHaveBeenCalledWith(
      config.portalConfigurationId,
    );
    expect(mocks.portalProblems).toHaveBeenCalledWith(
      { id: config.portalConfigurationId },
      config,
    );
    expect(mocks.createPortal).toHaveBeenCalledWith({
      customer: binding.customerId,
      configuration: config.portalConfigurationId,
      return_url: "https://cambridgetcg.com/prism-signals/account",
    });
    expect(await response.json()).toEqual({
      schema: "cambridgetcg.prism-stripe-redirect/1",
      kind: "portal",
      url: "https://billing.stripe.com/p/session/test_123",
    });
  });

  it.each([
    ["wrong account", () => mocks.retrieveAccount.mockResolvedValueOnce({ id: "acct_wrong123" })],
    ["drifting portal", () => mocks.portalProblems.mockReturnValueOnce(["plan_switching_enabled"])],
  ] as const)("fails closed for %s", async (_label, arrange) => {
    arrange();
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "portal_configuration_mismatch",
    );
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });

  it("rejects a mismatched or non-Stripe returned portal URL", async () => {
    mocks.createPortal.mockResolvedValueOnce({
      id: "bps_test_123",
      livemode: false,
      customer: binding.customerId,
      configuration: config.portalConfigurationId,
      return_url: "https://cambridgetcg.com/prism-signals/account",
      url: "https://evil.example/session",
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("portal_session_mismatch");
  });

  it("returns only private no-store structured failures on provider/storage errors", async () => {
    mocks.createPortal.mockRejectedValueOnce(new Error("secret provider detail"));
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.error.code).toBe("portal_unavailable");
    expect(JSON.stringify(body)).not.toContain("secret provider detail");
  });
});
