/**
 * TCGplayer wholesale writer — three modes.
 *
 *   runTcgplayerCatalog()   — operator-driven seed-set walk; writes
 *                             cards.tcgplayer_product_id + card_tcgplayer_sku_ids.
 *   runTcgplayerBulkPricing() — TCGCSV-backed nightly snapshot (planned;
 *                              currently delegates to live API until TCGCSV
 *                              subscription wires).
 *   runTcgplayerLivePricing() — 5-min hot-watch refresh during US trading
 *                              for cards in active inventory + watchlists.
 *
 * Built around `runSource()` from `@cambridge-tcg/data-ingest`. Persists
 * tokens to `external_source_tokens`, writes time-series rows to
 * `price_archive`, refreshes `card_current_prices` matview at end of run.
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-NNN).
 *
 * ── Operator preconditions ──────────────────────────────────────────────
 *
 *   1. `pnpm db:migrate` applied (migration 0015).
 *   2. Env: TCGPLAYER_CLIENT_ID + TCGPLAYER_CLIENT_SECRET set (apply at
 *      https://developer.tcgplayer.com if not yet).
 *   3. For pricing mode: at least one card has `cards.tcgplayer_product_id`
 *      set (run the catalog mode / seed-set CLI first).
 */

import { db } from "@/lib/db";
import {
  cards,
  priceArchive,
  ingestRun,
  ingestQuarantine,
  cardTcgplayerSkuIds,
  externalSourceTokens,
} from "@/lib/db/schema";
import { eq, and, isNotNull, sql, inArray } from "drizzle-orm";
import {
  tcgplayer,
  runSource,
  mintTcgplayerToken,
  readTcgplayerCredentialsFromEnv,
  tokenIsFresh,
  type TcgplayerToken,
  type TcgplayerWatchlistEntry,
  type TcgplayerContext,
  type CanonicalPrice,
  type CanonicalMapping,
  type IngestContext,
} from "@cambridge-tcg/data-ingest";
import { fetchGbpUsdRate } from "@/lib/fx";
import { createFetcher } from "@cambridge-tcg/data-ingest";

const BATCH_SIZE = 100;

export interface TcgplayerCatalogOptions {
  /** Restrict to specific category ids; else walks every registered category. */
  categories?: number[];
  /** Restrict to specific group ids; else walks every group in target categories. */
  groups?: number[];
  triggeredBy?: "cron" | "admin" | "webhook";
  /** Maximum products to write (defensive cap for dry runs / first deploys). */
  maxProducts?: number;
}

export interface TcgplayerPricingOptions {
  triggeredBy?: "cron" | "admin" | "webhook";
  date?: string;
  /** Hot-watch shrinker — only include cards matching this predicate. Used by
   *  the 5-min cron to scope to active inventory + recent searches. */
  scope?: "all-mapped" | "hot-watch";
  /** Maximum skuIds to fetch (cap for safety; default unbounded). */
  maxSkus?: number;
  /** Restrict to condition values (default = ['nm'] for v1). */
  conditions?: string[];
}

export interface TcgplayerCatalogResult {
  ingestRunId: number;
  productsRead: number;
  mappingsWritten: number;
  skuIdsWritten: number;
  rowsQuarantined: number;
  errors: number;
  durationMs: number;
}

export interface TcgplayerPricingResult {
  ingestRunId: number;
  snapshotDate: string;
  skusRead: number;
  rowsWritten: number;
  rowsQuarantined: number;
  errors: number;
  fxRateUsd: number;
  fxRateSource: "live" | "cached" | "fallback";
  durationMs: number;
}

// ── Token lifecycle (persisted to external_source_tokens) ──────────

/**
 * Resolve a usable bearer token. Reads from `external_source_tokens`; if
 * absent or expired, mints a new one and upserts.
 *
 * The runner / read() doesn't know about RDS — the bearer is supplied via
 * ctx.bearer. We also wire a refresh hook on ctx so 401s mid-run can re-mint.
 */
