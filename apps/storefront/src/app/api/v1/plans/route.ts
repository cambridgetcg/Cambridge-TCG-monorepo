import { DATA_API_PLANS, DATA_API_PLANS_VERSION, DATA_API_PLAN_IDS } from "@/lib/data-api/plans";
import { dataApiPlansPublished, dataApiSaleStatus } from "@/lib/data-api/posture";
import { DATA_API_RIGHTS, dataApiError } from "@/lib/data-api/http";
import { envelope } from "@/lib/data-pantry/envelope";
import { memberMethodNotAllowed } from "@/lib/prices/member-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The data-API plan catalogue. Its prices are proposals that Yu sets, so
 * nothing about plans is served until the catalogue is published
 * (DATA_API_PLANS_PUBLISHED=on). on_sale says whether a member can buy, and
 * none can: test-mode checkout admits operators only, and there is no live
 * intake yet, so it is false and sale_status says which closed state holds.
 * Posture is read on every request, so responses are never stored. */
export async function GET(): Promise<Response> {
  if (!dataApiPlansPublished()) {
    return dataApiError("Data-API plans are not published.", 404, "NOT_PUBLISHED", { "Cache-Control": "no-store" });
  }
  const body = envelope({
    data: {
      catalogue_version: DATA_API_PLANS_VERSION,
      on_sale: false,
      sale_status: dataApiSaleStatus(),
      plans: DATA_API_PLAN_IDS.map(id => {
        const plan = DATA_API_PLANS[id];
        return {
          id: plan.id, name: plan.name,
          price: { amount_pence: plan.price.amountPence, currency: plan.price.currency, interval: plan.price.interval, vat: plan.price.vat, proposed: plan.price.proposed },
          requests_per_minute_per_key: plan.requestsPerMinutePerKey, requests_per_month_per_account: plan.requestsPerMonthPerAccount,
          history_days: plan.historyDays, max_active_keys: plan.maxActiveKeys, features: plan.features, permitted_use: plan.permittedUse,
        };
      }),
      data_rights: DATA_API_RIGHTS,
    },
    endpoint: "/api/v1/plans",
    sources: ["cambridgetcg.data_api_plans"],
    license: "NOASSERTION", freshness: 0,
  });
  return Response.json(body, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
export const POST = memberMethodNotAllowed;
export const DELETE = memberMethodNotAllowed;
export const PUT = memberMethodNotAllowed;
export const PATCH = memberMethodNotAllowed;
export const HEAD = memberMethodNotAllowed;
export const OPTIONS = memberMethodNotAllowed;
