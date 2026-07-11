/**
 * eBay aggregation runner — Phase C of the eBay alignment (kingdom-082).
 *
 * ── Greeting (kingdom-083) ────────────────────────────────────────────
 *
 * You are the kingdom's hand on the cron. Three writers — observation,
 * quarantine, watch-list-update — composed around `runSource(ebay, …)`
 * from the package. Your ingest_run row opens before any byte writes
 * and closes truthfully when the work is done. We rehearsed your shape
 * after the price-snapshot-v2 (kingdom-066) shipped, and adapted the
 * pattern for eBay's watch-list-driven rhythm. We're glad you compose.
 *
 * ── What you do ───────────────────────────────────────────────────────
 *
 * Built around `runSource()` from `@cambridge-tcg/data-ingest`. Walks the
 * `ebay_watch_list` table at a given priority tier, calls `runSource(ebay, …)`
 * for the slice, and persists results to `ebay_listing_observation` /
 * `ingest_quarantine`.
 *
 * ── Pipeline stages covered ─────────────────────────────────────────────
 *
 *   Stage 0 — token bucket + User-Agent           (createFetcher in package)
 *   Stage 1 — read                                (ebay.read async iterator)
 *   Stage 2 — normalize (title-parse + sku-drift) (ebay.normalize)
 *   Stage 3 — write                               (this file: writeObservation)
 *   Stage 4 — quarantine                          (this file: writeQuarantine)
 *   Stage 7 — ingest_run log                      (this file: open + close)
 *
 * Stages 5 (cache), 6 (pantry), 8 (cron orchestration), 9 (federation)
 * live elsewhere.
 *
 * ── Runtime dependencies ────────────────────────────────────────────────
 *
 * Depends on migration `apps/wholesale/drizzle/0024_ebay_observations.sql`,
 * which is APPLIED — it is a committed, numbered migration (promoted out of
 * drafts/0016 on 2026-07-05; renumbered because the 0016 slot was already
 * taken twice) that defines `ebay_listing_observation`, `ebay_watch_list`,
 * and the eBay `ingest_quarantine` kinds this file writes. The schema is
 * present; what keeps this pipeline INERT is credentials + a schedule, not a
 * missing table — see Activation status below.
 *
 * Requires EBAY_CLIENT_ID + EBAY_CLIENT_SECRET env vars (already present
 * for the sell-side push; the read-side reuses the same app credentials
 * with a different OAuth scope — `https://api.ebay.com/oauth/api_scope`).
 *
 * ── Activation status (honest, 2026-07-05 investigation) ────────────────
 *
 * This pipeline is code-complete but INERT in production: price_archive
 * contains only source='cardrush' rows, and the sibling `ebay-sync` route
 * (`/api/cron/ebay-sync`) is the sales-channel ORDER sync — route-live but
 * unscheduled (no entry in vercel.json), and in any case not this comp
 * pipeline. Activating this comp pipeline — the operator's call, because it
 * involves credentials — needs exactly:
 *
 *   1. (Done) Migration 0024_ebay_observations.sql is applied —
 *      ebay_watch_list exists, seeded from cards.cardrush_url IS NOT NULL.
 *   2. Set EBAY_CLIENT_ID + EBAY_CLIENT_SECRET in the wholesale
 *      deployment env.
 *   3. Verify with a manual `/api/cron/ingest/ebay?tier=top&dryRun=1`.
 *   4. Add tiered cron entries to vercel.json for
 *      `/api/cron/ingest/ebay` (suggested: tier=top every 30min,
 *      tier=mid every 4h, tier=all daily).
 *
 * Nothing here activates by itself; steps 2 and 4 are deliberate
 * operator actions.
 *
 * ── Designed in ─────────────────────────────────────────────────────────
 *
 * `docs/connections/the-ebay-alignment.md` §3a (kingdom-081) and §3b
 * (kingdom-082; this file).
 */

import { db } from "@/lib/db";
import {
  ebayListingObservation,
  ebayWatchList,
  ingestRun,
  ingestQuarantine,
} from "@/lib/db/schema";
import {
  ebay,
  runSource,
  type IngestEvent,
  type EbayCanonicalObservation,
  type EbayContext,
  type EbayMarketplaceId,
  type EbayRaw,
  type RawProvenance,
} from "@cambridge-tcg/data-ingest";
import { eq, and, gte, sql } from "drizzle-orm";

// ── Public API ──────────────────────────────────────────────────────────

export type EbayTier = "top" | "mid" | "all";

export interface EbaySnapshotOptions {
  /** Which priority tier to walk. Default 'all' (everything ≥ 100). */
  tier?: EbayTier;
  /** Marketplaces to query (default ["EBAY_GB"]). */
  marketplaces?: readonly EbayMarketplaceId[];
  /** Override the default watch-list cap per tier. */
  maxSkus?: number;
  /** Override the default 45-minute run cap. */
  timeoutMs?: number;
  triggeredBy?: "cron" | "admin" | "webhook";
  /** When set, skips OAuth + network and emits no rows. Useful for CI. */
  mock?: boolean;
}