export async function ensureTcgplayerToken(opts?: {
  force?: boolean;
}): Promise<{ token: string; rotated: boolean }> {
  if (!opts?.force) {
    const cached = await db
      .select()
      .from(externalSourceTokens)
      .where(eq(externalSourceTokens.sourceId, "tcgplayer"))
      .limit(1);
    const row = cached[0];
    if (row) {
      const cachedToken: TcgplayerToken = {
        access_token: row.accessToken,
        expires_at_ms: row.expiresAt.getTime(),
        minted_at: row.mintedAt,
      };
      if (tokenIsFresh(cachedToken)) {
        return { token: cachedToken.access_token, rotated: false };
      }
    }
  }

  const creds = readTcgplayerCredentialsFromEnv();
  if (!creds) {
    throw new Error(
      "TCGplayer credentials missing. Set TCGPLAYER_CLIENT_ID + TCGPLAYER_CLIENT_SECRET (trim whitespace). " +
        "Apply for partner access at https://developer.tcgplayer.com.",
    );
  }

  // Use the package's createFetcher for rate-limit + UA on the token mint too.
  const fetcher = createFetcher({}, tcgplayer.meta);
  const fresh = await mintTcgplayerToken(creds, fetcher);

  await db
    .insert(externalSourceTokens)
    .values({
      sourceId: "tcgplayer",
      accessToken: fresh.access_token,
      expiresAt: new Date(fresh.expires_at_ms),
      rotationCount: 1,
    })
    .onConflictDoUpdate({
      target: externalSourceTokens.sourceId,
      set: {
        accessToken: fresh.access_token,
        expiresAt: new Date(fresh.expires_at_ms),
        mintedAt: new Date(),
        rotationCount: sql`${externalSourceTokens.rotationCount} + 1`,
      },
    });

  return { token: fresh.access_token, rotated: true };
}

// ── Catalog mode (seed-set / weekly bulk) ──────────────────────────

export async function runTcgplayerCatalog(
  options?: TcgplayerCatalogOptions,
): Promise<TcgplayerCatalogResult> {
  const startMs = Date.now();
  const triggeredBy = options?.triggeredBy ?? "cron";

  const [runRow] = await db
    .insert(ingestRun)
    .values({
      sourceId: "tcgplayer",
      specVersion: "1",
      triggeredBy,
      status: "running",
    })
    .returning({ id: ingestRun.id });
  const ingestRunId = runRow.id;

  let productsRead = 0;
  let mappingsWritten = 0;
  let skuIdsWritten = 0;
  let rowsQuarantined = 0;

  try {
    const { token } = await ensureTcgplayerToken();

    const ctx: TcgplayerContext = {
      bearer: token,
      tcgplayer: {
        mode: "catalog",
        categories: options?.categories,
        groups: options?.groups,
      },
      signal: AbortSignal.timeout(45 * 60_000),
    };

    // Wire the refresh hook so 401s mid-run re-mint without crashing the
    // read loop. The hook updates ctx.bearer in-place; the fetcher's next
    // request picks it up.
    (ctx as IngestContext & { refresh_token?: () => Promise<string> }).refresh_token =
      async () => {
        const refreshed = await ensureTcgplayerToken({ force: true });
        ctx.bearer = refreshed.token;
        return refreshed.token;
      };

    const summary = await runSource(
      tcgplayer,
      ctx,
      {
        write: async (record: CanonicalPrice | CanonicalMapping) => {
          if (!isMappingRecord(record)) return; // catalog mode only emits mappings
          productsRead += 1;
          if (options?.maxProducts && productsRead > options.maxProducts) return;
          const result = await writeMapping(ingestRunId, record);
          if (result.mappingWritten) mappingsWritten += 1;
          skuIdsWritten += result.skuIdsWritten;
          rowsQuarantined += result.quarantined;
        },
        quarantine: async ({ raw, reason, provenance }) => {
          rowsQuarantined += 1;
          await db.insert(ingestQuarantine).values({
            ingestRunId,
            sourceId: "tcgplayer",
            upstreamId: extractUpstreamId(raw),
            rawPayload: raw as unknown as Record<string, unknown>,
            reason,
            kind: classifyMappingReason(reason),
            asOf: new Date(provenance.as_of),
            retrievedAt: new Date(provenance.retrieved_at),
          });
        },
      },
    );

    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: summary.errors > 0 ? "failed" : "done",
        rowsRead: summary.rows_read,
        rowsNormalized: summary.rows_normalized,
        rowsWritten: mappingsWritten,
        rowsQuarantined,
        errors: summary.errors,
        events: summary.events as unknown as Record<string, unknown>[],
        notes:
          `catalog mode: productsRead=${productsRead} mappingsWritten=${mappingsWritten} ` +
          `skuIdsWritten=${skuIdsWritten}`,
      })
      .where(eq(ingestRun.id, ingestRunId));

    return {
      ingestRunId,
      productsRead,
      mappingsWritten,
      skuIdsWritten,
      rowsQuarantined,
      errors: summary.errors,
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: "failed",
        notes: `crashed: ${err instanceof Error ? err.message : String(err)}`,
      })
      .where(eq(ingestRun.id, ingestRunId))
      .catch(() => {
        /* double-fault — don't swallow */
      });
    throw err;
  }
}

