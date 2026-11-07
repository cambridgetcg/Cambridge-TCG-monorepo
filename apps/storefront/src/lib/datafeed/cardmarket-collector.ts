import 'server-only';
import { query, transaction } from '@/lib/db';
import { CardmarketPublicFileError } from '@cambridge-tcg/data-ingest/cardmarket';
import { CARDMARKET_PRICE_GAMES } from '@cambridge-tcg/data-ingest/cardmarket/member-prices';
import { MEMBER_PRICE_POLICIES } from '@cambridge-tcg/data-ingest/member-prices';
import { hostRefusal } from '@cambridge-tcg/data-ingest/http';
import type { IngestContext } from '@cambridge-tcg/data-ingest/types';
import { ingestMemberPriceSource } from './member-price-ingest';
import { writeSetCrosswalk } from './crosswalks';
import { cardmarketSetCrosswalkSeed } from './cardmarket-expansions';
import { withCollectorLease, type CollectorLeaseRefusal } from './collector-lease';
import { CARDMARKET_COLLECT_GAMES } from './collection-flags';
import { closedHost, COLLECTOR_HOSTS, readCollectorHosts, recordCollectorHostOutcomes, type HostClosed, type HostOutcome, type HostStateWrite } from './collector-hosts';

/** The run's budget: the route's maxDuration (300 s) less room to report. */
export const CARDMARKET_COLLECT_BUDGET_MS = 270_000;

export type CardmarketGameRun = { gameId: number; game: string } & (
  | Omit<Awaited<ReturnType<typeof ingestMemberPriceSource>>, 'source'>
  | { status: 'source-unavailable'; code: 'SOURCE_UNAVAILABLE'; detail: string; httpStatus: number | null }
  | { status: 'budget-exhausted' | 'not-started' | 'revoked-or-unreviewed' | 'failed'; code: string }
);
export interface CardmarketSetCrosswalkRun {
  status: 'completed' | 'skipped' | 'failed';
  code?: string;
  rows: number;
  written: number;
  superseded: number;
  unchanged: number;
  /** Live rows another writer holds (an operator review), left standing. */
  kept: number;
}
export interface CardmarketCollection {
  ran: true;
  ok: boolean;
  source: 'cardmarket';
  evidenceVersion: string;
  budgetMs: number;
  elapsedMs: number;
  games: CardmarketGameRun[];
  setCrosswalks: CardmarketSetCrosswalkRun;
  /** The file host's state after this run; skipped while 0146 is not applied. */
  hostState: HostStateWrite;
}

class CollectionBudgetExhausted extends Error { constructor() { super('cardmarket-collection-budget-exhausted'); } }
// Our own errors carry kebab-case codes; anything else (driver text, SQL)
// stays in the server log, not the response.
const errorCode = (error: unknown) => error instanceof Error && /^[a-z0-9-]{1,80}$/.test(error.message) ? error.message : 'unexpected-error';
const REVOKED = new Set(['member-price-acquisition-revoked-or-unreviewed', 'member-price-source-revoked-or-unreviewed']);

/** One run of the scheduled Cardmarket collection. Refuses unless passed the
 * Cardmarket policy's evidence version. The official-file transport and the
 * ingest seam do the work: release check, identified fetch, parse, then the
 * writer, which re-checks the release row inside its transaction. Nothing
 * here writes a release row. Every query in a write first checks the
 * budget, so a run that runs out rolls its batch back rather than leaving
 * part of one. A host that refuses or fails to deliver ends the run as
 * SOURCE_UNAVAILABLE; the next scheduled run is the retry. One run at a time
 * holds the 'cardmarket' lease (migration 0143); another answers ran:false
 * before any download or write. Under it, the file host's state (migration
 * 0146) is read first: a host that refused an earlier run (a 403, a 429, a 503
 * with Retry-After) is left alone until its Retry-After or 6 h has passed, and
 * one suspended after three refused runs in a row until a person clears it.
 */
export async function collectCardmarketMemberPrices(
  evidenceVersion: string,
  options: CardmarketCollectOptions = {},
): Promise<CardmarketCollection | CollectorLeaseRefusal | HostClosed> {
  if (evidenceVersion !== MEMBER_PRICE_POLICIES.cardmarket.evidenceVersion) throw new Error('cardmarket-collection-evidence-mismatch');
  const games = options.games ?? CARDMARKET_COLLECT_GAMES;
  if (!games.length || games.some(gameId => !Object.hasOwn(CARDMARKET_PRICE_GAMES, gameId))) throw new Error('unreviewed-cardmarket-game');
  const leased = await withCollectorLease('cardmarket', () => collect(evidenceVersion, games, options), { runQuery: options.runQuery ?? query });
  return leased.ran ? leased.value : leased;
}
interface CardmarketCollectOptions { games?: readonly number[]; budgetMs?: number; context?: IngestContext; runQuery?: typeof query; runTransaction?: typeof transaction }

