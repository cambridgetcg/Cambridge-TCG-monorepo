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
// The host state's storage is collector-hosts.ts's to test; its rules stay real.
const hostState = vi.hoisted(() => ({ read: vi.fn(), record: vi.fn() }));
vi.mock('../collector-hosts', async importOriginal => ({
  ...await importOriginal<typeof import('../collector-hosts')>(), readCollectorHosts: hostState.read, recordCollectorHostOutcomes: hostState.record,
}));
import type { CollectorHostRow } from '../collector-hosts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../../../../packages/data-ingest/src/tcgplayer/__tests__/fixtures/${name}`, import.meta.url), 'utf8'));
const onePiece = TCGPLAYER_PRODUCT_LINES.filter(line => line.slug === 'one-piece-card-game');
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
function source(clock: { at: number }, step: number, answer: (url: string) => Response | undefined = () => undefined) {
  const urls: string[] = [];
  const f = vi.fn(async (url: string) => {
    urls.push(url); clock.at += step;
    const given = answer(url);
    if (given) return given;
    // No robots.txt on any host: no rule, the recorded 10 s.
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    if (url.includes('SetNames')) return json(fixture('set-names-68.json'));
    if (url.includes('ProductTypes')) return json(fixture('product-types-68.json'));
    return json(url.includes('/set/3188/') ? fixture('price-guide-3188-op01.json') : { count: 0, total: 0, result: [] });
  });
  return Object.defineProperties(f, { count: { get: () => urls.length }, via_proxy: { value: null }, via_proxy_label: { value: null }, urls: { value: urls } }) as unknown as Fetcher & { urls: string[] };
}
const guide = (setId: number) => `https://infinite-api.tcgplayer.com/priceguide/set/${setId}/cards/?rows=5000&productTypeID=110`;
const ROBOTS = ['https://www.tcgplayer.com/robots.txt', 'https://mpapi.tcgplayer.com/robots.txt', 'https://infinite-api.tcgplayer.com/robots.txt'];
const hostRow = (host: string, fields: Partial<CollectorHostRow>): CollectorHostRow => ({ host, consecutiveRefusals: 0, lastSuccessAt: null, lastRefusalAt: null, lastRefusalReason: null, notBefore: null, suspendedAt: null, suspendedReason: null, ...fields });
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
  hostState.read.mockReset().mockResolvedValue(new Map());
  hostState.record.mockReset().mockImplementation(async (_source: string, outcomes: unknown[]) => ({ recorded: outcomes.length }));
});

