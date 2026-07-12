import { COMMUNITY_ORGANISATION_SCHEMA } from "@cambridge-tcg/data-spec";

/** Dereferenceable raw JSON Schema matching COMMUNITY_ORGANISATION_SCHEMA.$id. */
export function GET(): Response {
  return new Response(JSON.stringify(COMMUNITY_ORGANISATION_SCHEMA, null, 2), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "Content-Type": "application/schema+json; charset=utf-8",
    },
  });
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
