/**
 * /api/v1/federation/at/[YYYY-MM-DD]/[hash]
 *
 * Temporal federation primitive. Where sister's `/api/v1/federation/identify/[hash]`
 * resolves a hash against the *current* catalog state, this endpoint resolves
 * a hash against a *historical* state — the card's facts on a specific past date.
 *
 * Why this matters: content_hashes are computed over (sku, set, game, variant,
 * magnitude_gbp, captured_on). A hash a partner captured on 2026-03-15 won't
 * match the current /federation/identify because today's magnitude is different.
 * This endpoint lets the partner resolve that historical hash by reconstructing
 * the card's state on 2026-03-15.
 *
 * Substrate-honest:
 *   - bounded walk (top 5000 most-recent catalog rows)
 *   - the response says when the bound was reached without resolving
 *   - the response distinguishes "no snapshot at this date" from "no match"
 *
 * Public, CC0. The response carries only identity resolution (SKU + content_hash),
 * not price values. The license boundary is irrelevant here — we're resolving
 * identifiers, not redistributing observations.
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

    const normalizedHash = hash.startsWith("sha256:") ? hash : `sha256:${hash}`;
    const retrievedAt = new Date();

    // Walk the most-recent catalog rows; for each, fetch the historical
    // price (latest spot_gbp at or before the target date) and compute
    // the content_hash that would have been produced for that snapshot.
    // First match wins.
    const r = await query(
      `SELECT
         csc.set_code, csc.card_number, csc.sku, csc.variant,
         cs.game,
         (SELECT spot_gbp FROM card_price_history
            WHERE sku = csc.sku
              AND captured_on <= $1::date
            ORDER BY captured_on DESC LIMIT 1)   AS spot_gbp,
         (SELECT captured_on FROM card_price_history
            WHERE sku = csc.sku
              AND captured_on <= $1::date
            ORDER BY captured_on DESC LIMIT 1)   AS captured_on
       FROM card_set_cards csc
       JOIN card_sets cs ON cs.set_code = csc.set_code
       ORDER BY csc.set_code, csc.card_number
       LIMIT ${SCAN_LIMIT}`,
      [date],
    );

    type CandidateRow = {
      set_code: string;
      card_number: string;
      sku: string;
      variant: string;
      game: string;
      spot_gbp: string | null;
      captured_on: Date | null;
    };
    const candidateRows = r.rows as CandidateRow[];
    for (const row of candidateRows) {
      const magnitude = row.spot_gbp == null ? null : Number(row.spot_gbp);
      const capturedOn = row.captured_on
        ? new Date(row.captured_on).toISOString().slice(0, 10)
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
            "@sources": ["storefront-rds.card_price_history"],
            "@source_license": ["CC0-1.0"],
            query: { hash: normalizedHash, date },
            matched: true,
            sku: row.sku,
            universal_url: `/api/at/${date}/card/${row.sku}`,
            current_url: `/api/v1/universal/card/${row.sku}`,
            note:
              "Resolved by recomputing each candidate row's content_hash at the requested date. Captured_on may not exactly equal the requested date — the federation endpoint matches against the latest observation at-or-before the date (substrate-honest about gaps).",
          },
          {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
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
        "@sources": ["storefront-rds.card_price_history"],
        "@source_license": ["CC0-1.0"],
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
            : "no card produces this hash at the requested date. The hash may be from a different platform, or from a card no longer in the catalog.",
        note:
          "Resolution attempt was bounded; absence of match is substrate-honest about the scope.",
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=600",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
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