describe('TCGplayer collector run', () => {
  it.each(['run-in-progress', 'request-spacing', 'lease-not-provisioned'] as const)('holds one lease for every TCGplayer host, and answers %s without a request', async reason => {
    lease.mockResolvedValueOnce({ ran: false, reason });
    const clock = { at: Date.parse('2026-10-28T16:45:00.000Z') };
    const fetcher = source(clock, 10_000);
    expect(await collectTcgplayer({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece })).toEqual({ ran: false, reason, runAt: '2026-10-28T16:45:00.000Z', requests: 0 });
    // ...and its release keeps the run's interval (TCGplayer's 10 s Crawl-Delay, or more if robots.txt asks) before the next run's first request.
    expect(lease).toHaveBeenCalledWith('tcgplayer', expect.any(Function), { runQuery: released, spacingMs: expect.any(Function) });
    expect(lease.mock.calls[0]![2].spacingMs()).toBe(10_000);
    expect(fetcher.urls).toEqual([]);
    expect(writeMemberPriceBatch).not.toHaveBeenCalled();
  });

  it('reads never-read sets first (newest release first), then the longest ago, naming one batch per set', async () => {
    const clock = { at: Date.parse('2026-10-28T16:45:00.000Z') };
    const fetcher = source(clock, 10_000);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'all-sets-read', requests: 11, setsListed: 6, intervalMs: 10_000, hostState: { recorded: 3 } });
    // robots.txt for every host first, read this run, then the set list and product types.
    expect(fetcher.urls.slice(0, 3)).toEqual(ROBOTS);
    expect(fetcher.urls.slice(5)).toEqual([guide(24537), guide(3189), guide(17659), guide(17675), guide(24664), guide(3188)]);
    // A run that wrote a set was served by every host: their counts reset.
    expect(hostState.record.mock.calls[0]!.slice(0, 2)).toEqual(['tcgplayer', ROBOTS.map(url => ({ host: new URL(url).hostname, kind: 'collected' }))]);
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
    const fetcher = source(clock, 42_000);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    // robots.txt at 42, 84 and 126 s, set list at 168 s, product type at 210 s, one set at 252 s; 18 s left.
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'budget', requests: 6, elapsedMs: 252_000 });
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
    expect(revoked).toMatchObject({ status: 'release-revoked-or-unreviewed', stoppedBy: 'release', requests: 6, sets: [] });
    // Revocation says nothing about the hosts.
    expect(hostState.record.mock.calls.at(-1)![1]).toEqual([]);
  });

  it('records a set whose read fails as read, by code, so stalest-first moves on', async () => {
    const clock = { at: 0 };
    const fetcher = source(clock, 10_000, url => url.includes('/set/24537/') ? new Response('', { status: 404 }) : url.includes('/set/3189/') ? json({ count: 0 }) : undefined);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'all-sets-read', requests: 11 });
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
    expect(run).toMatchObject({ status: 'no-set-written', stoppedBy: 'all-sets-read', requests: 11, setsListed: 6, sets: [] });
    expect(run.errors).toHaveLength(6);
    expect(run.errors.every(entry => entry.recorded && entry.error === 'invalid-tcgplayer-price-guide')).toBe(true);
    // Nothing collected, nothing refused: no host changes.
    expect(hostState.record.mock.calls[0]![1]).toEqual([]);
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

  it('records a refusal against the host that refused, with its Retry-After, and changes no other host', async () => {
    const clock = { at: Date.parse('2026-10-28T16:45:00.000Z') };
    const fetcher = source(clock, 10_000, url => url.includes('/set/3189/') ? new Response('slow down', { status: 429, headers: { 'retry-after': '900' } }) : undefined);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(run).toMatchObject({ status: 'source-unavailable', unavailable: { reason: 'http-429', status: 429, url: guide(3189), refused: true } });
    expect(hostState.record.mock.calls[0]![1]).toEqual([{ host: 'infinite-api.tcgplayer.com', kind: 'refused', reason: 'http-429', retryAfter: '900' }]);
    // A 5xx without Retry-After stops the run but is not a refusal of this collector.
    hostState.record.mockClear();
    const failing = await collect({ fetcher: source(clock, 10_000, url => url.includes('SetNames') ? new Response('', { status: 500 }) : undefined), now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(failing).toMatchObject({ status: 'source-unavailable', unavailable: { reason: 'http-500', refused: false } });
    expect(hostState.record.mock.calls[0]![1]).toEqual([]);
  });

  it('collects nothing when a robots.txt read fails, and refuses the run, as a refusal, when robots.txt disallows it', async () => {
    const clock = { at: 0 };
    const down = source(clock, 10_000, url => url === ROBOTS[1] ? new Response('', { status: 502 }) : undefined);
    expect(await collect({ fetcher: down, now: () => clock.at, runQuery: released as never, lines: onePiece }))
      .toMatchObject({ status: 'source-unavailable', requests: 2, sets: [], unavailable: { reason: 'robots-http-502', url: ROBOTS[1], refused: false } });
    expect(down.urls).toEqual(ROBOTS.slice(0, 2));
    expect(writeMemberPriceBatch).not.toHaveBeenCalled();
    const closed = source(clock, 10_000, url => url === ROBOTS[0] ? new Response('User-agent: *\nDisallow: /categories/\n', { status: 200 }) : undefined);
    expect(await collect({ fetcher: closed, now: () => clock.at, runQuery: released as never, lines: onePiece }))
      .toMatchObject({ status: 'source-unavailable', requests: 3, unavailable: { reason: 'robots-disallows-collector', refused: true } });
    expect(closed.urls).toEqual(ROBOTS);
    expect(hostState.record.mock.calls.at(-1)![1]).toEqual([{ host: 'www.tcgplayer.com', kind: 'refused', reason: 'robots-disallows-collector', retryAfter: null }]);
  });

  it('keeps a longer Crawl-delay for its budget and between runs, and records a set robots.txt disallows as read', async () => {
    const clock = { at: 0 };
    // Crawl-delay 20 on the site; the stand-in's clock moves 20 s a request, as the spacing would make it.
    const fetcher = source(clock, 20_000, url => url === ROBOTS[0] ? new Response('User-agent: *\nCrawl-delay: 20\nDisallow: /categories/trading-and-collectible-card-games/one-piece-card-game/price-guides/romance-dawn\n', { status: 200 }) : undefined);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
      await vi.runAllTimersAsync();
      const run = await pending;
      expect(run.intervalMs).toBe(20_000);
      // A set is begun only with the interval and 20 s for its writes left: 40 s.
      expect(run.elapsedMs).toBeLessThanOrEqual(270_000 - 20_000);
      expect(lease.mock.calls[0]![2].spacingMs()).toBe(20_000);
      // Romance Dawn's page is disallowed: never requested, recorded as read by its reason.
      expect(fetcher.urls).not.toContain(guide(3188));
      expect(run.errors).toContainEqual({ line: 'one-piece-card-game', setId: 3188, error: 'tcgplayer-robots-disallows-set', recorded: true });
    } finally { vi.useRealTimers(); }
  });

  it('asks no TCGplayer host anything while any of the three is backing off or suspended', async () => {
    const clock = { at: Date.parse('2026-10-28T16:45:00.000Z') };
    const fetcher = source(clock, 10_000);
    hostState.read.mockResolvedValueOnce(new Map([['infinite-api.tcgplayer.com', hostRow('infinite-api.tcgplayer.com', { consecutiveRefusals: 1, lastRefusalAt: '2026-10-28T16:00:00.000Z', lastRefusalReason: 'http-429', notBefore: '2026-10-28T16:50:00.000Z' })]]));
    expect(await collectTcgplayer({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece }))
      .toEqual({ ran: false, reason: 'host-backing-off', host: 'infinite-api.tcgplayer.com', notBefore: '2026-10-28T16:50:00.000Z', suspendedAt: null, suspendedReason: null, runAt: '2026-10-28T16:45:00.000Z', requests: 0 });
    hostState.read.mockResolvedValueOnce(new Map([['www.tcgplayer.com', hostRow('www.tcgplayer.com', { consecutiveRefusals: 3, lastRefusalAt: '2026-10-28T12:00:00.000Z', lastRefusalReason: 'http-403', notBefore: '2026-10-28T18:00:00.000Z', suspendedAt: '2026-10-28T12:00:00.000Z', suspendedReason: 'http-403' })]]));
    expect(await collectTcgplayer({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece })).toMatchObject({ ran: false, reason: 'host-suspended', host: 'www.tcgplayer.com', requests: 0 });
    expect(hostState.read.mock.calls[0]!.slice(0, 2)).toEqual(['tcgplayer', ROBOTS.map(url => new URL(url).hostname)]);
    expect(fetcher.urls).toEqual([]);
    expect(writeMemberPriceBatch).not.toHaveBeenCalled(); expect(hostState.record).not.toHaveBeenCalled();
  });
});
