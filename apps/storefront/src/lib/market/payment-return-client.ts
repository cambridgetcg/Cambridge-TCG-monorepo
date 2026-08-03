import type { PaymentReturnTradeSnapshot } from "./payment-return";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PaymentReturnReadOptions {
  fetcher?: FetchLike;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_STATUS_TIMEOUT_MS = 5_000;

/**
 * Read the deliberately narrow participant payment projection. The explicit
 * deadline prevents a half-open connection from leaving the return surface in
 * a permanent "checking" state.
 */
export async function readMarketTradePaymentStatus(
  tradeId: string,
  options: PaymentReturnReadOptions = {},
): Promise<PaymentReturnTradeSnapshot> {
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_STATUS_TIMEOUT_MS;
  const externalSignal = options.signal;
  let removeExternalAbort: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutOrAbort = new Promise<never>((_, reject) => {
    const fail = (message: string) => {
      controller.abort();
      reject(new Error(message));
    };
    timeout = setTimeout(() => fail("trade payment status timed out"), timeoutMs);
    if (externalSignal) {
      const onAbort = () => fail("trade payment status read aborted");
      if (externalSignal.aborted) onAbort();
      else {
        externalSignal.addEventListener("abort", onAbort, { once: true });
        removeExternalAbort = () => externalSignal.removeEventListener("abort", onAbort);
      }
    }
  });

  try {
    const response = await Promise.race([
      fetcher(`/api/market/trades/${encodeURIComponent(tradeId)}/payment-status`, {
        cache: "no-store",
        signal: controller.signal,
      }),
      timeoutOrAbort,
    ]);
    if (!response.ok) throw new Error(`trade payment status HTTP ${response.status}`);
    const body = await response.json() as {
      trade?: { escrow_status?: unknown; payment_expires_at?: unknown };
    };
    if (!body.trade || typeof body.trade.escrow_status !== "string") {
      throw new Error("trade payment status response is incomplete");
    }
    return {
      escrow_status: body.trade.escrow_status,
      payment_expires_at: typeof body.trade.payment_expires_at === "string"
        ? body.trade.payment_expires_at
        : null,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
    removeExternalAbort?.();
  }
}
