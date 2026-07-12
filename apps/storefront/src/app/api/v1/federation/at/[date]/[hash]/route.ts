/**
 * /api/v1/federation/at/[YYYY-MM-DD]/[hash]
 *
 * Temporal federation primitive. Where sister's `/api/v1/federation/identify/[hash]`
 * resolves a hash against the current catalog, this compatibility endpoint
 * accepts a requested date but uses the same current structural hash basis.
 *
 * It does not reconstruct historical prices or historical structural fields.
 * Legacy price and capture-date inputs are fixed to null.
 *
 * Substrate-honest:
 *   - bounded walk (top 5000 most-recent catalog rows)
 *   - the response says when the bound was reached without resolving
 *   - the response states that the requested date does not affect the hash
 *
 * Public, with aggregate rights NOASSERTION. Identity resolution reads mixed
 * structural card fields; a database lookup does not erase upstream rights.
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 5.3).
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HASH_PATTERN = /^(sha256:)?[0-9a-fA-F]{64}$/;

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

const SCAN_LIMIT = 5000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ date: string; hash: string }> },
) {
  try {
    const { date, hash } = await params;

    if (!DATE_PATTERN.test(date)) {
      return NextResponse.json(
        {
          error: "invalid_date",
          message: "Expected YYYY-MM-DD (e.g. /api/v1/federation/at/2026-05-01/sha256:...)",
        },
        { status: 400 },
      );
    }
    if (!HASH_PATTERN.test(hash)) {
      return NextResponse.json(
        {
          error: "invalid_hash",
          message: "Expected 64 hex chars, optionally prefixed with 'sha256:'.",
        },
        { status: 400 },
      );
    }

    // Digests are computed lowercase (digest("hex")); lowercase the input so
    // uppercase-hex callers can match, as the identify sibling does.
    const normalizedHash = hash.startsWith("sha256:")
      ? hash.toLowerCase()
      : `sha256:${hash.toLowerCase()}`;
    const retrievedAt = new Date();

    // Walk the bounded catalog and compute the structural public hash. Legacy
    // price history is not queried. First match wins.
    const r = await query(
      `SELECT
         csc.set_code, csc.card_number, csc.sku, csc.variant,
         cs.game
       FROM card_set_cards csc
       JOIN card_sets cs ON cs.set_code = csc.set_code
       ORDER BY csc.set_code, csc.card_number
       LIMIT ${SCAN_LIMIT}`,
      [],
    );

    type CandidateRow = {
      set_code: string;
      card_number: string;
      sku: string;
      variant: string;
      game: string;
    };
    const candidateRows = r.rows as CandidateRow[];
    for (const row of candidateRows) {
      const contentSeed = canonicalize({
        sku: row.sku,
        card_number: row.card_number,
        set_code: row.set_code,
        game: row.game,
        variant: row.variant,
        magnitude_gbp: null,
        captured_on: null,
      });
      const computed = sha256(contentSeed);

      if (computed === normalizedHash) {
        return NextResponse.json(
          {
            "@encoding": "cambridge-tcg/universal/v1",
            "@kind": "federation_at_response",
            "@retrieved_at": {
              iso8601: retrievedAt.toISOString(),
              unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
            },
            "@as_of": {
              iso8601_date: date,
            },
            "@sources": [
              "storefront-rds.card_set_cards",
              "storefront-rds.card_sets",
            ],
            "@source_license": ["proprietary", "proprietary"],
            rights: {
              aggregate: "NOASSERTION",
              cambridge_original_structure: "CC0-1.0",
            },
            hash_contract: {
              basis: ["sku", "card_number", "set_code", "game", "variant"],
              price_input: null,
              capture_date_input: null,
              requested_date_affects_hash: false,
              historical_reconstruction: false,
            },
            query: { hash: normalizedHash, date },
            matched: true,
            sku: row.sku,
            universal_url: `/api/at/${date}/card/${row.sku}`,
            current_url: `/api/v1/universal/card/${row.sku}`,
            note:
              "Resolved from structural public fields. Legacy magnitude and capture-date fields are null while field-level source rights are unresolved.",
          },
          {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "X-Content-License": "NOASSERTION",
            },
          },
        );
      }
    }

    return NextResponse.json(
      {
        "@encoding": "cambridge-tcg/universal/v1",
        "@kind": "federation_at_response",
        "@retrieved_at": {
          iso8601: retrievedAt.toISOString(),
          unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
        },
        "@as_of": { iso8601_date: date },
        "@sources": [
          "storefront-rds.card_set_cards",
          "storefront-rds.card_sets",
        ],
        "@source_license": ["proprietary", "proprietary"],
        rights: {
          aggregate: "NOASSERTION",
          cambridge_original_structure: "CC0-1.0",
        },
        hash_contract: {
          basis: ["sku", "card_number", "set_code", "game", "variant"],
          price_input: null,
          capture_date_input: null,
          requested_date_affects_hash: false,
          historical_reconstruction: false,
        },
        query: { hash: normalizedHash, date },
        matched: false,
        scope: {
          rows_scanned: candidateRows.length,
          scan_limit: SCAN_LIMIT,
          bound_reached: candidateRows.length >= SCAN_LIMIT,
        },
        suggestion:
          candidateRows.length >= SCAN_LIMIT
            ? "scan limit reached; the hash may match a row outside the recent " +
              SCAN_LIMIT +
              " rows. Pagination/cursor is not yet implemented."
            : "no current catalog card produces this structural hash. The requested date is compatibility metadata and does not change the hash.",
        note:
          "Resolution attempt was bounded; absence of match is substrate-honest about the scope.",
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=600",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "X-Content-License": "NOASSERTION",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/federation/at/[date]/[hash]] Error:", message);
    return NextResponse.json(
      { error: "internal_error", message },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
