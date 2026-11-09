import 'server-only';
import { query, transaction } from '@/lib/db';
import { MEMBER_PRICE_POLICIES, TCGPLAYER_EVIDENCE_VERSION } from '@cambridge-tcg/data-ingest/member-prices';
import {
  acquireTcgplayerPriceGuide, createTcgplayerFetcher, fetchTcgplayerCardsProductType, fetchTcgplayerSets, readTcgplayerRobots, tcgplayerSetDisallowed,
  TCGPLAYER_COLLECTOR_HOSTS, TCGPLAYER_PRODUCT_LINES, TCGPLAYER_REQUEST_INTERVAL_MS, TcgplayerUnavailableError, type TcgplayerProductLine, type TcgplayerSet,
} from '@cambridge-tcg/data-ingest/tcgplayer/member-prices';
import type { Fetcher, HostRefusal } from '@cambridge-tcg/data-ingest/http';
import { writeMemberPriceBatch } from '../member-price-writer';
import { writeProductCrosswalk, writeSetCrosswalk } from '../crosswalks';
import { withCollectorLease, type CollectorLeaseRefusal } from '../collector-lease';
import { closedHost, readCollectorHosts, recordCollectorHostOutcomes, type HostClosed, type HostOutcome, type HostStateWrite } from '../collector-hosts';

/** One run's wall-clock budget. The route's maxDuration (300 s) leaves room
 * past it to finish the last set's writes and report. */
export const TCGPLAYER_RUN_BUDGET_MS = 270_000;
/** A set is not begun with less left than the run's request interval (10 s,
 * or the longer Crawl-delay its robots.txt asks) and this: its read waits
 * that long, then its batch and crosswalks are written.
 */
const SET_WRITE_RESERVE_MS = 20_000;

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
  /** Between requests this run: 10 s, or the longer Crawl-delay robots.txt asked. */
  intervalMs: number;
  setsListed: number; sets: TcgplayerSetResult[];
  /** Listed sets whose page or data robots.txt disallows: never requested,
   * and no batch written for them. */
  robotsDisallowed: number;
  /** skipped: live rows another writer holds (an operator review), left standing. */
  crosswalks: { setWritten: number; productWritten: number; productUnchanged: number; skipped: number; failed: number };
  /** A set's entry says whether its failure was recorded as that set's reading. */
  errors: { line: string; setId?: number; error: string; recorded?: boolean }[];
  /** refused: the host refused this collector (a 403, a 429, a 503 with
   * Retry-After, robots.txt disallowing it or every listed set, a Crawl-delay
   * the run cannot keep), which its host state counts. */
  unavailable?: { reason: string; status: number | null; url: string; refused: boolean };
  /** Every host's state after this run; skipped while 0146 is not applied. */
  hostState?: HostStateWrite;
}
/** Another run holds the lease, the store has no lease table, or a TCGplayer
 * host is suspended or not to be asked yet (migration 0146): nothing was read. */
export type TcgplayerRunRefused = (CollectorLeaseRefusal | HostClosed) & { runAt: string; requests: 0 };
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
/** robots.txt refusing this collector: no HTTP answer, no Retry-After. */
const ROBOTS_REFUSAL: HostRefusal = { status: null, retryAfter: null };
const released = (date: string | null) => (date ? Date.parse(date) : NaN) || 0;

/** A line's turn: its sets not yet taken this run, stalest first. The run
 * takes the turn's set with `sets.shift()`, and every turn takes at least one
 * (a line that can read nothing this run is emptied), so the turns end. */
export interface TcgplayerTurn { line: TcgplayerProductLine; sets: TcgplayerSet[] }

