import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Fetcher } from '@cambridge-tcg/data-ingest/http';
import { TCGPLAYER_PRODUCT_LINES } from '@cambridge-tcg/data-ingest/tcgplayer/member-prices';
import { writeMemberPriceBatch } from '../member-price-writer';
import { writeProductCrosswalk, writeSetCrosswalk } from '../crosswalks';
import { collectTcgplayer, TCGPLAYER_RUN_BUDGET_MS } from './tcgplayer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock('../member-price-writer', () => ({ writeMemberPriceBatch: vi.fn() }));
vi.mock('../crosswalks', () => ({ writeProductCrosswalk: vi.fn(), writeSetCrosswalk: vi.fn() }));
const lease = vi.hoisted(() => vi.fn());
vi.mock('../collector-lease', () => ({ withCollectorLease: lease }));

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../../../../packages/data-ingest/src/tcgplayer/__tests__/fixtures/${name}`, import.meta.url), 'utf8'));
const onePiece = TCGPLAYER_PRODUCT_LINES.filter(line => line.slug === 'one-piece-card-game');
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
function source(clock: { at: number }, step: number, answer: (url: string) => Response | undefined = () => undefined) {
  const urls: string[] = [];
  const f = vi.fn(async (url: string) => {
    urls.push(url); clock.at += step;
    const given = answer(url);
    if (given) return given;
    if (url.includes('SetNames')) return json(fixture('set-names-68.json'));
    if (url.includes('ProductTypes')) return json(fixture('product-types-68.json'));
    return json(url.includes('/set/3188/') ? fixture('price-guide-3188-op01.json') : { count: 0, total: 0, result: [] });
  });
  return Object.defineProperties(f, { count: { get: () => urls.length }, via_proxy: { value: null }, via_proxy_label: { value: null }, urls: { value: urls } }) as unknown as Fetcher & { urls: string[] };
}
const guide = (setId: number) => `https://infinite-api.tcgplayer.com/priceguide/set/${setId}/cards/?rows=5000&productTypeID=110`;
const released = vi.fn(async (sql: string) => ({
  rows: sql.includes('member_price_source_releases') ? [{ source: 'tcgplayer' }] : [{ set_id: '24664', last_read: 1_000 }, { set_id: '3188', last_read: 2_000 }],
  rowCount: 1,
}));

/** A run that got its lease; the lease itself is collector-lease.ts's to test. */
async function collect(options: Parameters<typeof collectTcgplayer>[0]) {
  const run = await collectTcgplayer(options);
  if (!run.ran) throw new Error(`not run: ${run.reason}`);
  return run;
}

beforeEach(() => {
  lease.mockReset().mockImplementation(async (_key: string, work: () => Promise<unknown>) => ({ ran: true, value: await work() }));
  vi.mocked(writeMemberPriceBatch).mockReset().mockResolvedValue({ batchId: '1', inserted: 0, duplicate: false });
  vi.mocked(writeSetCrosswalk).mockReset().mockResolvedValue({ id: '1', supersededId: null, unchanged: false });
  vi.mocked(writeProductCrosswalk).mockReset().mockResolvedValue({ id: '1', supersededId: null, unchanged: false });
});

