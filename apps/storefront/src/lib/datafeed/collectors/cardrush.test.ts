import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { CARDRUSH_COLLECTOR_HOSTS, CARDRUSH_CROSSWALK_VERSION, parseCardRushMemberPrices } from '@cambridge-tcg/data-ingest/cardrush/member-prices';

vi.mock('server-only', () => ({}));
const ports = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), acquire: vi.fn(), write: vi.fn(), product: vi.fn(), set: vi.fn(), lease: vi.fn(), images: vi.fn(), readHosts: vi.fn(), recordHosts: vi.fn() }));
vi.mock('@/lib/db', () => ({ query: ports.query, transaction: ports.transaction }));
vi.mock('@cambridge-tcg/data-ingest/cardrush/member-prices', async importOriginal => ({
  ...await importOriginal<typeof import('@cambridge-tcg/data-ingest/cardrush/member-prices')>(), acquireCardRushMemberPrices: ports.acquire,
}));
vi.mock('../member-price-writer', () => ({ writeMemberPriceBatch: ports.write }));
vi.mock('../crosswalks', () => ({ writeProductCrosswalk: ports.product, writeSetCrosswalk: ports.set }));
vi.mock('../collector-lease', () => ({ withCollectorLease: ports.lease }));
vi.mock('../listing-images', () => ({ writeCardRushListingImages: ports.images }));
// The host state's storage is collector-hosts.ts's to test; its rules stay real.
vi.mock('../collector-hosts', async importOriginal => ({
  ...await importOriginal<typeof import('../collector-hosts')>(), readCollectorHosts: ports.readHosts, recordCollectorHostOutcomes: ports.recordHosts,
}));
import { REFERENCE_FRESHNESS_DAYS } from '@cambridge-tcg/data-spec';
import { CARDRUSH_REREAD, cardRushHostFor, chooseCardRushPages, chooseStalestCardRushPages, collectCardRush, orderCardRushPages, orderStalestCardRushPages } from './cardrush';
import type { CollectorHostRow } from '../collector-hosts';

const fixtures = new URL('../../../../../../packages/data-ingest/src/cardrush/__tests__/fixtures/', import.meta.url);
const page = (id: number) => ({ url: `https://www.cardrush-op.jp/product/${id}`, bytes: readFileSync(new URL(`cardrush-op-${id}.html`, fixtures)), retrievedAt: '2026-10-28T15:00:00.000Z' });
const slots = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(2026, 9, 28, 2 * index, 15)));
const opRun = slots.find(slot => cardRushHostFor(slot) === 'www.cardrush-op.jp')!;
const released = { rows: [{ source: 'cardrush' }], rowCount: 1 };
beforeEach(() => {
  Object.values(ports).forEach(port => port.mockReset());
  // The lease is collector-lease.ts's to test; here every run gets it.
  ports.lease.mockImplementation(async (_key: string, work: () => Promise<unknown>) => ({ ran: true, value: await work() }));
  ports.readHosts.mockResolvedValue(new Map());
  ports.recordHosts.mockImplementation(async (_source: string, outcomes: unknown[]) => ({ recorded: outcomes.length }));
});
const hostRow = (fields: Partial<CollectorHostRow>): CollectorHostRow => ({ host: 'www.cardrush-op.jp', consecutiveRefusals: 0, lastSuccessAt: null, lastRefusalAt: null, lastRefusalReason: null, notBefore: null, suspendedAt: null, suspendedReason: null, ...fields });

describe('CardRush run planning', () => {
  it('reads one host per two-hour slot, each of the six in turn', () => {
    const hosts = slots.map(cardRushHostFor);
    expect(new Set(hosts.slice(0, 6))).toEqual(new Set(Object.keys(CARDRUSH_COLLECTOR_HOSTS)));
    expect(hosts.slice(6)).toEqual(hosts.slice(0, 6));
    expect(cardRushHostFor(new Date(opRun.getTime() + 100 * 60 * 1000))).toBe('www.cardrush-op.jp');
  });

  it('takes never-read pages first in sitemap order, then the oldest reading, quarantine included', async () => {
    const urls = [1, 2, 3, 4, 5].map(id => `https://www.cardrush-op.jp/product/${id}`);
    const runQuery = vi.fn().mockResolvedValue({ rows: [
      { id: 'www.cardrush-op.jp/product/1', at: new Date('2026-10-28T09:00:00Z') },
      { id: 'www.cardrush-op.jp/product/3', at: new Date('2026-10-28T03:00:00Z') },
      { id: 'www.cardrush-op.jp/product/5', at: '2026-10-28T05:00:00.000Z' },
    ], rowCount: 3 });
    expect(await chooseStalestCardRushPages('www.cardrush-op.jp', urls, 4, runQuery)).toEqual([urls[1], urls[3], urls[2], urls[4]]);
    expect(runQuery.mock.calls[0]![1]).toEqual(['www.cardrush-op.jp/product/']);
    expect(runQuery.mock.calls[0]![0]).toMatch(/member_price_observations[\s\S]*jsonb_array_elements\(b\.quarantine\)/);
    expect(await chooseStalestCardRushPages('www.cardrush-op.jp', urls, 0, runQuery)).toEqual([]);
    expect(runQuery).toHaveBeenCalledOnce();
  });
});