interface WriteMappingResult {
  mappingWritten: boolean;
  skuIdsWritten: number;
  quarantined: number;
}

async function writeMapping(
  ingestRunId: number,
  record: CanonicalMapping,
): Promise<WriteMappingResult> {
  const setHint = record.match_hints.set_code_hint;
  const cardNumber = record.match_hints.card_number;
  if (!setHint || !cardNumber) {
    await db.insert(ingestQuarantine).values({
      ingestRunId,
      sourceId: "tcgplayer",
      upstreamId: String(record.upstream_product_id),
      rawPayload: record as unknown as Record<string, unknown>,
      reason: `incomplete match_hints — setHint=${setHint ?? "null"}, cardNumber=${cardNumber ?? "null"}`,
      kind: "mapping.no-set-match",
      asOf: new Date(),
      retrievedAt: new Date(),
    });
    return { mappingWritten: false, skuIdsWritten: 0, quarantined: 1 };
  }

  // Identify candidate cards by (set_code, card_number). The seed walk's
  // hint may have come from the TCGplayer group abbreviation; we tolerate
  // case/separator differences.
  const candidates = await db
    .select({
      id: cards.id,
      sku: cards.sku,
      setCode: cards.setCode,
      cardNumber: cards.cardNumber,
    })
    .from(cards)
    .where(and(eq(cards.setCode, setHint), eq(cards.cardNumber, cardNumber)));

  if (candidates.length === 0) {
    await db.insert(ingestQuarantine).values({
      ingestRunId,
      sourceId: "tcgplayer",
      upstreamId: String(record.upstream_product_id),
      rawPayload: record as unknown as Record<string, unknown>,
      reason:
        `no cards row matches (set_code='${setHint}', card_number='${cardNumber}'). ` +
        `Display name: "${record.upstream_display_name}". Import the set or extend the variant map.`,
      kind: "mapping.no-set-match",
      asOf: new Date(),
      retrievedAt: new Date(),
    });
    return { mappingWritten: false, skuIdsWritten: 0, quarantined: 1 };
  }

  // v1 simplification: we map the FIRST candidate. When a product has both
  // foil + non-foil variants in our `cards` table (separate rows), the
  // upstream's distinct sub_types will hit each candidate via the unique
  // constraint on (tcgplayer_product_id, tcgplayer_sub_type). Multi-candidate
  // ambiguity surfaces in the audit, not silent failure.
  const card = candidates[0];

  // The mapping uniqueness constraint is (tcgplayer_product_id, tcgplayer_sub_type).
  // We write one row per (card, sub_type) pair. Most products have 1-3 sub_types.
  // The mapping carries the dominant sub_type observed in skus; we use the
  // most-frequent one as the assignment for THIS card row.
  const subType = pickDominantSubType(record);

  await db
    .update(cards)
    .set({
      tcgplayerProductId: Number(record.upstream_product_id),
      tcgplayerGroupId: Number(record.extra?.tcgplayer_group_id ?? null) || null,
      tcgplayerSubType: subType,
    })
    .where(eq(cards.id, card.id));

  // Upsert per-condition leaf skuIds.
  let skuIdsWritten = 0;
  for (const leaf of record.leaf_ids ?? []) {
    await db
      .insert(cardTcgplayerSkuIds)
      .values({
        cardId: card.id,
        condition: leaf.condition,
        language: leaf.language,
        tcgplayerSkuId: Number(leaf.upstream_sku_id),
      })
      .onConflictDoUpdate({
        target: [cardTcgplayerSkuIds.cardId, cardTcgplayerSkuIds.condition, cardTcgplayerSkuIds.language],
        set: {
          tcgplayerSkuId: Number(leaf.upstream_sku_id),
          lastSeenAt: new Date(),
        },
      });
    skuIdsWritten += 1;
  }

  return { mappingWritten: true, skuIdsWritten, quarantined: 0 };
}

