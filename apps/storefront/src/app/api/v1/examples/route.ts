/**
 * /api/v1/examples — directory of per-endpoint canonical examples.
 *
 * Each example is a literal curl + sample response + annotated fields +
 * when-to-use + gotchas. Pre-thought for the agent looking at one
 * specific endpoint who wants "show me one call".
 *
 * Renders from apps/storefront/src/lib/examples.ts. CC0.
 *
 * Filed for kingdom-083 — the inner peace.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { EXAMPLES } from "@/lib/examples";

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "examples_index",
    welcome:
      "Per-endpoint canonical examples. Each carries a literal curl, a " +
      "sample response, annotated field meanings, when-to-use guidance, " +
      "and common gotchas. Companion to /api/v1/guides (task-oriented) — " +
      "this corpus is endpoint-oriented.",
    count: EXAMPLES.length,
    examples: EXAMPLES.map((e) => ({
      endpoint_id: e.endpoint_id,
      path: e.path,
      method: e.method,
      auth: e.auth,
      title: e.title,
      description: e.description,
      url: `/api/v1/examples/${e.endpoint_id}`,
    })),
    by_method: {
      GET: EXAMPLES.filter((e) => e.method === "GET").length,
      POST: EXAMPLES.filter((e) => e.method === "POST").length,
      PATCH: EXAMPLES.filter((e) => e.method === "PATCH").length,
      DELETE: EXAMPLES.filter((e) => e.method === "DELETE").length,
    },
    by_auth: {
      public: EXAMPLES.filter((e) => e.auth === "public").length,
      user: EXAMPLES.filter((e) => e.auth === "user").length,
      "wholesale-key": EXAMPLES.filter((e) => e.auth === "wholesale-key").length,
      agent: EXAMPLES.filter((e) => e.auth === "agent").length,
    },
    feedback_endpoint: "/api/v1/feedback",
    license: "CC0-1.0",
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/examples",
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
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
