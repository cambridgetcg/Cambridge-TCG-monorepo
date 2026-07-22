/**
 * /api/v1/artists — the named hands, machine-readable. Twin of /artists.
 *
 * The first open structured dataset of One Piece Card Game illustrator
 * credits: Bandai's digital databases carry no artist field, Limitless's
 * axis is search-only, the fan directory is hand-counted HTML. This
 * endpoint publishes what our catalogue credits as plain facts — the
 * name, the works, the print we hold — with provenance attached, because
 * attribution is owed, not risky.
 *
 * Credits are catalogue annotations mirroring the printed card-face
 * credit; see provenance_note in the payload. The per-source licenses
 * below are honest: both underlying sources (supplier catalogue, the
 * publisher's official sample images) remain PROPRIETARY — who-drew-what
 * is an uncopyrightable fact you may repeat, but this payload's image
 * URLs and attribution strings are not a redistribution grant.
 */

import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { getNamedHands } from "@/lib/cards/artists";

export async function GET(): Promise<Response> {
  let hands;
  try {
    hands = await getNamedHands();
  } catch {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        "The catalogue substrate is temporarily unreachable — an outage, not a claim that no hands are named. Retry shortly.",
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/artists",
    sources: [
      "card_set_cards (supplier catalogue; `illust:` annotations on special-art listings)",
      "card_images (official sample collection, takedown-clear prints only)",
    ],
    source_license: ["proprietary", "proprietary"],
    freshness: "catalog",
    data: {
      provenance_note:
        "One Piece Card Game cards print the illustrator's name on the physical card face, but no official database records it. These credits are read from our supplier catalogue's special-art annotations, which mirror the printed credit; the extraction was verified against Limitless's per-printing records and the fan-kept directory below at the wing's opening (2026-07-22) — credits ingested since inherit the pipeline, not that check. A hand is named where — and only where — a credit exists; over 200 hands have drawn for this game and the uncredited majority is absent here because no machine-readable credit exists yet, not because none is owed.",
      corroboration: [
        "https://onepiece.limitlesstcg.com/cards/advanced",
        "https://onepiececard-letter.com/onepiececard-illustrator-list/",
      ],
      totals: {
        hands: hands.length,
        credited_works: hands.reduce((n, h) => n + h.works.length, 0),
        prints_held: hands.reduce((n, h) => n + h.held, 0),
      },
      hands: hands.map((h) => ({
        name: h.name,
        slug: h.slug,
        page: `/artists/${h.slug}`,
        work_count: h.works.length,
        prints_held: h.held,
        works: h.works.map((w) => ({
          set_code: w.set_code,
          card_number: w.card_number,
          card_name: w.name,
          print: w.print
            ? {
                sku: w.print.sku,
                variant: w.print.variant_label,
                image_url: w.print.image_url,
                attribution: w.print.attribution,
                market_page: `/market/${w.print.sku}`,
              }
            : null,
        })),
      })),
      _links: {
        human_page: "/artists",
        image_policy: "/legal/card-images",
        siblings: "/api/v1/status",
      },
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
