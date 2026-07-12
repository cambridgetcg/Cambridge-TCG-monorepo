/**
 * POST /api/cron/ingest/bandai-en
 *
 * Official English card data — names, effect text, publisher sample
 * images — from Bandai's EN cardlist sites into the storefront's
 * `card_texts` + `card_images` (migration 0116, provenance-first).
 * Source module: `packages/data-ingest/src/bandai-en/` (op implemented;
 * dbf/dmw/una/bsr are substrate-honest stubs that yield nothing and
 * emit an actionable error). Policy: docs/EN-CARD-DATA.md.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}  OR  Vercel Cron header
 * (`@/lib/cron-auth`, same gate as /api/cron/maintenance).
 *
 * Query params:
 *   ?game=op|dbf|dmw|una|bsr — which Bandai EN site (default 'op')
 *   ?series=569101,569102    — explicit series ids; omitted = discover
 *                              from the cardlist page's own <select>
 *   ?max_series=NN           — cap on series pages fetched (backfill in
 *                              polite batches; the source throttles to
 *                              1 req/2s, so a full 52-series op walk is
 *                              a long run — batch it)
 *   ?dryRun=1                — read + normalize + count, write nothing;
 *                              max_series defaults to 1 for review
 *
 * Returns `{ ok, read, written_texts, written_images, quarantined,
 * dryRun, ... }`. "written" counts rows the upsert actually changed —
 * re-running with an unchanged upstream writes 0 (the ON CONFLICT
 * guard only accepts strictly newer `retrieved_at`).
 *
 * ── Where the rows land (the join key) ────────────────────────────────
 *
 * EN skus mostly don't exist in `card_set_cards` yet, so rows are keyed
 * by the language-and-variant-stripped uppercase EN sku base
 * (`OP-OP01-001-EN`) that JP market pages derive from their own sku.
 * The decision and its four reasons live in ONE place:
 * `@/lib/cards/en-card-data.ts` — this route builds the key with that
 * module's `enCardKeyFromParts` so write and read can never drift.
 * Parallel prints (`-p1` variant tails): text upserts onto the base key
 * (rules text is identical across prints); images keep the variant tail
 * appended (`OP-OP01-001-EN-P1`) so parallel art is preserved without
 * clobbering the base sample.
 *
 * TODO(EN-CARD-DATA §5): S3 mirroring. `s3_key` is written NULL — the
 * `ctcg-card-images` bucket doesn't exist yet (needs Yu, rollout §6.5a).
 * When it lands, add a mirror step here (download → sha256 → put to
 * s3://ctcg-card-images/{lang}/{game}/{set}/{CARD_NO}[_variant].{ext}
 * + thumb/ ~300px → UPDATE s3_key/width/height/sha256), and whitelist
 * the bucket host in next.config.ts. Never touches jp-*-photos.
 *
 * ── No ingest_run / ingest_quarantine here (yet) ──────────────────────
 *
 * The storefront RDS has neither table (they're wholesale-side; the
 * merge draft is drizzle/drafts/0102). Run bookkeeping therefore lives
 * in this response body + Vercel logs, and quarantined rows are counted
 * + logged, not persisted. Substrate-honest: the summary says exactly
 * what was and wasn't kept.
 *
 * ── The cron entry (operator flips it on) ─────────────────────────────
 *
 * vercel.json is strict JSON — comments break the deploy — so the house
 * "shipped commented-out" pattern (kingdom-083, the ebay route) carries
 * the entry here, paste-ready. After the first manual run looks right
 * (start with `?dryRun=1`, then `?max_series=2`), add to
 * apps/storefront/vercel.json "crons":
 *
 *   {
 *     "path": "/api/cron/ingest/bandai-en?game=op&max_series=6",
 *     "schedule": "30 2 * * *"
 *   }
 *
 * (Daily, off-peak, six series per night ≈ full op catalogue refresh
 * every ~9 days at 1 req/2s politeness. Tighten once verified.)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  bandaiEn,
  runSource,
  type BandaiEnContext,
  type BandaiEnGameKey,
  type CanonicalCard,
} from "@cambridge-tcg/data-ingest";
import { requireCronAuth } from "@/lib/cron-auth";
import { enCardKeyFromParts } from "@/lib/cards/en-card-data";
import { query } from "@/lib/db";

export const maxDuration = 800; // seconds — Vercel fluid-function ceiling

const VALID_GAMES: readonly BandaiEnGameKey[] = [
  "op",
  "dbf",
  "dmw",
  "una",
  "bsr",
] as const;

function parseGame(raw: string | null): BandaiEnGameKey {
  if (raw && (VALID_GAMES as readonly string[]).includes(raw)) {
    return raw as BandaiEnGameKey;
  }
  return "op";
}

function parseSeries(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9]+$/.test(s));
  return ids.length > 0 ? ids : undefined;
}

/** Pull the policy quartet out of `CanonicalCard.extra` without trusting
 *  its shape (extra is a free-form bag; the writers need strings). */