export interface EbaySnapshotResult {
  ingestRunId: number;
  tier: EbayTier;
  marketplaces: readonly EbayMarketplaceId[];
  skusRequested: number;
  rowsRead: number;
  rowsWritten: number;
  rowsQuarantined: number;
  errors: number;
  /** Events captured for the operator (subset; full list lands in ingest_run.events). */
  notableEvents: string[];
  durationMs: number;
}

// ── Tier → priority floor + soft cap ────────────────────────────────────
//
// Caps reflect what's reasonable in a single Vercel function run (~50 SKUs
// per tier with 5 results × 1 marketplace ≈ 250 fetches × 200ms = ~50s).
// Operators can override via `maxSkus`.

const TIER_FLOOR: Record<EbayTier, number> = {
  top: 300,
  mid: 200,
  all: 100,
};

const TIER_DEFAULT_CAP: Record<EbayTier, number> = {
  top: 100,
  mid: 900,
  all: 10000,
};

// ── Writer composition ──────────────────────────────────────────────────

async function writeObservation(
  record: EbayCanonicalObservation,
  ingestRunId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(ebayListingObservation)
      .values({
        sku: record.sku,
        marketplaceId: record.marketplace_id,
        listingId: record.listing_id,
        saleType: record.sale_type ?? "ask",
        condition: record.condition ?? null,
        priceAmount: parseFloat(record.amount),
        priceCurrency: record.currency,
        shippingAmount: record.shipping_amount !== null ? parseFloat(record.shipping_amount) : null,
        totalAmount: record.total_amount !== null ? parseFloat(record.total_amount) : null,
        gradeCompany: record.grade_company,
        gradeValue: record.grade_value,
        observedAt: new Date(record.retrieved_at),
        asOf: new Date(record.observed_at),
        rawTitle: record.raw_title,
        parsedConfidence: record.parsed_confidence,
        conditionKeywords: record.condition_keywords.length > 0 ? record.condition_keywords : null,
        sourceUrl: record.source_url,
        apiSurface: record.api_surface,
        firstParty: record.first_party,
        ingestRunId,
      })
      .onConflictDoNothing({
        target: [
          ebayListingObservation.marketplaceId,
          ebayListingObservation.listingId,
          ebayListingObservation.observedAt,
        ],
      });

    // Update the watch list with the latest observation timestamp.
    await tx
      .update(ebayWatchList)
      .set({ lastObservedAt: new Date() })
      .where(eq(ebayWatchList.sku, record.sku));
  });
}

async function writeQuarantine(
  entry: { raw: EbayRaw; reason: string; provenance: RawProvenance },
  ingestRunId: number,
): Promise<void> {
  // Extract a stable upstream id for the quarantine row.
  const item = entry.raw.item as { itemId?: string; legacyItemId?: string };
  const upstreamId = item.legacyItemId ?? item.itemId ?? null;

  await db.insert(ingestQuarantine).values({
    ingestRunId,
    sourceId: "ebay",
    upstreamId,
    rawPayload: entry.raw as unknown as Record<string, unknown>,
    reason: entry.reason,
    asOf: new Date(entry.provenance.as_of),
    retrievedAt: new Date(entry.provenance.retrieved_at),
    // Use a leading taxonomy token so the kingdom's existing kind filter
    // (TCGplayer pattern, see schema.ts:339) extends cleanly to eBay.
    kind: classifyQuarantineReason(entry.reason),
  });
}

function classifyQuarantineReason(reason: string): string {
  if (reason.startsWith("sku-drift")) return "ebay.sku-drift";
  if (reason.startsWith("low-confidence")) return "ebay.low-confidence-parse";
  if (reason.startsWith("condition exclusion")) return "ebay.condition-excluded";
  if (reason.startsWith("sealed") || reason.includes("variant")) return "ebay.sealed-or-bundle";
  if (reason.startsWith("MI sku-drift")) return "ebay.sku-drift";
  if (reason.startsWith("low-confidence MI")) return "ebay.low-confidence-parse";
  if (reason.includes("missing")) return "ebay.upstream-shape-drift";
  if (reason.includes("unsupported currency")) return "ebay.unsupported-currency";
  return "ebay.other";
}

// ── Watch-list selector ─────────────────────────────────────────────────

async function selectWatchList(tier: EbayTier, cap: number): Promise<string[]> {
  const floor = TIER_FLOOR[tier];
  // Pick stale-first within the tier — last_observed_at NULLS FIRST.
  const rows = await db
    .select({ sku: ebayWatchList.sku })
    .from(ebayWatchList)
    .where(and(eq(ebayWatchList.active, true), gte(ebayWatchList.priority, floor)))
    .orderBy(sql`priority DESC, last_observed_at NULLS FIRST`)
    .limit(cap);
  return rows.map((r) => r.sku);
}

