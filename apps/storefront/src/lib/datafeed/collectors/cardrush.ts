import 'server-only';
import { query, transaction } from '@/lib/db';
import { acquireCardRushMemberPrices, cardRushSourceProductId, CARDRUSH_COLLECTOR_HOSTS, CARDRUSH_CROSSWALK_VERSION, CARDRUSH_MAX_BUDGET_MS, CARDRUSH_PAGE_RATE } from '@cambridge-tcg/data-ingest/cardrush/member-prices';
import { MEMBER_PRICE_POLICIES } from '@cambridge-tcg/data-ingest/member-prices';
import type { IngestContext } from '@cambridge-tcg/data-ingest/types';
import { writeMemberPriceBatch } from '../member-price-writer';
import { writeProductCrosswalk, writeSetCrosswalk, type CrosswalkWrite } from '../crosswalks';
import { withCollectorLease } from '../collector-lease';

/** The CardRush page collector (Yu, 2026-10-28). One run reads one host:
 * its robots.txt and sitemap once, then the stalest product pages the budget allows, and
 * writes one batch through the member-price writer, which re-checks the
 * release row inside its transaction. A run the host refused writes its batch
 * too, with no observation invented and a quarantine entry naming the refusal,
 * so health and the run's record see a host refused on every run. Crosswalks go through their own
 * writers. A run holds the host's lease (cardrush:<host>, migration 0143)
 * from before its first request to its last write, so two runs never read
 * one host at once, and the lease keeps the next run's first request 2 s
 * after it ends. Scheduling and the on switch belong to the cron route.
 */
/** Of the run's 270 s (CARDRUSH_MAX_BUDGET_MS), kept back for the writes: at
 * 0.5 rps the other 210 s send about 105 requests: robots.txt, the sitemap
 * and about 103 pages. */
const WRITE_RESERVE_MS = 60_000;
/** The crosswalk writers' own refusals of a malformed link; anything else is a fault. */
const CROSSWALK_REFUSALS = new Set(['invalid-price-crosswalk', 'price-crosswalk-not-exact', 'invalid-price-set-crosswalk']);
/** The route's schedule: every two hours, each run the next host in turn. */
const RUN_INTERVAL_MS = 2 * 60 * 60 * 1000;

export interface CardRushRunSummary {
  ran: boolean; host: string; runAt: string; reason?: string;
  /** Product pages requested this run. */
  requested: number; observed: number; quarantined: number;
  unavailable?: { code: 'SOURCE_UNAVAILABLE'; reason: string };
  sitemapProducts?: number;
  /** Listed pages the host's robots.txt disallows to this collector: never requested. */
  robotsDisallowed?: number;
  batch?: { id: string; inserted: number; duplicate: boolean } | null;
  crosswalks?: { written: number; unchanged: number; skipped: number; refused: number };
}

/** Round-robin by run time, so a missed run shifts nothing and two runs in
 * one slot read the same host. */
export function cardRushHostFor(runAt: Date): string {
  const hosts = Object.keys(CARDRUSH_COLLECTOR_HOSTS);
  return hosts[Math.floor(runAt.getTime() / RUN_INTERVAL_MS) % hosts.length]!;
}

/** Never-read pages first, in sitemap order, then the page whose latest
 * reading is oldest. A quarantined reading counts as read: otherwise pages
 * that never yield a price (sealed product, supplies, gone pages) would come
 * first in every run and starve the singles.
 */
export async function chooseStalestCardRushPages(host: string, productUrls: readonly string[], capacity: number, runQuery: typeof query = query): Promise<string[]> {
  if (capacity <= 0 || !productUrls.length) return [];
  const prefix = `${host}/product/`;
  const read = await runQuery(`SELECT id, max(at) AS at FROM (
      SELECT source_product_id AS id, max(retrieved_at) AS at FROM member_price_observations
       WHERE source = 'cardrush' AND starts_with(source_product_id, $1) GROUP BY 1
      UNION ALL
      SELECT q->>'sourceProductId', max(b.inserted_at) FROM member_price_batches b CROSS JOIN LATERAL jsonb_array_elements(b.quarantine) q
       WHERE b.source = 'cardrush' AND starts_with(q->>'sourceProductId', $1) GROUP BY 1
    ) readings GROUP BY id`, [prefix]);
  const last = new Map(read.rows.map(row => [String(row.id), new Date(row.at).getTime()]));
  return productUrls.map((url, order) => ({ url, order, at: last.get(cardRushSourceProductId(url) ?? '') ?? -Infinity }))
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .slice(0, capacity)
    .map(entry => entry.url);
}