/** The lines take turns, one set a turn. Each round gives every line with
 * sets left one turn, in one order for the whole run: the line read least
 * recently first, by its latest reading (a line never read comes first of
 * all; of two lines last read together, the one whose next set is stalest).
 * Within a line, sets go stalest first (never read, then longest ago; newest
 * release first among equals). So a line with many sets, or many never read,
 * has its own share of a run and never another line's: what decides a line's
 * place is when it was last read, not how stale its backlog is. A run's
 * spare turns go to the lines that waited longest, and the next run's to the
 * others; a run with fewer turns than lines (a long Crawl-delay) gives them
 * in rotation. One queue across all lines put every never-read set first:
 * switching on Pokemon's 220 sets would have read nothing else for the first
 * dozen or so runs, as one global queue starved One Piece in the wholesale
 * ingest (price-snapshot-v2.ts, 2026-07-05). The cost is that each line is
 * read through at a pace set by its own size: a run of 16 sets gives each of
 * three lines 5 or 6, about 5⅓ on average, so a line of n sets is read
 * through in about 3n/16 runs.
 */
export function* tcgplayerTurns(candidates: readonly { line: TcgplayerProductLine; set: TcgplayerSet }[], lastRead: ReadonlyMap<number, number>): Generator<TcgplayerTurn> {
  const age = (set: TcgplayerSet) => lastRead.get(set.setId) ?? -Infinity;
  const stalest = (a: TcgplayerSet, b: TcgplayerSet) => (age(a) - age(b)) || (released(b.releaseDate) - released(a.releaseDate)) || (a.setId - b.setId);
  const turns = new Map<string, TcgplayerTurn>();
  for (const { line, set } of candidates) {
    const turn = turns.get(line.slug) ?? { line, sets: [] };
    turns.set(line.slug, turn);
    turn.sets.push(set);
  }
  const latest = new Map<TcgplayerTurn, number>();
  for (const turn of turns.values()) {
    turn.sets.sort(stalest);
    latest.set(turn, turn.sets.reduce((at, set) => Math.max(at, age(set)), -Infinity));
  }
  // Two lines never read differ by -Infinity - -Infinity, NaN, which falls through to their next sets.
  const order = [...turns.values()].sort((a, b) => (latest.get(a)! - latest.get(b)!) || stalest(a.sets[0]!, b.sets[0]!));
  while (true) {
    const round = order.filter(turn => turn.sets.length);
    if (!round.length) return;
    for (const turn of round) if (turn.sets.length) yield turn;
  }
}

/** One run: read every TCGplayer host's robots.txt (readTcgplayerRobots),
 * list the configured lines' sets, then read them with the lines taking
 * turns (tcgplayerTurns), each line's stalest first, one request at a
 * time, until every set is read or the budget is spent. Each set
 * is one batch named tcgplayer:<setId>:<run>, which is how the next run knows
 * its age, and its crosswalks go through the crosswalk writers. A refusal ends
 * the run as SOURCE_UNAVAILABLE; revocation ends it before or between sets.
 * A set whose read or write fails is recorded as read, with an empty batch
 * whose quarantine names the failure: no observation is invented, and the next
 * run moves on to other sets instead of starting with it forever. A set
 * robots.txt disallows is skipped unasked and unrecorded: it costs no request
 * and no turn, so it starves no other set, and leaves no empty batch in the
 * append-only store; robots.txt that leaves no listed set, or a Crawl-delay
 * that leaves the budget no set, refuses the run. The budget's timeout cutting
 * a request short is a budget stop, not that set's failure.
 * Every TCGplayer host shares one bucket, so one lease ('tcgplayer', migration
 * 0143) covers the run from before its first request to its last write, and
 * keeps the next run's first request the run's interval after it ends. Under
 * it, before any request, the hosts' state (migration 0146) is read: if any
 * of the three is suspended or not to be asked yet, the run asks none, since
 * it reads all three. At the end a refused host's backoff moves on, and a run
 * that wrote a set resets every host's count.
 */
