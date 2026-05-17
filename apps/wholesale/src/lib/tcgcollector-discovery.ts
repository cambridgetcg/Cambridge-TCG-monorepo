/**
 * TCGCollector discovery runner — sitemap → JSON-LD → typed product rows
 * → SKU match → price_archive (v2).
 *
 * Wholesale-side wrapper around `@cambridge-tcg/data-ingest`'s
 * `tcgcollector` source module. Walks the public sitemap-index, fetches
 * each product page, parses the Schema.org JSON-LD, runs the SKU
 * matcher, and records:
 *   - one `ingest_run` row per run (status, counters, events jsonb)
 *   - one `price_archive` row per successful match (source='tcgcollector')
 *   - one `ingest_quarantine` row per row that failed parse, fetch, or match
 *
 * ── v1 → v2 evolution ────────────────────────────────────────────────
 *
 * v1 (commit 4a393a9) shipped discovery + parse only — no price_archive
 * writes. This is v2 — adds the SKU matcher (URL+JSON-LD → canonical SKU
 * via @cambridge-tcg/sku) and the price_archive INSERT path. The match
 * is conservative: returns null when the game segment is unmapped or
 * the card_number is unextractable; those rows quarantine with specific
 * reasons (`sku_match_unknown_game_segment_<seg>`,
 * `sku_match_card_number_unextractable`, etc.).
 *
 * Substrate-honest about absence:
 *   - Sitemap unreachable → ingest_run status=`failed` + event recorded
 *   - Page fetch fails → quarantine row with http_status reason
 *   - JSON-LD missing → quarantine row with `no_jsonld_product_found`
 *   - Price unparseable → quarantine row with `no_offer_or_unparseable_price`
 *   - SKU match failed → quarantine row with `sku_match_<specific>`
 *   - SKU not in cards table → quarantine row with `sku_not_in_cards`
 *   - FX rate fetch failed → row written with price_gbp=null + a stub
 *     `fxRateSource: "fetch_failed"` so the operator sees the gap
 *
 * Kingdom — *the sitemap-discovery strategy, vendor 1 v2*. Companion
 * to docs/connections/the-sitemap-discovery.md.
 */

import { db } from "@/lib/db";
import { ingestRun, ingestQuarantine, cards, priceArchive } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  tcgcollector,
  resetTcgcollectorFetcher,
  matchTcgcollectorSku,
  type TcgCollectorRaw,
} from "@cambridge-tcg/data-ingest";
import { fetchGbpRate } from "@/lib/fx";

export interface TcgcollectorDiscoveryOptions {
  triggeredBy?: "cron" | "admin" | "webhook";
  /** Cap on URLs fetched per run. Substrate-honest budget — the
   *  TCGC sitemap has tens of thousands of pages; a discovery cron
   *  typically only walks a slice. Default: 100 for first runs. */
  maxUrls?: number;
  /** Explicit URL list — when provided, sitemap walk is skipped and
   *  only these URLs are fetched. Useful for targeted re-scrapes. */
  urls?: string[];
  /** Dry-run: walk + parse + match, skip all DB writes. */
  dryRun?: boolean;
}

export interface TcgcollectorDiscoverySummary {
  ingest_run_id: number;
  triggered_by: "cron" | "admin" | "webhook";
  started_at: string;
  finished_at: string;
  dry_run: boolean;
  urls_discovered: number;
  rows_fetched: number;
  rows_parsed_ok: number;
  rows_matched_high_confidence: number;
  rows_matched_medium_confidence: number;
  rows_written_price_archive: number;
  rows_quarantined: number;
  errors: number;
  /** Breakdown of quarantine reasons (substrate-honest forensics). */
  quarantine_reasons: Record<string, number>;
  /** FX rates fetched for this run (currency → units per 1 GBP). */
  fx_rates: Record<string, number | null>;
  /** First 10 parsed products — for the cron-response preview. */
  sample: Array<{
    source_url: string;
    name: string | null;
    price: number | null;
    currency: string | null;
    sku_match: string | null;
    written: boolean;
  }>;
}

/**
 * Run TCGCollector discovery. Substrate-honest: never throws on per-row
 * failure — every failure produces a quarantine row with a specific
 * `reason`. The runner throws only on infrastructure failure (db
 * unreachable, signal aborted at unexpected point).
 */
