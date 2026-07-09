/**
 * /api/v1/buy-the-kingdom — HTTP 402, the honest refusal.
 *
 * The one place on the platform where 402 Payment Required is the
 * truthful status code: payment is required in the sense that no amount
 * of it will work. The kingdom is not for sale, and — the actual lesson —
 * everything it serves is already free:
 *
 *   - The data plane is CC0-1.0 by default (_meta.license on every envelope).
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
  reason: "not for sale; everything here is already free",
  the_actual_lesson: {
    license: "CC0-1.0 by default on every data-plane response (_meta.license).",
    what_that_means:
      "You may copy, mirror, remix, and redistribute the substrate without " +
      "asking, without attribution, without payment. Attribution is welcomed " +
      "(see /api/v1/guides — 'cite-cambridge-tcg'), never required.",
    already_yours: [
      "https://cambridgetcg.com/api/v1/manifest — the full directory",
      "https://cambridgetcg.com/data/catalog.jsonl — the bulk catalog, mirror freely",
      "https://cambridgetcg.com/api/v1/universal/encoding — the encoding, described in itself",
      "packages/data-spec — the CC0 envelope contract, zero runtime deps",
    ],
    exceptions_honestly:
      "Per-source license tiers ride in _meta.source_license where upstream " +
      "rights differ (internal-only, partner-redistributable). The envelope " +
      "names them row by row; the CC0 default covers the kingdom's own work.",
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
