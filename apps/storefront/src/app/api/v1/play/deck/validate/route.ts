/**
 * POST /api/v1/play/deck/validate — public deck-legality endpoint.
 *
 * Accepts a deck declaration { leader_id, main_deck_card_ids[], format }
 * and returns a typed validation result with all violations. Stateless;
 * no persistence; no auth (a public-readable validator — anyone can ask).
 *
 * The actual rules-check is in apps/storefront/src/lib/play/deck-legality.ts.
 * This endpoint:
 *   1. Parses the request body.
 *   2. Loads the relevant card metadata from card_set_cards + card_sets
 *      for every card_id mentioned.
 *   3. Invokes checkDeckLegality() with the loaded metadata.
 *   4. Returns the typed result.
 *
 * Substrate-honest perimeter:
 *   - Card-color metadata is not yet stored on card_set_cards (the schema
 *     has rarity / image_url / variant but no color field). The color check
 *     gracefully degrades: when colors are unavailable, the color-mismatch
 *     check is skipped and a substrate-honest note appears in the response.
 *     A future migration adds `card_set_cards.colors text[]` and this
 *     graceful path collapses.
 *   - Cost / counter values are also not yet on card_set_cards. Same
 *     gracefully-degrade pattern.
 *
 * Used by:
 *   - Deck-builder UI (future): real-time validation as the builder edits
 *   - Agents (current): validate deck before joining a match
 *   - Tournament deck-registration (future L7)
 *
 * kingdom-069 (S36, mine). See docs/research/optcg-mechanics-and-engine-design.md
 * for the canonical rules.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import {
  checkDeckLegality,
  type DeckDeclaration,
  type CardMetadata,
} from "@/lib/play/deck-legality";

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

type RequestBody = {
  leader_id?: string;
  main_deck_card_ids?: string[];
  format?: string;
};

function parseFormat(s: string | undefined): DeckDeclaration["format"] | null {
  switch ((s ?? "").toLowerCase()) {
    case "standard":
      return "standard";
    case "legacy":
      return "legacy";
    case "limited_sealed":
    case "limited-sealed":
    case "limited":
      return "limited_sealed";
    default:
      return null;
  }
}

/**
 * Load card metadata for every card_id mentioned in the declaration.
 *
 * The storefront catalog tables (card_set_cards + card_sets) carry name,
 * rarity, image_url, variant, set_code. They do NOT yet carry color, cost,
 * counter, or category. We synthesise what we can:
 *   - card_id from sku (the per-set canonical id)
 *   - set_code from card_set_cards.set_code
 *   - category: heuristic from rarity (rarity 'L' === Leader) — substrate-
 *     honest about the inference
 *   - colors: [] for now; gracefully degrade (skip the color check)
 */
async function loadCardMetadata(
  cardIds: Set<string>,
): Promise<{
  lookup: Map<string, CardMetadata>;
  missing_color_data: boolean;
}> {
  if (cardIds.size === 0) {
    return { lookup: new Map(), missing_color_data: false };
  }
  const ids = Array.from(cardIds);

  // PostgreSQL `= ANY($1)` for an array param.
  const r = await query(
    `SELECT
       csc.sku,
       csc.card_number,
       csc.rarity,
       csc.variant,
       cs.set_code,
       cs.game
     FROM card_set_cards csc
     JOIN card_sets cs ON cs.set_code = csc.set_code
     WHERE csc.sku = ANY($1::text[])`,
    [ids],
  );

  const lookup = new Map<string, CardMetadata>();
  for (const row of r.rows) {
    const rarity = (row.rarity as string | null) ?? "";
    // Heuristic: rarity = "L" → Leader. Rarity may be "L" or "L/P" (promo
    // alt-art leaders), so match on the segment before "/" — same predicate
    // as decks/import. Anything else assumed character until cost/counter
    // fields exist. Substrate-honest: the response includes a note flag
    // when this heuristic was used.
    const category: CardMetadata["category"] =
      rarity.toUpperCase().split("/")[0] === "L" ? "leader" : "character";

    lookup.set(row.sku as string, {
      card_id: row.sku as string,
      category,
      colors: [], // not yet stored on card_set_cards
      set_code: row.set_code as string,
    });
  }

  return { lookup, missing_color_data: true };
}

