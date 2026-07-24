/**
 * /api/v1/play/index.json — the play module's API directory.
 *
 * Machine-readable counterpart to /play/spec (HTML). Lists every play
 * resource (API endpoint + library file + UI page + design doc) with
 * its relationships, so an agent landing on any single play endpoint
 * can fetch this once and discover the rest.
 *
 * Both this endpoint and /play/spec render from the same source of truth:
 * apps/storefront/src/lib/play/resources.ts. Add a new play surface →
 * append one entry there → both consumers update. kingdom-077 closed the
 * drift gap; kingdom-073 (S40) created it when the JSON and HTML directories
 * were hand-maintained separately.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  PLAY_RESOURCES,
  PLAY_API_SIBLINGS,
  playResourceCounts,
} from "@/lib/play/resources";

function sha256(input: string): string {
  return "sha256:" + createHash("sha256").update(input).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export async function GET() {
  try {
    const retrievedAt = new Date();
    const counts = playResourceCounts();

    const contentSeed = canonicalize({
      resource_ids: PLAY_RESOURCES.map((r) => r.id).sort(),
      shipped_count: counts.shipped,
      designed_count: counts.designed,
      planned_count: counts.planned,
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "play_module_index",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": ["resources[].blurb"],
      _links: {
        canonical: "/api/v1/play/index.json",
        html_sibling: "/play/spec",
        methodology: "/methodology/play-module",
        connections: [
          "docs/connections/the-play-substrate.md",
          "docs/connections/the-play-structure.md",
          "docs/connections/the-play-interconnect.md",
        ],
        manifest: "/api/v1/manifest",
        see_also: {
          tutorial: PLAY_API_SIBLINGS.tutorial,
          glossary: PLAY_API_SIBLINGS.glossary,
          archetypes: PLAY_API_SIBLINGS.archetypes,
          game_state_schema: PLAY_API_SIBLINGS.game_state_schema,
          effect_grammar: PLAY_API_SIBLINGS.effect_grammar,
          deck_validate: PLAY_API_SIBLINGS.deck_validate,
          example_match: PLAY_API_SIBLINGS.example_match,
          castle_pack: PLAY_API_SIBLINGS.castle_pack,
        },
        openapi: "/api/openapi.json#/paths/~1api~1v1~1play~1index.json/get",
      },
      module: "play",
      module_methodology_url: "/methodology/play-module",
      resource_count: PLAY_RESOURCES.length,
      counts: {
        shipped: counts.shipped,
        designed: counts.designed,
        planned: counts.planned,
      },
      layers: [
        "L0_doc",
        "L1_contract",
        "L2_pure_fn",
        "L3_runtime",
        "L4_engine",
        "UI",
        "policy",
      ],
      archetypes: ["hobbyist", "collector", "competitor"],
      fun_first_stance:
        "The play module carries no commerce affordances. Ratings are skill, not money. Prize pools live under future play-to-earn opt-in (L4+, separate kingdom).",
      resources: PLAY_RESOURCES,
    };

    const selfHash = sha256(canonicalize(document));
    return NextResponse.json(
      { "@self_hash": selfHash, ...document },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/play/index.json] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Internal server error." } },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
