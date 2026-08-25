import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  makeOffer: vi.fn(),
  listOffersForBuyer: vi.fn(),
  listOffersForSeller: vi.fn(),
  resolveCommissionRate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/market/offers", () => ({
  makeOffer: mocks.makeOffer,
  listOffersForBuyer: mocks.listOffersForBuyer,
  listOffersForSeller: mocks.listOffersForSeller,
}));
vi.mock("@/lib/membership/commission", () => ({
  resolveCommissionRate: mocks.resolveCommissionRate,
}));

import { POST } from "./route";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("offer production release boundary", () => {
  it("returns a no-store 503 before the DAL when production is not reviewed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("P2P_COMMITMENT_MODE", "");
    const request = new Request("https://cambridgetcg.com/api/market/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ askOrderId: "ask-1", offerPrice: 12 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      code: "P2P_COMMITMENT_PAUSED",
    });
    expect(mocks.makeOffer).not.toHaveBeenCalled();
  });

  it("reaches the DAL only for the exact reviewed production mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "P2P_COMMITMENT_MODE",
      "reviewed-adult-human-review-v1",
    );
    mocks.makeOffer.mockResolvedValue({
      ok: true,
      value: { id: "offer-1" },
    });
    const request = new Request("https://cambridgetcg.com/api/market/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ askOrderId: "ask-1", offerPrice: 12 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mocks.makeOffer).toHaveBeenCalledWith({
      buyerId: "user-1",
      askOrderId: "ask-1",
      offerPrice: 12,
      quantity: undefined,
      message: undefined,
    });
  });
});
