import "server-only";
import { DERIVED_MARKET_METHOD_VERSION } from "@cambridge-tcg/data-spec";
import { envelope } from "@/lib/data-pantry/envelope";
import { memberJson } from "@/lib/prices/member-http";
import { resolveDataApiBearer, type DataApiBearerResult } from "./bearer";
import type { DataApiFeature } from "./plans";
import { dataApiReadsPublished } from "./posture";
import { DataApiQueryError, type DerivedPage } from "./reads";

/** Carried in every data-API _meta and export manifest (decision of 2026-10-28). */
export const DATA_API_RIGHTS = "Cambridge-derived market data (ctcg.market-derived/v1). Not CC0 and not licensed for AI training. Offered under Cambridge data-API terms, which are pending.";
export const DATA_API_DOES_NOT_INCLUDE = [
  "A provider's own price, a per-source value, a per-source breakdown of a card or a numeric spread.",
  "Rows from a source whose derivation is revoked, or dated before your plan's history window.",
] as const;

export type DataApiErrorCode =
  | "INVALID_INPUT" | "UNAUTHORIZED" | "INSUFFICIENT_TIER" | "RATE_LIMITED" | "NOT_PROVISIONED" | "SOURCE_UNAVAILABLE" | "NOT_PUBLISHED";
type Authorized = Extract<DataApiBearerResult, { ok: true }>;

/** Private, no-store, no CORS (member-http), with a stable code beside the message. */
export function dataApiError(message: string, status: number, code: DataApiErrorCode, extra?: HeadersInit, details?: Record<string, unknown>): Response {
  return memberJson({ error: message, code, ...details }, status, extra);
}

export function rateLimitHeaders(auth: Pick<Authorized, "minute" | "month">, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("X-RateLimit-Limit", String(auth.minute.limit));
  headers.set("X-RateLimit-Remaining", String(auth.minute.remaining));
  headers.set("X-RateLimit-Reset-After", String(auth.minute.resetSeconds));
  headers.set("X-RateLimit-Month-Limit", String(auth.month.limit));
  headers.set("X-RateLimit-Month-Remaining", String(auth.month.remaining));
  headers.set("X-RateLimit-Month-Reset-After", String(auth.month.resetSeconds));
  return headers;
}

/** Publication first, then authentication, before any URL parsing or data
 * read; cookies never substitute for a key. While DATA_API_READS is off the
 * key is not looked up, so nothing is counted against its minute or month. */
export async function authenticateDataApi(request: Request): Promise<{ ok: true; auth: Authorized } | { ok: false; response: Response }> {
  if (!dataApiReadsPublished()) return { ok: false, response: dataApiError("The data API is not published.", 404, "NOT_PUBLISHED") };
  let auth: DataApiBearerResult;
  try { auth = await resolveDataApiBearer(request.headers.get("authorization")); }
  catch { return { ok: false, response: dataApiError("The data API is unavailable.", 503, "SOURCE_UNAVAILABLE") }; }
  if (auth.ok) return { ok: true, auth };
  if (auth.status === 401) {
    return { ok: false, response: dataApiError("A valid member price-read key is required.", 401, "UNAUTHORIZED", { "WWW-Authenticate": 'Bearer realm="data-api"' }) };
  }
  if (auth.status === 429) {
    const message = auth.window === "minute"
      ? `${auth.limit} requests per minute per key on your plan. Retry after the reset.`
      : `${auth.limit} requests per month on your plan. The count resets at the start of next month (UTC).`;
    return { ok: false, response: dataApiError(message, 429, "RATE_LIMITED", rateLimitHeaders(auth, { "Retry-After": String(auth.resetSeconds) }),
      { window: auth.window, limit: auth.limit, resetSeconds: auth.resetSeconds }) };
  }
  return { ok: false, response: auth.code === "NOT_PROVISIONED"
    ? dataApiError("The data API is not provisioned yet.", 503, "NOT_PROVISIONED")
    : dataApiError("The data API is unavailable.", 503, "SOURCE_UNAVAILABLE") };
}

export function featureDenied(auth: Authorized, feature: DataApiFeature): Response | null {
  return auth.entitlement.features.includes(feature) ? null
    : dataApiError("Your plan does not include this data.", 403, "INSUFFICIENT_TIER", rateLimitHeaders(auth), { feature });
}

export function queryFailure(error: unknown, auth: Authorized, unavailable: string): Response {
  if (error instanceof DataApiQueryError) return dataApiError(error.message, error.status, error.code, rateLimitHeaders(auth));
  return dataApiError(unavailable, 503, "SOURCE_UNAVAILABLE", rateLimitHeaders(auth));
}

/** Not-provisioned and unavailable reads are errors, never an empty success. */
export function derivedPageResponse<T>(request: Request, endpoint: string, page: DerivedPage<T>, auth: Authorized, sourcesOf: (item: T) => readonly string[]): Response {
  const headers = rateLimitHeaders(auth);
  if (page.status === "not-provisioned") return dataApiError("Derived market data is not provisioned yet.", 503, "NOT_PROVISIONED", headers);
  if (page.status === "unavailable") return dataApiError("Derived market data is unavailable.", 503, "SOURCE_UNAVAILABLE", headers);
  const next = new URL(request.url).searchParams;
  if (page.nextCursor) next.set("cursor", page.nextCursor);
  return memberJson(envelope({
    data: page, endpoint,
    // Sources are named, never valued.
    sources: [...new Set(page.items.flatMap(sourcesOf))].sort(),
    license: "NOASSERTION", freshness: 86400,
    as_of: page.asOf ?? undefined,
    next_link: page.nextCursor ? `${endpoint}?${next}` : null,
    extra_meta: {
      as_of_meaning: "Pagination snapshot opening time; each row carries its own asOf date.",
      derived_market_contract: DERIVED_MARKET_METHOD_VERSION,
      data_rights: DATA_API_RIGHTS,
      plan: auth.entitlement.planId,
    },
    does_not_include: DATA_API_DOES_NOT_INCLUDE,
  }), 200, headers);
}
