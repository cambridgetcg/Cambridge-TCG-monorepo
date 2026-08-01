export interface MarketCheckoutStart {
  ok: true;
  url: string;
}

export interface MarketCheckoutStartFailure {
  ok: false;
  message: string;
  code?: string;
  status?: number;
}

export type MarketCheckoutStartResult = MarketCheckoutStart | MarketCheckoutStartFailure;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const OUTCOME_UNKNOWN =
  "Checkout start could not be confirmed. The request may have reached the payment provider. Do not try again yet; refresh this trade and check its status, then contact support with the trade reference if it is still unclear.";

/**
 * One client contract for every market Pay button. It never infers payment
 * from a redirect or a malformed response and always gives the buyer an
 * actionable error instead of letting a click disappear silently.
 */
export async function requestMarketTradeCheckout(
  tradeId: string,
  fetcher: FetchLike = fetch,
): Promise<MarketCheckoutStartResult> {
  let response: Response;
  try {
    response = await fetcher(`/api/market/trades/${encodeURIComponent(tradeId)}/pay`, {
      method: "POST",
    });
  } catch {
    return { ok: false, message: OUTCOME_UNKNOWN, code: "checkout_outcome_unknown" };
  }

  const body = await response.json().catch(() => null) as {
    url?: unknown;
    error?: unknown;
    code?: unknown;
  } | null;

  if (!response.ok) {
    return {
      ok: false,
      message: typeof body?.error === "string" && body.error.trim()
        ? body.error
        : `${OUTCOME_UNKNOWN} (HTTP ${response.status}.)`,
      code: typeof body?.code === "string" ? body.code : undefined,
      status: response.status,
    };
  }

  if (typeof body?.url !== "string" || !/^https?:\/\//.test(body.url)) {
    return {
      ok: false,
      message: OUTCOME_UNKNOWN,
      code: "checkout_outcome_unknown",
      status: response.status,
    };
  }

  return { ok: true, url: body.url };
}
