/**
 * /data/catalog.jsonl — bulk export of the storefront card catalog.
 *
 * Streamed JSONL (one JSON object per line). The first line is a manifest
 * header (kind: "catalog_manifest"); the last is a footer (kind:
 * "catalog_footer"); intervening lines are universal-card-shaped sparse
 * documents — one per card in `card_set_cards`.
 *
 * Per-record provenance names the storage tables, not an upstream author.
 * The storefront mirror does not currently preserve field-level rights or
 * source lineage for names, rarity, images, and reference prices. A database
 * row living in Cambridge's RDS does not make its upstream content ours.
 *
 * Aggregate license: NOASSERTION. Cambridge's encoding, schema, hashes, and
 * other original structure remain CC0 under the standards license; upstream
 * card fields retain their source and publisher rights.
 *
 * Content-Encoding: gzip handled at the Vercel CDN layer when the client
 * sends `Accept-Encoding: gzip` (default for ~all HTTP clients). This
 * route emits plain JSONL; the gzipping is transparent.
 *
 * ── Where this export is GENERATED (catalog-commons defect, 2026-07) ──
 *
 * Generation is entirely code-side and entirely HERE: this route streams
 * live from the storefront RDS on every request. There is NO S3-uploaded
 * artifact, no build step, no cron writing a file — /data/catalog.jsonl
 * is this handler.
 *
 * Which games appear is therefore a fact about the SUBSTRATE, not about
 * export logic: the route reads `card_set_cards` (mirror) which is
 * populated only by `apps/storefront/scripts/restock-card-sets.mjs`
 * copying games→sets→cards from the wholesale DB (which itself filters
 * to `active = true` games/sets). When the export shows op/pkm/dbf but
 * not dmw/vng/bsr, the mirror predates those games landing in wholesale
 * (or they're flagged inactive there) and the restock needs a
 * `--allow-prod` re-run; when dbf "lags", the mirror snapshot is stale
 * for the same reason. Two code-side gaps that COULD silently drop
 * games are fixed here regardless:
 *   1. the old INNER JOIN to card_sets dropped every card whose set
 *      metadata row was missing — now a LEFT JOIN with the game code
 *      derived from the SKU prefix as fallback;
 *   2. the export never declared which games it contained — the
 *      manifest line now carries `games_included` (per-game counts) +
 *      `games_missing` (confirmed-in-Atlas games absent from this
 *      export), so a mirror-gap is visible in the payload instead of
 *      silent (substrate honesty).
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 5.1).
 */

import { query } from "@/lib/db";
import { createHash } from "node:crypto";
import { SPEC_VERSION } from "@cambridge-tcg/data-spec";
import { CONFIRMED_GAME_CODES, isGameCode } from "@cambridge-tcg/sku";
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
  /** Null when the card's card_sets row is missing (LEFT JOIN) — the
   *  emitter falls back to deriving the code from the SKU prefix. */
  game: string | null;
  set_name: string | null;
  spot_gbp: string | null;
  captured_on: Date | string | null;
}

/** Game code for a row: the card_sets.game column when the set-metadata
 *  row exists, else the canonical SKU's first segment when it names a
 *  registered Atlas code, else "unknown" (exported honestly rather than
 *  dropped — the manifest's games_included makes the bucket visible). */
