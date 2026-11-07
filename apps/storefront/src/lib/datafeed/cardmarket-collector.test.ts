import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardmarketPublicFileError } from '@cambridge-tcg/data-ingest/cardmarket';
import { CARDMARKET_DERIVATION_EVIDENCE_VERSION, CARDMARKET_EVIDENCE_VERSION } from '@cambridge-tcg/data-ingest/member-prices';

vi.mock('server-only', () => ({}));
const ports = vi.hoisted(() => ({ ingest: vi.fn(), writeSet: vi.fn(), transaction: vi.fn(), lease: vi.fn(), readHosts: vi.fn(), recordHosts: vi.fn() }));
vi.mock('@/lib/db', () => ({ query: vi.fn(), transaction: ports.transaction }));
vi.mock('./member-price-ingest', () => ({ ingestMemberPriceSource: ports.ingest }));
vi.mock('./crosswalks', () => ({ writeSetCrosswalk: ports.writeSet }));
vi.mock('./collector-lease', () => ({ withCollectorLease: ports.lease }));
// The host state's storage is collector-hosts.ts's to test; its rules stay real.
vi.mock('./collector-hosts', async importOriginal => ({
  ...await importOriginal<typeof import('./collector-hosts')>(), readCollectorHosts: ports.readHosts, recordCollectorHostOutcomes: ports.recordHosts,
}));
import { CARDMARKET_COLLECT_BUDGET_MS, collectCardmarketMemberPrices } from './cardmarket-collector';
import { CARDMARKET_COLLECT_GAMES } from './collection-flags';
import { CARDMARKET_ONE_PIECE_EXPANSIONS } from './cardmarket-expansions';
import type { CollectorHostRow } from './collector-hosts';

