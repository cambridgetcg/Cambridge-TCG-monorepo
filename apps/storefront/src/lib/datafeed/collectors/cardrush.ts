import 'server-only';
import { query, transaction } from '@/lib/db';
import { REFERENCE_FRESHNESS_DAYS } from '@cambridge-tcg/data-spec';
import { acquireCardRushMemberPrices, cardRushSourceProductId, CARDRUSH_COLLECTOR_HOSTS, CARDRUSH_CROSSWALK_VERSION, CARDRUSH_MAX_BUDGET_MS, CARDRUSH_PAGE_RATE } from '@cambridge-tcg/data-ingest/cardrush/member-prices';
import { MEMBER_PRICE_POLICIES } from '@cambridge-tcg/data-ingest/member-prices';
import type { IngestContext } from '@cambridge-tcg/data-ingest/types';
import { writeMemberPriceBatch } from '../member-price-writer';
import { writeProductCrosswalk, writeSetCrosswalk, type CrosswalkWrite } from '../crosswalks';
import { withCollectorLease } from '../collector-lease';
import { CARDRUSH_RUN_INTERVAL_MS, closedHost, readCollectorHosts, recordCollectorHostOutcomes, type HostClosed, type HostOutcome, type HostStateWrite } from '../collector-hosts';
import { writeCardRushListingImages, type ListingImageWrite } from '../listing-images';

/** The CardRush page collector (Yu, 2026-10-28). One run reads one host:
 * its robots.txt and sitemap once, then the product pages the budget allows,
 * in the order chooseCardRushPages gives (on One Piece, due members of a fixed
 * re-read basket first; then never-read pages, then the stalest), and
 * writes one batch through the member-price writer, which re-checks the
 * release row inside its transaction. A run the host refused writes its batch
 * too, with no observation invented and a quarantine entry naming the refusal,
 * so health and the run's record see a host refused on every run. Crosswalks go through their own
 * writers. A run holds the host's lease (cardrush:<host>, migration 0143)
 * from before its first request to its last write, so two runs never read
 * one host at once, and the lease keeps the next run's first request 2 s
 * after it ends. Listing image URLs, read from the same pages, are recorded
 * last, for the listings whose observations the batch wrote (listing-images.ts,
 * migration 0145): links, never copies. Under the lease, before any request,
 * the host's state (collector-hosts.ts, migration 0146) is read: a host that
 * refused an earlier run is left alone until its Retry-After (or 6 h) has
 * passed, and one suspended after three refused runs in a row until a person
 * clears it. The run's outcome for the host is written before its batch.
 * Scheduling and the on switch belong to the cron route.
 */
/** Of the run's 270 s (CARDRUSH_MAX_BUDGET_MS), kept back for the writes: at
 * 0.5 rps the other 210 s send about 105 requests: robots.txt, the sitemap
 * and about 103 pages. */
const WRITE_RESERVE_MS = 60_000;
/** The crosswalk writers' own refusals of a malformed link; anything else is a fault. */
const CROSSWALK_REFUSALS = new Set(['invalid-price-crosswalk', 'price-crosswalk-not-exact', 'invalid-price-set-crosswalk']);

export interface CardRushRunSummary {
  ran: boolean; host: string; runAt: string; reason?: string;
  /** A host left alone this run: not before this time, or suspended since it. */
  notBefore?: string | null; suspendedAt?: string | null; suspendedReason?: string | null;
  /** Product pages requested this run. */
  requested: number; observed: number; quarantined: number;
  unavailable?: { code: 'SOURCE_UNAVAILABLE'; reason: string };
  sitemapProducts?: number;
  /** Listed pages the host's robots.txt disallows to this collector: never requested. */
  robotsDisallowed?: number;
  batch?: { id: string; inserted: number; duplicate: boolean } | null;
  crosswalks?: { written: number; unchanged: number; skipped: number; refused: number };
  /** Listing image links recorded; skipped while 0145 is not applied. */
  listingImages?: ListingImageWrite;
  /** The host's state after this run; skipped while 0146 is not applied. */
  hostState?: HostStateWrite;
  /** The re-read basket as the chooser found it: only on a host whose titles
   * place listings in a set (CARDRUSH_COLLECTOR_HOSTS[host].crosswalk). */
  reread?: CardRushRereadCounts;
}

