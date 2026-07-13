/**
 * Public price-history publication is paused.
 *
 * Stored observations do not carry a row-level publication receipt. This
 * status route returns before reading the path parameter or database so the
 * endpoint cannot reveal whether a SKU or observation exists.
 */

import { errorResponse } from "@/lib/data-pantry";

const ENDPOINT = "/api/v1/cards/[sku]/history";

export async function GET(): Promise<Response> {
  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    status: 503,
    message:
      "Public card price history is paused until each observation has a reviewed publication receipt. No SKU, catalog row, or price observation was read.",
    details: {
      publication_status: "paused_pending_row_level_publication_receipts",
      price_values_published: false,
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