export async function collectCardRush(options: {
  runAt?: Date; context?: IngestContext; runQuery?: typeof query; runTransaction?: typeof transaction;
} = {}): Promise<CardRushRunSummary> {
  const runAt = options.runAt ?? new Date();
  const started = Date.now();
  const runQuery = options.runQuery ?? query, runTransaction = options.runTransaction ?? transaction;
  const host = cardRushHostFor(runAt);
  const base = { host, runAt: runAt.toISOString(), requested: 0, observed: 0, quarantined: 0 };
  const policy = MEMBER_PRICE_POLICIES.cardrush;
  // Revocation precedes network work; the writer checks again in its transaction.
  const release = await runQuery(`SELECT source FROM member_price_source_releases WHERE source='cardrush' AND evidence_version=$1 AND evidence_url=$2 AND revoked_at IS NULL AND member_display`, [policy.evidenceVersion, policy.evidenceUrl]);
  if (!release.rows.length) return { ...base, ran: false, reason: 'release-revoked-or-unreviewed' };
  // A duplicate delivery or a manual call during a scheduled run would read
  // this host at twice the collector's rate: it is refused before any request, and
  // so is a run that would start within one request interval of the last one's end.
  const run = { host, runAt, started, base, context: options.context ?? {}, runQuery, runTransaction };
  const leased = await withCollectorLease(`cardrush:${host}`, () => readHost(run), { runQuery, spacingMs: Math.ceil(1000 / CARDRUSH_PAGE_RATE.rps) });
  return leased.ran ? leased.value : { ...base, ran: false, reason: leased.reason };
}

/** One leased run of one host: its pages, then its batch and crosswalks. */
async function readHost({ host, runAt, started, base, context, runQuery, runTransaction }: {
  host: string; runAt: Date; started: number; base: Omit<CardRushRunSummary, 'ran'>;
  context: IngestContext; runQuery: typeof query; runTransaction: typeof transaction;
}): Promise<CardRushRunSummary> {
  const policy = MEMBER_PRICE_POLICIES.cardrush;
  const acquired = await acquireCardRushMemberPrices(context, {
    evidenceVersion: policy.evidenceVersion, host,
    budgetMs: CARDRUSH_MAX_BUDGET_MS - WRITE_RESERVE_MS - (Date.now() - started),
    choose: (productUrls, capacity) => chooseStalestCardRushPages(host, productUrls, capacity, runQuery),
  });
  const { productCrosswalks, setCrosswalks, ...parsed } = acquired.parsed;
  const summary: CardRushRunSummary = {
    ...base, ran: true, requested: acquired.requested, observed: parsed.observations.length, quarantined: parsed.quarantine.length,
    ...(acquired.unavailable ? { unavailable: acquired.unavailable } : {}), sitemapProducts: acquired.sitemapProducts, robotsDisallowed: acquired.robotsDisallowed, batch: null,
  };
  const batch = acquired.unavailable
    ? { ...parsed, quarantine: [...parsed.quarantine, { sourceProductId: null, field: 'host', reason: acquired.unavailable.reason }] }
    : parsed;
  if (!batch.sourceRows && !acquired.unavailable) return summary;
  const written = await writeMemberPriceBatch('cardrush', batch, runTransaction, { ingestKey: `cardrush:${host}:${runAt.toISOString()}` });
  summary.batch = { id: written.batchId, inserted: written.inserted, duplicate: written.duplicate };

  // The collectors' one crosswalk rule (crosswalks.ts collectorMaySupersede):
  // this run replaces live rows of its own family (cardrush-title/, any
  // revision) and leaves another writer's, an operator review's, standing.
  const counts = { written: 0, unchanged: 0, skipped: 0, refused: 0 };
  const record = async (write: () => Promise<CrosswalkWrite>) => {
    try { const result = await write(); if (result.foreign) counts.skipped++; else if (result.unchanged) counts.unchanged++; else counts.written++; }
    catch (error) { if (error instanceof Error && CROSSWALK_REFUSALS.has(error.message)) counts.refused++; else throw error; }
  };
  for (const link of productCrosswalks) {
    await record(() => writeProductCrosswalk({ source: 'cardrush', ...link, crosswalkVersion: CARDRUSH_CROSSWALK_VERSION }, runTransaction, { collector: true }));
  }
  for (const set of setCrosswalks) {
    await record(() => writeSetCrosswalk({ source: 'cardrush', ...set, crosswalkVersion: CARDRUSH_CROSSWALK_VERSION }, runTransaction, { collector: true }));
  }
  summary.crosswalks = counts;
  return summary;
}