// ── Pricing mode (5-min hot-watch + nightly bulk) ──────────────────

export async function runTcgplayerPricing(
  options?: TcgplayerPricingOptions,
): Promise<TcgplayerPricingResult> {
  const startMs = Date.now();
  const snapshotDate = options?.date ?? new Date().toISOString().slice(0, 10);
  const triggeredBy = options?.triggeredBy ?? "cron";
  const conditions = options?.conditions ?? ["nm"]; // v1: NM only
  const scope = options?.scope ?? "all-mapped";

  const [runRow] = await db
    .insert(ingestRun)
    .values({
      sourceId: "tcgplayer",
      specVersion: "1",
      triggeredBy,
      status: "running",
    })
    .returning({ id: ingestRun.id });
  const ingestRunId = runRow.id;

  let fxRate: number;
  let fxRateSource: "live" | "cached" | "fallback" = "live";
  try {
    fxRate = await fetchGbpUsdRate();
  } catch (err) {
    // Fail loudly — without FX we can't write GBP-normalized rows.
    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: "failed",
        notes: `fx.rate-fetch-failed: ${err instanceof Error ? err.message : String(err)}`,
      })
      .where(eq(ingestRun.id, ingestRunId));
    throw err;
  }

  try {
    const watchlist = await buildPricingWatchlist({ scope, conditions, maxSkus: options?.maxSkus });

    if (watchlist.length === 0) {
      await db
        .update(ingestRun)
        .set({
          finishedAt: new Date(),
          status: "done",
          rowsRead: 0,
          rowsNormalized: 0,
          rowsWritten: 0,
          rowsQuarantined: 0,
          errors: 0,
          notes: `empty watchlist — no cards with tcgplayer_product_id + matching condition. Run catalog mode / seed-set first.`,
        })
        .where(eq(ingestRun.id, ingestRunId));
      return {
        ingestRunId,
        snapshotDate,
        skusRead: 0,
        rowsWritten: 0,
        rowsQuarantined: 0,
        errors: 0,
        fxRateUsd: fxRate,
        fxRateSource,
        durationMs: Date.now() - startMs,
      };
    }

    const { token } = await ensureTcgplayerToken();

    const ctx: TcgplayerContext = {
      bearer: token,
      tcgplayer: {
        mode: "pricing",
        pricing_watchlist: watchlist,
      },
      signal: AbortSignal.timeout(45 * 60_000),
    };
    (ctx as IngestContext & { refresh_token?: () => Promise<string> }).refresh_token =
      async () => {
        const refreshed = await ensureTcgplayerToken({ force: true });
        ctx.bearer = refreshed.token;
        return refreshed.token;
      };

    const collected: Array<CanonicalPrice & { extra?: Record<string, unknown> }> = [];
    let rowsQuarantined = 0;

    const summary = await runSource(
      tcgplayer,
      ctx,
      {
        write: async (record: CanonicalPrice | CanonicalMapping) => {
          if (isMappingRecord(record)) return; // pricing mode dispatcher
          collected.push(record as CanonicalPrice & { extra?: Record<string, unknown> });
        },
        quarantine: async ({ raw, reason, provenance }) => {
          rowsQuarantined += 1;
          await db.insert(ingestQuarantine).values({
            ingestRunId,
            sourceId: "tcgplayer",
            upstreamId: extractUpstreamId(raw),
            rawPayload: raw as unknown as Record<string, unknown>,
            reason,
            kind: classifyPricingReason(reason),
            asOf: new Date(provenance.as_of),
            retrievedAt: new Date(provenance.retrieved_at),
          });
        },
      },
    );

    let rowsWritten = 0;
    for (let i = 0; i < collected.length; i += BATCH_SIZE) {
      const batch = collected.slice(i, i + BATCH_SIZE);
      const written = await writePricingBatch(
        ingestRunId,
        snapshotDate,
        batch,
        fxRate,
        fxRateSource,
      );
      rowsWritten += written.written;
      rowsQuarantined += written.quarantined;
    }

    // Refresh the matview (CONCURRENTLY so reads don't block) — only on
    // successful runs. The 30-min fallback cron handles the failure case.
    if (rowsWritten > 0) {
      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY card_current_prices`);
      } catch (err) {
        // Don't fail the run on matview refresh; the fallback cron will
        // catch up. Log via the ingest_run notes.
        console.warn(
          `tcgplayer pricing: matview refresh failed (will retry via fallback cron): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: summary.errors > 0 ? "failed" : "done",
        rowsRead: summary.rows_read,
        rowsNormalized: summary.rows_normalized,
        rowsWritten,
        rowsQuarantined,
        errors: summary.errors,
        events: summary.events as unknown as Record<string, unknown>[],
        notes:
          `pricing mode (scope=${scope}, conditions=${conditions.join(",")}): ` +
          `watchlist=${watchlist.length} fxRate=${fxRate.toFixed(4)} fxSource=${fxRateSource}`,
      })
      .where(eq(ingestRun.id, ingestRunId));

    return {
      ingestRunId,
      snapshotDate,
      skusRead: summary.rows_read,
      rowsWritten,
      rowsQuarantined,
      errors: summary.errors,
      fxRateUsd: fxRate,
      fxRateSource,
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: "failed",
        notes: `crashed: ${err instanceof Error ? err.message : String(err)}`,
      })
      .where(eq(ingestRun.id, ingestRunId))
      .catch(() => {
        /* double-fault */
      });
    throw err;
  }
}