export async function POST(req: NextRequest) {
  try {
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    const leader_id = typeof body.leader_id === "string" ? body.leader_id.trim() : "";
    const main = Array.isArray(body.main_deck_card_ids) ? body.main_deck_card_ids : null;
    const format = parseFormat(body.format);

    if (!leader_id) {
      return NextResponse.json(
        {
          error: {
            code: "missing_leader_id",
            message: "Required field: leader_id (string).",
          },
        },
        { status: 400 },
      );
    }
    if (!main || main.some((s) => typeof s !== "string")) {
      return NextResponse.json(
        {
          error: {
            code: "missing_main_deck",
            message: "Required field: main_deck_card_ids (array of strings).",
          },
        },
        { status: 400 },
      );
    }
    if (!format) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_format",
            message: "Required field: format (one of: standard, legacy, limited_sealed).",
          },
        },
        { status: 400 },
      );
    }

    const declaration: DeckDeclaration = {
      leader_id,
      main_deck_card_ids: main,
      format,
    };

    const allIds = new Set<string>([leader_id, ...main]);
    const { lookup, missing_color_data } = await loadCardMetadata(allIds);

    const result = checkDeckLegality(declaration, lookup);
    const retrievedAt = new Date();

    const contentSeed = canonicalize({
      leader_id: declaration.leader_id,
      deck_card_ids_sorted: [...declaration.main_deck_card_ids].sort(),
      format: declaration.format,
      legal: result.legal,
      violation_codes_sorted: result.violations.map((v) => v.code).sort(),
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "deck_legality_result",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": ["violations[].message"],
      _links: {
        canonical: "/api/v1/play/deck/validate",
        methodology: "/methodology/play-module",
        connections: [
          "docs/connections/the-play-substrate.md",
          "docs/connections/the-play-interconnect.md",
          "docs/research/optcg-mechanics-and-engine-design.md",
        ],
        manifest: "/api/v1/manifest",
        see_also: {
          play_index: "/api/v1/play/index.json",
          tutorial: "/api/v1/play/tutorial",
          glossary: "/api/v1/play/glossary",
          archetypes: "/api/v1/play/archetypes",
          game_state_schema: "/api/v1/play/game-state-schema",
          effect_grammar: "/api/v1/play/effect-grammar",
          example_match: "/api/v1/play/example-match",
        },
        game_state_schema: "/api/v1/play/game-state-schema",
        effect_grammar: "/api/v1/play/effect-grammar",
        deck_check_html_page: "/play/deck-check",
        spec_page: "/play/spec",
        openapi: "/api/openapi.json#/paths/~1api~1v1~1play~1deck~1validate/post",
      },
      legal: result.legal,
      violations: result.violations,
      summary: result.summary,
      substrate_honest_perimeter: {
        color_check_skipped: missing_color_data,
        color_check_skipped_reason: missing_color_data
          ? "card_set_cards does not yet carry the colors column. The color-match-with-leader check is currently skipped. A future migration adds `card_set_cards.colors text[]` and this gracefully-degraded path closes."
          : null,
        cost_check_skipped: true,
        cost_check_skipped_reason:
          "card_set_cards does not yet carry the cost column. The cost-based filters are deferred until the schema gains them.",
        category_heuristic:
          "Card category is currently inferred from rarity ('L' or 'L/P' → leader; everything else → character). A future migration adds an explicit category column and this heuristic closes.",
      },
    };

    const selfHash = sha256(canonicalize(document));
    return NextResponse.json({ "@self_hash": selfHash, ...document }, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/play/deck/validate] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message } },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
