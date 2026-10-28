import 'server-only';
import { query, transaction } from '@/lib/db';
import { MEMBER_PRICE_POLICIES, TCGPLAYER_EVIDENCE_VERSION } from '@cambridge-tcg/data-ingest/member-prices';
import {
  acquireTcgplayerPriceGuide, createTcgplayerFetcher, fetchTcgplayerCardsProductType, fetchTcgplayerSets,
  TCGPLAYER_PRODUCT_LINES, TCGPLAYER_RATE_LIMIT, TcgplayerUnavailableError, type TcgplayerProductLine, type TcgplayerSet,
} from '@cambridge-tcg/data-ingest/tcgplayer/member-prices';
import type { Fetcher } from '@cambridge-tcg/data-ingest/http';
import { writeMemberPriceBatch } from '../member-price-writer';
import { writeProductCrosswalk, writeSetCrosswalk } from '../crosswalks';
import { withCollectorLease, type CollectorLeaseRefusal } from '../collector-lease';

/** One run's wall-clock budget. The route's maxDuration (300 s) leaves room
 * past it to finish the last set's writes and report. */
export const TCGPLAYER_RUN_BUDGET_MS = 270_000;
/** A set is not begun with less left: its read waits up to 10 s for the
 * shared bucket, then its batch and crosswalks are written.
 */
const SET_RESERVE_MS = 30_000;

export interface TcgplayerSetResult {
  line: string; setId: number; abbreviation: string; batchId: string; duplicate: boolean;
  sourceRows: number; observations: number; inserted: number; mapped: number; quarantined: number;
  setCode: string | null; productCrosswalks: number;
}
export interface TcgplayerRun {
  ran: true;
  /** no-set-written: the run ended without writing any set's guide (every read
   * or write failed, the set lists failed, or the budget ran out first). */
  status: 'ok' | 'no-set-written' | 'source-unavailable' | 'release-revoked-or-unreviewed';
  stoppedBy: 'all-sets-read' | 'budget' | 'source-unavailable' | 'release';
  runAt: string; elapsedMs: number; requests: number;
  setsListed: number; sets: TcgplayerSetResult[];
  /** skipped: live rows another writer holds (an operator review), left standing. */
  crosswalks: { setWritten: number; productWritten: number; productUnchanged: number; skipped: number; failed: number };
  /** A set's entry says whether its failure was recorded as that set's reading. */
  errors: { line: string; setId?: number; error: string; recorded?: boolean }[];
  unavailable?: { reason: string; status: number | null; url: string };
}
/** Another run holds the lease, or the store has no lease table: nothing was read. */
export type TcgplayerRunRefused = CollectorLeaseRefusal & { runAt: string; requests: 0 };
export interface TcgplayerCollectorOptions {
  /** Tests only. A run otherwise builds the identified fetcher whose single
   * bucket spaces every TCGplayer request 10 s apart; acquisition refuses a
   * proxied one either way.
   */
  fetcher?: Fetcher;
  now?: () => number;
  runQuery?: typeof query;
  runTransaction?: typeof transaction;
  lines?: readonly TcgplayerProductLine[];
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200);
// What is stored names our own kebab-case codes only; driver text stays out of the database.
const errorCode = (error: unknown) => error instanceof Error && /^[a-z0-9-]{1,80}$/.test(error.message) ? error.message : 'unexpected-error';
/** The run's budget timeout (or the caller's abort) cut a request short. */
const aborted = (error: unknown) => error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
const REVOKED = 'member-price-source-revoked-or-unreviewed';
const released = (date: string | null) => (date ? Date.parse(date) : NaN) || 0;

/** One run: list the configured lines' sets, then read them stalest first
 * (never read, then longest ago; newest release first among equals), one
 * request at a time, until every set is read or the budget is spent. Each set
 * is one batch named tcgplayer:<setId>:<run>, which is how the next run knows
 * its age, and its crosswalks go through the crosswalk writers. A refusal ends
 * the run as SOURCE_UNAVAILABLE; revocation ends it before or between sets.
 * A set whose read or write fails is recorded as read, with an empty batch
 * whose quarantine names the failure: no observation is invented, and the next
 * run moves on to other sets instead of starting with it forever. The budget's
 * timeout cutting a request short is a budget stop, not that set's failure.
 * Every TCGplayer host shares one bucket, so one lease ('tcgplayer', migration
 * 0143) covers the run from before its first request to its last write, and
 * keeps the next run's first request 10 s after it ends.
 */