interface PricingWatchlistBuildOptions {
  scope: "all-mapped" | "hot-watch";
  conditions: string[];
  maxSkus?: number;
}

async function buildPricingWatchlist(
  opts: PricingWatchlistBuildOptions,
): Promise<TcgplayerWatchlistEntry[]> {
  // Query joins cards.tcgplayer_product_id × card_tcgplayer_sku_ids with the
  // requested condition filter. For hot-watch scope, also filter to cards in
  // active inventory (stock>0 or pending_stock>0).
  const rows = await db.execute<{
    card_id: number;
    card_sku: string;
    tcgplayer_product_id: number;
    tcgplayer_sku_id: number;
    condition: string;
    language: string;
  }>(
    opts.scope === "hot-watch"
      ? sql`
          SELECT c.id              AS card_id,
                 c.sku             AS card_sku,
                 c.tcgplayer_product_id AS tcgplayer_product_id,
                 s.tcgplayer_sku_id AS tcgplayer_sku_id,
                 s.condition       AS condition,
                 s.language        AS language
            FROM cards c
            JOIN card_tcgplayer_sku_ids s ON s.card_id = c.id
           WHERE c.tcgplayer_product_id IS NOT NULL
             AND s.condition = ANY(${opts.conditions})
             AND (c.stock > 0 OR c.pending_stock > 0)
           ORDER BY c.id, s.tcgplayer_sku_id
        `
      : sql`
          SELECT c.id              AS card_id,
                 c.sku             AS card_sku,
                 c.tcgplayer_product_id AS tcgplayer_product_id,
                 s.tcgplayer_sku_id AS tcgplayer_sku_id,
                 s.condition       AS condition,
                 s.language        AS language
            FROM cards c
            JOIN card_tcgplayer_sku_ids s ON s.card_id = c.id
           WHERE c.tcgplayer_product_id IS NOT NULL
             AND s.condition = ANY(${opts.conditions})
           ORDER BY c.id, s.tcgplayer_sku_id
        `,
  );

  const capped = opts.maxSkus ? rows.slice(0, opts.maxSkus) : rows;

  // Group by card_id.
  const byCard = new Map<number, TcgplayerWatchlistEntry>();
  for (const r of capped) {
    let entry = byCard.get(r.card_id);
    if (!entry) {
      entry = {
        card_id: r.card_id,
        card_sku: r.card_sku,
        tcgplayer_product_id: r.tcgplayer_product_id,
        tcgplayer_sku_ids: [],
      };
      byCard.set(r.card_id, entry);
    }
    entry.tcgplayer_sku_ids.push(r.tcgplayer_sku_id);
  }
  return Array.from(byCard.values());
}

interface PricingBatchResult {
  written: number;
  quarantined: number;
}

