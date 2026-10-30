import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Fetcher } from '@cambridge-tcg/data-ingest/http';
import { TCGPLAYER_PRODUCT_LINES } from '@cambridge-tcg/data-ingest/tcgplayer/member-prices';
import { writeMemberPriceBatch } from '../member-price-writer';
import { writeProductCrosswalk, writeSetCrosswalk } from '../crosswalks';
import { collectTcgplayer, tcgplayerTurns, TCGPLAYER_RUN_BUDGET_MS } from './tcgplayer';

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
    // Each line's own trimmed set list and product types.
    const category = /SetNames\?categoryId=(\d+)&active=true$/.exec(url)?.[1] ?? /ProductTypes\/(\d+)\/$/.exec(url)?.[1];
    if (category) return json(fixture(url.includes('SetNames') ? `set-names-${category}.json` : `product-types-${category}.json`));
    return json(url.includes('/set/3188/') ? fixture('price-guide-3188-op01.json') : url.includes('/set/24448/') ? fixture('price-guide-24448-pfl.json') : { count: 0, total: 0, result: [] });
  });
  return Object.defineProperties(f, { count: { get: () => urls.length }, via_proxy: { value: null }, via_proxy_label: { value: null }, urls: { value: urls } }) as unknown as Fetcher & { urls: string[] };
}
const guide = (setId: number, productTypeId = 110) => `https://infinite-api.tcgplayer.com/priceguide/set/${setId}/cards/?rows=5000&productTypeID=${productTypeId}`;
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

  it('keeps a longer Crawl-delay for its budget and between runs, and skips a set robots.txt disallows, unrecorded', async () => {
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
      // Romance Dawn's page is disallowed: never requested, and no empty batch is written for it.
      expect(fetcher.urls).not.toContain(guide(3188));
      expect(run.robotsDisallowed).toBe(1);
      expect(run.errors).toEqual([]);
      expect(vi.mocked(writeMemberPriceBatch).mock.calls.map(call => call[3]?.ingestKey)).not.toContain(`tcgplayer:3188:${run.runAt}`);
      expect(run.status).toBe('ok');
    } finally { vi.useRealTimers(); }
  });

  it.each([
    ['one product type\'s data', 'infinite-api.tcgplayer.com', 'Disallow: /priceguide/set/*/cards/?rows=5000&productTypeID=110$', guide(24537)],
    ['every listed set\'s page', 'www.tcgplayer.com', 'Disallow: /categories/trading-and-collectible-card-games/one-piece-card-game/price-guides/*-', 'https://www.tcgplayer.com/categories/trading-and-collectible-card-games/one-piece-card-game/price-guides/the-azure-seas-seven'],
  ])('refuses the run, as a refusal, writing no batch, when robots.txt leaves no listed set readable (%s)', async (_label, host, rule, url) => {
    const clock = { at: 0 };
    // Neither rule reaches what every run reads (the line's page, any set's data), so the run reads on until no set is left.
    const fetcher = source(clock, 10_000, answered => answered === `https://${host}/robots.txt` ? new Response(`User-agent: *\n${rule}\n`, { status: 200 }) : undefined);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece });
    expect(run).toMatchObject({ status: 'source-unavailable', setsListed: 6, robotsDisallowed: 6, sets: [], errors: [], unavailable: { reason: 'robots-disallows-collector', status: null, url, refused: true } });
    // robots.txt, the set list and the product types: no set was asked for.
    expect(run.requests).toBe(5);
    expect(writeMemberPriceBatch).not.toHaveBeenCalled();
    expect(hostState.record.mock.calls[0]![1]).toEqual([{ host: new URL(url).hostname, kind: 'refused', reason: 'robots-disallows-collector', retryAfter: null }]);
  });

  it('refuses the run, as a refusal against the host that asked, when a Crawl-delay leaves its budget no set', async () => {
    const delayed = (seconds: number) => {
      const clock = { at: 0 };
      const fetcher = source(clock, seconds * 1000, url => url === ROBOTS[1] ? new Response(`User-agent: *\nCrawl-delay: ${seconds}\n`, { status: 200 }) : undefined);
      return { fetcher, pending: collect({ fetcher, now: () => clock.at, runQuery: released as never, lines: onePiece }) };
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // The stand-in's clock moves the Crawl-delay a request. At 42 s, robots.txt three times, the
      // set list and the product types end at 210 s: under the 62 s a set's wait and writes need.
      const long = delayed(42);
      await vi.runAllTimersAsync();
      expect(await long.pending).toMatchObject({ status: 'source-unavailable', requests: 3, sets: [], unavailable: { reason: 'robots-crawl-delay-too-long', url: ROBOTS[1], refused: true } });
      expect(long.fetcher.urls).toEqual(ROBOTS);
      expect(hostState.record.mock.calls.at(-1)![1]).toEqual([{ host: 'mpapi.tcgplayer.com', kind: 'refused', reason: 'robots-crawl-delay-too-long', retryAfter: null }]);
      // At 41 s the same run reads one set, at 246 s.
      const kept = delayed(41);
      await vi.runAllTimersAsync();
      expect(await kept.pending).toMatchObject({ status: 'ok', stoppedBy: 'budget', intervalMs: 41_000, requests: 6, elapsedMs: 246_000 });
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

describe('TCGplayer lines take turns', () => {
  const collected = TCGPLAYER_PRODUCT_LINES.filter(line => line.collect);
  const slugOf = (setId: number) => setId === 3188 || setId === 3189 || setId === 17659 || setId === 17675 || setId === 24537 || setId === 24664 ? 'one-piece-card-game'
    : setId === 23598 || setId === 23599 || setId === 24172 ? 'pokemon-japan' : 'pokemon';
  /** One Piece's and Pokemon Japan's trimmed sets were read before, in list order; no Pokemon set has been. */
  const readBefore = vi.fn(async (sql: string) => ({
    rows: sql.includes('member_price_source_releases') ? [{ source: 'tcgplayer' }]
      : [[3188, 1_000], [3189, 1_001], [17659, 1_002], [17675, 1_003], [24537, 1_004], [24664, 1_005], [23598, 2_000], [23599, 2_001], [24172, 2_002]].map(([setId, at]) => ({ set_id: String(setId), last_read: at })),
    rowCount: 1,
  }));
  const LISTS = [68, 3, 85].map(category => `https://mpapi.tcgplayer.com/v2/Catalog/SetNames?categoryId=${category}&active=true`);
  const types = (category: number) => `https://mpapi.tcgplayer.com/v2/Product/ProductTypes/${category}/`;

  it('gives every line one set a turn, the line read least recently first', async () => {
    const clock = { at: Date.parse('2026-10-30T18:45:00.000Z') };
    const fetcher = source(clock, 10_000);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: readBefore as never, lines: collected });
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'all-sets-read', setsListed: 14, requests: 23, errors: [] });
    expect(fetcher.urls).toEqual([
      ...ROBOTS, ...LISTS,
      // Each round: Pokemon, never read, then One Piece (last read at 1,005) and Pokemon Japan (2,002).
      // Pokemon's never-read sets go newest release first (ME06, due 2026-11-06).
      types(3), guide(24831, 1), types(68), guide(3188), types(85), guide(23598, 143),
      guide(24529, 1), guide(3189), guide(23599, 143),
      guide(24448, 1), guide(17659), guide(24172, 143),
      // Pokemon Japan's three are read; the other two lines go on taking turns.
      guide(604, 1), guide(17675),
      // Nintendo Promos has no release date, so it is the last of the never-read.
      guide(1423, 1), guide(24537),
      guide(24664),
    ]);
    // Phantasmal Flames: its 25 rows observed, none mapped (slash numbers name no set).
    expect(run.sets.find(set => set.setId === 24448)).toMatchObject({ line: 'pokemon', sourceRows: 25, observations: 25, mapped: 0, setCode: null, productCrosswalks: 0 });
    expect(run.sets.filter(set => set.line === 'pokemon').map(set => set.mapped)).toEqual([0, 0, 0, 0, 0]);
  });

  it('never lets one line\'s backlog take another line\'s turns: 40 never-read Pokemon sets leave the other two their share', async () => {
    const backlog = { errors: [], results: Array.from({ length: 40 }, (_, index) => ({
      setNameId: 990_000 + index, categoryId: 3, name: `Synthetic ${index}`, cleanSetName: `Synthetic ${index}`, urlName: `synthetic-${index}`, abbreviation: `SY${index}`,
      releaseDate: `20${String(10 + (index % 16)).padStart(2, '0')}-0${1 + (index % 9)}-01T00:00:00`, isSupplemental: false, active: true,
    })) };
    const clock = { at: Date.parse('2026-10-30T18:45:00.000Z') };
    const fetcher = source(clock, 10_000, url => url === LISTS[1] ? json(backlog) : undefined);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: readBefore as never, lines: collected });
    // 25 requests in the 270 s: robots.txt, three lists, three product types and 16 sets.
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'budget', setsListed: 49, requests: 25 });
    const read = (slug: string) => run.sets.filter(set => set.line === slug).map(set => set.setId);
    // One queue for every line spent this whole run on never-read Pokemon sets: none of these.
    expect(read('one-piece-card-game')).toEqual([3188, 3189, 17659, 17675, 24537, 24664]);
    expect(read('pokemon-japan')).toEqual([23598, 23599, 24172]);
    expect(read('pokemon')).toHaveLength(7);
    expect(run.sets.map(set => set.line).slice(0, 9)).toEqual(Array(3).fill(['pokemon', 'one-piece-card-game', 'pokemon-japan']).flat());
  });

  it('spends no turn on a set robots.txt disallows: the line\'s next set takes it', async () => {
    const clock = { at: Date.parse('2026-10-30T18:45:00.000Z') };
    const fetcher = source(clock, 10_000, url => url === ROBOTS[0] ? new Response('User-agent: *\nCrawl-delay: 10\nDisallow: /categories/trading-and-collectible-card-games/pokemon/price-guides/me06-delta-reign\n', { status: 200 }) : undefined);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: readBefore as never, lines: collected });
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'all-sets-read', robotsDisallowed: 1, errors: [] });
    expect(fetcher.urls).not.toContain(guide(24831, 1));
    expect(run.sets.slice(0, 3).map(set => set.setId)).toEqual([24529, 3188, 23598]);
    expect(vi.mocked(writeMemberPriceBatch).mock.calls.map(call => call[3]?.ingestKey)).not.toContain(`tcgplayer:24831:${run.runAt}`);
  });

  it('lets the other lines keep their turns when one line\'s product types fail', async () => {
    const clock = { at: Date.parse('2026-10-30T18:45:00.000Z') };
    const fetcher = source(clock, 10_000, url => url === types(3) ? json({ errors: [], results: [] }) : undefined);
    const run = await collect({ fetcher, now: () => clock.at, runQuery: readBefore as never, lines: collected });
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'all-sets-read', errors: [{ line: 'pokemon', error: 'tcgplayer-cards-product-type-missing' }] });
    expect(run.sets.map(set => set.setId)).toEqual([3188, 23598, 3189, 23599, 17659, 24172, 17675, 24537, 24664]);
    // Pokemon's sets are not asked for, and not recorded as read: the next run tries them first again.
    expect(fetcher.urls.filter(url => url.endsWith('productTypeID=1'))).toEqual([]);
    expect(vi.mocked(writeMemberPriceBatch).mock.calls.map(call => slugOf(Number(call[3]!.ingestKey!.split(':')[1])))).not.toContain('pokemon');
  });

  it('asks a line\'s product types only when a set can follow them in the run', async () => {
    // Crawl-delay 26 on the site; the stand-in's clock moves 26 s a request. Pokemon's product types
    // and first set end at 208 s, leaving 62 s: room for a set (46 s) but not for One Piece's product
    // types and a set (72 s). One Piece and Pokemon Japan pass this run's turn unasked, and are read
    // first next run; Pokemon's next set takes the time.
    const clock = { at: 0 };
    const fetcher = source(clock, 26_000, url => url === ROBOTS[0] ? new Response('User-agent: *\nCrawl-delay: 26\n', { status: 200 }) : undefined);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = collect({ fetcher, now: () => clock.at, runQuery: readBefore as never, lines: collected });
      await vi.runAllTimersAsync();
      const run = await pending;
      expect(run).toMatchObject({ status: 'ok', stoppedBy: 'budget', intervalMs: 26_000, requests: 9, elapsedMs: 234_000 });
      expect(fetcher.urls).toEqual([...ROBOTS, ...LISTS, types(3), guide(24831, 1), guide(24529, 1)]);
    } finally { vi.useRealTimers(); }
  });
});