const HOUR = 3_600_000, DAY = 24 * HOUR;
/** Most of a One Piece run re-reads a fixed basket, the rest reads pages never
 * read, at the same load (the owner's decision of 2026-11-16). The numbers are
 * agents' sizing against the 2026-11-16 measurements
 * (docs/plans/tcg-data-platform/paid-data-api.md#cardrush-basket), not the
 * owner's. */
export const CARDRUSH_REREAD: Readonly<{ share: number; perSet: number; frozenAt: string; dueAfterMs: number }> = Object.freeze({
  /** Most of a run's capacity due members may take. 0 restores the earlier order exactly. */
  share: 0.8,
  /** Listings per set. */
  perSet: 30,
  /** Members rank by their first reading's distance from this instant, readings before it first. */
  frozenAt: '2026-11-17T00:00:00.000Z',
  /** Due at the first run four days on, less an hour so the same slot four days later qualifies. */
  dueAfterMs: 4 * DAY - HOUR,
});
/** A reading this old stops counting within about two days (the derivation
 * takes readings up to REFERENCE_FRESHNESS_DAYS old): it goes first. */
const URGENT_MS = (REFERENCE_FRESHNESS_DAYS - 1) * DAY;
/** Past this, a reading counts in no later derivation run. */
const LAPSED_MS = (REFERENCE_FRESHNESS_DAYS + 1) * DAY;

/** One host's re-read basket ($1 = '<host>/product/', $2 = frozenAt, $3 =
 * listings per set): for each set, the listings whose first accepted sell
 * reading stated no grade and whose printed set a live set crosswalk places,
 * ranked by how close that first reading is to $2, readings before it first.
 * A query over append-only rows, not a stored list: once $2 has passed no
 * page can gain a first reading before it, and later first readings rank
 * behind earlier ones, so a full set keeps its members and a short one only
 * gains. Otherwise only a set crosswalk added, superseded or remapped changes
 * a set's members.
 */
export const CARDRUSH_BASKET_SQL = `WITH first_read AS (
  SELECT DISTINCT ON (o.source_product_id) o.source_product_id AS id, o.game, o.condition, o.source_set_key, o.retrieved_at
    FROM member_price_observations o
   WHERE o.source = 'cardrush' AND starts_with(o.source_product_id, $1) AND o.metric = 'sell' AND o.quality = 'accepted'
   ORDER BY o.source_product_id, o.retrieved_at, o.id
), placed AS (
  SELECT f.id, s.set_code, f.retrieved_at
    FROM first_read f
    JOIN price_source_set_crosswalks s
      ON s.source = 'cardrush' AND s.game = f.game AND s.source_set_key = f.source_set_key AND s.superseded_at IS NULL
   WHERE f.condition IS NULL
)
SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY set_code
           ORDER BY retrieved_at >= $2::timestamptz, abs(extract(epoch FROM retrieved_at - $2::timestamptz)), id) AS rank
    FROM placed
) ranked WHERE rank <= $3`;

/** What the chooser found of the basket on one run, as ops_job_outcomes keeps
 * counts (whole non-negative numbers). */
export interface CardRushRereadCounts {
  /** Members of the host's basket. */
  basket: number;
  /** Members among this run's permitted sitemap URLs, with a reading. */
  listed: number;
  /** Listed members last read at least dueAfterMs ago. */
  due: number;
  /** Due members put first this run: at most capacity × share. */
  chosen: number;
  /** Due members whose reading is 6 to 8 days old: it stops counting within about two days. */
  urgent: number;
  /** Listed members whose reading is 8 days old or more: it counts in no later derivation run. */
  lapsed: number;
  /** The oldest listed member's reading, in whole hours; 0 if none. */
  oldestHours: number;
}

/** Round-robin by run time, every two hours (CARDRUSH_RUN_INTERVAL_MS, the
 * route's schedule), so a missed run shifts nothing and two runs in one slot
 * read the same host. */
export function cardRushHostFor(runAt: Date): string {
  const hosts = Object.keys(CARDRUSH_COLLECTOR_HOSTS);
  return hosts[Math.floor(runAt.getTime() / CARDRUSH_RUN_INTERVAL_MS) % hosts.length]!;
}

