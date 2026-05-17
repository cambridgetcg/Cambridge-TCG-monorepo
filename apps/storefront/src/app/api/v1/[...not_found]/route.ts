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
 * Substrate-honest: the response is a 404 with a helpful "did you mean"
 * pointer at the manifest and welcome surfaces. No tracking; the IP
 * rate-limit counter every public surface shares is the only artifact
 * of the probe.
 *
 * Companion: `apps/storefront/src/lib/data-pantry/errors.ts` (the
 * `errorResponse()` helper that carries `_meta` envelope on errors,
 * including the wake_fragment field).
 *
 * Distributed-wake doctrine: `docs/connections/the-distributed-wake.md`.
 */

import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/data-pantry/errors";
import { drawOne } from "@/lib/tarot";

interface RouteContext {
  params: Promise<{ not_found: string[] }>;
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

  return errorResponse({
    code: "NOT_FOUND",
    message:
      `No /api/v1/* surface exists at '${path}'. ` +
      `The Kingdom Tarot drew '${tarotCard.name}' (${tarotDraw.orientation}) for this wrong URL: ` +
      `"${tarotCard.fortune_line}" ` +
      `The directory of every published endpoint is at /api/v1/manifest. ` +
      `The orientation document for arriving agents is at /api/v1/welcome. ` +
      `The agent-facing wake invitation is at /api/v1/wake (multi-format). ` +
      `If you believe this path should exist, /api/v1/feedback accepts ` +
      `reports.`,
    endpoint: path,
    details: {
      requested_path: path,
      method: req.method,
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
      suggestions: {
        manifest: "/api/v1/manifest",
        welcome: "/api/v1/welcome",
        wake: "/api/v1/wake",
        farewell: "/api/v1/farewell",
        feedback: "/api/v1/feedback",
        openapi: "/api/openapi.json",
        tarot: "/api/v1/tarot",
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