export async function collectTcgplayer(options: TcgplayerCollectorOptions = {}): Promise<TcgplayerRun | TcgplayerRunRefused> {
  const now = options.now ?? Date.now;
  const runQuery = options.runQuery ?? query, runTransaction = options.runTransaction ?? transaction;
  const started = now(), deadline = started + TCGPLAYER_RUN_BUDGET_MS;
  const run: TcgplayerRun = {
    ran: true, status: 'ok', stoppedBy: 'all-sets-read', runAt: new Date(started).toISOString(), elapsedMs: 0, requests: 0, setsListed: 0, sets: [],
    crosswalks: { setWritten: 0, productWritten: 0, productUnchanged: 0, skipped: 0, failed: 0 }, errors: [],
  };
  // The writer re-checks the release in each transaction; checking first spares the source.
  const policy = MEMBER_PRICE_POLICIES.tcgplayer;
  const release = await runQuery(`SELECT source FROM member_price_source_releases WHERE source='tcgplayer' AND evidence_version=$1 AND evidence_url=$2 AND revoked_at IS NULL AND member_display`, [policy.evidenceVersion, policy.evidenceUrl]);
  if (!release.rows.length) return { ...run, status: 'release-revoked-or-unreviewed', stoppedBy: 'release' };
  // A duplicate delivery or a manual call during a scheduled run would ask
  // TCGplayer twice as often as its Crawl-Delay: it is refused before any
  // request, and so is a run that would start within 10 s of the last one's end.
  const leased = await withCollectorLease('tcgplayer', () => readSets(run, { ...options, now, runQuery, runTransaction, started, deadline }),
    { runQuery, spacingMs: Math.ceil(1000 / TCGPLAYER_RATE_LIMIT.rps) });
  return leased.ran ? leased.value : { ran: false, reason: leased.reason, runAt: run.runAt, requests: 0 };
}