/** Each of a host's pages' latest reading, in epoch ms by source product id:
 * an observation's retrieved_at, or the inserted_at of a batch whose
 * quarantine names the page. A quarantined reading counts as read: otherwise
 * pages that never yield a price (sealed product, supplies, gone pages) would
 * come first in every run and starve the singles.
 */
export async function readCardRushReadings(host: string, runQuery: typeof query = query): Promise<Map<string, number>> {
  const prefix = `${host}/product/`;
  const read = await runQuery(`SELECT id, max(at) AS at FROM (
      SELECT source_product_id AS id, max(retrieved_at) AS at FROM member_price_observations
       WHERE source = 'cardrush' AND starts_with(source_product_id, $1) GROUP BY 1
      UNION ALL
      SELECT q->>'sourceProductId', max(b.inserted_at) FROM member_price_batches b CROSS JOIN LATERAL jsonb_array_elements(b.quarantine) q
       WHERE b.source = 'cardrush' AND starts_with(q->>'sourceProductId', $1) GROUP BY 1
    ) readings GROUP BY id`, [prefix]);
  return new Map(read.rows.map(row => [String(row.id), new Date(row.at).getTime()]));
}

/** Never-read pages first, in sitemap order, then the page whose latest
 * reading (`last`, from readCardRushReadings) is oldest, up to `capacity`.
 */
export function orderStalestCardRushPages(productUrls: readonly string[], last: ReadonlyMap<string, number>, capacity: number): string[] {
  return productUrls.map((url, order) => ({ url, order, at: last.get(cardRushSourceProductId(url) ?? '') ?? -Infinity }))
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .slice(0, Math.max(0, capacity))
    .map(entry => entry.url);
}

/** The stalest pages of a host, never-read first (orderStalestCardRushPages
 * over readCardRushReadings). No query when there is nothing to choose. */
export async function chooseStalestCardRushPages(host: string, productUrls: readonly string[], capacity: number, runQuery: typeof query = query): Promise<string[]> {
  if (capacity <= 0 || !productUrls.length) return [];
  return orderStalestCardRushPages(productUrls, await readCardRushReadings(host, runQuery), capacity);
}

/** The source product ids in one host's re-read basket (CARDRUSH_BASKET_SQL).
 * `perSet` is CARDRUSH_REREAD.perSet; tests pass a smaller one. */
export async function readCardRushBasket(host: string, runQuery: typeof query = query, perSet: number = CARDRUSH_REREAD.perSet): Promise<Set<string>> {
  const read = await runQuery(CARDRUSH_BASKET_SQL, [`${host}/product/`, CARDRUSH_REREAD.frozenAt, perSet]);
  return new Set(read.rows.map(row => String(row.id)));
}

/** A run's pages, pure. First the basket members among `urls` that are due
 * (last read at least dueAfterMs before `now`): those whose reading is 6 to 8
 * days old, so stops counting within two days, then every other due member,
 * each group oldest reading first and then in sitemap order, at most
 * floor(capacity × share) of them. Then the rest by today's rule
 * (orderStalestCardRushPages): never-read pages in sitemap order, then the
 * stalest. Re-reads go first, so a run cut short loses first reads, not
 * re-reads. No page twice, none outside `urls`, at most `capacity`; with
 * share 0, exactly orderStalestCardRushPages.
 */
