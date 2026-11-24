import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isAdmin: vi.fn(), recordTradePayout: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/market/db", () => ({ recordTradePayout: mocks.recordTradePayout }));

import { TRADE_BUYER_NOT_PAID_ERROR } from "@/lib/payouts/owed";
import { POST } from "./route";

const call = (body: unknown) => POST(
  new Request("https://example.test/api/market/trades/t1/payout", { method: "POST", body: JSON.stringify(body) }),
  { params: Promise.resolve({ id: "t1" }) },
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isAdmin.mockResolvedValue(true);
});

describe("POST /api/market/trades/[id]/payout", () => {
  it("answers a refusal with its reason", async () => {
    mocks.recordTradePayout.mockResolvedValue({ ok: false, error: TRADE_BUYER_NOT_PAID_ERROR });
    const res = await call({ method: "stripe_connect" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: TRADE_BUYER_NOT_PAID_ERROR });
  });
  it("answers nobody but an admin", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    expect((await call({ method: "stripe_connect" })).status).toBe(401);
    expect(mocks.recordTradePayout).not.toHaveBeenCalled();
  });
});