function extraString(
  extra: CanonicalCard["extra"],
  key: string,
): string | null {
  const v = extra?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const game = parseGame(url.searchParams.get("game"));
  const series = parseSeries(url.searchParams.get("series"));
  const dryRun = url.searchParams.get("dryRun") === "1";
  const maxSeriesParam = url.searchParams.get("max_series");

  // dryRun reviews one series page by default — enough to eyeball the
  // parse + the would-write counts without a long polite walk.
  const max_series = maxSeriesParam
    ? parseInt(maxSeriesParam, 10)
    : dryRun
      ? 1
      : undefined;

  let written_texts = 0;
  let written_images = 0;

  const ctx: BandaiEnContext = {
    bandai_en: { game, series, max_series },
  };

  try {
    const summary = await runSource(
      bandaiEn,
      ctx,
      {
        write: async (record) => {
          // The join key — one truth in @/lib/cards/en-card-data.ts.
          const baseKey = enCardKeyFromParts(
            record.game,
            record.set,
            record.number,
          );

          const sourceUrl = extraString(record.extra, "source_url");
          const attribution = extraString(record.extra, "attribution");
          const retrievedAt =
            extraString(record.extra, "retrieved_at") ??
            new Date().toISOString();

          if (!attribution) {
            // attribution is NOT NULL by schema and by policy — a record
            // without a credit line cannot enter the catalogue. Treat as
            // quarantine-shaped (counted in errors by the runner's write
            // failure path).
            throw new Error(`${record.sku}: missing attribution in extra`);
          }

          if (dryRun) {
            // Count what WOULD be written; touch nothing.
            written_texts += 1;
            if (record.image_url) written_images += 1;
            return;
          }

          // card_texts — base key always (rules text is print-invariant).
          // Update only when the incoming fetch is strictly newer, so a
          // replayed older page can never regress a fresher row.
          const textRes = await query(
            `INSERT INTO card_texts
               (sku, lang, effect_text, card_type, source, source_url, attribution, retrieved_at)
             VALUES ($1, 'en', $2, $3, 'bandai-en', $4, $5, $6)
             ON CONFLICT (sku, lang) DO UPDATE SET
               effect_text  = EXCLUDED.effect_text,
               card_type    = EXCLUDED.card_type,
               source       = EXCLUDED.source,
               source_url   = EXCLUDED.source_url,
               attribution  = EXCLUDED.attribution,
               retrieved_at = EXCLUDED.retrieved_at
             WHERE EXCLUDED.retrieved_at > card_texts.retrieved_at`,
            [
              baseKey,
              record.oracle_text ?? null,
              record.type ?? null,
              sourceUrl,
              attribution,
              retrievedAt,
            ],
          );
          written_texts += textRes.rowCount ?? 0;

          // card_images — official publisher sample. Parallel prints keep
          // their variant tail so alt art never clobbers the base sample.
          // s3_key stays NULL until the mirror step exists (TODO in the
          // route header, EN-CARD-DATA §5). The upsert deliberately does
          // NOT touch s3_key or takedown_status: a takedown survives
          // re-ingest, and a mirrored object isn't forgotten by a refresh.
          if (record.image_url) {
            const imageKey = record.variant
              ? `${baseKey}-${record.variant.toUpperCase()}`
              : baseKey;
            const imgRes = await query(
              `INSERT INTO card_images
                 (sku, lang, kind, source, source_url, s3_key, attribution, retrieved_at)
               VALUES ($1, 'en', 'official_sample', 'bandai-en', $2, NULL, $3, $4)
               ON CONFLICT (sku, lang, kind, source) DO UPDATE SET
                 source_url   = EXCLUDED.source_url,
                 attribution  = EXCLUDED.attribution,
                 retrieved_at = EXCLUDED.retrieved_at
               WHERE EXCLUDED.retrieved_at > card_images.retrieved_at`,
              [imageKey, record.image_url, attribution, retrievedAt],
            );
            written_images += imgRes.rowCount ?? 0;
          }
        },
        quarantine: async ({ reason }) => {
          // No ingest_quarantine table on the storefront RDS (see route
          // header) — counted by the runner, named in the logs, honest
          // about not being persisted.
          console.warn(`[ingest/bandai-en] quarantine (not persisted): ${reason}`);
        },
      },
      // Runaway-shape guard: if the upstream DOM changed and everything
      // quarantines, stop early instead of politely hammering the site.
      { max_quarantines: 50 },
    );

    // Stub games (implemented: false) emit an error event and yield 0
    // rows — surface that plainly instead of a silent all-zero success.
    const errorEvents = summary.events
      .filter((e) => e.kind === "error")
      .map((e) => e.detail);

    return NextResponse.json({
      ok: true,
      game,
      series: series ?? "discovered",
      read: summary.rows_read,
      written_texts,
      written_images,
      quarantined: summary.rows_quarantined,
      errors: summary.errors,
      error_events: errorEvents.slice(0, 10),
      started_at: summary.started_at,
      finished_at: summary.finished_at,
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INTERNAL", message },
      },
      { status: 500 },
    );
  }
}

// GET as a convenience for operator manual triggers (and Vercel Cron,
// which issues GET). The body shape is identical.
export const GET = POST;