/** One leased run: list the lines' sets, then read them stalest first. */
async function readSets(run: TcgplayerRun, options: TcgplayerCollectorOptions & {
  now: () => number; runQuery: typeof query; runTransaction: typeof transaction; started: number; deadline: number;
}): Promise<TcgplayerRun> {
  const { now, runQuery, runTransaction, started, deadline } = options;
  const fetcher = options.fetcher ?? createTcgplayerFetcher({ signal: AbortSignal.timeout(TCGPLAYER_RUN_BUDGET_MS) });
  const left = () => deadline - now();
  // The set's batch name, under which its failure is its reading too.
  const recordFailure = async (line: TcgplayerProductLine, set: TcgplayerSet, error: unknown, sourceRows = 0) => {
    const entry: TcgplayerRun['errors'][number] = { line: line.slug, setId: set.setId, error: message(error), recorded: false };
    try {
      await writeMemberPriceBatch('tcgplayer', { observations: [], quarantine: [{ sourceProductId: null, field: 'set', reason: errorCode(error) }], sourceRows, missingPrices: 0 },
        runTransaction, { ingestKey: `tcgplayer:${set.setId}:${run.runAt}` });
      entry.recorded = true;
    } catch (failure) {
      if (message(failure) === REVOKED) throw failure;
    }
    run.errors.push(entry);
  };
  try {
    const lastRead = new Map<number, number>();
    for (const row of (await runQuery(`SELECT split_part(ingest_key, ':', 2) AS set_id, EXTRACT(EPOCH FROM max(inserted_at))::float8 AS last_read
      FROM member_price_batches WHERE source='tcgplayer' AND ingest_key LIKE 'tcgplayer:%' GROUP BY 1`)).rows) {
      lastRead.set(Number(row.set_id), Number(row.last_read));
    }
    const candidates: { line: TcgplayerProductLine; set: TcgplayerSet }[] = [];
    for (const line of (options.lines ?? TCGPLAYER_PRODUCT_LINES).filter(entry => entry.collect)) {
      if (left() < SET_RESERVE_MS) break;
      try { for (const set of await fetchTcgplayerSets(fetcher, TCGPLAYER_EVIDENCE_VERSION, line)) candidates.push({ line, set }); }
      catch (error) { if (error instanceof TcgplayerUnavailableError || aborted(error)) throw error; run.errors.push({ line: line.slug, error: message(error) }); }
    }
    run.setsListed = candidates.length;
    const age = (set: TcgplayerSet) => lastRead.get(set.setId) ?? -Infinity;
    candidates.sort((a, b) => (age(a.set) - age(b.set)) || (released(b.set.releaseDate) - released(a.set.releaseDate)) || (a.set.setId - b.set.setId));

    const productTypes = new Map<string, number | null>();
    for (const { line, set } of candidates) {
      if (left() < SET_RESERVE_MS) { run.stoppedBy = 'budget'; break; }
      if (!productTypes.has(line.slug)) {
        try { productTypes.set(line.slug, await fetchTcgplayerCardsProductType(fetcher, TCGPLAYER_EVIDENCE_VERSION, line)); }
        catch (error) { if (error instanceof TcgplayerUnavailableError || aborted(error)) throw error; productTypes.set(line.slug, null); run.errors.push({ line: line.slug, error: message(error) }); }
        if (left() < SET_RESERVE_MS) { run.stoppedBy = 'budget'; break; }
      }
      const productTypeId = productTypes.get(line.slug);
      if (productTypeId == null) continue;
      let guide: Awaited<ReturnType<typeof acquireTcgplayerPriceGuide>>;
      try { guide = await acquireTcgplayerPriceGuide(fetcher, TCGPLAYER_EVIDENCE_VERSION, { line, set, productTypeId }); }
      catch (error) { if (error instanceof TcgplayerUnavailableError || aborted(error)) throw error; await recordFailure(line, set, error); continue; }
      let written: Awaited<ReturnType<typeof writeMemberPriceBatch>>;
      try { written = await writeMemberPriceBatch('tcgplayer', guide.parsed, runTransaction, { ingestKey: `tcgplayer:${set.setId}:${run.runAt}` }); }
      catch (error) { if (message(error) === REVOKED) throw error; await recordFailure(line, set, error, guide.parsed.sourceRows); continue; }
      // The collectors' one crosswalk rule (crosswalks.ts collectorMaySupersede):
      // rows of another family, an operator review's, stay live.
      if (guide.setCrosswalk) {
        try {
          const result = await writeSetCrosswalk(guide.setCrosswalk, runTransaction, { collector: true });
          if (result.foreign) run.crosswalks.skipped++; else if (!result.unchanged) run.crosswalks.setWritten++;
        } catch { run.crosswalks.failed++; }
      }
      for (const link of guide.productCrosswalks) {
        try {
          const result = await writeProductCrosswalk(link, runTransaction, { collector: true });
          if (result.foreign) run.crosswalks.skipped++; else if (result.unchanged) run.crosswalks.productUnchanged++; else run.crosswalks.productWritten++;
        } catch { run.crosswalks.failed++; }
      }
      run.sets.push({
        line: line.slug, setId: set.setId, abbreviation: set.abbreviation, batchId: written.batchId, duplicate: written.duplicate,
        sourceRows: guide.parsed.sourceRows, observations: guide.parsed.observations.length, inserted: written.inserted,
        mapped: guide.parsed.observations.filter(row => row.mappingStatus === 'exact').length, quarantined: guide.parsed.quarantine.length,
        setCode: guide.setCrosswalk?.setCode ?? null, productCrosswalks: guide.productCrosswalks.length,
      });
    }
  } catch (error) {
    if (error instanceof TcgplayerUnavailableError) {
      run.status = 'source-unavailable'; run.stoppedBy = 'source-unavailable';
      run.unavailable = { reason: error.reason, status: error.status, url: error.url };
    } else if (message(error) === REVOKED) {
      run.status = 'release-revoked-or-unreviewed'; run.stoppedBy = 'release';
    } else if (aborted(error)) {
      // The 270 s timeout fired mid-request: what was written stands, and the
      // cut request's set stays as stale as it was for the next run.
      run.stoppedBy = 'budget';
    } else throw error;
  } finally {
    run.requests = fetcher.count;
    run.elapsedMs = now() - started;
  }
  // A run that wrote no set collected nothing, whatever else it recorded.
  if (run.status === 'ok' && !run.sets.length) run.status = 'no-set-written';
  return run;
}
