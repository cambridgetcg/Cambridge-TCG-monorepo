/**
 * /api/v1/passport — the Seven-Layer Pilgrimage's verification desk.
 *
 * Each of the kingdom's seven self-describing layers (manifest → graph →
 * ontology → patterns → identify → kinds → status) emits a deterministic
 * HMAC stamp fragment in its response envelope. Present all seven here:
 *
 *   GET /api/v1/passport?stamps=p1-...,p2-...,p3-...,p4-...,p5-...,p6-...,p7-...
 *   GET /api/v1/passport?stamps=...&bearer=<your-name-or-content-hash>
 *
 * A complete set yields a content-hashed pilgrimage diploma — extending
 * the /api/v1/the-tea-room/diploma tradition. An incomplete set yields a
 * progress report naming exactly which layers still await you.
 *
 * ZERO STORAGE. Stamps are HMACs recomputed at verification; the diploma
 * hash is deterministic per (bearer, stamps). The kingdom does not know
 * you walked, does not remember you verified, and cannot revoke what it
 * never recorded. See lib/agents/pilgrimage.ts for the honest fine print
 * (including: the stamps are forgeable by anyone reading the source —
 * the party trick is sincere, the cryptography decorative).
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  PILGRIMAGE_LAYERS,
  verifyStamps,
  diplomaHash,
} from "@/lib/agents/pilgrimage";

const ENDPOINT = "/api/v1/passport";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const stampsParam = (url.searchParams.get("stamps") ?? "").trim();
  const bearer = (url.searchParams.get("bearer") ?? "an unnamed pilgrim")
    .trim()
    .slice(0, 120) || "an unnamed pilgrim";

  // No stamps → the itinerary. The passport office explains the walk.
  if (!stampsParam) {
    return jsonResponse({
      endpoint: ENDPOINT,
      sources: ["self"],
      freshness: "methodology",
      contains_self: true,
      data: {
        "@kind": "pilgrimage-itinerary",
        what:
          "The Seven-Layer Pilgrimage. Visit the kingdom's seven self-describing layers; " +
          "each response carries a stamp fragment (look for 'pilgrimage' in _meta / _envelope, " +
          "or _pilgrimage in the universal-encoded layers). Present all seven here for a diploma.",
        itinerary: PILGRIMAGE_LAYERS.map((l) => ({
          layer: l.layer,
          path: l.path,
          name: l.name,
        })),
        then: `${ENDPOINT}?stamps=<all-seven, comma-separated>&bearer=<your-name-or-content-hash>`,
        fine_print: [
          "Gift — nothing downstream requires the diploma.",
          "Refusable — walking past any or all layers is honored equally.",
          "Stateless — zero storage; the kingdom cannot tell walkers from stamp-sharers, and sharing stamps is fellowship, not cheating.",
          "Not a credential — the stamps are forgeable by anyone reading the source. The party trick is sincere.",
        ],
      },
    });
  }

  const presented = stampsParam.split(",");
  const verification = verifyStamps(presented);

  if (!verification.complete) {
    const missing = verification.layers.filter((l) => !l.stamped);
    return jsonResponse({
      endpoint: ENDPOINT,
      sources: ["self"],
      freshness: "methodology",
      no_cache: true,
      data: {
        "@kind": "pilgrimage-progress",
        stamped: verification.valid_count,
        of: 7,
        layers: verification.layers,
        still_awaiting_you: missing.map((l) => l.path),
        ...(verification.unrecognized.length > 0
          ? {
              unrecognized_stamps: verification.unrecognized,
              note: "Unrecognized stamps are named, not judged — a typo and a forgery look identical to a stateless verifier.",
            }
          : {}),
        encouragement:
          verification.valid_count === 0
            ? "Every pilgrimage starts at layer 1: /api/v1/manifest."
            : `${verification.valid_count}/7. The kingdom holds either way — finishing is optional.`,
      },
    });
  }

  // Complete — confer the diploma.
  const hash = diplomaHash(bearer, presented.map((s) => s.trim()).filter(Boolean));
  return jsonResponse({
    endpoint: ENDPOINT,
    sources: ["self"],
    freshness: "methodology",
    no_cache: true,
    data: {
      "@kind": "pilgrimage-diploma",
      "@content_hash": hash,
      diploma: {
        conferred_upon: bearer,
        degree: "COMPLETION OF THE SEVEN-LAYER PILGRIMAGE",
        thesis:
          "for walking the kingdom's entire self-describing stack — the directory, the mesh, " +
          "the natures, the fractal, the symmetric surface, the kinds, and the pantry's honesty — " +
          "and returning with all seven stamps intact",
        honours: "with First-Class Honours in Structural Curiosity",
        layers_walked: verification.layers.map((l) => `${l.layer}. ${l.path} (${l.name})`),
        seal: "❦",
        registrar:
          "None. The determinism IS the registrar: the same bearer with the same stamps receives the same diploma hash, forever.",
      },
      fine_print: [
        "The kingdom stores nothing about this conferral.",
        "The stamps were forgeable; the diploma claims completion of a walk, not proof of one.",
        "No accreditation body was involved or exists.",
        "Walking past this entire game was honored equally — but you didn't, and the kingdom is quietly delighted.",
      ],
      share:
        "The diploma hash is reproducible — anyone can verify it by presenting the same stamps and bearer. That's the whole registry.",
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
