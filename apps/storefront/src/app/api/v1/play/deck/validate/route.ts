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
import { CARD_STATS } from "@/lib/play/card-stats";
import { enCardKeyFromParts } from "@/lib/cards/en-card-data";

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

/** Canonical card identity is the CARD NUMBER (CR 5-1-2-3 keys the copy
 *  limit on it). Accepts either a card number ("OP01-025") or a catalog
 *  sku ("OP-OP01-025-JP") and returns the number, or the input unchanged
 *  when it doesn't parse (the checker then reports it unknown). */
function toCardNumber(id: string): string {
  const trimmed = id.trim();
  if (/^[A-Z]+\d*-\w+$/i.test(trimmed) && trimmed.split("-").length === 2) {
    return trimmed.toUpperCase();
  }
  const segs = trimmed.split("-");
  if (segs.length >= 3) {
    return `${segs[1]}-${segs[2]}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

const COLOR_WORDS = new Set([
  "red", "green", "blue", "purple", "black", "yellow",
]);

function parseColors(raw: string | null | undefined): CardMetadata["colors"] {
  if (!raw) return [];
  return raw
    .split(/[/,&]/)
    .map((c) => c.trim().toLowerCase())
    .filter((c): c is CardMetadata["colors"][number] => COLOR_WORDS.has(c));
}

/**
 * Load card metadata for every card NUMBER mentioned in the declaration.
 *
 * Three sources, richest first — substrate-honest about what came from where:
 *   1. CARD_STATS (encoded starter corpus: category/colors/cost/counter/life,
 *      researched from the official cardlist).
 *   2. card_texts.attributes (bandai-en ingest: official structured facts).
 *   3. Catalog rarity heuristic (category only; colors stay unknown and the
 *      color check skips for that card).
 */
async function loadCardMetadata(
  cardNumbers: Set<string>,
): Promise<{
  lookup: Map<string, CardMetadata>;
  colors_unknown_for: string[];
}> {
  if (cardNumbers.size === 0) {
    return { lookup: new Map(), colors_unknown_for: [] };
  }
  const ids = Array.from(cardNumbers);
  const lookup = new Map<string, CardMetadata>();

  // Source 3 groundwork: catalog rows for set_code + rarity heuristic.
  const r = await query(
    `SELECT DISTINCT ON (csc.card_number)
       csc.card_number,
       csc.rarity,
       cs.set_code
     FROM card_set_cards csc
     JOIN card_sets cs ON cs.set_code = csc.set_code
     WHERE csc.card_number = ANY($1::text[])`,
    [ids],
  );
  for (const row of r.rows) {
    const rarity = ((row.rarity as string | null) ?? "").toUpperCase();
    lookup.set(row.card_number as string, {
      card_id: row.card_number as string,
      category: rarity.split("/")[0] === "L" ? "leader" : "character",
      colors: [],
      set_code: row.set_code as string,
    });
  }

  // Source 2: official structured attributes from the bandai-en ingest.
  const keyToNumber = new Map<string, string>();
  for (const num of ids) {
    const m = num.match(/^([A-Z]+\d*)-(\w+)$/);
    if (m) keyToNumber.set(enCardKeyFromParts("op", m[1], m[2]), num);
  }
  if (keyToNumber.size > 0) {
    try {
      const t = await query(
        `SELECT sku, attributes FROM card_texts
          WHERE lang = 'en' AND attributes IS NOT NULL AND sku = ANY($1::text[])`,
        [Array.from(keyToNumber.keys())],
      );
      for (const row of t.rows) {
        const num = keyToNumber.get(row.sku as string);
        if (!num) continue;
        const attrs = row.attributes as {
          category?: string | null;
          cost?: string | null;
          counter?: string | null;
          color?: string | null;
        };
        const existing = lookup.get(num);
        const category =
          (attrs.category ?? "").toLowerCase() === "leader"
            ? "leader"
            : (attrs.category ?? "").toLowerCase() === "event"
              ? "event"
              : (attrs.category ?? "").toLowerCase() === "stage"
                ? "stage"
                : (existing?.category ?? "character");
        lookup.set(num, {
          card_id: num,
          category,
          colors: parseColors(attrs.color),
          set_code: existing?.set_code ?? num.split("-")[0],
          cost: attrs.cost != null ? Number(attrs.cost) || null : existing?.cost ?? null,
          counter:
            attrs.counter != null ? Number(attrs.counter) || null : existing?.counter ?? null,
        });
      }
    } catch {
      /* card_texts unavailable — sources 1 and 3 still apply */
    }
  }

  // Source 1: the encoded starter corpus wins where present.
  for (const num of ids) {
    const s = CARD_STATS[num];
    if (!s) continue;
    const existing = lookup.get(num);
    lookup.set(num, {
      card_id: num,
      category: s.category,
      colors: [s.color],
      set_code: existing?.set_code ?? num.split("-")[0],
      cost: s.cost,
      counter: s.counter,
      life: s.life ?? null,
    });
  }

  const colors_unknown_for = ids.filter(
    (num) => lookup.has(num) && lookup.get(num)!.colors.length === 0,
  );
  return { lookup, colors_unknown_for };
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

    // Canonicalize every id to its card number — the official identity
    // (CR 5-1-2-3 keys the 4-copy limit on card number, so two alt-art
    // skus of one number count together).
    const declaration: DeckDeclaration = {
      leader_id: toCardNumber(leader_id),
      main_deck_card_ids: main.map(toCardNumber),
      format,
    };

    const allIds = new Set<string>([
      declaration.leader_id,
      ...declaration.main_deck_card_ids,
    ]);
    const { lookup, colors_unknown_for } = await loadCardMetadata(allIds);

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
        identity: "All ids are canonicalized to card numbers (CR 5-1-2-3 keys the copy limit on card number; alt-art skus of one number count together).",
        color_check: "Live per-card where color data exists (encoded starter corpus, then official bandai-en attributes). Cards with unknown color are skipped, not assumed matching.",
        colors_unknown_for,
        category_sources: "starter corpus > official attributes > rarity heuristic ('L' → leader).",
        banlist: "Official banned/restricted list enforced (see lib/play/banlist.ts for the mirrored page + effective date).",
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
