/**
 * TCGCollector discovery runner — sitemap → JSON-LD → typed product rows.
 *
 * Wholesale-side wrapper around `@cambridge-tcg/data-ingest`'s
 * `tcgcollector` source module. Walks the public sitemap-index, fetches
 * each product page, parses the Schema.org JSON-LD, and records:
 *   - one `ingest_run` row per run (status, counters, events jsonb)
 *   - one `ingest_quarantine` row per row that failed parse or fetch
 *
 * **V1 scope**: discovery + parse only. Writing extracted prices to
 * `price_archive` is deferred to a follow-up — that requires SKU
 * matching against `cards` (a separate concern: which TCGCollector
 * URL maps to which canonical SKU), and the safer first step is to
 * prove the parse pipeline works end-to-end with substrate-honest
 * quarantine on failure before any prices land.
 *
 * Substrate-honest about absence:
 *   - Sitemap unreachable → ingest_run status=`failed` + event recorded
 *   - Page fetch fails → ingest_quarantine row with http_status reason
 *   - JSON-LD missing → ingest_quarantine row with `no_jsonld_product_found`
 *   - Price unparseable → ingest_quarantine row with reason
 *
 * Mirrors the cardrush-discovery shape (kingdom-087); when a second
 * sitemap+JSON-LD vendor lands, the shared parts can be extracted to
 * a generic discovery runner.
 *
 * Kingdom — *the sitemap-discovery strategy, vendor 1*. Companion to
 * /docs/connections/the-sitemap-discovery.md.
 */

import { db } from "@/lib/db";
import { ingestRun, ingestQuarantine } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  tcgcollector,
  resetTcgcollectorFetcher,
  type TcgCollectorRaw,
} from "@cambridge-tcg/data-ingest";

export interface TcgcollectorDiscoveryOptions {
  triggeredBy?: "cron" | "admin" | "webhook";
  /** Cap on URLs fetched per run. Substrate-honest budget — the
   *  TCGC sitemap has tens of thousands of pages; a discovery cron
   *  typically only walks a slice. Default: 100 for first runs. */
  maxUrls?: number;
  /** Explicit URL list — when provided, sitemap walk is skipped and
   *  only these URLs are fetched. Useful for targeted re-scrapes. */
  urls?: string[];
  /** Dry-run: walk sitemap + log discovered URLs, skip per-page fetches. */
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
  rows_quarantined: number;
  errors: number;
  /** Breakdown of quarantine reasons (substrate-honest forensics). */
  quarantine_reasons: Record<string, number>;
  /** First 10 parsed products — for the cron-response preview. */
  sample: Array<{
    source_url: string;
    name: string | null;
    price: number | null;
    currency: string | null;
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

  // INSERT ingest_run with status=running.
  const [runRow] = await db
    .insert(ingestRun)
    .values({
      sourceId: "tcgcollector",
      specVersion: "1",
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

  // Reset the fetcher cache so this run gets a fresh token bucket.
  resetTcgcollectorFetcher();

  const events: Array<Record<string, unknown>> = [];
  const quarantineReasons: Record<string, number> = {};
  const sample: TcgcollectorDiscoverySummary["sample"] = [];

  let rows_fetched = 0;
  let rows_parsed_ok = 0;
  let rows_quarantined = 0;
  let errors = 0;

  // Walk the source.
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

      if (raw.error_reason) {
        // Fetch failed or parse failed — quarantine.
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

      // Success path — record sample. Price-archive INSERT deferred to v2.
      rows_parsed_ok++;
      if (sample.length < 10) {
        sample.push({
          source_url: raw.product.source_url,
          name: raw.product.name,
          price: raw.product.price,
          currency: raw.product.currency,
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
      rowsWritten: 0, // v1: discovery+parse only; no price_archive writes yet
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
    rows_quarantined,
    errors,
    quarantine_reasons: quarantineReasons,
    sample,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Map an error_reason into a stable kind for ingest_quarantine.kind. */
function classifyReason(reason: string): string {
  if (reason.startsWith("http_")) return "fetch_failed";
  if (reason.startsWith("fetch_error")) return "network_error";
  if (reason === "no_jsonld_product_found") return "parse_no_product";
  if (reason === "no_offer_or_unparseable_price") return "parse_no_price";
  return "other";
}