const completed = { source: 'cardmarket', status: 'completed-with-quarantine', sourceRows: 3, observations: 5, mappedObservations: 0, missingPriceFields: 2, quarantined: 1, batchId: '9', inserted: 5, duplicate: false };
/** A run that got its lease; the lease itself is collector-lease.ts's to test. */
async function collect(...args: Parameters<typeof collectCardmarketMemberPrices>) {
  const result = await collectCardmarketMemberPrices(...args);
  if (!result.ran) throw new Error(`not run: ${result.reason}`);
  return result;
}
beforeEach(() => {
  Object.values(ports).forEach(mock => mock.mockReset());
  ports.lease.mockImplementation(async (_key: string, work: () => Promise<unknown>) => ({ ran: true, value: await work() }));
  ports.writeSet.mockResolvedValue({ id: '1', supersededId: null, unchanged: true });
  ports.readHosts.mockResolvedValue(new Map());
  ports.recordHosts.mockImplementation(async (_source: string, outcomes: unknown[]) => ({ recorded: outcomes.length }));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
const HOST = 'downloads.s3.cardmarket.com';
const row = (fields: Partial<CollectorHostRow>): CollectorHostRow => ({ host: HOST, consecutiveRefusals: 0, lastSuccessAt: null, lastRefusalAt: null, lastRefusalReason: null, notBefore: null, suspendedAt: null, suspendedReason: null, ...fields });

describe('scheduled Cardmarket collection', () => {
  it('collects One Piece only, within a 270 s budget, unless Yu widens it', () => {
    expect(CARDMARKET_COLLECT_GAMES).toEqual([18]);
    expect(CARDMARKET_COLLECT_BUDGET_MS).toBe(270_000);
  });

  it.each([CARDMARKET_DERIVATION_EVIDENCE_VERSION, 'cardrush/2026-10-28.1', ''])('refuses another evidence version (%j) before any work', async version => {
    await expect(collectCardmarketMemberPrices(version)).rejects.toThrow('cardmarket-collection-evidence-mismatch');
    expect(ports.ingest).not.toHaveBeenCalled();
    expect(ports.writeSet).not.toHaveBeenCalled();
  });

  it.each([[[]], [[2]], [[18, 999]]])('refuses an unreviewed game list %j before any work', async games => {
    await expect(collectCardmarketMemberPrices(CARDMARKET_EVIDENCE_VERSION, { games })).rejects.toThrow('unreviewed-cardmarket-game');
    expect(ports.ingest).not.toHaveBeenCalled();
  });

  it.each(['run-in-progress', 'lease-not-provisioned'] as const)('takes the cardmarket lease first, and answers %s without downloading or writing', async reason => {
    ports.lease.mockResolvedValueOnce({ ran: false, reason });
    expect(await collectCardmarketMemberPrices(CARDMARKET_EVIDENCE_VERSION)).toEqual({ ran: false, reason });
    expect(ports.lease).toHaveBeenCalledWith('cardmarket', expect.any(Function), expect.objectContaining({ runQuery: expect.any(Function) }));
    expect(ports.ingest).not.toHaveBeenCalled();
    expect(ports.writeSet).not.toHaveBeenCalled();
  });

  it('refuses a wrong evidence version or game before it asks for the lease', async () => {
    await expect(collectCardmarketMemberPrices('')).rejects.toThrow('cardmarket-collection-evidence-mismatch');
    await expect(collectCardmarketMemberPrices(CARDMARKET_EVIDENCE_VERSION, { games: [2] })).rejects.toThrow('unreviewed-cardmarket-game');
    expect(ports.lease).not.toHaveBeenCalled();
  });

  it('writes one batch per game through the ingest seam, then the reviewed set seed', async () => {
    ports.ingest.mockResolvedValue(completed);
    const fetch = vi.fn();
    const result = await collect(CARDMARKET_EVIDENCE_VERSION, { games: [18, 6], context: { fetch } });
    expect(ports.ingest.mock.calls.map(call => call[0])).toEqual([{ source: 'cardmarket', gameId: 18 }, { source: 'cardmarket', gameId: 6 }]);
    // The caller's transport passes through with the run's deadline; nothing else is added.
    for (const call of ports.ingest.mock.calls) expect(Object.keys(call[1]).sort()).toEqual(['fetch', 'signal']);
    expect(result).toMatchObject({ ran: true, ok: true, source: 'cardmarket', evidenceVersion: CARDMARKET_EVIDENCE_VERSION, budgetMs: 270_000 });
    const { source: _source, ...run } = completed;
    expect(result.games).toEqual([{ gameId: 18, game: 'one-piece', ...run }, { gameId: 6, game: 'pokemon', ...run }]);
    expect(ports.writeSet).toHaveBeenCalledTimes(CARDMARKET_ONE_PIECE_EXPANSIONS.length);
    // As a collector: another writer's live row is left standing (crosswalks.ts).
    for (const call of ports.writeSet.mock.calls) expect(call[2]).toEqual({ collector: true });
    expect(result.setCrosswalks).toEqual({ status: 'completed', rows: CARDMARKET_ONE_PIECE_EXPANSIONS.length, written: 0, superseded: 0, unchanged: CARDMARKET_ONE_PIECE_EXPANSIONS.length, kept: 0 });
  });

  it('ends the run as SOURCE_UNAVAILABLE when the host refuses, without asking it for the next game', async () => {
    ports.ingest.mockRejectedValueOnce(new CardmarketPublicFileError('http-error', 'Cardmarket public-file request failed with HTTP 403', { status: 403 }));
    const result = await collect(CARDMARKET_EVIDENCE_VERSION, { games: [18, 6, 3] });
    expect(ports.ingest).toHaveBeenCalledOnce();
    expect(result.ok).toBe(false);
    expect(result.games).toEqual([
      { gameId: 18, game: 'one-piece', status: 'source-unavailable', code: 'SOURCE_UNAVAILABLE', detail: 'http-error', httpStatus: 403 },
      { gameId: 6, game: 'pokemon', status: 'not-started', code: 'source-unavailable' },
      { gameId: 3, game: 'yu-gi-oh', status: 'not-started', code: 'source-unavailable' },
    ]);
    // The seed needs no network, so a refused download does not hold it back.
    expect(result.setCrosswalks.status).toBe('completed');
  });

  it('stops at a revoked or unreviewed release and writes no crosswalk', async () => {
    ports.ingest.mockRejectedValueOnce(new Error('member-price-acquisition-revoked-or-unreviewed'));
    const result = await collect(CARDMARKET_EVIDENCE_VERSION);
    expect(result.games).toEqual([{ gameId: 18, game: 'one-piece', status: 'revoked-or-unreviewed', code: 'member-price-acquisition-revoked-or-unreviewed' }]);
    expect(result.setCrosswalks).toMatchObject({ status: 'skipped', code: 'revoked-or-unreviewed' });
    expect(ports.writeSet).not.toHaveBeenCalled();
  });

  it('reports other faults by code only, never by driver text', async () => {
    ports.ingest.mockRejectedValueOnce(new Error('relation "member_price_batches" does not exist'));
    ports.writeSet.mockRejectedValueOnce(new Error('relation "price_source_set_crosswalks" does not exist'));
    const result = await collect(CARDMARKET_EVIDENCE_VERSION);
    expect(result.games[0]).toEqual({ gameId: 18, game: 'one-piece', status: 'failed', code: 'unexpected-error' });
    expect(result.setCrosswalks).toMatchObject({ status: 'failed', code: 'unexpected-error' });
    expect(JSON.stringify(result)).not.toContain('relation');
  });

  it('starts nothing once the budget is spent', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await collect(CARDMARKET_EVIDENCE_VERSION, { games: [18, 6], context: { signal: controller.signal } });
    expect(ports.ingest).not.toHaveBeenCalled();
    expect(result.games.map(run => run.status)).toEqual(['not-started', 'not-started']);
    expect(result.setCrosswalks).toMatchObject({ status: 'skipped', code: 'budget-exhausted' });
  });

  it('refuses every write query after the budget runs out, so the batch rolls back whole', async () => {
    const controller = new AbortController();
    const tx = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const runTransaction = vi.fn(async work => work(tx));
    ports.ingest.mockImplementationOnce(async (_input, _context, budgeted) => budgeted(async (query: (sql: string) => Promise<unknown>) => {
      await query('SELECT pg_advisory_xact_lock(137, 1)');
      controller.abort();
      await query('INSERT INTO member_price_observations');
    }));
    const result = await collect(CARDMARKET_EVIDENCE_VERSION, { context: { signal: controller.signal }, runTransaction: runTransaction as never });
    expect(tx.mock.calls.map(call => call[0])).toEqual(['SELECT pg_advisory_xact_lock(137, 1)']);
    expect(result.games).toEqual([{ gameId: 18, game: 'one-piece', status: 'budget-exhausted', code: 'cardmarket-collection-budget-exhausted' }]);
    expect(result.ok).toBe(false);
  });

  it('records the file host served when every game completed, and its refusal with Retry-After when it refused', async () => {
    ports.ingest.mockResolvedValue(completed);
    expect((await collect(CARDMARKET_EVIDENCE_VERSION)).hostState).toEqual({ recorded: 1 });
    expect(ports.recordHosts.mock.calls[0]!.slice(0, 3)).toEqual(['cardmarket', [{ host: HOST, kind: 'collected' }], new Map()]);
    ports.recordHosts.mockClear();
    ports.ingest.mockRejectedValueOnce(new CardmarketPublicFileError('http-error', 'Cardmarket public-file request failed with HTTP 429', { url: `https://${HOST}/productCatalog/priceGuide/price_guide_18.json`, status: 429, retryAfter: '3600' }));
    await collect(CARDMARKET_EVIDENCE_VERSION);
    expect(ports.recordHosts.mock.calls[0]![1]).toEqual([{ host: HOST, kind: 'refused', reason: 'http-429', retryAfter: '3600' }]);
  });

  it.each([
    ['a 503 with no Retry-After', new CardmarketPublicFileError('http-error', 'HTTP 503', { status: 503 })],
    ['a network failure', new CardmarketPublicFileError('http-error', 'fetch failed')],
    ['a parse failure', new Error('invalid-cardmarket-envelope-rows')],
  ])('leaves the host as it was after %s: not a refusal, not served', async (_label, error) => {
    ports.ingest.mockRejectedValueOnce(error);
    await collect(CARDMARKET_EVIDENCE_VERSION);
    expect(ports.recordHosts.mock.calls[0]![1]).toEqual([]);
  });

  it('downloads nothing while the file host is backing off or suspended, and writes nothing', async () => {
    ports.readHosts.mockResolvedValueOnce(new Map([[HOST, row({ consecutiveRefusals: 1, lastRefusalAt: '2026-10-29T05:30:00.000Z', lastRefusalReason: 'http-429', notBefore: new Date(Date.now() + 3_600_000).toISOString() })]]));
    expect(await collectCardmarketMemberPrices(CARDMARKET_EVIDENCE_VERSION)).toMatchObject({ ran: false, reason: 'host-backing-off', host: HOST });
    ports.readHosts.mockResolvedValueOnce(new Map([[HOST, row({ consecutiveRefusals: 3, lastRefusalAt: '2026-10-29T05:30:00.000Z', lastRefusalReason: 'http-403', notBefore: '2026-10-29T11:30:00.000Z', suspendedAt: '2026-10-29T05:30:00.000Z', suspendedReason: 'http-403' })]]));
    expect(await collectCardmarketMemberPrices(CARDMARKET_EVIDENCE_VERSION)).toEqual({ ran: false, reason: 'host-suspended', host: HOST, notBefore: '2026-10-29T11:30:00.000Z', suspendedAt: '2026-10-29T05:30:00.000Z', suspendedReason: 'http-403' });
    expect(ports.ingest).not.toHaveBeenCalled(); expect(ports.writeSet).not.toHaveBeenCalled(); expect(ports.recordHosts).not.toHaveBeenCalled();
    // A not-before already past asks again.
    ports.readHosts.mockResolvedValueOnce(new Map([[HOST, row({ consecutiveRefusals: 1, lastRefusalAt: '2026-10-29T05:30:00.000Z', lastRefusalReason: 'http-429', notBefore: new Date(Date.now() - 1).toISOString() })]]));
    ports.ingest.mockResolvedValue(completed);
    expect(await collectCardmarketMemberPrices(CARDMARKET_EVIDENCE_VERSION)).toMatchObject({ ran: true, ok: true });
  });
});
