/**
 * /api/v1/examples/[endpoint_id] — one endpoint's canonical example.
 */

import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { getExample, listAllExampleIds } from "@/lib/examples";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ endpoint_id: string }> },
): Promise<Response> {
  const { endpoint_id } = await params;
  const example = getExample(endpoint_id);

  if (!example) {
    return errorResponse({
      code: "NOT_FOUND",
      message:
        `No example with id "${endpoint_id}". Known ids: ${listAllExampleIds().join(", ")}. ` +
        `Browse the directory at /api/v1/examples.`,
      docs: "/api/v1/examples",
    });
  }

  return jsonResponse({
    data: {
      "@kind": "endpoint_example",
      ...example,
    },
    endpoint: "/api/v1/examples/[endpoint_id]",
    sources: ["ctcg-derived"],
    source_license: ["CC0-1.0"],
    freshness: "methodology",
    contains_self: true,
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
