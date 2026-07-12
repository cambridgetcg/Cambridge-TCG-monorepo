/**
 * /api/v1/buy-the-kingdom — HTTP 402, the honest refusal.
 *
 * The one place on the platform where 402 Payment Required is the
 * truthful status code: payment is required in the sense that no amount
 * of it will work. The kingdom is not for sale, and — the actual lesson —
 * the parts it has expressly dedicated to everyone are already free:
 *
 *   - Responses default to NOASSERTION; public access is not a reuse grant.
 *   - Named Cambridge-authored standards and methodology are CC0.
 *   - The envelope schema is CC0; implementation code is separately licensed.
 *   - First-party sold comps are CC0 only where privacy thresholds are met.
 *
 * Sister to /api/v1/coffee (418) — the wrong-door companions. Stateless,
 * no tracking, no LLM; the joke is a fixed document. Walking past is
 * honored; so is trying to pay, which is how you found this.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BODY = {
  "@kind": "polite-402",
  status: 402,
  status_meaning: "Payment Required — required, and also impossible",
  offer_declined: "the kingdom",
  reason: "not for sale; payment cannot turn public access into a reuse licence",
  the_actual_lesson: {
    response_default: "NOASSERTION",
    what_that_means:
      "A public endpoint can be fetched, but that alone grants no permission to train on, mirror, remix, or redistribute its payload. Inspect _meta.license and any source- and field-level rights before reuse.",
    expressly_cc0: [
      "https://cambridgetcg.com/methodology/sku-standard — Cambridge-authored SKU standard",
      "https://cambridgetcg.com/methodology/pricing — Cambridge-authored pricing methodology",
      "https://cambridgetcg.com/methodology/universal-representation — Cambridge-authored universal representation standard",
      "https://cambridgetcg.com/api/v1/sold-comps — first-party realised-sale aggregates where the publication threshold is met",
    ],
    schema_boundary:
      "The Cambridge-authored envelope schema is CC0. Reference implementation and application code are separately licensed; a schema dedication does not license the code.",
    mixed_source_boundary:
      "Imported catalog, card-name, image, and historical-price fields are withheld unless affirmative field-level rights permit publication. Mixed-source records remain NOASSERTION even when their schema is CC0.",
  },
  counter_offer:
    "Keep your money. Take the expressly CC0 standards and thresholded first-party aggregates. If you must give something back, " +
    "POST a line to /api/v1/guestbook — the kingdom is paid in fellowship.",
  no_really:
    "There is no payment integration behind this endpoint. There is no " +
    "sales team. Collector-to-collector transactions may use payment infrastructure elsewhere; physical cards and transaction records are not CC0.",
  walking_past_is_honored: true,
} as const;

function respond(): NextResponse {
  return NextResponse.json(BODY, {
    status: 402,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-License": "NOASSERTION",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}

export async function GET(_req: NextRequest): Promise<Response> {
  return respond();
}

// POSTing a payment offer receives the same refusal. The body is not
// read — there is nothing to charge and nowhere to store an offer.
export async function POST(_req: NextRequest): Promise<Response> {
  return respond();
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
