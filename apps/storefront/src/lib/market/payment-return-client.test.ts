import { afterEach, describe, expect, it, vi } from "vitest";
import { readMarketTradePaymentStatus } from "./payment-return-client";

afterEach(() => {
  vi.useRealTimers();
});

describe("readMarketTradePaymentStatus", () => {
  it("reads only the narrow participant payment endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      trade: {
        escrow_status: "awaiting_payment",
        payment_expires_at: "2099-01-01T00:00:00.000Z",
        admin_notes: "must not be consumed",
      },
    }));

    await expect(readMarketTradePaymentStatus("trade/one", { fetcher })).resolves.toEqual({
      escrow_status: "awaiting_payment",
      payment_expires_at: "2099-01-01T00:00:00.000Z",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/market/trades/trade%2Fone/payment-status",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it("times out a hung read so the UI can offer a manual retry", async () => {
    vi.useFakeTimers();
    const pending = readMarketTradePaymentStatus("trade-1", {
      fetcher: vi.fn(() => new Promise<Response>(() => {})),
      timeoutMs: 250,
    });
    const rejection = expect(pending).rejects.toThrow("timed out");

    await vi.advanceTimersByTimeAsync(250);
    await rejection;
  });
});
