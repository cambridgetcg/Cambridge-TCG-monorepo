import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), reserve: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prism-signals/stripe", () => ({
  reservePrismStripeCheckoutAttempt: mocks.reserve,
  getPrismStripeTestClient: mocks.client,
}));
function request(body = "{}", origin = "https://cambridgetcg.com") {
  return new Request("https://cambridgetcg.com/api/prism-signals/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin" },
    body,
  });
}
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "existing-owner" } }); });

describe("retired PRISM checkout", () => {
  it("returns terminal 410 without reserving an attempt or contacting Stripe", async () => {
    const response = await POST(request());
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("retry-after")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NEW_PAID_COMMERCE_RETIRED" } });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("retains authentication before revealing owner paths", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
  });
  it("retains same-origin enforcement before authentication", async () => {
    expect((await POST(request("{}", "https://other.example"))).status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each(["not-json", '{"price":"price_forged"}'])("rejects malformed or expanded body %s", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