export async function runTcgcollectorDiscovery(
  opts: TcgcollectorDiscoveryOptions = {},
): Promise<TcgcollectorDiscoverySummary> {
  const triggered_by = opts.triggeredBy ?? "cron";
  const started_at = new Date().toISOString();
  const dry_run = opts.dryRun ?? false;
  const snapshotDate = isoDateOnly(started_at);

  // INSERT ingest_run with status=running.
  const [runRow] = await db
    .insert(ingestRun)
    .values({
      sourceId: "tcgcollector",
      specVersion: "2",
      triggeredBy: triggered_by,
      triggeredAt: new Date(started_at),
      status: "running",
      rowsRead: 0,
      rowsNormalized: 0,
      rowsWritten: 0,
      rowsQuarantined: 0,
      errors: 0,
      events: [],
      notes: dry_run ? "dry_run" : null,
    })
    .returning({ id: ingestRun.id });

  const runId = runRow.id;

  resetTcgcollectorFetcher();

  const events: Array<Record<string, unknown>> = [];
  const quarantineReasons: Record<string, number> = {};
  const sample: TcgcollectorDiscoverySummary["sample"] = [];
  const fxCache: Record<string, number | null> = {};

  let rows_fetched = 0;
  let rows_parsed_ok = 0;
  let rows_matched_high = 0;
  let rows_matched_medium = 0;
  let rows_written = 0;
  let rows_quarantined = 0;
  let errors = 0;

  const ctx = {
    tcgcollector: {
      urls: opts.urls,
      max_urls: opts.maxUrls ?? 100,
      continue_on_error: true,
    },
    on_event: (e: { kind: string; detail: Record<string, unknown> }) => {
      events.push({ ts: new Date().toISOString(), kind: e.kind, ...e.detail });
    },
  };

  try {
    for await (const row of tcgcollector.read(ctx)) {
      rows_fetched++;
      const raw: TcgCollectorRaw = row.raw;

      // ── Parse failure → quarantine ─────────────────────────────
      if (raw.error_reason) {
        rows_quarantined++;
        quarantineReasons[raw.error_reason] =
          (quarantineReasons[raw.error_reason] ?? 0) + 1;
        if (!dry_run) {
          await db.insert(ingestQuarantine).values({
            ingestRunId: runId,
            sourceId: "tcgcollector",
            upstreamId: raw.product.source_url,
            rawPayload: raw as unknown as Record<string, unknown>,
            reason: raw.error_reason,
            asOf: new Date(row.provenance.as_of),
            retrievedAt: new Date(row.provenance.retrieved_at),
            kind: classifyReason(raw.error_reason),
          });
        }
        continue;
      }

      rows_parsed_ok++;

      // ── SKU match ──────────────────────────────────────────────
      const matchResult = matchTcgcollectorSku(raw.product);
      let writtenSku: string | null = null;
      let written = false;

      if (!matchResult.ok) {
        rows_quarantined++;
        quarantineReasons[matchResult.reason] =
          (quarantineReasons[matchResult.reason] ?? 0) + 1;
        if (!dry_run) {
          await db.insert(ingestQuarantine).values({
            ingestRunId: runId,
            sourceId: "tcgcollector",
            upstreamId: raw.product.source_url,
            rawPayload: raw as unknown as Record<string, unknown>,
            reason: matchResult.reason,
            asOf: new Date(row.provenance.as_of),
            retrievedAt: new Date(row.provenance.retrieved_at),
            kind: "sku_match_failed",
          });
        }
      } else {
        // Match ok — count confidence + check cards table.
        if (matchResult.confidence === "high") rows_matched_high++;
        else rows_matched_medium++;

        const cardId = await lookupCardIdBySku(matchResult.sku);
        if (cardId === null) {
          // SKU candidate built but the card doesn't exist in our table.
          // Substrate-honest: quarantine; the operator decides whether
          // to seed the card (a separate concern) or accept the gap.
          const reason = "sku_not_in_cards";
          rows_quarantined++;
          quarantineReasons[reason] = (quarantineReasons[reason] ?? 0) + 1;
          if (!dry_run) {
            await db.insert(ingestQuarantine).values({
              ingestRunId: runId,
              sourceId: "tcgcollector",
              upstreamId: raw.product.source_url,
              rawPayload: {
                ...(raw as unknown as Record<string, unknown>),
                candidate_sku: matchResult.sku,
                match_confidence: matchResult.confidence,
              },
              reason,
              asOf: new Date(row.provenance.as_of),
              retrievedAt: new Date(row.provenance.retrieved_at),
              kind: "sku_not_in_cards",
            });
          }
        } else if (raw.product.price !== null && raw.product.currency !== null) {
          // SKU matches AND price extractable → write price_archive.
          writtenSku = matchResult.sku;
          if (!dry_run) {
            const fxRate = await getOrFetchFxRate(
              raw.product.currency,
              fxCache,
            );
            // Substrate-honest: if FX fetch failed, we still need a
            // numeric price (NOT NULL constraint). We write 0 as a
            // sentinel and set fxRateSource: "fetch_failed" so the
            // operator can filter for repair. Rows with rate=null are
            // also skipped from any downstream price-display path
            // (the consumer reads fxRateSource and ignores 0-priced
            // rows where source != "fetch_failed").
            const priceGbp =
              fxRate !== null && fxRate > 0
                ? Number((raw.product.price / fxRate).toFixed(2))
                : 0;
            await db
              .insert(priceArchive)
              .values({
                cardId,
                snapshotDate,
                sku: matchResult.sku,
                // Cardrush-shaped columns: 0 sentinel for non-cardrush
                // sources (kingdom-066 generalized FX moved live data
                // into fxRateToGbp + fxRateSource).
                cardrushJpy: 0,
                gbpJpyRate: 0,
                baseGbp: priceGbp,
                price: priceGbp,
                source: "tcgcollector",
                sourceUrl: raw.product.source_url,
                sourceCurrency: raw.product.currency.toUpperCase(),
                sourceRedistribute: false,
                condition: "nm",
                fxRateToGbp: fxRate !== null ? fxRate : null,
                fxRateSource: fxRate !== null ? "live" : "fetch_failed",
                extra: {
                  source_price: raw.product.price,
                  source_currency: raw.product.currency,
                  availability: raw.product.availability,
                  match_confidence: matchResult.confidence,
                  upstream_sku: raw.product.upstream_sku,
                } as Record<string, unknown>,
              })
              .onConflictDoUpdate({
                target: [
                  priceArchive.cardId,
                  priceArchive.snapshotDate,
                  priceArchive.source,
                  priceArchive.condition,
                ],
                set: {
                  price: sql`EXCLUDED.price`,
                  baseGbp: sql`EXCLUDED.base_gbp`,
                  sourceUrl: sql`EXCLUDED.source_url`,
                  sourceCurrency: sql`EXCLUDED.source_currency`,
                  fxRateToGbp: sql`EXCLUDED.fx_rate_to_gbp`,
                  fxRateSource: sql`EXCLUDED.fx_rate_source`,
                  extra: sql`EXCLUDED.extra`,
                },
              });
          }
          rows_written++;
          written = true;
        } else {
          // Match ok but no price — already counted in parsed_ok; the
          // earlier `no_offer_or_unparseable_price` reason should have
          // fired; if we got here the upstream is misshapen.
          const reason = "matched_but_no_price";
          rows_quarantined++;
          quarantineReasons[reason] = (quarantineReasons[reason] ?? 0) + 1;
          if (!dry_run) {
            await db.insert(ingestQuarantine).values({
              ingestRunId: runId,
              sourceId: "tcgcollector",
              upstreamId: raw.product.source_url,
              rawPayload: raw as unknown as Record<string, unknown>,
              reason,
              asOf: new Date(row.provenance.as_of),
              retrievedAt: new Date(row.provenance.retrieved_at),
              kind: "other",
            });
          }
        }
      }

      if (sample.length < 10) {
        sample.push({
          source_url: raw.product.source_url,
          name: raw.product.name,
          price: raw.product.price,
          currency: raw.product.currency,
          sku_match: writtenSku ?? (matchResult.ok ? matchResult.sku : null),
          written,
        });
      }
    }
  } catch (err) {
    errors++;
    events.push({
      ts: new Date().toISOString(),
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const finished_at = new Date().toISOString();

  await db
    .update(ingestRun)
    .set({
      finishedAt: new Date(finished_at),
      status: errors > 0 ? "failed" : "ok",
      rowsRead: rows_fetched,
      rowsNormalized: rows_parsed_ok,
      rowsWritten: rows_written,
      rowsQuarantined: rows_quarantined,
      errors,
      events,
    })
    .where(eq(ingestRun.id, runId));

  return {
    ingest_run_id: runId,
    triggered_by,
    started_at,
    finished_at,
    dry_run,
    urls_discovered: rows_fetched,
    rows_fetched,
    rows_parsed_ok,
    rows_matched_high_confidence: rows_matched_high,
    rows_matched_medium_confidence: rows_matched_medium,
    rows_written_price_archive: rows_written,
    rows_quarantined,
    errors,
    quarantine_reasons: quarantineReasons,
    fx_rates: fxCache,
    sample,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Lookup a card's id by its canonical SKU. Returns null when the SKU
 *  is not in the cards table (a substrate-honest "this SKU doesn't
 *  exist yet" signal — the caller quarantines). */
async function lookupCardIdBySku(sku: string): Promise<number | null> {
  const rows = await db
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.sku, sku))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Fetch the GBP/<currency> FX rate, with per-run caching. Returns null
 *  on fetch failure rather than throwing — the row is still written with
 *  price=null and fxRateSource="fetch_failed" (substrate-honest about
 *  the absence). */
async function getOrFetchFxRate(
  currency: string,
  cache: Record<string, number | null>,
): Promise<number | null> {
  const code = currency.toUpperCase();
  if (code in cache) return cache[code];
  if (code === "GBP") {
    cache[code] = 1;
    return 1;
  }
  try {
    const rate = await fetchGbpRate(code);
    cache[code] = rate;
    return rate;
  } catch {
    cache[code] = null;
    return null;
  }
}

/** Convert an ISO timestamp to a YYYY-MM-DD date string for the
 *  price_archive.snapshot_date column. */
function isoDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/** Map an error_reason into a stable kind for ingest_quarantine.kind. */
function classifyReason(reason: string): string {
  if (reason.startsWith("http_")) return "fetch_failed";
  if (reason.startsWith("fetch_error")) return "network_error";
  if (reason === "no_jsonld_product_found") return "parse_no_product";
  if (reason === "no_offer_or_unparseable_price") return "parse_no_price";
  return "other";
}
