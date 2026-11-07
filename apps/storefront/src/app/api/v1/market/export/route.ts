import { DATA_API_RIGHTS, authenticateDataApi, dataApiError, featureDenied, queryFailure, rateLimitHeaders } from "@/lib/data-api/http";
import { parseExportQuery, readDerivedExport, serializeDerivedExport } from "@/lib/data-api/reads";
import { memberHeaders, memberMethodNotAllowed } from "@/lib/prices/member-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One bounded NDJSON page of a day's derived rows: manifest, rows, footer. */
export async function GET(request: Request): Promise<Response> {
  const authenticated = await authenticateDataApi(request);
  if (!authenticated.ok) return authenticated.response;
  const { auth } = authenticated;
  const denied = featureDenied(auth, "daily-export");
  if (denied) return denied;
  try {
    const query = parseExportQuery(new URL(request.url).searchParams);
    const page = await readDerivedExport(auth.actor, auth.entitlement, query);
    const headers = rateLimitHeaders(auth);
    // Not-provisioned and unavailable are errors, never a completed download.
    if (page.status === "not-provisioned") return dataApiError("Derived market data is not provisioned yet.", 503, "NOT_PROVISIONED", headers);
    if (page.status === "unavailable") return dataApiError("The derived export is unavailable.", 503, "SOURCE_UNAVAILABLE", headers);
    headers.set("Content-Type", "application/x-ndjson; charset=utf-8");
    headers.set("Content-Disposition", `attachment; filename="market-derived-${query.date}.ndjson"`);
    headers.set("X-Data-Count", String(page.count));
    headers.set("X-Data-Total", String(page.total));
    headers.set("X-Data-Complete", String(page.complete));
    if (page.nextCursor) headers.set("X-Next-Cursor", page.nextCursor);
    return new Response(serializeDerivedExport(page, DATA_API_RIGHTS), { headers: memberHeaders(headers) });
  } catch (error) {
    return queryFailure(error, auth, "The derived export is unavailable.");
  }
}
export const POST = memberMethodNotAllowed;
export const DELETE = memberMethodNotAllowed;
export const PUT = memberMethodNotAllowed;
export const PATCH = memberMethodNotAllowed;
export const HEAD = memberMethodNotAllowed;
export const OPTIONS = memberMethodNotAllowed;