export async function collectTcgplayer(options: TcgplayerCollectorOptions = {}): Promise<TcgplayerRun | TcgplayerRunRefused> {
  const now = options.now ?? Date.now;
  const runQuery = options.runQuery ?? query, runTransaction = options.runTransaction ?? transaction;
  const started = now(), deadline = started + TCGPLAYER_RUN_BUDGET_MS;
  const run: TcgplayerRun = {
    ran: true, status: 'ok', stoppedBy: 'all-sets-read', runAt: new Date(started).toISOString(), elapsedMs: 0, requests: 0, intervalMs: TCGPLAYER_REQUEST_INTERVAL_MS, setsListed: 0, sets: [], robotsDisallowed: 0,
    crosswalks: { setWritten: 0, productWritten: 0, productUnchanged: 0, skipped: 0, failed: 0 }, errors: [],
  };
  // The writer re-checks the release in each transaction; checking first spares the source.
  const policy = MEMBER_PRICE_POLICIES.tcgplayer;
  const release = await runQuery(`SELECT source FROM member_price_source_releases WHERE source='tcgplayer' AND evidence_version=$1 AND evidence_url=$2 AND revoked_at IS NULL AND member_display`, [policy.evidenceVersion, policy.evidenceUrl]);
  if (!release.rows.length) return { ...run, status: 'release-revoked-or-unreviewed', stoppedBy: 'release' };
  // A duplicate delivery or a manual call during a scheduled run would ask
  // TCGplayer twice as often as its Crawl-Delay: it is refused before any
  // request, and so is a run that would start within the last run's interval
  // of its end.
  const leased = await withCollectorLease('tcgplayer', () => readSets(run, { ...options, now, runQuery, runTransaction, started, deadline }),
    { runQuery, spacingMs: () => run.intervalMs });
  return leased.ran ? leased.value : { ...leased, runAt: run.runAt, requests: 0 };
}

