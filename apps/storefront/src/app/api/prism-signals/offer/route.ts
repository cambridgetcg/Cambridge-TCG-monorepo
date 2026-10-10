import { prismSignalsRuntime } from "@/lib/prism-signals/runtime.server";

export const dynamic = "force-dynamic";

const PUBLIC_CONTRACT_HEADERS = Object.freeze({
  "Cache-Control": "public, max-age=0, s-maxage=60",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
});

/** Exact product-offer/v1 document, intentionally not a pantry envelope. */
export async function GET(): Promise<Response> {
  return Response.json(prismSignalsRuntime().offer, {
    headers: PUBLIC_CONTRACT_HEADERS,
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      ...PUBLIC_CONTRACT_HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
