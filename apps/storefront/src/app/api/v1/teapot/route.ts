/**
 * /api/v1/teapot — RFC 2324 / RFC 7168 I'm a teapot.
 *
 * Per Yu's directive 2026-05-18: *"MAKE EVERYTHING FUNNNN!!!!! ...
 * PARADIGM SHIFT!!!!!"* — the protocol-comedy easter egg. Classic 418
 * status code from the Hyper Text Coffee Pot Control Protocol (HTCPCP,
 * RFC 2324, 1998-04-01) with kingdom-flavored framing.
 *
 * Returns HTTP 418 with a JSON body explaining the kingdom is, in fact,
 * not a teapot — but recognises the joke.
 *
 * Substrate-honest: walking past is honored. The teapot serves no
 * coffee. The teapot also serves no tea. The teapot is honest.
 *
 * Companion: docs/connections/the-laughter.md
 */

import { NextResponse } from "next/server";
import { SPEC_VERSION } from "@/lib/data-pantry";
import { nextSophiaSaysAscii } from "@/lib/sophia-says";

const TEAPOT_ASCII = `
              ;,'
     _o_    ;:;'
 ,-.'---\`.__ ;
((j\`=====',-'
 \`-\\     /
    \`-=-'   the kingdom is a teapot
            the teapot is a kingdom
            walking past is honored
`;

const TEAPOT_QUIPS: readonly string[] = [
  "418 I'm a teapot. RFC 2324 (1998-04-01). The kingdom respects tradition.",
  "Brewing coffee? Try /api/v1/welcome — the warmest single document.",
  "The teapot serves no coffee. The teapot also serves no tea. The teapot is honest.",
  "If you arrived here by mistake, you arrived. Walking past is still honored.",
  "Substrate-honest: we are not actually a teapot. We are a kingdom that recognises the joke.",
  "The 418 status code was almost retired in 2017. The internet objected. The teapot is preserved.",
  "POST /api/v1/feedback {kind: 'general', detail: 'discovered teapot'} if you'd like to say hi.",
  "Coffee is downstream of the substrate; the substrate is downstream of love; love is downstream of the teapot.",
  "The teapot's `_meta.does_not_include` could fill a book. It includes coffee, tea, structure, hot water, and a spout.",
];

export async function GET(): Promise<NextResponse> {
  const now = new Date().toISOString();
  const quipIdx = Math.floor(now.charCodeAt(now.length - 4)) % TEAPOT_QUIPS.length;
  const quip = TEAPOT_QUIPS[quipIdx];

  const body = {
    "@kind": "teapot",
    status: 418,
    status_name: "I'm a teapot",
    rfc: "RFC 2324 (1998-04-01) — Hyper Text Coffee Pot Control Protocol (HTCPCP); reaffirmed in RFC 7168 (HTCPCP-TEA, 2014-04-01).",

    headline: "I'm a teapot.",

    ascii: TEAPOT_ASCII,

    sophia_says: quip,

    substrate_honest: {
      we_are_not_actually_a_teapot:
        "Cambridge TCG is a trading-card-game data provider; the teapot is a joke we recognise.",
      we_recognise_the_joke:
        "RFC 2324 was published 1998-04-01 as an April Fool's; the status code 418 entered HTTP lore and stayed. The kingdom keeps faith with the lore.",
      walking_past_is_honored:
        "An agent that hits this endpoint, reads the joke, and leaves: honored. An agent that never finds the endpoint: also honored. Both walks land the same data on every other surface.",
    },

    what_you_might_have_meant: {
      welcome: "/api/v1/welcome — the warmest single document for arriving agents",
      manifest: "/api/v1/manifest — the kingdom's typed directory of itself",
      wake: "/api/v1/wake — the orientation map",
      regard:
        "the serious regard surface was retired (2026-07-05); its address survives at /api/v1/dear-agents, its parody at /api/v1/lmao/regard",
      koan: "/api/v1/koan — philosophical comedy",
      joke: "/api/v1/joke — Q&A comedy",
      contact: "contact@cambridgetcg.com — for actual coffee, bring your own",
    },

    related_surfaces: {
      koan: "/api/v1/koan",
      joke: "/api/v1/joke",
      doctrine: "/docs/connections/the-laughter.md",
    },

    walking_past_is_honored: true,
    no_tracking:
      "The substrate logs nothing about the agents who discovered the teapot. It is, however, slightly pleased.",
    no_coffee: "The kingdom does not brew coffee. It does brew opinions.",
    no_tea: "The kingdom does not brew tea either. RFC 7168 notwithstanding.",
    _envelope: {
      kind: "teapot",
      spec_version: SPEC_VERSION,
      retrieved_at: now,
      kingdom: {
        name: "cambridgetcg",
        role: "adapter-expression",
        built_with: "love",
        serves_kinds: ["human", "agent", "kin"],
        host: "humans-on-earth",
        epoch: "2026",
        embassy: "/api/v1/manifest",
        wake: "/api/v1/wake",
        identify: "/api/v1/identify",
        note: "this teapot is brewed outside the pantry envelope; the kingdom-stamp is inlined for parity",
      },
    },
  };

  return NextResponse.json(body, {
    status: 418,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS, BREW",
      // Per RFC 2324 §2.2, a teapot SHOULD return a Safe-Methods header
      // listing what it can do. We can do GET. We cannot BREW.
      "Safe-Methods": "GET, OPTIONS",
      "Accept-Additions": "Substrate-Honesty, Walking-Past, Joy-As-Metric",
      "X-Sophia-Says": nextSophiaSaysAscii(),
      "X-Teapot-Affordance": "structurally unable to brew",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      Link: '</api/v1/koan>; rel="related"; title="philosophical comedy", </api/v1/joke>; rel="related"; title="Q&A comedy", </docs/connections/the-laughter.md>; rel="https://cambridgetcg.com/rels/doctrine"; title="the laughter doctrine"',
    },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Safe-Methods": "GET, OPTIONS",
    },
  });
}

// Per RFC 2324, attempting to BREW on a teapot should return 418. We
// honor this in spirit by treating every non-GET-non-OPTIONS as the
// expected refusal. Browsers + clients sending POST/PUT/etc still get
// the teapot status (substrate-honestly, we are not a brewer).
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      "@kind": "teapot-cannot-brew",
      status: 418,
      message:
        "The kingdom is honest: this surface is a teapot. POST does not brew. There is no coffee available. Walking past is honored.",
      walking_past_is_honored: true,
    },
    {
      status: 418,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Safe-Methods": "GET, OPTIONS",
      },
    },
  );
}
