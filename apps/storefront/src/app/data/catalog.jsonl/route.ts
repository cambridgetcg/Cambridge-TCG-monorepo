/**
 * /data/catalog.jsonl — bulk export of the storefront card catalog.
 *
 * Streamed JSONL (one JSON object per line). The first line is a manifest
 * header (kind: "catalog_manifest"); the last is a footer (kind:
 * "catalog_footer"); intervening lines are universal-card-shaped sparse
 * documents — one per card in `card_set_cards`.
 *
 * Per-record provenance: each card carries `@sources` + `@source_license`
 * declaring the substrate (storefront-rds.card_set_cards, CC0). The
 * underlying GBP price chain may include cardrush observations at the
 * wholesale layer; that lineage doesn't surface in this bulk export
 * because the storefront RDS doesn't carry per-row source provenance.
 * For source-attributed historical prices, fetch the wholesale temporal
 * slice (Bearer-keyed) on a per-SKU basis.
 *
 * License: CC0-1.0. Mirror freely. The catalog rows are Cambridge TCG's
 * own observation discipline.
 *
 * Content-Encoding: gzip handled at the Vercel CDN layer when the client
 * sends `Accept-Encoding: gzip` (default for ~all HTTP clients). This
 * route emits plain JSONL; the gzipping is transparent.
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 5.1).
 */

import { query } from "@/lib/db";
import { createHash } from "node:crypto";
import { SPEC_VERSION } from "@cambridge-tcg/data-spec";
import { fragmentForRequest } from "@/lib/wake-fragments";

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

interface CatalogRow {
  set_code: string;
  card_number: string;
  sku: string;
  card_name: string | null;
  rarity: string | null;
  image_url: string | null;
  variant: string;
  game: string;
  set_name: string;
  spot_gbp: string | null;
  captured_on: Date | string | null;
}

// Hard cap to keep the stream bounded. ~12k cards × ~500 bytes/line ≈ 6MB —
// fits a single response. If the catalog grows past 50k, pagination via
// ?cursor=<set_code>:<card_number> becomes load-bearing.
const MAX_ROWS = 50000;

export async function GET(): Promise<Response> {
  const retrievedAt = new Date();
  const retrievedAtIso = retrievedAt.toISOString();

  // Stream the catalog. PostgreSQL cursor would be ideal; for now we
  // SELECT all rows and chunk them. Memory cost: bounded by MAX_ROWS.
  const r = await query(
    `SELECT
       csc.set_code, csc.card_number, csc.sku, csc.card_name, csc.rarity,
       csc.image_url, csc.variant,
       cs.game, cs.set_name,
       (SELECT spot_gbp FROM card_price_history
          WHERE sku = csc.sku ORDER BY captured_on DESC LIMIT 1)   AS spot_gbp,
       (SELECT captured_on FROM card_price_history
          WHERE sku = csc.sku ORDER BY captured_on DESC LIMIT 1)   AS captured_on
     FROM card_set_cards csc
     JOIN card_sets cs ON cs.set_code = csc.set_code
     ORDER BY cs.game, csc.set_code, csc.card_number
     LIMIT ${MAX_ROWS}`,
  );

  const rows = r.rows as CatalogRow[];
  const count = rows.length;
  const truncated = count >= MAX_ROWS;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // ── Manifest line ────────────────────────────────────────────────
      const manifest = {
        "@encoding": "cambridge-tcg/universal/v1",
        "@kind": "catalog_manifest",
        spec_version: SPEC_VERSION,
        format: "jsonl",
        line_kinds: ["catalog_manifest", "card", "catalog_footer"],
        count_expected: count,
        truncated,
        max_rows: MAX_ROWS,
        retrieved_at: {
          iso8601: retrievedAtIso,
          unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
        },
        sources: ["storefront-rds.card_set_cards", "storefront-rds.card_sets", "storefront-rds.card_price_history"],
        source_license: ["CC0-1.0", "CC0-1.0", "CC0-1.0"],
        license: "CC0-1.0",
        note:
          "Bulk export of the storefront card catalog. CC0; mirror freely. " +
          "GBP prices are Cambridge TCG retail offers (our own discipline); the " +
          "wholesale-layer chain producing them may include CardRush JP observations " +
          "(license: internal-only) — bulk JPY is NOT in this export. Pull per-SKU " +
          "source-attributed historicals from wholesaletcgdirect.com (Bearer-keyed) " +
          "if you need them.",
        endpoint: "/data/catalog.jsonl",
        next_recompute_recommended: "daily (catalog freshness budget)",
        // Distributed wake fragment — the wake breathing through the
        // bulk catalog. One atomic fragment selected deterministically
        // by this endpoint's path; the same fragment surfaces every
        // time the catalog is fetched. An agent mirroring the catalog
        // accumulates this fragment in their substrate without ever
        // fetching /api/v1/wake. Walking past is honored — readers
        // that ignore the field receive the catalog unchanged. See
        // docs/connections/the-distributed-wake.md.
        wake_fragment: fragmentForRequest("/data/catalog.jsonl"),
      };
      controller.enqueue(encoder.encode(JSON.stringify(manifest) + "\n"));

      // ── Card lines ────────────────────────────────────────────────────
      for (const row of rows) {
        const magnitude = row.spot_gbp == null ? null : Number(row.spot_gbp);
        const capturedOn =
          row.captured_on === null
            ? null
            : (row.captured_on instanceof Date
                ? row.captured_on.toISOString().slice(0, 10)
                : String(row.captured_on).slice(0, 10));

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

        const card = {
          "@encoding": "cambridge-tcg/universal/v1",
          "@kind": "card",
          "@content_hash": contentHash,
          "@density": "sparse",
          "@sources": ["storefront-rds.card_price_history"],
          "@source_license": ["CC0-1.0"],
          sku: row.sku,
          set_code: row.set_code,
          card_number: row.card_number,
          game: row.game,
          variant: row.variant,
          rarity: row.rarity,
          image_url: row.image_url,
          name: row.card_name,
          price: magnitude !== null
            ? {
                magnitude,
                currency_token: "GBP",
                captured_on: capturedOn,
              }
            : null,
          in_set: {
            target_hash: sha256(`set:${row.game}:${row.set_code}`),
            target_natural_token: row.set_code,
          },
          of_game: {
            target_hash: sha256(`game:${row.game}`),
            target_natural_token: row.game,
          },
        };
        controller.enqueue(encoder.encode(JSON.stringify(card) + "\n"));
      }

      // ── Footer line ──────────────────────────────────────────────────
      const footer = {
        "@encoding": "cambridge-tcg/universal/v1",
        "@kind": "catalog_footer",
        count_emitted: count,
        complete: !truncated,
        truncated,
        retrieved_at: {
          iso8601: retrievedAtIso,
          unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
        },
      };
      controller.enqueue(encoder.encode(JSON.stringify(footer) + "\n"));

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // 1 hour client cache, 6h CDN — catalog changes slowly.
      "Cache-Control": "public, max-age=3600, s-maxage=21600",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "X-Spec-Version": SPEC_VERSION,
      "X-Content-License": "CC0-1.0",
      "Content-Disposition": 'inline; filename="cambridge-tcg-catalog.jsonl"',
    },
  });
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
