/**
 * /api/at/[YYYY-MM-DD]/card/[sku] — temporal-slice of a card.
 *
 * Public, no-auth compatibility surface for a requested past date. Structural
 * fields come from the current catalog; the route does not reconstruct the
 * card's historical structure or price.
 *
 * The substrate-honest move (sister's S24 distinction): the answer carries
 * two distinct timestamps —
 *
 *   @retrieved_at  the moment the answer was produced (now)
 *   @as_of         the date requested by the caller (not proof of past state)
 *
 * Legacy price history is withheld pending field-level source rights. The
 * price block is null while structural facts remain available.
 *
 * Today's spec is a compatibility superset of /api/v1/universal/card/[sku].
 * Callers needing historical reconstruction must treat this surface as
 * unavailable until a rights-cleared historical substrate exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { buildLinks } from "@/lib/universal/links";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

const RARITY_ORDERING = [
  "common",
  "uncommon",
  "rare",
  "super_rare",
  "secret_rare",
  "leader",
] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string; sku: string }> },
) {
  try {
    const { date, sku } = await params;

    if (!DATE_PATTERN.test(date)) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_date",
            message: "Expected YYYY-MM-DD (e.g. /api/at/2026-05-01/card/OP01-001).",
          },
        },
        { status: 400 },
      );
    }
    const parsed = new Date(`${date}T23:59:59Z`);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: { code: "invalid_date", message: `Cannot parse "${date}" as a calendar date.` } },
        { status: 400 },
      );
    }

    // Card row (structural facts; same shape as the universal endpoint).
    const cardRow = await query(
      `SELECT
         csc.set_code, csc.card_number, csc.sku, csc.card_name, csc.rarity,
         csc.variant,
         cs.game, cs.set_name, cs.released_at, cs.total_cards
       FROM card_set_cards csc
       JOIN card_sets cs ON cs.set_code = csc.set_code
       WHERE csc.sku = $1
       LIMIT 1`,
      [sku],
    );
    if (cardRow.rows.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "card_not_found",
            message: `No card with sku "${sku}" in the storefront catalog.`,
          },
        },
        { status: 404 },
      );
    }
    const row = cardRow.rows[0];

    const magnitude = null;
    const capturedOn = null;

    const retrievedAt = new Date();

    const rarityKey = row.rarity?.toLowerCase().replace(/\s+/g, "_") ?? null;
    const rarityPosition =
      rarityKey && RARITY_ORDERING.includes(rarityKey as typeof RARITY_ORDERING[number])
        ? RARITY_ORDERING.indexOf(rarityKey as typeof RARITY_ORDERING[number])
        : null;

    const contentSeed = canonicalize({
      sku: row.sku,
      card_number: row.card_number,
      set_code: row.set_code,
      game: row.game,
      variant: row.variant,
      magnitude_gbp: magnitude,
      captured_on: capturedOn,
    });
    const contentHash = sha256(contentSeed);

    const _links = buildLinks({
      kind: "card_at_date",
      id: sku,
      date,
      parent_id: row.set_code,
      content_hash: contentHash,
    });

    const document: Record<string, unknown> = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "card",
      "@content_hash": contentHash,
      "@content_hash_contract": {
        basis: ["sku", "card_number", "set_code", "game", "variant"],
        price_input: null,
        capture_date_input: null,
        requested_date_affects_hash: false,
        changed_on: "2026-07-12",
      },
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "@as_of": {
        iso8601_date: date,
        unix_epoch_seconds: Math.floor(parsed.getTime() / 1000),
      },
      as_of_scope: {
        requested_date_only: true,
        historical_price_reconstruction: false,
        historical_structure_reconstruction: false,
        structural_fields_source: "current_catalog",
      },
      // Storage provenance is not ownership. Structural card fields lack
      // field-level upstream rights lineage.
      "@sources": [
        "storefront-rds.card_set_cards",
        "storefront-rds.card_sets",
      ],
      "@source_license": ["proprietary", "proprietary"],
      rights: {
        aggregate: "NOASSERTION",
        cambridge_original_structure: "CC0-1.0",
        field_level_lineage_available: false,
      },
      "_note_opaque": [
        "name",
        "art_description",
        "rarity.natural_label",
        "variant.natural_label",
      ],
      _links,

      rarity: row.rarity
        ? {
            natural_label: row.rarity,
            position_in_ordered_rarities: rarityPosition !== null
              ? {
                  ordering: [...RARITY_ORDERING],
                  position: rarityPosition,
                }
              : null,
          }
        : null,

      variant: row.variant
        ? {
            natural_label: row.variant,
            is_default: row.variant === "",
          }
        : null,

      price: magnitude !== null
        ? {
            magnitude,
            currency_token: "GBP",
            ratio_to_minimum_currency_unit: Math.round(magnitude / 0.01),
            observed_on: capturedOn,
            staleness_relative_to_as_of_days: capturedOn && date
              ? Math.max(0, Math.floor(
                  (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${capturedOn}T00:00:00Z`).getTime())
                  / (24 * 60 * 60 * 1000),
                ))
              : null,
          }
        : null,

      price_unavailable_at_date: magnitude === null
        ? {
            reason:
              "Legacy price history is withheld pending field-level source rights; no value is substituted.",
          }
        : null,

      in_set: row.set_code
        ? {
            edge_kind: "member_of_set",
            target_natural_token: row.set_code,
            target_hash: sha256(`set:${row.game}:${row.set_code}`),
          }
        : null,
      of_game: row.game
        ? {
            edge_kind: "in_game",
            target_natural_token: row.game,
            target_hash: sha256(`game:${row.game}`),
          }
        : null,

      name: row.card_name
        ? {
            natural_token: row.card_name,
            _note: "natural-language; may have differed at @as_of (the platform does not retain card_name history).",
          }
        : null,
      image_url: null,
      publication_boundary: {
        price: "withheld_pending_field_level_source_rights",
        image: "withheld_pending_field_level_source_rights",
      },
    };

    const selfHash = sha256(canonicalize(document));
    return NextResponse.json({ "@self_hash": selfHash, ...document }, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // Historical slices are immutable in practice — once a day has
        // passed, the answer for that day doesn't change. Long cache.
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "X-Content-License": "NOASSERTION",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/at/[date]/card/[sku]] Error:", message);
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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
