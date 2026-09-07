import { resolveMemberBearer } from "@/lib/datafeed/member-keys";
import { MemberPriceQueryError, parseMemberPriceQuery, readMemberPrices } from "@/lib/prices/member-feed";
import { memberError, memberJson, memberMethodNotAllowed } from "@/lib/prices/member-http";
import { memberPageHeaders } from "@/lib/prices/member-export";
import { envelope } from "@/lib/data-pantry/envelope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    // Authenticate before URL parsing or any source read; cookies never substitute for a key.
    const auth = await resolveMemberBearer(request.headers.get("authorization"));
    if (!auth.ok) return memberError(auth.status === 429 ? "Thirty requests per minute per key. Retry after the reset." : "A valid member price-read key is required.", auth.status,
      auth.status === 429 ? { "Retry-After": String(auth.resetSeconds) } : { "WWW-Authenticate": 'Bearer realm="member-prices"' });
    const query = parseMemberPriceQuery(new URL(request.url).searchParams);
    const page = await readMemberPrices(auth.actor, query, "member-api");
    const headers = memberPageHeaders(page);
    headers.set("X-RateLimit-Limit", "30");
    headers.set("X-RateLimit-Remaining", String(auth.remaining));
    headers.set("X-RateLimit-Reset-After", String(auth.resetSeconds));
    const nextParams = new URL(request.url).searchParams;
    if (page.nextCursor) nextParams.set("cursor", page.nextCursor);
    return memberJson(envelope({
      data: page, endpoint: "/api/v1/member-prices",
      sources: [...new Set(page.items.map(item => item.source))],
      license: "NOASSERTION", freshness: 86400,
      as_of: page.asOf ?? undefined,
      next_link: page.nextCursor ? `/api/v1/member-prices?${nextParams}` : null,
      extra_meta: { as_of_meaning: "Pagination snapshot opening time; source timestamps are per observation.",
        price_rights: "Source-specific evidence and permittedUses accompany every observation." },
    }), page.status === "unavailable" ? 503 : 200, headers);
  } catch (error) {
    if (error instanceof MemberPriceQueryError) return memberError(error.message, 400);
    return memberError("Member prices are unavailable.", 503);
  }
}
export const POST = memberMethodNotAllowed;
export const DELETE = memberMethodNotAllowed;
export const PUT = memberMethodNotAllowed;
export const PATCH = memberMethodNotAllowed;
export const HEAD = memberMethodNotAllowed;
export const OPTIONS = memberMethodNotAllowed;
