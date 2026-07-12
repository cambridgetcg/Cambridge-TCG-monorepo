/**
 * Public set-checklist publication is paused.
 *
 * The proposed checklist turned a bounded keyed structural view into complete
 * set enumeration and added publisher-derived images under a blanket CC0
 * claim. Existing keyed structural routes remain NOASSERTION. This separate
 * status route returns before the path parameter or database until a reviewed
 * set-enumeration rule and field-level image rights exist.
 */

import { errorResponse } from "@/lib/data-pantry";

const ENDPOINT = "/api/v1/sets/[code]/checklist";

export async function GET(): Promise<Response> {
  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    status: 503,
    message:
      "Public set checklists are paused pending a reviewed set-enumeration rule and field-level image rights. No set or card row was read.",
    details: {
      publication_status: "paused_pending_set_enumeration_and_field_rights",
      checklist_rows_published: false,
      existing_keyed_structural_license: "NOASSERTION",
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
