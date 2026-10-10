import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS } from "./route";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  derive: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prism-signals/stripe/config.server", () => ({
  readPrismStripeSandboxConfig: mocks.config,
}));
vi.mock("@/lib/prism-signals/stripe/refs.server", () => ({
  derivePrismStripePriceRef: mocks.derive,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.config.mockReturnValue({
    referenceSecret: "secret-never-public",
    priceId: "price_never_public",
  });
  mocks.derive.mockReturnValue("pf_public_price_ref_01");
});

describe("PRISM Signals All test offer endpoint", () => {
  it("publishes only the strict sandbox offer and mapped price reference", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(mocks.derive).toHaveBeenCalledWith(
      "secret-never-public",
      "price_never_public",
    );
    expect(body).toMatchObject({
      id: "prism-signals-all",
      version: 1,
      status: "test",
      environment: "test",
      rights: {
        purpose: "synthetic_fixture_delivery",
        decision: "granted",
      },
      delivery: {
        web: { availability: "test", url: "/prism-signals/account" },
        telegram: { availability: "off" },
      },
    });
    expect(body.rails[0]).toEqual({
      rail: "stripe_web",
      channel: "web",
      availability: "test",
      price_ref: "pf_public_price_ref_01",
    });
    expect(body.rails.slice(1).every((rail: { availability: string }) => rail.availability === "off")).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(
      /secret-never-public|price_never_public|sk_test_|whsec_/,
    );
  });

  it("fails visibly and without configuration detail", async () => {
    mocks.config.mockImplementationOnce(() => {
      throw new Error("sk_test_private_detail");
    });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "offer_unavailable",
        message: "The PRISM Signals All sandbox offer is not available.",
      },
    });
  });

  it("answers CORS preflight for read-only discovery", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, OPTIONS",
    );
  });
});