describe('tcgplayerTurns at the lines\' listed sizes', () => {
  const [onePieceLine, pokemonLine, japanLine] = ['one-piece-card-game', 'pokemon', 'pokemon-japan'].map(slug => TCGPLAYER_PRODUCT_LINES.find(line => line.slug === slug)!);
  // The sizes the set lists answered: 87 and 461 sets on 2026-10-28, 220 on 2026-10-30.
  const sizes = [[onePieceLine, 87, 100_000], [pokemonLine, 220, 300_000], [japanLine, 461, 200_000]] as const;
  const candidates = sizes.flatMap(([line, count, base]) => Array.from({ length: count }, (_, index) => ({
    line, set: { setId: base + index, categoryId: line.categoryId, name: `S${index}`, abbreviation: `S${index}`, urlName: `s-${index}`, releaseDate: index % 7 ? `${2000 + (index % 26)}-06-01T00:00:00` : null },
  })));
  const lineOf = (setId: number) => setId >= 300_000 ? 'pokemon' : setId >= 200_000 ? 'pokemon-japan' : 'one-piece-card-game';
  /** One run of `turns` turns, taking one set each, as the collector does. */
  const runOnce = (lastRead: Map<number, number>, turns: number) => {
    const taken: number[] = [];
    for (const turn of tcgplayerTurns(candidates, lastRead)) {
      taken.push(turn.sets.shift()!.setId);
      if (taken.length === turns) break;
    }
    return taken;
  };

  it('gives each line its own share from the first run after a line of 220 never-read sets is switched on, and reads every set within its own line\'s pace', () => {
    // One Piece and Pokemon Japan were read through over the last 30 runs; Pokemon never.
    const lastRead = new Map<number, number>();
    candidates.filter(({ line }) => line !== pokemonLine).forEach(({ set }, index) => lastRead.set(set.setId, -30 + Math.floor(index / 18)));
    const reads = new Map<number, number[]>();
    const spare = { 'one-piece-card-game': 0, pokemon: 0, 'pokemon-japan': 0 } as Record<string, number>;
    for (let run = 0; run < 300; run++) {
      const taken = runOnce(lastRead, 16);
      const share = { 'one-piece-card-game': 0, pokemon: 0, 'pokemon-japan': 0 } as Record<string, number>;
      // A run's sets are written one after another, so each has its own time, as inserted_at gives them.
      taken.forEach((setId, slot) => { share[lineOf(setId)]!++; lastRead.set(setId, run + slot / 100); reads.set(setId, [...(reads.get(setId) ?? []), run]); });
      // 16 turns over three lines: 5 each, and the spare one to the line read least recently.
      expect(Object.values(share).sort()).toEqual([5, 5, 6]);
      spare[Object.entries(share).find(([, count]) => count === 6)![0]]!++;
    }
    // The spare turn passes from line to line.
    expect(spare).toEqual({ 'one-piece-card-game': 100, pokemon: 100, 'pokemon-japan': 100 });
    // Every Pokemon set was first read within 42 runs (220 / 5⅓), not after the others waited.
    expect(Math.max(...candidates.filter(({ line }) => line === pokemonLine).map(({ set }) => reads.get(set.setId)![0]!))).toBeLessThanOrEqual(42);
    // From then on, the longest gap between two readings of one set, in runs (hours).
    const longest = (slug: string) => Math.max(...candidates.filter(({ line }) => line.slug === slug).flatMap(({ set }) => {
      const at = reads.get(set.setId)!.filter(run => run >= 100);
      return at.slice(1).map((run, index) => run - at[index]!);
    }));
    expect(longest('one-piece-card-game')).toBeLessThanOrEqual(17);
    expect(longest('pokemon')).toBeLessThanOrEqual(42);
    expect(longest('pokemon-japan')).toBeLessThanOrEqual(87);
  });

  it('passes the turns on from run to run, so a run with fewer turns than lines leaves no line behind another line\'s backlog', () => {
    // One Piece and Pokemon Japan were read before, Pokemon's 220 sets never; one set a run, as a
    // Crawl-delay of about 30 s leaves.
    const lastRead = new Map<number, number>();
    candidates.filter(({ line }) => line !== pokemonLine).forEach(({ set }, index) => lastRead.set(set.setId, -30 + index / 100));
    const lines: string[] = [];
    for (let run = 0; run < 30; run++) {
      const [setId] = runOnce(lastRead, 1);
      lastRead.set(setId!, run);
      lines.push(lineOf(setId!));
    }
    // Rounds ordered by each line's stalest set gave all 30 to Pokemon's never-read sets.
    expect(lines).toEqual(Array(10).fill(['pokemon', 'one-piece-card-game', 'pokemon-japan']).flat());
  });

  it('ends once every turn has taken its sets, and yields no line with none left', () => {
    const few = candidates.filter(({ set }) => [100_000, 100_001, 300_000].includes(set.setId));
    const seen: string[] = [];
    for (const turn of tcgplayerTurns(few, new Map([[100_000, 5], [100_001, 6]]))) {
      seen.push(turn.line.slug);
      // A turn may take more than one set (robots.txt skips), or empty its line.
      turn.sets.splice(0, turn.line === pokemonLine ? 1 : 2);
    }
    expect(seen).toEqual(['pokemon', 'one-piece-card-game']);
  });
});
