/**
 * /api/v1/buy-the-kingdom — HTTP 402, the honest refusal.
 *
 * The one place on the platform where 402 Payment Required is the
 * truthful status code: payment is required in the sense that no amount
 * of it will work. The kingdom is not for sale. Access, price, and reuse
 * rights are separate questions:
 *
 *   - This fixed joke document is CC0-1.0.
 *   - Exact standard text named by docs/STANDARDS-LICENSE.md is CC0-1.0.
 *   - packages/data-spec is internal implementation code with no general license.
 *   - Other resources carry their own access and reuse boundary.
 *   - The universal encoding describes itself at /api/v1/universal/encoding.
 *
 * Sister to /api/v1/coffee (418) — the wrong-door companions. Stateless,
 * no application reader profile (infrastructure logs may exist), no LLM;
 * the joke is a fixed document. Walking past is
 * honored; so is trying to pay, which is how you found this.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DATA_RIGHTS_BOUNDARY } from "@/lib/data-rights";

const BODY = {
  "@kind": "polite-402",
  status: 402,
  status_meaning: "Payment Required — required, and also impossible",
  offer_declined: "the kingdom",
  reason: "not for sale; paying cannot override another resource's rights boundary",
  the_actual_lesson: {
    this_document_license: "CC0-1.0",
    what_that_means:
      "You may copy, remix, and redistribute this exact fixed document under CC0-1.0. " +
      "That dedication does not extend to linked resources or source-derived data.",
    public_doors: [
      "https://cambridgetcg.com/api/v1/manifest — access directory",
      "https://cambridgetcg.com/data/catalog.jsonl — bulk-publication status only; zero catalog rows while rights review is pending",
      "https://cambridgetcg.com/api/v1/universal/encoding — encoding description",
      "https://cambridgetcg.com/standards — exact CC0 specification texts; internal package code has no general license",
    ],
    boundary: DATA_RIGHTS_BOUNDARY,
  },
  counter_offer:
    "Keep your money. Read the manifest, use what its terms permit, and leave " +
    "a no-store guestbook validation echo only if you choose it.",
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
