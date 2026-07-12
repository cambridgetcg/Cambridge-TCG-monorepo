/**
 * /api/v1/cards/[sku]/cardrush-history
 *
 * Signed-in access does not create upstream publication permission. Legacy
 * observations remain stored for review; this route never calls wholesale or
 * emits an observation.
 */

import { auth } from "@/lib/auth";
import { errorResponse } from "@/lib/data-pantry";
import {
  CARDRUSH_BLOCK_REASON,
  CARDRUSH_DATA_POLICY_URL,
} from "@cambridge-tcg/data-ingest";

const ENDPOINT = "/api/v1/cards/[sku]/cardrush-history";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return errorResponse({
      code: "UNAUTHORIZED",
      message: "Sign in is required for this account-scoped endpoint.",
      endpoint: ENDPOINT,
    });
  }

  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    status: 503,
    message:
      "CardRush observation publication is withheld pending written source rights.",
    details: {
      source: "cardrush",
      reason: CARDRUSH_BLOCK_REASON,
      policy: CARDRUSH_DATA_POLICY_URL,
      observations: [],
    },
    endpoint: ENDPOINT,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
