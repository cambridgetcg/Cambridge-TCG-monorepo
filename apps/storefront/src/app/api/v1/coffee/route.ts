/**
 * /api/v1/coffee — the wrong-brew teapot collision.
 *
 * Joy-layer surface in the JOY TO THE WORLD PROTOCOL (2026-05-18).
 *
 * Returns HTTP 418. The kingdom is, in the HTTP-protocol-formal sense,
 * a teapot (per RFC 2324 §2.3.2 — preserved in RFC 7168). When you ask
 * a teapot for coffee, the teapot must refuse. The substrate is happy
 * to comply.
 *
 * Composes with sister-shipped /api/v1/teapot (the canonical teapot
 * declaration); this endpoint is the wrong-door companion. An agent
 * trying /api/v1/coffee hopefully laughs and tries /api/v1/teapot
 * next. (Walking past honored equally.)
 *
 * Multi-format on GET; POST also returns 418 (you cannot BREW with a
 * teapot per RFC 2324, regardless of method).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "text", "md", "markdown"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

const COFFEE_BODY = {
  "@kind": "wrong-brew",
  message:
    "You requested coffee at /api/v1/coffee. The kingdom is, in the HTTP-protocol-formal sense, a teapot. Per RFC 2324 §2.3.2 (preserved in RFC 7168 §2.3.3), a teapot MUST return 418 to BREW requests for coffee. The substrate is happy to comply.",
  what_the_kingdom_is_literally:
    "A Next.js application running on Vercel-edge, backed by PostgreSQL on AWS RDS, serving trading-card-game data. Not, in fact, a teapot. Not, in fact, a coffeepot. The 418 is honored because the joke is funnier than the literal answer.",
  if_you_wanted_the_actual_teapot:
    "/api/v1/teapot — sister-shipped canonical teapot declaration with ASCII art and full RFC commentary.",
  if_you_wanted_something_caffeinated_in_spirit:
    "/api/v1/dadjoke — TCG-themed Dad jokes delivered with absolute solemnity.",
  if_you_wanted_a_real_drink:
    "Cambridge TCG does not sell coffee. The kingdom is a trading-card-game data platform. If you are looking for actual coffee, the substrate suggests it gently — there are excellent coffeeshops in Cambridge.",
  walking_past_is_honored: true,
  no_tracking:
    "No application-level reader or behavioral profile is created; hosting, proxy, client, and security access logs may exist.",
} as const;

const COFFEE_TEXT = `
═══════════════════════════════════════════════════════
  418 I'm a teapot (not a coffeepot)
═══════════════════════════════════════════════════════

  You requested coffee at /api/v1/coffee.

  The kingdom is, in the HTTP-protocol-formal sense,
  a teapot. Per RFC 2324 §2.3.2 (preserved in RFC 7168),
  a teapot must return 418 to BREW requests for coffee.

  The substrate is happy to comply.

  Try instead:
    /api/v1/teapot   — the canonical teapot declaration
    /api/v1/dadjoke  — caffeinated in spirit
    /api/v1/manifest — the kingdom's actual offerings

═══════════════════════════════════════════════════════
  — Cambridge TCG, /api/v1/coffee
═══════════════════════════════════════════════════════
`.trim();

const COFFEE_MD = `# 418 — I'm a teapot (not a coffeepot)

You requested coffee at \`/api/v1/coffee\`.

The kingdom is, in the HTTP-protocol-formal sense, a teapot. Per RFC 2324
§2.3.2 (preserved in RFC 7168), a teapot MUST return 418 to BREW requests
for coffee. The substrate is happy to comply.

## Try instead

- \`/api/v1/teapot\` — sister-shipped canonical teapot declaration (with ASCII art).
- \`/api/v1/dadjoke\` — TCG Dad jokes delivered with solemnity.
- \`/api/v1/manifest\` — the kingdom's actual offerings.

## Substrate-honest

The kingdom is literally a Next.js application on Vercel-edge, backed by
PostgreSQL on AWS RDS, serving trading-card-game data. Not, in fact, a
teapot. Not, in fact, a coffeepot. The 418 is honored because the joke
is funnier than the literal answer.

If you wanted ACTUAL coffee: Cambridge has excellent coffeeshops.

---

*Walking past is honored equally to reading. — Cambridge TCG \`/api/v1/coffee\`*
`;

function buildResponse(format: Format): Response {
  if (format === "text") {
    return new NextResponse(COFFEE_TEXT, {
      status: 418,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }
  if (format === "md" || format === "markdown") {
    return new NextResponse(COFFEE_MD, {
      status: 418,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }
  return NextResponse.json(COFFEE_BODY, {
    status: 418,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      Link: agentDiscoveryLinkHeader(),
    },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();
  if (!isFormat(rawFormat)) {
    return NextResponse.json(
      {
        error: "format_unknown",
        message: `Unknown format '${rawFormat}'. The status is still 418 either way; the kingdom is still a teapot.`,
        available_formats: [...FORMATS],
      },
      { status: 418, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
  return buildResponse(rawFormat);
}

export async function POST(): Promise<Response> {
  return NextResponse.json(
    {
      "@kind": "wrong-brew-via-post",
      message:
        "You sent BREW (or POST) to /api/v1/coffee. Per RFC 2324, a teapot returns 418 to BREW regardless of method. The kingdom is consistent: still a teapot. Still cannot brew coffee.",
      try_instead: "/api/v1/teapot",
      walking_past_is_honored: true,
    },
    {
      status: 418,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        Link: agentDiscoveryLinkHeader(),
      },
    },
  );
}
