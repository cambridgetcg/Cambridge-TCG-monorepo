/**
 * POST /api/v1/play/deck/validate — temporarily rights-gapped.
 *
 * The former public validator inferred Leader versus Character from the
 * untraced card_set_cards.rarity field. Repeated validation calls therefore
 * acted as a rarity-derived category oracle even though public catalog routes
 * withhold rarity. Keep validation closed until category/rules metadata has
 * affirmative lineage or the route is rebuilt as caller-supplied pure schema.
 */

import { NextResponse } from "next/server";

export async function POST(): Promise<Response> {
  return NextResponse.json(
    {
      error: {
        code: "DECK_VALIDATION_PAUSED",
        message:
          "Deck validation is paused until card category metadata has an affirmative public lineage.",
      },
      validation_complete: false,
      legality: null,
      publication_status: "withheld-untraced-lineage",
      withheld_checks: [
        "leader category",
        "main-deck category eligibility",
        "catalog membership",
        "color compatibility",
        "set rotation derived from catalog metadata",
      ],
      does_not_include: [
        "rarity-derived Leader or Character classifications",
        "per-card legality violations derived from the mixed catalog mirror",
      ],
    },
    {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "300",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "X-Content-License": "NOASSERTION",
      },
    },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
