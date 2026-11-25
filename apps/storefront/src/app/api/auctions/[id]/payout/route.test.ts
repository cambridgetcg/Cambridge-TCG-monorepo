import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isAdmin: vi.fn(), recordAuctionPayout: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/auction/db", () => ({ recordAuctionPayout: mocks.recordAuctionPayout }));

import { AUCTION_BUYER_NOT_PAID_ERROR } from "@/lib/payouts/owed";
import { POST } from "./route";

const call = (body: unknown) => POST(
  new Request("https://example.test/api/auctions/a1/payout", { method: "POST", body: JSON.stringify(body) }),
  { params: Promise.resolve({ id: "a1" }) },
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isAdmin.mockResolvedValue(true);
});

describe("POST /api/auctions/[id]/payout", () => {
  it("answers a refusal with its reason", async () => {
    mocks.recordAuctionPayout.mockResolvedValue({ ok: false, error: AUCTION_BUYER_NOT_PAID_ERROR });
    const res = await call({ method: "stripe_connect" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: AUCTION_BUYER_NOT_PAID_ERROR });
  });
  it("records only by a known method", async () => {
    expect((await call({ method: "cash" })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect(mocks.recordAuctionPayout).not.toHaveBeenCalled();
  });
  it("answers nobody but an admin", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    expect((await call({ method: "stripe_connect" })).status).toBe(401);
    expect(mocks.recordAuctionPayout).not.toHaveBeenCalled();
  });
});