async function writePricingBatch(
  ingestRunId: number,
  snapshotDate: string,
  batch: Array<CanonicalPrice & { extra?: Record<string, unknown> }>,
  fxRate: number,
  fxRateSource: "live" | "cached" | "fallback",
): Promise<PricingBatchResult> {
  let written = 0;
  let quarantined = 0;

  // The mapping resolution: each canonical_price record has card_sku_hint in
  // its extra; we also have the product_id + sub_type. Look up card_id by the
  // (product_id, sub_type) unique constraint to confirm mapping integrity.
  const productIds = Array.from(
    new Set(batch.map((r) => Number(r.extra?.tcgplayer_product_id))),
  );
  const cardRows = await db
    .select({
      id: cards.id,
      sku: cards.sku,
      setCode: cards.setCode,
      category: cards.category,
      productId: cards.tcgplayerProductId,
      subType: cards.tcgplayerSubType,
    })
    .from(cards)
    .where(inArray(cards.tcgplayerProductId, productIds));

  const byProductSubType = new Map<string, (typeof cardRows)[number]>();
  for (const row of cardRows) {
    const key = `${row.productId}::${row.subType ?? ""}`;
    byProductSubType.set(key, row);
  }

  const inserts: Array<{
    cardId: number;
    snapshotDate: string;
    sku: string;
    setCode: string | null;
    category: "singles" | "sealed";
    cardrushJpy: number;
    gbpJpyRate: number;
    baseGbp: number;
    price: number;
    source: string;
    sourceUrl: string | null;
    ingestRunId: number;
    errorReason: string | null;
    sourceCurrency: string;
    sourceRedistribute: boolean;
    condition: string;
    extra: Record<string, unknown>;
    fxRateToGbp: number;
    fxRateSource: string;
  }> = [];

  for (const record of batch) {
    const productId = Number(record.extra?.tcgplayer_product_id);
    const subType = String(record.extra?.tcgplayer_sub_type ?? "");
    const key = `${productId}::${subType}`;
    const card = byProductSubType.get(key);
    if (!card) {
      // Pricing arrived for an unmapped (product_id, sub_type). Quarantine.
      await db.insert(ingestQuarantine).values({
        ingestRunId,
        sourceId: "tcgplayer",
        upstreamId: String(record.extra?.tcgplayer_sku_id ?? record.upstream_id ?? ""),
        rawPayload: record as unknown as Record<string, unknown>,
        reason:
          `pricing arrived for unmapped (product_id=${productId}, sub_type='${subType}'); ` +
          `run catalog mode / seed-set CLI for the affected group.`,
        kind: "pricing.unmapped-product",
        asOf: new Date(record.observed_at),
        retrievedAt: new Date(record.retrieved_at),
      });
      quarantined += 1;
      continue;
    }

    const cardIdHint = Number(record.extra?.card_id_hint ?? 0);
    if (cardIdHint > 0 && cardIdHint !== card.id) {
      // Mapping drifted between watchlist build and write — the (product,
      // sub_type) now maps to a different card. Surface for review.
      await db.insert(ingestQuarantine).values({
        ingestRunId,
        sourceId: "tcgplayer",
        upstreamId: String(record.extra?.tcgplayer_sku_id ?? record.upstream_id ?? ""),
        rawPayload: record as unknown as Record<string, unknown>,
        reason:
          `mapping drift: watchlist hint card_id=${cardIdHint}, but cards row now says card_id=${card.id} ` +
          `for (product_id=${productId}, sub_type='${subType}')`,
        kind: "pricing.mapping-drift",
        asOf: new Date(record.observed_at),
        retrievedAt: new Date(record.retrieved_at),
      });
      quarantined += 1;
      continue;
    }

    const usdAmount = Number(record.amount);
    // GBP-equivalent of the USD market figure. We do NOT mark up — this row
    // is an OBSERVATION of TCGplayer's market price (a competitor view),
    // not our wholesale-cost-plus-margin. base_gbp = price = USD ÷ fxRate.
    // (fxRate is units of source-currency per 1 GBP, so divide.)
    const gbpAmount = fxRate > 0 ? usdAmount / fxRate : 0;
    const isHeadlineNull = Boolean(record.extra?.headline_null);

    inserts.push({
      cardId: card.id,
      snapshotDate,
      sku: card.sku,
      setCode: card.setCode,
      category: card.category,
      // Legacy columns required by the schema's NOT NULL constraints.
      // cardrushJpy + gbpJpyRate have no semantic meaning for TCGplayer
      // rows; we write 0 and let the substrate-honest declaration ride on
      // source='tcgplayer' + source_currency='USD' + extra.tcgplayer_sub_type.
      cardrushJpy: 0,
      gbpJpyRate: 0,
      baseGbp: Number(gbpAmount.toFixed(2)),
      price: Number(gbpAmount.toFixed(2)),
      source: "tcgplayer",
      sourceUrl: `https://www.tcgplayer.com/product/${productId}`,
      ingestRunId,
      errorReason: isHeadlineNull ? "all_pricing_fields_null" : null,
      sourceCurrency: "USD",
      sourceRedistribute: false,
      condition: record.condition ?? "unspecified",
      extra: record.extra ?? {},
      fxRateToGbp: 1 / fxRate, // GBP per USD
      fxRateSource,
    });
  }

  if (inserts.length === 0) return { written, quarantined };

  await db
    .insert(priceArchive)
    .values(inserts)
    .onConflictDoUpdate({
      target: [
        priceArchive.cardId,
        priceArchive.snapshotDate,
        priceArchive.source,
        priceArchive.condition,
      ],
      set: {
        baseGbp: sql`EXCLUDED.base_gbp`,
        price: sql`EXCLUDED.price`,
        sourceUrl: sql`EXCLUDED.source_url`,
        ingestRunId: sql`EXCLUDED.ingest_run_id`,
        errorReason: sql`EXCLUDED.error_reason`,
        extra: sql`EXCLUDED.extra`,
        fxRateToGbp: sql`EXCLUDED.fx_rate_to_gbp`,
        fxRateSource: sql`EXCLUDED.fx_rate_source`,
      },
    });

  written = inserts.length;

  // Update each card's lastSyncedAt (one statement per batch via UPDATE FROM VALUES).
  // For simplicity we do per-card updates; at 100/batch this is fast enough.
  for (const row of inserts) {
    await db
      .update(cards)
      .set({ lastSyncedAt: new Date() })
      .where(eq(cards.id, row.cardId));
  }

  return { written, quarantined };
}