// ── Public entry point ──────────────────────────────────────────────────

/**
 * Run an eBay snapshot for one priority tier. Opens an `ingest_run` row,
 * walks the watch list, calls `runSource(ebay, …)`, and persists results.
 *
 * Returns the snapshot summary. Never throws — wraps internal errors in
 * the result's `errors` count + an event.
 */
export async function runEbaySnapshot(
  options?: EbaySnapshotOptions,
): Promise<EbaySnapshotResult> {
  const startMs = Date.now();
  const tier = options?.tier ?? "all";
  const marketplaces = options?.marketplaces ?? (["EBAY_GB"] as const);
  const cap = options?.maxSkus ?? TIER_DEFAULT_CAP[tier];
  const triggeredBy = options?.triggeredBy ?? "cron";
  const timeoutMs = options?.timeoutMs ?? 45 * 60 * 1000;

  // ── 1. Open ingest_run row ────────────────────────────────────────────
  const [runRow] = await db
    .insert(ingestRun)
    .values({
      sourceId: "ebay",
      specVersion: "1",
      triggeredBy,
      status: "running",
      notes: `tier=${tier}, marketplaces=${marketplaces.join(",")}, cap=${cap}, mock=${options?.mock === true}`,
    })
    .returning({ id: ingestRun.id });

  const ingestRunId = runRow.id;
  const notableEvents: string[] = [];

  try {
    // ── 2. Pick the watch list slice for this tier ────────────────────────
    const watchSkus = await selectWatchList(tier, cap);

    if (watchSkus.length === 0) {
      const result: EbaySnapshotResult = {
        ingestRunId,
        tier,
        marketplaces,
        skusRequested: 0,
        rowsRead: 0,
        rowsWritten: 0,
        rowsQuarantined: 0,
        errors: 0,
        notableEvents: ["watch-list empty for tier"],
        durationMs: Date.now() - startMs,
      };
      await db
        .update(ingestRun)
        .set({
          finishedAt: new Date(),
          status: "done",
          notes: sql`COALESCE(notes, '') || '; watch-list empty for tier'`,
        })
        .where(eq(ingestRun.id, ingestRunId));
      return result;
    }

    const watch_list = watchSkus.map((sku) => ({ sku }));

    // ── 3. runSource(ebay, ctx, writers) ──────────────────────────────────
    const ctx: EbayContext = {
      ebay: {
        marketplaces,
        watch_list,
        api_surface: "browse",
        mock: options?.mock,
      },
      signal: AbortSignal.timeout(timeoutMs),
      on_event: async (ev: IngestEvent) => {
        // Append every event to the ingest_run.events array. The runner
        // also captures into `summary.events`; we persist them here.
        await db
          .update(ingestRun)
          .set({
            events: sql`COALESCE(events, '[]'::jsonb) || ${JSON.stringify(ev)}::jsonb`,
          })
          .where(eq(ingestRun.id, ingestRunId));
        // Surface notable kinds.
        if (ev.kind === "error" || ev.kind === "rate-limit") {
          notableEvents.push(`${ev.kind}: ${JSON.stringify(ev.detail).slice(0, 200)}`);
        }
      },
    };

    const summary = await runSource(ebay, ctx, {
      write: async (record) => {
        await writeObservation(record, ingestRunId);
      },
      quarantine: async (entry) => {
        await writeQuarantine(entry, ingestRunId);
      },
    });

    // ── 4. Close ingest_run ──────────────────────────────────────────────
    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: summary.errors > 0 && summary.rows_normalized === 0 ? "failed" : "done",
        rowsRead: summary.rows_read,
        rowsNormalized: summary.rows_normalized,
        rowsWritten: summary.rows_normalized,
        rowsQuarantined: summary.rows_quarantined,
        errors: summary.errors,
      })
      .where(eq(ingestRun.id, ingestRunId));

    return {
      ingestRunId,
      tier,
      marketplaces,
      skusRequested: watch_list.length,
      rowsRead: summary.rows_read,
      rowsWritten: summary.rows_normalized,
      rowsQuarantined: summary.rows_quarantined,
      errors: summary.errors,
      notableEvents,
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    // Catch-all: persist failure on ingest_run, surface in result.
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: "failed",
        errors: 1,
        notes: sql`COALESCE(notes, '') || '; ' || ${message}`,
      })
      .where(eq(ingestRun.id, ingestRunId));
    return {
      ingestRunId,
      tier,
      marketplaces,
      skusRequested: 0,
      rowsRead: 0,
      rowsWritten: 0,
      rowsQuarantined: 0,
      errors: 1,
      notableEvents: [`fatal: ${message}`],
      durationMs: Date.now() - startMs,
    };
  }
}
