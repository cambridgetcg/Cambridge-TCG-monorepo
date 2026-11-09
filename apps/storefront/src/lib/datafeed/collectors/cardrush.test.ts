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
import { cardRushHostFor, chooseStalestCardRushPages, collectCardRush } from './cardrush';
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
});
