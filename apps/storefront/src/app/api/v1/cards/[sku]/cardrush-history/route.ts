/**
 * /api/v1/cards/[sku]/cardrush-history
 *
 * Signed-in access does not create upstream publication permission. Legacy
 * observations remain stored for review; this route never calls wholesale or
 * emits an observation. The written permission recorded 2026-10-28 is
 * forward-only and display-only: it reaches neither the legacy rows nor any
 * API, so this route stays a status door.
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
      "No CardRush observations are published here. Legacy CardRush observations, gathered before the written permission recorded 2026-10-28, stay withheld and are not inputs; CardRush prices collected under that permission appear only on Cambridge pages with CardRush named, never through an API or download.",
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