export function orderCardRushPages({ urls, last, basket, capacity, now, share = CARDRUSH_REREAD.share }: {
  urls: readonly string[]; last: ReadonlyMap<string, number>; basket: ReadonlySet<string>; capacity: number; now: number; share?: number;
}): { urls: string[]; reread: CardRushRereadCounts } {
  const listed = urls.flatMap((url, order) => {
    const id = cardRushSourceProductId(url);
    const at = id === null || !basket.has(id) ? undefined : last.get(id);
    return at === undefined ? [] : [{ url, order, at, age: now - at }];
  });
  const urgent = (age: number) => age >= URGENT_MS && age < LAPSED_MS;
  const due = listed.filter(entry => entry.age >= CARDRUSH_REREAD.dueAfterMs)
    .sort((a, b) => Number(urgent(b.age)) - Number(urgent(a.age)) || a.at - b.at || a.order - b.order);
  const room = Math.max(0, Math.floor(capacity * Math.min(1, Math.max(0, share))));
  const first = due.slice(0, room).map(entry => entry.url);
  const taken = new Set(first);
  const rest = orderStalestCardRushPages(urls.filter(url => !taken.has(url)), last, capacity - first.length);
  return {
    urls: [...first, ...rest],
    reread: {
      basket: basket.size, listed: listed.length, due: due.length, chosen: first.length,
      urgent: due.filter(entry => urgent(entry.age)).length,
      lapsed: listed.filter(entry => entry.age >= LAPSED_MS).length,
      oldestHours: Math.floor(Math.max(0, ...listed.map(entry => entry.age)) / HOUR),
    },
  };
}

/** The collector's chooser. On a host whose titles place listings in a set
 * (today One Piece), due basket members first (orderCardRushPages over the
 * readings and the basket, read in parallel), with what it found of the
 * basket; on any other host, or with CARDRUSH_REREAD.share 0, today's
 * stalest order and no counts. No query when there is nothing to choose.
 */
export async function chooseCardRushPages(host: string, productUrls: readonly string[], capacity: number, runQuery: typeof query = query, now: number = Date.now()): Promise<{ urls: string[]; reread?: CardRushRereadCounts }> {
  if (capacity <= 0 || !productUrls.length) return { urls: [] };
  if (!CARDRUSH_COLLECTOR_HOSTS[host]?.crosswalk || CARDRUSH_REREAD.share <= 0) return { urls: await chooseStalestCardRushPages(host, productUrls, capacity, runQuery) };
  const [last, basket] = await Promise.all([readCardRushReadings(host, runQuery), readCardRushBasket(host, runQuery)]);
  return orderCardRushPages({ urls: productUrls, last, basket, capacity, now });
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
  const hosts = await readCollectorHosts('cardrush', [host], runQuery);
  const closed: HostClosed | null = closedHost(hosts, [host], Date.now());
  if (closed) return { ...base, ...closed };
  // What the chooser found of the re-read basket, for the run's summary.
  const choice: { reread?: CardRushRereadCounts } = {};
  const acquired = await acquireCardRushMemberPrices(context, {
    evidenceVersion: policy.evidenceVersion, host,
    budgetMs: CARDRUSH_MAX_BUDGET_MS - WRITE_RESERVE_MS - (Date.now() - started),
    choose: async (productUrls, capacity) => {
      const chosen = await chooseCardRushPages(host, productUrls, capacity, runQuery);
      choice.reread = chosen.reread;
      return chosen.urls;
    },
  });
  const { productCrosswalks, setCrosswalks, listingImages, ...parsed } = acquired.parsed;
  const summary: CardRushRunSummary = {
    ...base, ran: true, requested: acquired.requested, observed: parsed.observations.length, quarantined: parsed.quarantine.length,
    ...(acquired.unavailable ? { unavailable: acquired.unavailable } : {}), sitemapProducts: acquired.sitemapProducts, robotsDisallowed: acquired.robotsDisallowed,
    ...(choice.reread ? { reread: choice.reread } : {}), batch: null,
  };
  const batch = acquired.unavailable
    ? { ...parsed, quarantine: [...parsed.quarantine, { sourceProductId: null, field: 'host', reason: acquired.unavailable.reason }] }
    : parsed;
  // Served, refused, or neither (a failure that says nothing about this
  // collector). Recorded first: a refusal is honoured whatever the writes do.
  const outcome: HostOutcome | null = acquired.refused
    ? { host, kind: 'refused', reason: acquired.unavailable?.reason ?? 'refused', retryAfter: acquired.refused.retryAfter }
    : acquired.unavailable ? null : { host, kind: 'collected' };
  summary.hostState = await recordCollectorHostOutcomes('cardrush', outcome ? [outcome] : [], hosts, runQuery, Date.now());
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
  // A repeated run key wrote nothing, so it links nothing.
  if (!written.duplicate) summary.listingImages = await writeCardRushListingImages(listingImages, batch.observations, runQuery);
  return summary;
}
