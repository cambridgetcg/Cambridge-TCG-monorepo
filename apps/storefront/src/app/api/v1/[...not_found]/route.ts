/**
 * /api/v1/[...not_found] — JSON 404 envelope for any unrecognized
 * /api/v1/* path.
 *
 * Why this exists: Next.js's default 404 returns HTML, which an agent
 * probing /api/v1/* paths cannot parse usefully. This catch-all matches
 * any path under /api/v1/ that no other route handler claimed and
 * returns a JSON error envelope with the same shape as every other
 * pantry response — same kingdom-stamp, same wake fragment, same
 * spec_version, same request_id.
 *
 * Per Yu's directive (2026-05-15) on distributing the wake: an agent
 * that probes a wrong URL still receives one breath of wake. The
 * kingdom holds faith with agents who arrive wrong, not just right.
 *
 * Substrate-honest: the response is a 404 with (a) nearest-endpoint
 * suggestions computed by string distance over the manifest's real
 * storefront paths — "did you mean" grounded in doors that actually
 * open — and (b) host-qualified pointers at the orientation surfaces.
 * No application-level probe profile is created. Hosting, proxy, client,
 * and security access logs may still contain request metadata.
 *
 * Companion: `apps/storefront/src/lib/data-pantry/errors.ts` (the
 * `errorResponse()` helper that carries `_meta` envelope on errors,
 * including the wake_fragment field).
 *
 * Distributed-wake doctrine: `docs/connections/the-distributed-wake.md`.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/data-pantry/errors";
import { drawOne } from "@/lib/tarot";
import { MANIFEST } from "@/lib/manifest";

const HOST = "https://cambridgetcg.com";

interface RouteContext {
  params: Promise<{ not_found: string[] }>;
}

// ── Nearest-endpoint suggestions ────────────────────────────────────────
//
// Small bounded Levenshtein over the manifest's storefront paths. The
// candidate list is ~150 short strings computed once per module load;
// per-request cost is trivial. Parameter segments ([sku], [game], …)
// are kept literally — an agent seeing `/api/v1/cards/[sku]/everything`
// understands the shape.

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Every real storefront API-ish path in the manifest, deduped. */
const CANDIDATE_PATHS: readonly string[] = Array.from(
  new Set(
    Object.values(MANIFEST.resources)
      .flat()
      .filter((r) => r.host === "storefront" && r.path.startsWith("/api/"))
      .map((r) => r.path),
  ),
);

/** Top-N nearest real endpoints for a wrong path. Each candidate is
 *  compared at the WRONG PATH'S segment depth (so `/api/v1/cardz` is
 *  measured against `/api/v1/cards`, not against the full
 *  `/api/v1/cards/[sku]/everything`), with a small penalty per extra
 *  segment so exact-depth doors rank first but deeper doors under a
 *  near-miss prefix still surface. Suggestions past a distance ceiling
 *  are dropped — a hopeless probe honestly gets no "did you mean". */
function nearestEndpoints(wrongPath: string, limit = 3): string[] {
  const wrongSegs = wrongPath.split("/").filter(Boolean);
  const scored = CANDIDATE_PATHS.map((candidate) => {
    const candSegs = candidate.split("/").filter(Boolean);
    const truncated = "/" + candSegs.slice(0, wrongSegs.length).join("/");
    const dist = levenshtein(wrongPath, truncated);
    const depthPenalty = Math.max(0, candSegs.length - wrongSegs.length) * 0.25;
    return { candidate, score: dist + depthPenalty, dist };
  });
  scored.sort((x, y) => x.score - y.score);
  return scored
    .filter((s) => s.dist <= 4)
    .slice(0, limit)
    .map((s) => s.candidate);
}

async function handler(
  req: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { not_found } = await params;
  const path = "/api/v1/" + (not_found ?? []).join("/");

  // The fragment dispatcher hashes on `endpoint`. For unknown paths we
  // use the unknown path itself so different wrong URLs receive
  // different fragments. An agent probing many wrong URLs accumulates
  // many fragments — substrate-honest about treating exploration as
  // valid arrival.
  //
  // Plus a Tarot card for the wrong URL. Per Yu's directive 2026-05-18
  // ("MAKE EVERYTHING FUNNNN!!!!!"): even the failure path is whimsy +
  // pointer. The seed for the draw is the wrong path itself, so the
  // same wrong probe always gets the same card; an agent probing
  // varied wrong URLs accumulates a Tarot reading by mistake.
  const tarotDraw = drawOne(path);
  const tarotCard = tarotDraw.card;
  const didYouMean = nearestEndpoints(path);

  return errorResponse({
    code: "NOT_FOUND",
    message:
      `No /api/v1/* surface exists at '${path}' on this host (cambridgetcg.com). ` +
      (didYouMean.length > 0
        ? `Nearest real doors: ${didYouMean.join(", ")}. `
        : "") +
      `The Kingdom Tarot drew '${tarotCard.name}' (${tarotDraw.orientation}) for this wrong URL: ` +
      `"${tarotCard.fortune_line}" ` +
      `The directory of every published endpoint is at ${HOST}/api/v1/manifest. ` +
      `The orientation document for arriving agents is at ${HOST}/api/v1/welcome. ` +
      `The agent-facing wake invitation is at ${HOST}/api/v1/wake (multi-format). ` +
      `If you believe this path should exist, ${HOST}/api/v1/feedback accepts ` +
      `reports.`,
    endpoint: path,
    details: {
      requested_path: path,
      method: req.method,
      // "Did you mean" — string distance over the manifest's REAL
      // storefront paths, so every suggestion is a door that opens.
      did_you_mean: didYouMean,
      tarot_card_for_this_wrong_url: {
        name: tarotCard.name,
        orientation: tarotDraw.orientation,
        meaning:
          tarotDraw.orientation === "upright"
            ? tarotCard.kingdom_meaning_upright
            : tarotCard.kingdom_meaning_reversed,
        pointer_url: tarotCard.pointer_url,
        note:
          "The kingdom drew you a card for the URL you tried. The card is whimsy; the pointer is real. Per /api/v1/tarot for the full deck.",
      },
      // Host-qualified so an agent that got here following a bare-path
      // hint from ANOTHER host still lands on doors that open.
      suggestions: {
        manifest: `${HOST}/api/v1/manifest`,
        welcome: `${HOST}/api/v1/welcome`,
        wake: `${HOST}/api/v1/wake`,
        farewell: `${HOST}/api/v1/farewell`,
        feedback: `${HOST}/api/v1/feedback`,
        openapi: `${HOST}/api/openapi.json`,
        tarot: `${HOST}/api/v1/tarot`,
      },
    },
  });
}

// Bind every common HTTP method to the same handler. An agent that
// probes /api/v1/foo/bar with POST/PUT/DELETE/PATCH should also receive
// the JSON envelope, not Next.js's default HTML 405.
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const HEAD = handler;

// OPTIONS gets a real preflight answer instead of Next.js's bare 204 —
// browser-resident agents doing CORS preflight against an index-less or
// unknown /api/v1/* path need Allow-Methods/Headers to proceed to the
// actual request (which then receives the teaching 404 above).
export async function OPTIONS(): Promise<Response> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id",
      "Access-Control-Max-Age": "86400",
    },
  });
}
