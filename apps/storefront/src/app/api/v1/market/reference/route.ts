import { authenticateDataApi, derivedPageResponse, featureDenied, queryFailure } from "@/lib/data-api/http";
import { DATA_API_ENDPOINTS, parseReferenceQuery, readReferencePrices } from "@/lib/data-api/reads";
import { memberMethodNotAllowed } from "@/lib/prices/member-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const authenticated = await authenticateDataApi(request);
  if (!authenticated.ok) return authenticated.response;
  const { auth } = authenticated;
  const denied = featureDenied(auth, "reference-prices");
  if (denied) return denied;
  try {
    const query = parseReferenceQuery(new URL(request.url).searchParams);
    const page = await readReferencePrices(auth.actor, auth.entitlement, query);
    return derivedPageResponse(request, DATA_API_ENDPOINTS.reference, page, auth, item => item.sources);
  } catch (error) {
    return queryFailure(error, auth, "Reference prices are unavailable.");
  }
}
export const POST = memberMethodNotAllowed;
export const DELETE = memberMethodNotAllowed;
export const PUT = memberMethodNotAllowed;
export const PATCH = memberMethodNotAllowed;
export const HEAD = memberMethodNotAllowed;
export const OPTIONS = memberMethodNotAllowed;