const HOUR = 3_600_000, DAY = 24 * HOUR;
const op = (id: number) => `https://www.cardrush-op.jp/product/${id}`;
const opId = (id: number) => `www.cardrush-op.jp/product/${id}`;
/** A run choosing at 00:15:50 UTC, as One Piece's runs do about 50 s into their slot. */
const NOW = Date.parse('2026-11-25T00:15:50.000Z');
const ago = (ms: number) => NOW - ms;
/** mulberry32: the same synthetic cases on every run. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
/** Up to 60 listed pages, most read in the last 12 days, about half of those
 * basket members, plus five members the sitemap no longer lists. */
function randomCase(random: () => number) {
  const ids = [...new Set(Array.from({ length: Math.floor(random() * 60) }, () => 1 + Math.floor(random() * 200)))];
  const last = new Map<string, number>(), basket = new Set<string>();
  for (const id of ids) {
    if (random() < 0.7) last.set(opId(id), ago(Math.floor(random() * 12 * DAY)));
    if (last.has(opId(id)) && random() < 0.5) basket.add(opId(id));
  }
  for (let unlisted = 0; unlisted < 5; unlisted++) {
    const id = 300 + Math.floor(random() * 100);
    last.set(opId(id), ago(Math.floor(random() * 12 * DAY))); basket.add(opId(id));
  }
  return { urls: ids.map(op), last, basket, capacity: Math.floor(random() * 70) };
}

/** Sixty days of One Piece runs at 00:15:50 and 12:15:50 UTC, 101 pages each,
 * every page read 2 s after the one before it. The basket's members are first
 * read at random over the 18 days before the first run; 5,000 pages are never
 * read before it. Sets play no part in the order (the basket query has
 * already applied them), so none are modelled. `skip` drops runs by index. */
function simulate({ members, skip = new Set<number>(), seed = 18 }: { members: number; skip?: ReadonlySet<number>; seed?: number }) {
  const random = seeded(seed);
  const start = Date.UTC(2026, 10, 17), capacity = 101;
  const urls = Array.from({ length: members + 5_000 }, (_, index) => op(index + 1));
  const basket = new Set(urls.slice(0, members).map(url => url.slice('https://'.length)));
  const last = new Map<string, number>(), reads = new Map<string, number[]>();
  for (const id of basket) { const at = start - Math.floor(random() * 18 * DAY); last.set(id, at); reads.set(id, [at]); }
  const runs: { rereads: number; firstReads: number; others: number }[] = [];
  let now = start;
  for (let index = 0; index < 120; index++) {
    now = start + index * 12 * HOUR + 15 * 60_000 + 50_000;
    if (skip.has(index)) continue;
    const run = { rereads: 0, firstReads: 0, others: 0 };
    orderCardRushPages({ urls, last, basket, capacity, now }).urls.forEach((url, position) => {
      const id = url.slice('https://'.length), at = now + 2_000 * position;
      if (basket.has(id)) { run.rereads++; reads.get(id)!.push(at); } else if (last.has(id)) run.others++; else run.firstReads++;
      last.set(id, at);
    });
    runs.push(run);
  }
  // A gap that starts at a run, or a reading not yet repeated when the last run chose. The wait
  // of a reading made before the first run is the catch-up's, not the schedule's.
  const gaps = [...reads.values()].flatMap(times => [
    ...times.slice(1).map((end, index) => ({ from: times[index]!, end, length: end - times[index]! })).filter(gap => gap.from >= start),
    { from: times.at(-1)!, end: now, length: now - times.at(-1)! },
  ]);
  const firstReread = [...reads.values()].map(times => times.find(at => at >= start) ?? Infinity);
  return { start, runs, gaps, firstReread, longest: (from = start) => Math.max(...gaps.filter(gap => gap.end >= from).map(gap => gap.length)) / DAY };
}