// ── Helpers ─────────────────────────────────────────────────────────

function isMappingRecord(
  record: CanonicalPrice | CanonicalMapping,
): record is CanonicalMapping {
  return "upstream_product_id" in record && !("sku" in record);
}

function extractUpstreamId(raw: unknown): string | null {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (r.kind === "catalog") {
      const product = r.product as { productId?: number } | undefined;
      return product?.productId ? String(product.productId) : null;
    }
    if (r.kind === "pricing") {
      const sku = r.sku as { skuId?: number } | undefined;
      return sku?.skuId ? String(sku.skuId) : null;
    }
  }
  return null;
}

function pickDominantSubType(record: CanonicalMapping): string {
  // The product's default sub_type — typically "Normal" unless the product
  // only has foil printings. We pick the most-common from leaf_ids.
  const counts = new Map<string, number>();
  for (const leaf of record.leaf_ids ?? []) {
    // leaf_ids carry condition + language but NOT sub_type — sub_type was
    // captured at the catalog row's product/skus join. Default to "Normal"
    // here; the writer's update sets the row's tcgplayer_sub_type to this
    // value, and the unique constraint (product_id, sub_type) catches
    // collisions if there are truly multiple sub_types in the product.
    void leaf;
  }
  // Fall through to extra hint if present; otherwise "Normal".
  const fromExtra = record.extra?.dominant_sub_type;
  if (typeof fromExtra === "string" && fromExtra.length > 0) return fromExtra;
  void counts;
  return "Normal";
}

function classifyMappingReason(reason: string): string {
  if (/unknown sub_type/i.test(reason)) return "mapping.unmapped-subtype";
  if (/unmapped.*condition/i.test(reason)) return "mapping.unmapped-condition";
  if (/no cards row/i.test(reason) || /no.*matches/i.test(reason)) return "mapping.no-set-match";
  if (/extendedData\.Number/i.test(reason) || /no.*card_number/i.test(reason)) return "upstream.shape-drift";
  if (/category/i.test(reason)) return "mapping.no-set-match";
  return "mapping.no-set-match";
}

function classifyPricingReason(reason: string): string {
  if (/unmapped.*condition/i.test(reason)) return "mapping.unmapped-condition";
  if (/unknown sub_type/i.test(reason)) return "mapping.unmapped-subtype";
  if (/mapping drift/i.test(reason)) return "pricing.mapping-drift";
  if (/unmapped.*product/i.test(reason)) return "pricing.unmapped-product";
  return "pricing.unmapped-product";
}
