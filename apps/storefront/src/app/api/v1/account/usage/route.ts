import { DATA_API_PLANS } from "@/lib/data-api/plans";
import { authenticateDataApi, rateLimitHeaders } from "@/lib/data-api/http";
import { envelope } from "@/lib/data-pantry/envelope";
import { memberJson, memberMethodNotAllowed } from "@/lib/prices/member-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The key's account: its plan's limits and this month's aggregate count.
 * This request is metered like any other and is included in the count.
 * Like the market reads, it answers 404 NOT_PUBLISHED, uncounted, while
 * DATA_API_READS is off (authenticateDataApi). */
export async function GET(request: Request): Promise<Response> {
  const authenticated = await authenticateDataApi(request);
  if (!authenticated.ok) return authenticated.response;
  const { auth } = authenticated;
  const { entitlement } = auth;
  return memberJson(envelope({
    data: {
      plan: { id: entitlement.planId, name: DATA_API_PLANS[entitlement.planId].name, catalogueVersion: entitlement.catalogueVersion },
      limits: {
        requestsPerMinutePerKey: entitlement.requestsPerMinutePerKey, requestsPerMonthPerAccount: entitlement.requestsPerMonthPerAccount,
        historyDays: entitlement.historyDays, maxActiveKeys: entitlement.maxActiveKeys,
      },
      features: entitlement.features,
      minute: auth.minute,
      month: auth.month,
      metering: "Aggregate counts only: requests per key per minute and per account per calendar month (UTC). No paths, queries, IP addresses or read history.",
    },
    endpoint: "/api/v1/account/usage",
    sources: ["cambridgetcg.data_api_usage"],
    license: "NOASSERTION", freshness: 0,
    extra_meta: { as_of_meaning: "This response's time; counts include this request." },
  }), 200, rateLimitHeaders(auth));
}
export const POST = memberMethodNotAllowed;
export const DELETE = memberMethodNotAllowed;
export const PUT = memberMethodNotAllowed;
export const PATCH = memberMethodNotAllowed;
export const HEAD = memberMethodNotAllowed;
export const OPTIONS = memberMethodNotAllowed;