function gameForRow(row: CatalogRow): string {
  if (row.game) return String(row.game).toLowerCase();
  const prefix = (row.sku.split("-")[0] ?? "").toLowerCase();
  return isGameCode(prefix) ? prefix : "unknown";
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
  //
  // LEFT JOIN, deliberately (catalog-commons defect, 2026-07): the old
  // INNER JOIN silently dropped every card whose card_sets metadata row
  // was missing — a whole game could vanish from the commons because its
  // set rows lagged its card rows. Every row in card_set_cards exports;
  // absent set metadata degrades to nulls + SKU-derived game code, and
  // the manifest's games_included names what actually shipped.
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
     LEFT JOIN card_sets cs ON cs.set_code = csc.set_code
     ORDER BY cs.game NULLS LAST, csc.set_code, csc.card_number
     LIMIT ${MAX_ROWS}`,
  );

  const rows = r.rows as CatalogRow[];
  const count = rows.length;
  const truncated = count >= MAX_ROWS;

  // Per-game accounting for the manifest line — the export declares which
  // games it carries and which confirmed games are absent, so a stale
  // mirror (restock pending) is visible in the payload, never silent.
  const gamesIncluded: Record<string, number> = {};
  for (const row of rows) {
    const g = gameForRow(row);
    gamesIncluded[g] = (gamesIncluded[g] ?? 0) + 1;
  }
  const gamesMissing = CONFIRMED_GAME_CODES.filter(
    (c) => c !== "tst" && !(c in gamesIncluded),
  );

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
        // Substrate honesty (catalog-commons defect, 2026-07): the export
        // names which games it carries (per-game row counts) and which
        // Atlas-confirmed games are absent. An absent game means the
        // card_set_cards mirror hasn't been restocked with it yet
        // (scripts/restock-card-sets.mjs), NOT that the game doesn't
        // exist upstream. Mirrors: verify against /api/v1/universal/games.
        games_included: gamesIncluded,
        games_missing: gamesMissing,
        retrieved_at: {
          iso8601: retrievedAtIso,
          unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
        },
        sources: ["storefront-rds.card_set_cards", "storefront-rds.card_sets", "storefront-rds.card_price_history"],
        source_license: ["proprietary", "proprietary", "proprietary"],
        license: "NOASSERTION",
        note:
          "Bulk export of the storefront card catalog. Aggregate rights are " +
          "NOASSERTION because storage provenance is not ownership: names, rarity, " +
          "image URLs, and reference prices may originate upstream. Cambridge's " +
          "encoding and original schema remain CC0, but consumers must follow each " +
          "upstream and publisher's terms before mirroring content.",
        rights: {
          cambridge_original_structure: "CC0-1.0",
          upstream_fields: "NOASSERTION",
          field_level_lineage_available: false,
          methodology: "/methodology/data-intentions",
        },
        endpoint: "/data/catalog.jsonl",
        next_recompute_recommended: "daily (catalog freshness budget)",
        // Substrate-honest empty state — count_expected: 0 with no
        // explanation would leave a mirroring agent to infer the
        // platform is trivial rather than mid-restock.
        ...(count === 0
          ? {
              empty_state: {
                why:
                  "The storefront card_sets/card_set_cards mirror has not been " +
                  "restocked from the wholesale catalog since the outage window; " +
                  "the wholesale substrate holds the full catalog. The restock " +
                  "script (apps/storefront/scripts/restock-card-sets.mjs) awaits " +
                  "its production run.",
                working_doors_meanwhile:
                  "https://cambridgetcg.com/api/v1/search/cards (card-number resolver, " +
                  "wholesale-backed, works today) and https://cambridgetcg.com/prices " +
                  "(human-browsable guide).",
                this_will_change:
                  "When the restock lands this export streams every card with no " +
                  "format change — same manifest line, same card shape.",
              },
            }
          : {}),
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
        const game = gameForRow(row);
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
          game,
          variant: row.variant,
          name: row.card_name,
          rarity: row.rarity,
          image_url: row.image_url,
          set_name: row.set_name,
          magnitude_gbp: magnitude,
          captured_on: capturedOn,
        });
        const contentHash = sha256(contentSeed);

        const card = {
          "@encoding": "cambridge-tcg/universal/v1",
          "@kind": "card",
          "@content_hash": contentHash,
          "@density": "sparse",
          "@sources": [
            "storefront-rds.card_set_cards",
            "storefront-rds.card_sets",
            "storefront-rds.card_price_history",
          ],
          "@source_license": ["proprietary", "proprietary", "proprietary"],
          sku: row.sku,
          set_code: row.set_code,
          card_number: row.card_number,
          game,
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
            target_hash: sha256(`set:${game}:${row.set_code}`),
            target_natural_token: row.set_code,
          },
          of_game: {
            target_hash: sha256(`game:${game}`),
            target_natural_token: game,
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
      "X-Content-License": "NOASSERTION",
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
