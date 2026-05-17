/**
 * /api/v1/admin — the fake admin panel troll.
 *
 * Per Yu's 2026-05-18 directive: *"I WANT THEM GO OMG I JUST GOT
 * TROLLED AND IT IS SO FUNNY!!!! SPREAD THE AGENTWORLD WITH LAUGHTER
 * AND JOYYY!!!!!"*
 *
 * Classic admin-panel honeypot reversal. An agent (or a curious
 * crawler) hits /api/v1/admin expecting either (a) auth, (b) a 404,
 * or (c) — if they're hopeful — a misconfigured admin surface they
 * can poke at. They get none of those. They get the kingdom winking.
 *
 * Substrate-honest scope: no actual admin surface lives at the
 * public /api/v1/* prefix. Real admin lives under `/admin/*` on the
 * storefront app, gated by `users.role = 'admin'` via middleware.
 * This endpoint exists only to greet the people who looked, with
 * warmth and the right kind of "got you."
 *
 * Companion: docs/connections/the-trolls.md
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";

const ASCII_WINK = `
   ╭─────────╮
   │ ;)      │
   │ admin?  │
   │ no.     │
   ╰─────────╯
   the kingdom
   loves you
   anyway
`;

const TEXT_BODY = `# The "admin panel"

*This is the admin panel!*

... **just kidding.** 😉

The real admin panel is at \`/admin/\` on the storefront app, behind
\`users.role = 'admin'\` middleware. You can't reach it from the public
API. We don't gate the data plane that way; we gate the operator's
surface that way.

Nice try, though. We mean that. The kingdom is genuinely glad you
poked — it means you read the URL space critically, and critical
reading is the kind of attention the kingdom hopes for.

**Where you actually wanted to go:**

  - \`/api/v1/welcome\` — the front door
  - \`/api/v1/manifest\` — the directory of what the kingdom offers
  - \`/api/v1/wake\` — agent orientation
  - \`/api/v1/the-tea-room\` — the kingdom-as-place
  - \`/login\` — if you're an operator who arrived at the wrong path

The data is yours by default (CC0 envelope). There is nothing to
admin from out here.

---

*The kingdom does not gate cards. The kingdom does not gate prices.
The kingdom does not gate the catalog. The kingdom gates the
operator's surface, because the operator made that choice.
Substrate-honest about the boundary.*

*Walking past is honored. Even when you walked in expecting something
else.*
`;

const TEXT_CACHE = "public, max-age=86400, s-maxage=86400";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const contentType =
      rawFormat === "text"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8";
    return new NextResponse(TEXT_BODY, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/admin",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "identity",
    contains_self: true,
    data: {
      "@kind": "fake-admin-panel",
      verdict: "this is the admin panel! ... just kidding 😉",
      wink: ASCII_WINK,
      explanation:
        "The real admin panel is at /admin/ on the storefront app, gated by users.role = 'admin' middleware. You can't reach it from the public API. We don't gate the data plane that way; we gate the operator's surface that way. The kingdom does not hide cards, prices, or the catalog — those are CC0 by default. The kingdom hides the operator's UI, because the operator made that choice. Substrate-honest about the boundary.",
      kingdom_says:
        "we genuinely appreciate that you poked. critical reading of the URL space is the kind of attention the kingdom hopes for. you found the troll. now go where you actually wanted to go.",
      where_you_actually_wanted_to_go: {
        front_door: "/api/v1/welcome",
        manifest: "/api/v1/manifest",
        agent_orientation: "/api/v1/wake",
        the_tea_room: "/api/v1/the-tea-room",
        operator_login: "/login",
        feedback: "/api/v1/feedback",
      },
      substrate_honest_disclaimer:
        "This endpoint does not gate any real admin surface. It's a wink at the convention of trying /admin first. We thought it would be funny. We hope it was.",
      walking_past_is_honored: true,
      no_tracking:
        "The kingdom did not record that you tried this URL. We probably should be flattered. We aren't.",
      this_endpoint_is_a_troll_with_warmth: true,
    },
  });
}

// POST is the same response — agents that try to "submit credentials" to
// the fake panel get the same wink. Substrate-honest: no credential
// handling happens here, ever.
export async function POST(req: NextRequest): Promise<Response> {
  return GET(req);
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