describe('CardRush re-read basket', () => {
  it('with share 0 is exactly the stalest order, and on a host whose titles place nothing reads no basket', async () => {
    const random = seeded(1116);
    for (let index = 0; index < 200; index++) {
      const input = randomCase(random);
      const ordered = orderCardRushPages({ ...input, now: NOW, share: 0 });
      expect(ordered.urls).toEqual(orderStalestCardRushPages(input.urls, input.last, input.capacity));
      expect(ordered.reread.chosen).toBe(0);
    }
    const db = [1, 2, 3].map(id => `https://www.cardrush-db.jp/product/${id}`);
    const runQuery = vi.fn().mockResolvedValue({ rows: [{ id: 'www.cardrush-db.jp/product/2', at: new Date(ago(9 * DAY)) }], rowCount: 1 });
    expect(await chooseCardRushPages('www.cardrush-db.jp', db, 3, runQuery, NOW)).toEqual({ urls: [db[0], db[2], db[1]] });
    expect(runQuery).toHaveBeenCalledOnce();
    expect(runQuery.mock.calls[0]![0]).toMatch(/jsonb_array_elements\(b\.quarantine\)/);
    expect(runQuery.mock.calls[0]![1]).toEqual(['www.cardrush-db.jp/product/']);
  });

  // Members 2, 3, 4, 7, 8, 10, 11 are listed; 99 is a member the sitemap no longer lists.
  const sitemap = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(op);
  const last = new Map([
    [opId(2), ago(7 * DAY)], [opId(3), ago(10 * DAY + 30 * 60_000)], [opId(4), ago(6.5 * DAY)], [opId(5), ago(20 * DAY)], [opId(7), ago(5 * DAY)],
    [opId(8), ago(2 * DAY)], [opId(9), ago(DAY)], [opId(10), ago(9 * DAY)], [opId(11), ago(7 * DAY)], [opId(99), ago(12 * DAY)],
  ]);
  const basket = new Set([2, 3, 4, 7, 8, 10, 11, 99].map(opId));

  it('puts due members first: urgent ones (6 to 8 days) oldest first, then other due ones, lapsed included, oldest first; then never-read pages, then the stalest', () => {
    const { urls } = orderCardRushPages({ urls: sitemap, last, basket, capacity: 12, now: NOW });
    // 2 and 11 were read at the same instant: sitemap order. 8 (2 days) is a member not yet due; 5 is no member.
    expect(urls).toEqual([2, 11, 4, 3, 10, 7, 1, 6, 12, 5, 8, 9].map(op));
  });

  it('counts the basket as it found it', () => {
    expect(orderCardRushPages({ urls: sitemap, last, basket, capacity: 12, now: NOW }).reread)
      .toEqual({ basket: 8, listed: 7, due: 6, chosen: 6, urgent: 3, lapsed: 2, oldestHours: 240 });
    // Fewer slots for re-reads than due members: the urgent go first.
    expect(orderCardRushPages({ urls: sitemap, last, basket, capacity: 4, now: NOW }))
      .toEqual({ urls: [2, 11, 4, 1].map(op), reread: { basket: 8, listed: 7, due: 6, chosen: 3, urgent: 3, lapsed: 2, oldestHours: 240 } });
  });

  it('gives due members at most floor(capacity × share) of a run, the oldest first, and the rest wait', async () => {
    const members = Array.from({ length: 30 }, (_, index) => index + 1);
    const fresh = Array.from({ length: 10 }, (_, index) => 101 + index);
    const urls = [...fresh, ...members].map(op);
    // Every member is due (4 to 5.25 days) and none urgent; 30 is the oldest.
    const read = new Map(members.map(id => [opId(id), ago(4 * DAY + id * HOUR)]));
    const ordered = orderCardRushPages({ urls, last: read, basket: new Set(members.map(opId)), capacity: 20, now: NOW });
    expect(Math.floor(20 * CARDRUSH_REREAD.share)).toBe(16);
    expect(ordered.urls).toEqual([...members.slice(-16).reverse(), ...fresh.slice(0, 4)].map(op));
    expect(ordered.reread).toMatchObject({ due: 30, chosen: 16, urgent: 0, lapsed: 0 });
    expect(orderCardRushPages({ urls, last: read, basket: new Set(members.map(opId)), capacity: 0, now: NOW }).urls).toEqual([]);
    const runQuery = vi.fn();
    expect(await chooseCardRushPages('www.cardrush-op.jp', urls, 0, runQuery, NOW)).toEqual({ urls: [] });
    expect(await chooseCardRushPages('www.cardrush-op.jp', [], 20, runQuery, NOW)).toEqual({ urls: [] });
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('leaves a member read 3.5 days ago out of the re-reads', () => {
    const ordered = orderCardRushPages({ urls: [1, 2].map(op), last: new Map([[opId(2), ago(3.5 * DAY)]]), basket: new Set([opId(2)]), capacity: 2, now: NOW });
    expect(ordered.urls).toEqual([op(1), op(2)]);
    expect(ordered.reread).toMatchObject({ listed: 1, due: 0, chosen: 0 });
  });

  it('is due, urgent and lapsed at the right One Piece slot (00:15 and 12:15 UTC, choosing about 50 s in)', () => {
    const day = Date.UTC(2026, 10, 17);
    const slot = (days: number, hour: number) => day + days * DAY + hour * HOUR + 15 * 60_000 + 50_000;
    const one = (readAt: number, now: number) => orderCardRushPages({ urls: [op(1)], last: new Map([[opId(1), readAt]]), basket: new Set([opId(1)]), capacity: 1, now }).reread;
    const midnightRun = day + 16 * 60_000, noonRun = day + 12 * HOUR + 19 * 60_000;
    expect(one(midnightRun, slot(4, 0))).toMatchObject({ due: 1, urgent: 0, lapsed: 0 });
    expect(one(noonRun, slot(4, 0))).toMatchObject({ due: 0 });
    expect(one(noonRun, slot(4, 12))).toMatchObject({ due: 1, urgent: 0 });
    expect(one(midnightRun, slot(6, 0))).toMatchObject({ due: 1, urgent: 0 });
    expect(one(midnightRun, slot(6, 12))).toMatchObject({ due: 1, urgent: 1, lapsed: 0 });
    // The 00:15 run on day 8 is the last whose reading the day-8 derivation (window from day 1) takes.
    expect(one(midnightRun, slot(8, 0))).toMatchObject({ due: 1, urgent: 1, lapsed: 0 });
    expect(one(midnightRun, slot(8, 12))).toMatchObject({ due: 1, urgent: 0, lapsed: 1 });
  });

  it('returns no page twice, none it was not given, and fills the run up to capacity, whatever the basket holds', () => {
    const random = seeded(20261116);
    for (let index = 0; index < 300; index++) {
      const input = randomCase(random);
      const { urls, reread } = orderCardRushPages({ ...input, now: NOW });
      expect(new Set(urls).size).toBe(urls.length);
      expect(urls.length).toBe(Math.min(input.capacity, input.urls.length));
      expect(urls.filter(url => !input.urls.includes(url))).toEqual([]);
      expect(reread.chosen).toBeLessThanOrEqual(Math.floor(input.capacity * CARDRUSH_REREAD.share));
      expect(reread.listed).toBeLessThanOrEqual(reread.basket);
    }
    // 99 is due, lapsed and a member, but not listed this run.
    expect(orderCardRushPages({ urls: sitemap, last, basket, capacity: 12, now: NOW }).urls).not.toContain(op(99));
  });

  it('keeps a four-day cycle inside the derivation window with three days to spare, and gives the basket most of a run', () => {
    expect(CARDRUSH_REREAD.dueAfterMs).toBeLessThanOrEqual((REFERENCE_FRESHNESS_DAYS - 3) * DAY);
    expect(CARDRUSH_REREAD.share).toBeGreaterThan(0.5);
    expect(CARDRUSH_REREAD.share).toBeLessThanOrEqual(1);
    expect(Object.isFrozen(CARDRUSH_REREAD)).toBe(true);
    // The values the plan (#cardrush-basket), the heartbeat, the changelog and the tributaries row state;
    // the other tests derive their bounds from CARDRUSH_REREAD, so they would follow a change silently.
    expect(CARDRUSH_REREAD).toEqual({ share: 0.8, perSet: 30, frozenAt: '2026-11-17T00:00:00.000Z', dueAfterMs: 4 * DAY - HOUR });
  });

  describe('over sixty days of runs (pure, no database)', () => {
    const rereadCap = Math.floor(101 * CARDRUSH_REREAD.share);
    it('re-reads 548 members every four and a half days at most once caught up, never past seven, and leaves at least a fifth of each run to first reads', () => {
      const run = simulate({ members: 548 });
      expect(run.runs).toHaveLength(120);
      expect(Math.max(...run.firstReread) - run.start).toBeLessThanOrEqual(5 * DAY);
      expect(run.longest()).toBeLessThanOrEqual(7);
      expect(run.longest(run.start + 8 * DAY)).toBeLessThanOrEqual(4.5);
      expect(Math.max(...run.runs.map(entry => entry.rereads))).toBeLessThanOrEqual(rereadCap);
      expect(Math.min(...run.runs.map(entry => entry.firstReads))).toBeGreaterThanOrEqual(101 - rereadCap);
      expect(run.runs.every(entry => entry.others === 0)).toBe(true);
    }, 30_000);

    it('keeps every gap under 7.5 days with six runs in a row missed (three days)', () => {
      const run = simulate({ members: 548, skip: new Set([40, 41, 42, 43, 44, 45]) });
      expect(run.runs).toHaveLength(114);
      expect(run.longest()).toBeLessThanOrEqual(7.5);
    }, 30_000);

    it('keeps every gap under 7 days with 1,034 members, the re-reads then filling their share', () => {
      const run = simulate({ members: 1_034 });
      expect(run.longest()).toBeLessThanOrEqual(7);
      expect(Math.max(...run.runs.map(entry => entry.rereads))).toBe(rereadCap);
      expect(Math.min(...run.runs.map(entry => entry.firstReads))).toBeGreaterThanOrEqual(101 - rereadCap);
    }, 30_000);
  });
});

describe('CardRush collector run', () => {
  it('does no acquisition while the release row is revoked or missing', async () => {
    ports.query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await collectCardRush({ runAt: opRun })).toMatchObject({ ran: false, host: 'www.cardrush-op.jp', reason: 'release-revoked-or-unreviewed', requested: 0 });
    expect(ports.acquire).not.toHaveBeenCalled(); expect(ports.write).not.toHaveBeenCalled();
  });

  it.each(['run-in-progress', 'request-spacing', 'lease-not-provisioned'] as const)('holds the host lease before any request, and answers %s without reading', async reason => {
    ports.query.mockResolvedValueOnce(released);
    ports.lease.mockResolvedValueOnce({ ran: false, reason });
    expect(await collectCardRush({ runAt: opRun })).toEqual({ ran: false, reason, host: 'www.cardrush-op.jp', runAt: opRun.toISOString(), requested: 0, observed: 0, quarantined: 0 });
    // One lease per host: another host's run is not held back by this one.
    // Its release keeps the host's 2 s between requests before the next run's first.
    expect(ports.lease).toHaveBeenCalledWith('cardrush:www.cardrush-op.jp', expect.any(Function), { runQuery: expect.any(Function), spacingMs: 2_000 });
    expect(ports.acquire).not.toHaveBeenCalled(); expect(ports.write).not.toHaveBeenCalled();
  });

  it('asks for no lease while the release row is revoked', async () => {
    ports.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await collectCardRush({ runAt: opRun });
    expect(ports.lease).not.toHaveBeenCalled();
  });

  it('writes one batch under the run key, and its crosswalks as a collector, so another mapper’s live row stands', async () => {
    const parsed = parseCardRushMemberPrices([page(15600), page(169)]);
    ports.query.mockResolvedValueOnce(released);
    ports.acquire.mockImplementation(async (_context, input) => {
      expect(input).toMatchObject({ evidenceVersion: 'cardrush/2026-10-28.1', host: 'www.cardrush-op.jp' });
      // 270 s less the 60 s kept back for writes, less the time spent so far.
      expect(input.budgetMs).toBeGreaterThan(200_000); expect(input.budgetMs).toBeLessThanOrEqual(210_000);
      return { host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: 14887, requested: 2, unavailable: { code: 'SOURCE_UNAVAILABLE', reason: 'http-429' }, refused: { status: 429, retryAfter: '7200' }, parsed };
    });
    ports.write.mockResolvedValue({ batchId: '21', inserted: 2, duplicate: false });
    // The writers decide under their lock: the second product and the set are an operator's.
    ports.product.mockResolvedValueOnce({ id: '9', supersededId: null, unchanged: false }).mockResolvedValueOnce({ id: '4', supersededId: null, unchanged: true, foreign: true });
    ports.set.mockResolvedValue({ id: '5', supersededId: null, unchanged: true, foreign: true });
    ports.images.mockResolvedValue({ written: 2 });
    const summary = await collectCardRush({ runAt: opRun });
    expect(summary).toEqual({
      ran: true, host: 'www.cardrush-op.jp', runAt: opRun.toISOString(), requested: 2, observed: 2, quarantined: 1,
      unavailable: { code: 'SOURCE_UNAVAILABLE', reason: 'http-429' }, sitemapProducts: 14887,
      batch: { id: '21', inserted: 2, duplicate: false }, crosswalks: { written: 1, unchanged: 0, skipped: 2, refused: 0 },
      listingImages: { written: 2 }, hostState: { recorded: 1 },
    });
    // The 429 counts against the host, with its Retry-After as sent.
    expect(ports.recordHosts.mock.calls[0]!.slice(0, 3)).toEqual(['cardrush', [{ host: 'www.cardrush-op.jp', kind: 'refused', reason: 'http-429', retryAfter: '7200' }], new Map()]);
    const [source, batch, , options] = ports.write.mock.calls[0]!;
    expect(source).toBe('cardrush');
    // The host's refusal is named in the batch, beside the pages it read before it.
    expect(batch).toEqual({ observations: parsed.observations, quarantine: [...parsed.quarantine, { sourceProductId: null, field: 'host', reason: 'http-429' }], sourceRows: 2, missingPrices: 0 });
    expect(options).toEqual({ ingestKey: `cardrush:www.cardrush-op.jp:${opRun.toISOString()}` });
    expect(ports.product).toHaveBeenCalledTimes(2);
    expect(ports.product.mock.calls[0]![0]).toEqual({ source: 'cardrush', ...parsed.productCrosswalks[0], crosswalkVersion: CARDRUSH_CROSSWALK_VERSION });
    for (const call of [...ports.product.mock.calls, ...ports.set.mock.calls]) expect(call[2]).toEqual({ collector: true });
    expect(ports.set).toHaveBeenCalledOnce();
    // The listing image URLs go to their own writer, last, with the observations the batch wrote; never into the batch.
    expect(parsed.listingImages).toHaveLength(2);
    expect(ports.images).toHaveBeenCalledWith(parsed.listingImages, parsed.observations, expect.any(Function));
  });

  it('links no listing image for a repeated run key, and reports a store without 0145 without failing the run', async () => {
    const parsed = parseCardRushMemberPrices([page(15600)]);
    ports.query.mockResolvedValueOnce(released);
    ports.acquire.mockResolvedValue({ host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: 9, requested: 1, unavailable: null, refused: null, parsed });
    ports.product.mockResolvedValue({ id: '3', supersededId: null, unchanged: true });
    ports.set.mockResolvedValue({ id: '4', supersededId: null, unchanged: true });
    ports.write.mockResolvedValue({ batchId: '24', inserted: 0, duplicate: true });
    expect((await collectCardRush({ runAt: opRun })).listingImages).toBeUndefined();
    expect(ports.images).not.toHaveBeenCalled();
    ports.query.mockResolvedValueOnce(released);
    ports.write.mockResolvedValue({ batchId: '25', inserted: 1, duplicate: false });
    ports.images.mockResolvedValue({ written: 0, skipped: 'not-provisioned' });
    expect(await collectCardRush({ runAt: opRun })).toMatchObject({ batch: { id: '25', inserted: 1 }, listingImages: { written: 0, skipped: 'not-provisioned' } });
  });

  it('counts a malformed link the writers refuse, and lets any other failure surface', async () => {
    const parsed = parseCardRushMemberPrices([page(15600)]);
    ports.query.mockResolvedValueOnce(released);
    ports.acquire.mockResolvedValue({ host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: 9, requested: 1, unavailable: null, refused: null, parsed });
    ports.write.mockResolvedValue({ batchId: '22', inserted: 1, duplicate: false });
    ports.product.mockRejectedValue(new Error('price-crosswalk-not-exact'));
    ports.set.mockResolvedValue({ id: '3', supersededId: null, unchanged: true });
    expect((await collectCardRush({ runAt: opRun })).crosswalks).toEqual({ written: 0, unchanged: 1, skipped: 0, refused: 1 });
    ports.query.mockResolvedValueOnce(released);
    ports.product.mockRejectedValue(new Error('connection reset'));
    await expect(collectCardRush({ runAt: opRun })).rejects.toThrow('connection reset');
  });

  it('records a host that refused its sitemap as that host\'s reading: a batch with no observation, naming the refusal', async () => {
    ports.query.mockResolvedValueOnce(released);
    ports.acquire.mockResolvedValue({ host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: 0, requested: 0, unavailable: { code: 'SOURCE_UNAVAILABLE', reason: 'sitemap-http-403' }, refused: { status: 403, retryAfter: null },
      parsed: { observations: [], quarantine: [], sourceRows: 0, missingPrices: 0, productCrosswalks: [], setCrosswalks: [], listingImages: [] } });
    ports.write.mockResolvedValue({ batchId: '23', inserted: 0, duplicate: false });
    expect(await collectCardRush({ runAt: opRun })).toMatchObject({ ran: true, requested: 0, batch: { id: '23', inserted: 0 }, unavailable: { reason: 'sitemap-http-403' } });
    expect(ports.write.mock.calls[0]!.slice(0, 2)).toEqual(['cardrush', { observations: [], quarantine: [{ sourceProductId: null, field: 'host', reason: 'sitemap-http-403' }], sourceRows: 0, missingPrices: 0 }]);
    expect(ports.write.mock.calls[0]![3]).toEqual({ ingestKey: `cardrush:www.cardrush-op.jp:${opRun.toISOString()}` });
    expect(ports.product).not.toHaveBeenCalled();
  });

  it('writes nothing when the run read no page and nothing refused it', async () => {
    ports.query.mockResolvedValueOnce(released);
    ports.acquire.mockResolvedValue({ host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: 9, requested: 0, unavailable: null, refused: null,
      parsed: { observations: [], quarantine: [], sourceRows: 0, missingPrices: 0, productCrosswalks: [], setCrosswalks: [], listingImages: [] } });
    expect(await collectCardRush({ runAt: opRun })).toMatchObject({ ran: true, requested: 0, batch: null, hostState: { recorded: 1 } });
    expect(ports.write).not.toHaveBeenCalled();
    // Served, even with nothing to read: the host's count resets.
    expect(ports.recordHosts.mock.calls[0]![1]).toEqual([{ host: 'www.cardrush-op.jp', kind: 'collected' }]);
  });

  it('asks a host nothing while it is backing off or suspended, and asks again once its not-before has passed', async () => {
    const later = new Date(Date.now() + 3_600_000).toISOString();
    for (const [row, expected] of [
      [hostRow({ consecutiveRefusals: 1, lastRefusalAt: '2026-10-28T02:15:00.000Z', lastRefusalReason: 'http-429', notBefore: later }), { reason: 'host-backing-off', notBefore: later, suspendedAt: null }],
      [hostRow({ consecutiveRefusals: 3, lastRefusalAt: '2026-10-28T02:15:00.000Z', lastRefusalReason: 'http-403', notBefore: '2026-10-28T08:15:00.000Z', suspendedAt: '2026-10-28T02:15:00.000Z', suspendedReason: 'http-403' }),
        { reason: 'host-suspended', suspendedAt: '2026-10-28T02:15:00.000Z', suspendedReason: 'http-403' }],
    ] as const) {
      ports.query.mockResolvedValueOnce(released);
      ports.readHosts.mockResolvedValueOnce(new Map([['www.cardrush-op.jp', row]]));
      expect(await collectCardRush({ runAt: opRun })).toMatchObject({ ran: false, host: 'www.cardrush-op.jp', requested: 0, ...expected });
    }
    expect(ports.readHosts.mock.calls.map(call => call.slice(0, 2))).toEqual([['cardrush', ['www.cardrush-op.jp']], ['cardrush', ['www.cardrush-op.jp']]]);
    expect(ports.acquire).not.toHaveBeenCalled(); expect(ports.write).not.toHaveBeenCalled(); expect(ports.recordHosts).not.toHaveBeenCalled();
    ports.query.mockResolvedValueOnce(released);
    ports.readHosts.mockResolvedValueOnce(new Map([['www.cardrush-op.jp', hostRow({ consecutiveRefusals: 2, lastRefusalAt: '2026-10-28T02:15:00.000Z', lastRefusalReason: 'http-429', notBefore: new Date(Date.now() - 1).toISOString() })]]));
    ports.acquire.mockResolvedValue({ host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: 9, requested: 0, unavailable: null, refused: null,
      parsed: { observations: [], quarantine: [], sourceRows: 0, missingPrices: 0, productCrosswalks: [], setCrosswalks: [], listingImages: [] } });
    expect(await collectCardRush({ runAt: opRun })).toMatchObject({ ran: true });
    expect(ports.acquire).toHaveBeenCalledOnce();
  });

  it('leaves the host as it was after a stop that is not a refusal, and runs on a store without 0146', async () => {
    ports.query.mockResolvedValueOnce(released);
    ports.readHosts.mockResolvedValueOnce(null);
    ports.recordHosts.mockResolvedValueOnce({ recorded: 0, skipped: 'not-provisioned' });
    ports.acquire.mockResolvedValue({ host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: 0, requested: 0, unavailable: { code: 'SOURCE_UNAVAILABLE', reason: 'robots-http-500' }, refused: null,
      parsed: { observations: [], quarantine: [], sourceRows: 0, missingPrices: 0, productCrosswalks: [], setCrosswalks: [], listingImages: [] } });
    ports.write.mockResolvedValue({ batchId: '26', inserted: 0, duplicate: false });
    expect(await collectCardRush({ runAt: opRun })).toMatchObject({ ran: true, batch: { id: '26' }, hostState: { recorded: 0, skipped: 'not-provisioned' } });
    expect(ports.recordHosts.mock.calls[0]!.slice(0, 3)).toEqual(['cardrush', [], null]);
  });

  it('chooses due basket members first on One Piece and says what it found of the basket; another host keeps the stalest order and says nothing', async () => {
    const now = Date.now();
    const nothingRead = { observations: [], quarantine: [], sourceRows: 0, missingPrices: 0, productCrosswalks: [], setCrosswalks: [], listingImages: [] };
    // On each host, readings of 2 and 4 a day ago and of 3 nine days ago; One Piece's basket is 3 and 4.
    ports.query.mockImplementation(async (sql: string, params: string[]) => {
      if (sql.includes('member_price_source_releases')) return released;
      if (sql.includes('first_read')) return { rows: [{ id: opId(3) }, { id: opId(4) }], rowCount: 2 };
      return { rows: [[2, DAY], [3, 9 * DAY], [4, DAY]].map(([id, age]) => ({ id: `${params[0]}${id}`, at: new Date(now - age!) })), rowCount: 3 };
    });
    const chosen: (readonly string[])[] = [];
    ports.acquire.mockImplementation(async (_context, input) => {
      chosen.push(await input.choose([1, 2, 3, 4].map(id => `https://${input.host}/product/${id}`), 3));
      return { host: input.host, game: 'one-piece', sitemapProducts: 4, robotsDisallowed: 0, requested: 0, unavailable: null, refused: null, parsed: nothingRead };
    });
    expect(await collectCardRush({ runAt: opRun })).toMatchObject({ ran: true, host: 'www.cardrush-op.jp', reread: { basket: 2, listed: 2, due: 1, chosen: 1, urgent: 0, lapsed: 1, oldestHours: 216 } });
    expect(chosen).toEqual([[op(3), op(1), op(2)]]);
    expect(ports.query.mock.calls.slice(1).map(call => call[1])).toEqual([['www.cardrush-op.jp/product/'], ['www.cardrush-op.jp/product/', CARDRUSH_REREAD.frozenAt, CARDRUSH_REREAD.perSet]]);

    ports.query.mockClear(); ports.acquire.mockClear();
    const dbRun = slots.find(slot => cardRushHostFor(slot) === 'www.cardrush-db.jp')!;
    const summary = await collectCardRush({ runAt: dbRun });
    expect(summary).toMatchObject({ ran: true, host: 'www.cardrush-db.jp' });
    expect(summary).not.toHaveProperty('reread');
    expect(chosen[1]).toEqual([1, 3, 2].map(id => `https://www.cardrush-db.jp/product/${id}`));
    expect(ports.query.mock.calls.map(call => String(call[0])).filter(sql => sql.includes('first_read'))).toEqual([]);
  });
});