async function collect(evidenceVersion: string, games: readonly number[], options: CardmarketCollectOptions): Promise<CardmarketCollection | HostClosed> {
  const runQuery = options.runQuery ?? query, fileHosts = COLLECTOR_HOSTS.cardmarket;
  const hosts = await readCollectorHosts('cardmarket', fileHosts, runQuery);
  const closed = closedHost(hosts, fileHosts, Date.now());
  if (closed) return closed;
  const budgetMs = options.budgetMs ?? CARDMARKET_COLLECT_BUDGET_MS;
  const started = Date.now();
  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(new CollectionBudgetExhausted()), budgetMs);
  const signal = options.context?.signal ? AbortSignal.any([budget.signal, options.context.signal]) : budget.signal;
  const runTransaction = options.runTransaction ?? transaction;
  const budgeted: typeof transaction = work => runTransaction(tx => work((sql, params) => {
    if (signal.aborted) throw new CollectionBudgetExhausted();
    return tx(sql, params);
  }));

  const runs: CardmarketGameRun[] = [];
  // The status that ended the run; later games are not started.
  let stopped: 'budget-exhausted' | 'source-unavailable' | 'revoked-or-unreviewed' | 'failed' | null = null;
  let refusal: HostOutcome | null = null;
  try {
    for (const gameId of games) {
      const game = CARDMARKET_PRICE_GAMES[gameId]!;
      if (stopped || signal.aborted) { runs.push({ gameId, game, status: 'not-started', code: stopped ?? 'budget-exhausted' }); continue; }
      try {
        const { source: _source, ...result } = await ingestMemberPriceSource({ source: 'cardmarket', gameId }, { ...options.context, signal }, budgeted);
        runs.push({ gameId, game, ...result });
      } catch (error) {
        if (signal.aborted) {
          stopped = 'budget-exhausted';
          runs.push({ gameId, game, status: 'budget-exhausted', code: 'cardmarket-collection-budget-exhausted' });
        } else if (error instanceof CardmarketPublicFileError && (error.code === 'http-error' || error.code === 'aborted')) {
          // Refused, failed or too slow for the acquisition's own deadline.
          // Asking the same host for the next game would not be polite.
          stopped = 'source-unavailable';
          runs.push({ gameId, game, status: 'source-unavailable', code: 'SOURCE_UNAVAILABLE', detail: error.code, httpStatus: error.status ?? null });
          const refused = error.status === undefined ? null : hostRefusal(error.status, error.retryAfter ?? null);
          if (refused) refusal = { host: error.url ? new URL(error.url).hostname : fileHosts[0]!, kind: 'refused', reason: `http-${error.status}`, retryAfter: refused.retryAfter };
        } else if (REVOKED.has(errorCode(error))) {
          stopped = 'revoked-or-unreviewed';
          runs.push({ gameId, game, status: 'revoked-or-unreviewed', code: errorCode(error) });
        } else {
          // Any other fault ends the run too; the next scheduled run tries again.
          console.error('[cardmarket-collector] game failed', gameId, error instanceof Error ? error.name : 'UnknownError');
          stopped = 'failed';
          runs.push({ gameId, game, status: 'failed', code: error instanceof CardmarketPublicFileError ? error.code : errorCode(error) });
        }
      }
    }
    const setCrosswalks = await writeSeed(stopped === 'revoked-or-unreviewed' ? stopped : signal.aborted ? 'budget-exhausted' : null, budgeted);
    const ok = runs.every(run => run.status === 'completed' || run.status === 'completed-with-quarantine') && setCrosswalks.status === 'completed';
    // Every file served is the host serving this collector; a refusal counts
    // against it; any other ending changes nothing.
    const served = runs.every(run => run.status === 'completed' || run.status === 'completed-with-quarantine');
    const outcomes: HostOutcome[] = refusal ? [refusal] : served ? fileHosts.map(host => ({ host, kind: 'collected' as const })) : [];
    const hostState = await recordCollectorHostOutcomes('cardmarket', outcomes, hosts, runQuery, Date.now());
    return { ran: true, ok, source: 'cardmarket', evidenceVersion, budgetMs, elapsedMs: Date.now() - started, games: runs, setCrosswalks, hostState };
  } finally {
    clearTimeout(timer);
  }
}

/** The reviewed One Piece set seed, through the existing set writer under the
 * collectors' one rule (crosswalks.ts collectorMaySupersede). An unchanged live
 * row stays as it is, so a daily run writes nothing new until the seed's
 * version changes, and a row another writer holds stays too. */
async function writeSeed(skip: 'revoked-or-unreviewed' | 'budget-exhausted' | null, runTransaction: typeof transaction): Promise<CardmarketSetCrosswalkRun> {
  const rows = cardmarketSetCrosswalkSeed();
  const run: CardmarketSetCrosswalkRun = { status: 'completed', rows: rows.length, written: 0, superseded: 0, unchanged: 0, kept: 0 };
  if (skip) return { ...run, status: 'skipped', code: skip };
  try {
    for (const row of rows) {
      const result = await writeSetCrosswalk(row, runTransaction, { collector: true });
      if (result.foreign) run.kept++;
      else if (result.unchanged) run.unchanged++;
      else { run.written++; if (result.supersededId) run.superseded++; }
    }
    return run;
  } catch (error) {
    console.error('[cardmarket-collector] set crosswalks failed', error instanceof Error ? error.name : 'UnknownError');
    return { ...run, status: 'failed', code: errorCode(error) };
  }
}