/** One leased run: robots.txt, then the lines' sets, the lines taking turns. */
async function readSets(run: TcgplayerRun, options: TcgplayerCollectorOptions & {
  now: () => number; runQuery: typeof query; runTransaction: typeof transaction; started: number; deadline: number;
}): Promise<TcgplayerRun | TcgplayerRunRefused> {
  const { now, runQuery, runTransaction, started, deadline } = options;
  const hosts = await readCollectorHosts('tcgplayer', TCGPLAYER_COLLECTOR_HOSTS, runQuery);
  const closed = closedHost(hosts, TCGPLAYER_COLLECTOR_HOSTS, now());
  if (closed) return { ...closed, runAt: run.runAt, requests: 0 };
  const base = options.fetcher ?? createTcgplayerFetcher({ signal: AbortSignal.timeout(TCGPLAYER_RUN_BUDGET_MS) });
  const left = () => deadline - now();
  const reserve = () => run.intervalMs + SET_WRITE_RESERVE_MS;
  const lines = (options.lines ?? TCGPLAYER_PRODUCT_LINES).filter(entry => entry.collect);
  let refusal: HostOutcome | null = null;
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
    // Before any data request, every run: no reading of an earlier run is reused.
    const fetcher = await readTcgplayerRobots(base, TCGPLAYER_EVIDENCE_VERSION, lines);
    run.intervalMs = fetcher.robots.intervalMs;
    // A Crawl-delay under readTcgplayerRobots' 60 s cap can still leave this
    // budget no set: each line's set list, the product types and then a set,
    // each the interval apart, and that set's writes must fit in what is left.
    // Otherwise every run would spend its requests on lists and read nothing.
    if (fetcher.robots.delayHost && left() < (lines.length + 2) * run.intervalMs + SET_WRITE_RESERVE_MS) {
      throw new TcgplayerUnavailableError('robots-crawl-delay-too-long', null, `https://${fetcher.robots.delayHost}/robots.txt`, ROBOTS_REFUSAL);
    }
    const lastRead = new Map<number, number>();
    for (const row of (await runQuery(`SELECT split_part(ingest_key, ':', 2) AS set_id, EXTRACT(EPOCH FROM max(inserted_at))::float8 AS last_read
      FROM member_price_batches WHERE source='tcgplayer' AND ingest_key LIKE 'tcgplayer:%' GROUP BY 1`)).rows) {
      lastRead.set(Number(row.set_id), Number(row.last_read));
    }
    const candidates: { line: TcgplayerProductLine; set: TcgplayerSet }[] = [];
    for (const line of lines) {
      if (left() < reserve()) break;
      try { for (const set of await fetchTcgplayerSets(fetcher, TCGPLAYER_EVIDENCE_VERSION, line)) candidates.push({ line, set }); }
      catch (error) { if (error instanceof TcgplayerUnavailableError || aborted(error)) throw error; run.errors.push({ line: line.slug, error: message(error) }); }
    }
    run.setsListed = candidates.length;

    const productTypes = new Map<string, number | null>();
    let disallowed: string | null = null;
    for (const turn of tcgplayerTurns(candidates, lastRead)) {
      const { line } = turn;
      if (left() < reserve()) { run.stoppedBy = 'budget'; break; }
      if (!productTypes.has(line.slug)) {
        // A line's product types are asked only when a set can follow them
        // this run; otherwise the request would buy nothing. The line passes
        // its turns unread, so next run it comes before the lines read now.
        if (left() < run.intervalMs + reserve()) { run.stoppedBy = 'budget'; turn.sets.length = 0; continue; }
        try { productTypes.set(line.slug, await fetchTcgplayerCardsProductType(fetcher, TCGPLAYER_EVIDENCE_VERSION, line)); }
        catch (error) { if (error instanceof TcgplayerUnavailableError || aborted(error)) throw error; productTypes.set(line.slug, null); run.errors.push({ line: line.slug, error: message(error) }); }
        if (left() < reserve()) { run.stoppedBy = 'budget'; break; }
      }
      const productTypeId = productTypes.get(line.slug);
      // A line without its product type reads nothing this run.
      if (productTypeId == null) { turn.sets.length = 0; continue; }
      // A set robots.txt disallows costs no request and no turn: the line's
      // next set takes the turn.
      let set: TcgplayerSet | undefined, refused: string | null = null;
      while ((set = turn.sets.shift()) && (refused = tcgplayerSetDisallowed(fetcher, { line, set, productTypeId }))) { run.robotsDisallowed++; disallowed ??= refused; }
      if (!set) continue;
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
    // As CardRush's run stops when robots.txt permits no listed page.
    if (disallowed && run.robotsDisallowed === candidates.length) throw new TcgplayerUnavailableError('robots-disallows-collector', null, disallowed, ROBOTS_REFUSAL);
  } catch (error) {
    if (error instanceof TcgplayerUnavailableError) {
      run.status = 'source-unavailable'; run.stoppedBy = 'source-unavailable';
      run.unavailable = { reason: error.reason, status: error.status, url: error.url, refused: error.refused !== null };
      if (error.refused) refusal = { host: new URL(error.url).hostname, kind: 'refused', reason: error.reason, retryAfter: error.refused.retryAfter };
    } else if (message(error) === REVOKED) {
      run.status = 'release-revoked-or-unreviewed'; run.stoppedBy = 'release';
    } else if (aborted(error)) {
      // The 270 s timeout fired mid-request: what was written stands, and the
      // cut request's set stays as stale as it was for the next run.
      run.stoppedBy = 'budget';
    } else throw error;
  } finally {
    run.requests = base.count;
    run.elapsedMs = now() - started;
  }
  // A run that wrote no set collected nothing, whatever else it recorded.
  if (run.status === 'ok' && !run.sets.length) run.status = 'no-set-written';
  // A run that wrote a set was served by all three hosts (robots.txt, set
  // lists, a guide); a refused one counts against the host that refused. Any
  // other ending says nothing about this collector and changes no host.
  const outcomes: HostOutcome[] = refusal ? [refusal] : run.status === 'ok' ? TCGPLAYER_COLLECTOR_HOSTS.map(host => ({ host, kind: 'collected' as const })) : [];
  run.hostState = await recordCollectorHostOutcomes('tcgplayer', outcomes, hosts, runQuery, now());
  return run;
}
