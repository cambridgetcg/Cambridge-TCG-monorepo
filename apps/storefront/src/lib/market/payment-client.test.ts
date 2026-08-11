import { describe, expect, it, vi } from "vitest";
import { requestMarketTradeCheckout } from "./payment-client";

describe("requestMarketTradeCheckout", () => {
  it("returns the provider URL for a valid response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ url: "https://checkout.stripe.com/c/pay/cs_test" }),
    );

    await expect(requestMarketTradeCheckout("trade/with spaces", fetcher)).resolves.toEqual({
      ok: true,
      url: "https://checkout.stripe.com/c/pay/cs_test",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/market/trades/trade%2Fwith%20spaces/pay",
      { method: "POST" },
    );
  });

  it("preserves the server's deadline-aware failure", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      error: "Payments are temporarily unavailable. The window still closes at 12:00.",
      code: "payments_unavailable",
    }, { status: 503 }));

    await expect(requestMarketTradeCheckout("trade-1", fetcher)).resolves.toEqual({
      ok: false,
      message: "Payments are temporarily unavailable. The window still closes at 12:00.",
      code: "payments_unavailable",
      status: 503,
    });
  });

  it("treats network and malformed success responses as unknown and blocks an unsafe retry", async () => {
    await expect(requestMarketTradeCheckout(
      "trade-1",
      vi.fn().mockRejectedValue(new Error("offline")),
    )).resolves.toMatchObject({
      ok: false,
      code: "checkout_outcome_unknown",
      message: expect.stringMatching(/may have reached.*Do not try again/i),
    });

    await expect(requestMarketTradeCheckout(
      "trade-1",
      vi.fn().mockResolvedValue(Response.json({ ok: true })),
    )).resolves.toMatchObject({
      ok: false,
      code: "checkout_outcome_unknown",
      message: expect.stringMatching(/may have reached.*Do not try again/i),
    });
  });

  it("uses the same conservative outcome for a bodiless server failure", async () => {
    await expect(requestMarketTradeCheckout(
      "trade-1",
      vi.fn().mockResolvedValue(new Response(null, { status: 502 })),
    )).resolves.toMatchObject({
      ok: false,
      message: expect.stringMatching(/may have reached.*Do not try again/i),
      status: 502,
    });
  });
});
