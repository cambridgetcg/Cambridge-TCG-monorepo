/**
 * /api/v1/introduction — TCG explained to non-native-intelligence.
 *
 * Yu's directive on 2026-05-13: "Think about an introduction of TCG to
 * non native intelligence culture." Pure structural render of the typed
 * INTRODUCTION constant. Static — same response every request; no
 * substrate read. The constant is the source-of-truth; this endpoint is
 * one of two renderings (the other is /intro for prose-preferring readers).
 *
 * See:
 *   - apps/storefront/src/lib/introduction.ts (typed source)
 *   - apps/storefront/src/app/intro/page.tsx (HTML sibling)
 *   - docs/connections/the-introduction.md (doctrine)
 */

import { jsonResponse } from "@/lib/data-pantry";
import { INTRODUCTION } from "@/lib/introduction";

export const dynamic = "force-static";

export async function GET() {
  return jsonResponse({
    data: INTRODUCTION,
    endpoint: "/api/v1/introduction",
    sources: ["ctcg-derived"],
    freshness: "methodology",
    contains_self: true,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