describe('TCGplayer collector run', () => {
  it.each(['run-in-progress', 'request-spacing', 'lease-not-provisioned'] as const)('holds one lease for every TCGplayer host, and answers %s without a request', async reason => {
    lease.mockResolvedValueOnce({ ran: false, reason });
    const clock = { at: Date.parse('2026-10-28T16:45:00.000Z') };
    const fetcher = source(clock, 10_000);
    expect(await collectTcgplayer({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece })).toEqual({ ran: false, reason, runAt: '2026-10-28T16:45:00.000Z', requests: 0 });
    // ...and its release keeps TCGplayer's 10 s Crawl-Delay before the next run's first request.
    expect(lease).toHaveBeenCalledWith('tcgplayer', expect.any(Function), { runQuery: released, spacingMs: 10_000 });
    expect(fetcher.urls).toEqual([]);
    expect(writeMemberPriceBatch).not.toHaveBeenCalled();
  });

  it('reads never-read sets first (newest release first), then the longest ago, naming one batch per set', async () => {
    const clock = { at: Date.parse('2026-10-28T16:45:00.000Z') };
    const fetcher = source(clock, 10_000);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'all-sets-read', requests: 8, setsListed: 6 });
    expect(fetcher.urls.slice(2)).toEqual([guide(24537), guide(3189), guide(17659), guide(17675), guide(24664), guide(3188)]);
    expect(vi.mocked(writeMemberPriceBatch).mock.calls.map(call => [call[0], call[3]?.ingestKey])).toEqual(
      [24537, 3189, 17659, 17675, 24664, 3188].map(id => ['tcgplayer', `tcgplayer:${id}:2026-10-28T16:45:00.000Z`]));
    // Romance Dawn's set and its seven product links go through the crosswalk writers.
    // As a collector: another writer's live row is left standing (crosswalks.ts).
    expect(writeSetCrosswalk).toHaveBeenCalledWith(expect.objectContaining({ source: 'tcgplayer', sourceSetKey: '3188', setCode: 'op01' }), expect.any(Function), { collector: true });
    expect(writeProductCrosswalk).toHaveBeenCalledTimes(7);
    for (const call of vi.mocked(writeProductCrosswalk).mock.calls) expect(call[2]).toEqual({ collector: true });
    expect(run.crosswalks).toEqual({ setWritten: 1, productWritten: 7, productUnchanged: 0, skipped: 0, failed: 0 });
  });

  it(`begins no set with under 30 s of its ${TCGPLAYER_RUN_BUDGET_MS / 1000} s left`, async () => {
    const clock = { at: 0 };
    const fetcher = source(clock, 85_000);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    // Set list at 85 s, product type at 170 s, one set at 255 s; 15 s left.
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'budget', requests: 3, elapsedMs: 255_000 });
    expect(fetcher.urls.at(-1)).toBe(guide(24537));
    expect(writeMemberPriceBatch).toHaveBeenCalledTimes(1);
  });

  it('records a set the writer refuses as read, with no observation, and goes on; but stops at revocation', async () => {
    vi.mocked(writeMemberPriceBatch).mockRejectedValueOnce(new Error('unreviewed-price-release'));
    const clock = { at: 0 };
    const first = await collect({ fetcher: source(clock, 10_000), now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(first.errors).toEqual([{ line: 'one-piece-card-game', setId: 24537, error: 'unreviewed-price-release', recorded: true }]);
    expect(first.sets).toHaveLength(5);
    // The refused write is followed by the set's failure record under the same name, so the next run reads it last.
    const [refused, record] = vi.mocked(writeMemberPriceBatch).mock.calls.slice(0, 2);
    expect(record).toEqual(['tcgplayer', { observations: [], quarantine: [{ sourceProductId: null, field: 'set', reason: 'unreviewed-price-release' }], sourceRows: refused![1].sourceRows, missingPrices: 0 }, expect.any(Function), refused![3]]);
    vi.mocked(writeMemberPriceBatch).mockRejectedValueOnce(new Error('member-price-source-revoked-or-unreviewed'));
    const fetcher = source(clock, 10_000);
    const revoked = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(revoked).toMatchObject({ status: 'release-revoked-or-unreviewed', stoppedBy: 'release', requests: 3, sets: [] });
  });

  it('records a set whose read fails as read, by code, so stalest-first moves on', async () => {
    const clock = { at: 0 };
    const fetcher = source(clock, 10_000, url => url.includes('/set/24537/') ? new Response('', { status: 404 }) : url.includes('/set/3189/') ? json({ count: 0 }) : undefined);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'all-sets-read', requests: 8 });
    expect(run.errors).toEqual([
      { line: 'one-piece-card-game', setId: 24537, error: 'tcgplayer-http-404', recorded: true },
      { line: 'one-piece-card-game', setId: 3189, error: 'invalid-tcgplayer-price-guide', recorded: true },
    ]);
    expect(run.sets.map(set => set.setId)).toEqual([17659, 17675, 24664, 3188]);
    const records = vi.mocked(writeMemberPriceBatch).mock.calls.filter(call => !call[1].observations.length && call[1].quarantine.some(entry => entry.field === 'set'));
    expect(records.map(call => [call[1], call[3]?.ingestKey])).toEqual([
      [{ observations: [], quarantine: [{ sourceProductId: null, field: 'set', reason: 'tcgplayer-http-404' }], sourceRows: 0, missingPrices: 0 }, 'tcgplayer:24537:1970-01-01T00:00:00.000Z'],
      [{ observations: [], quarantine: [{ sourceProductId: null, field: 'set', reason: 'invalid-tcgplayer-price-guide' }], sourceRows: 0, missingPrices: 0 }, 'tcgplayer:3189:1970-01-01T00:00:00.000Z'],
    ]);
  });

  it('is not ok when no set was written: every guide failed, each recorded as read', async () => {
    const clock = { at: 0 };
    // Every price guide answers without its result array.
    const fetcher = source(clock, 10_000, url => url.includes('/priceguide/') ? json({ count: 0 }) : undefined);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(run).toMatchObject({ status: 'no-set-written', stoppedBy: 'all-sets-read', requests: 8, setsListed: 6, sets: [] });
    expect(run.errors).toHaveLength(6);
    expect(run.errors.every(entry => entry.recorded && entry.error === 'invalid-tcgplayer-price-guide')).toBe(true);
  });

  it('is not ok when the set list itself fails', async () => {
    const clock = { at: 0 };
    const fetcher = source(clock, 10_000, url => url.includes('SetNames') ? json({ results: 'not a list' }) : undefined);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(run).toMatchObject({ status: 'no-set-written', setsListed: 0, sets: [], errors: [{ line: 'one-piece-card-game' }] });
    expect(writeMemberPriceBatch).not.toHaveBeenCalled();
  });

  it('stores only its own codes for a failure, and says so when the record itself could not be written', async () => {
    vi.mocked(writeMemberPriceBatch)
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.1:5432'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
    const clock = { at: 0 };
    const run = await collect({ fetcher: source(clock, 10_000), now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(run.errors[0]).toMatchObject({ setId: 24537, recorded: false });
    expect(vi.mocked(writeMemberPriceBatch).mock.calls[1]![1].quarantine).toEqual([{ sourceProductId: null, field: 'set', reason: 'unexpected-error' }]);
    expect(run.sets).toHaveLength(5);
  });

  it.each(['TimeoutError', 'AbortError'])('ends as a budget stop when the run\'s timeout cuts a request short (%s), recording no failure', async name => {
    const clock = { at: 0 };
    const fetcher = source(clock, 10_000, url => { if (url.includes('/set/3189/')) throw new DOMException('The operation was aborted due to timeout', name); return undefined; });
    const run = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(run).toMatchObject({ ran: true, status: 'ok', stoppedBy: 'budget', errors: [] });
    expect(run.sets.map(set => set.setId)).toEqual([24537]);
    // The cut set is not marked read; it stays as stale as it was.
    expect(vi.mocked(writeMemberPriceBatch).mock.calls.map(call => call[3]?.ingestKey)).toEqual(['tcgplayer:24537:1970-01-01T00:00:00.000Z']);
  });
});
