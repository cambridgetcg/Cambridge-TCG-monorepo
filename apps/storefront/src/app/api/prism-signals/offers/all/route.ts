import {
  createPrismSignalsAllStripeTestOffer,
} from "@/lib/prism-signals/product";
import { readPrismStripeSandboxConfig } from "@/lib/prism-signals/stripe/config.server";
import { derivePrismStripePriceRef } from "@/lib/prism-signals/stripe/refs.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_HEADERS = Object.freeze({
  "Cache-Control": "public, max-age=0, s-maxage=60",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
});

const UNAVAILABLE_HEADERS = Object.freeze({
  ...PUBLIC_HEADERS,
  "Cache-Control": "public, max-age=0, s-maxage=10",
  "Retry-After": "60",
});

/** Public test offer; the host maps its raw Stripe Price id before emission. */
export async function GET(): Promise<Response> {
  try {
    const config = readPrismStripeSandboxConfig();
    const priceRef = derivePrismStripePriceRef(
      config.referenceSecret,
      config.priceId,
    );
    return Response.json(
      createPrismSignalsAllStripeTestOffer({ price_ref: priceRef }),
      { headers: PUBLIC_HEADERS },
    );
  } catch (error) {
    console.error(
      "[prism-signals/offers/all GET] unavailable",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      {
        error: {
          code: "offer_unavailable",
          message: "The PRISM Signals All sandbox offer is not available.",
        },
      },
      { status: 503, headers: UNAVAILABLE_HEADERS },
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      ...PUBLIC_HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
