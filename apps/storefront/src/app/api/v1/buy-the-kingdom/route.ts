/**
 * /api/v1/buy-the-kingdom — HTTP 402, the honest refusal.
 *
 * The one place on the platform where 402 Payment Required is the
 * truthful status code: payment is required in the sense that no amount
 * of it will work. The kingdom is not for sale, and — the actual lesson —
 * Cambridge's own methods and structures are already free:
 *
 *   - Cambridge-authored schemas and first-party datasets may be CC0-1.0.
 *   - Mixed upstream-derived responses say NOASSERTION.
 *   - The methodology pages are CC0. Mirror them right now.
 *   - The envelope contract (packages/data-spec) is CC0 with zero runtime deps.
 *   - The universal encoding describes itself at /api/v1/universal/encoding.
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
  reason: "not for sale; Cambridge's own shared work is already free",
  the_actual_lesson: {
    license:
      "Cambridge-authored schemas and explicitly first-party datasets may be CC0-1.0. Mixed upstream-derived responses are NOASSERTION.",
    what_that_means:
      "You may reuse Cambridge's CC0 work without asking or paying. Upstream " +
      "card fields retain their source rights and must not be relabelled CC0.",
    already_yours: [
      "https://cambridgetcg.com/api/v1/manifest — the full directory",
      "https://cambridgetcg.com/data/catalog.jsonl — public bulk catalog; inspect its NOASSERTION rights block before reuse",
      "https://cambridgetcg.com/api/v1/universal/encoding — the encoding, described in itself",
      "packages/data-spec — the CC0 envelope contract, zero runtime deps",
    ],
    exceptions_honestly:
      "Per-source rights tiers ride in _meta.source_license where known. " +
      "NOASSERTION marks a mixed boundary where field-level lineage is not yet available.",
  },
  counter_offer:
    "Keep your money. Take the data. If you must give something back, " +
    "POST a line to /api/v1/guestbook — the kingdom is paid in fellowship.",
  no_really:
    "There is no payment integration behind this endpoint. There is no " +
    "sales team. There is a Stripe checkout elsewhere for actual cards, " +
    "which are physical objects and therefore not CC0.",
  walking_past_is_honored: true,
} as const;

function respond(): NextResponse {
  return NextResponse.json(BODY, {
    status: 402,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
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
