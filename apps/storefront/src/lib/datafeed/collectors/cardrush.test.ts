import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { CARDRUSH_COLLECTOR_HOSTS, CARDRUSH_CROSSWALK_VERSION, parseCardRushMemberPrices } from '@cambridge-tcg/data-ingest/cardrush/member-prices';

vi.mock('server-only', () => ({}));
const ports = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), acquire: vi.fn(), write: vi.fn(), product: vi.fn(), set: vi.fn(), lease: vi.fn() }));
vi.mock('@/lib/db', () => ({ query: ports.query, transaction: ports.transaction }));
vi.mock('@cambridge-tcg/data-ingest/cardrush/member-prices', async importOriginal => ({
  ...await importOriginal<typeof import('@cambridge-tcg/data-ingest/cardrush/member-prices')>(), acquireCardRushMemberPrices: ports.acquire,
}));
vi.mock('../member-price-writer', () => ({ writeMemberPriceBatch: ports.write }));
vi.mock('../crosswalks', () => ({ writeProductCrosswalk: ports.product, writeSetCrosswalk: ports.set }));
vi.mock('../collector-lease', () => ({ withCollectorLease: ports.lease }));
import { cardRushHostFor, chooseStalestCardRushPages, collectCardRush } from './cardrush';

const fixtures = new URL('../../../../../../packages/data-ingest/src/cardrush/__tests__/fixtures/', import.meta.url);
const page = (id: number) => ({ url: `https://www.cardrush-op.jp/product/${id}`, bytes: readFileSync(new URL(`cardrush-op-${id}.html`, fixtures)), retrievedAt: '2026-10-28T15:00:00.000Z' });
const slots = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(2026, 9, 28, 2 * index, 15)));
const opRun = slots.find(slot => cardRushHostFor(slot) === 'www.cardrush-op.jp')!;
const released = { rows: [{ source: 'cardrush' }], rowCount: 1 };
beforeEach(() => {
  Object.values(ports).forEach(port => port.mockReset());
  // The lease is collector-lease.ts's to test; here every run gets it.
  ports.lease.mockImplementation(async (_key: string, work: () => Promise<unknown>) => ({ ran: true, value: await work() }));
});

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
      return { host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: 14887, requested: 2, unavailable: { code: 'SOURCE_UNAVAILABLE', reason: 'http-429' }, parsed };
    });
    ports.write.mockResolvedValue({ batchId: '21', inserted: 2, duplicate: false });
    // The writers decide under their lock: the second product and the set are an operator's.
    ports.product.mockResolvedValueOnce({ id: '9', supersededId: null, unchanged: false }).mockResolvedValueOnce({ id: '4', supersededId: null, unchanged: true, foreign: true });
    ports.set.mockResolvedValue({ id: '5', supersededId: null, unchanged: true, foreign: true });
    const summary = await collectCardRush({ runAt: opRun });
    expect(summary).toEqual({
      ran: true, host: 'www.cardrush-op.jp', runAt: opRun.toISOString(), requested: 2, observed: 2, quarantined: 1,
      unavailable: { code: 'SOURCE_UNAVAILABLE', reason: 'http-429' }, sitemapProducts: 14887,
      batch: { id: '21', inserted: 2, duplicate: false }, crosswalks: { written: 1, unchanged: 0, skipped: 2, refused: 0 },
    });
    const [source, batch, , options] = ports.write.mock.calls[0]!;
    expect(source).toBe('cardrush');
    // The host's refusal is named in the batch, beside the pages it read before it.
    expect(batch).toEqual({ observations: parsed.observations, quarantine: [...parsed.quarantine, { sourceProductId: null, field: 'host', reason: 'http-429' }], sourceRows: 2, missingPrices: 0 });
    expect(options).toEqual({ ingestKey: `cardrush:www.cardrush-op.jp:${opRun.toISOString()}` });
    expect(ports.product).toHaveBeenCalledTimes(2);
    expect(ports.product.mock.calls[0]![0]).toEqual({ source: 'cardrush', ...parsed.productCrosswalks[0], crosswalkVersion: CARDRUSH_CROSSWALK_VERSION });
    for (const call of [...ports.product.mock.calls, ...ports.set.mock.calls]) expect(call[2]).toEqual({ collector: true });
    expect(ports.set).toHaveBeenCalledOnce();
  });

  it('counts a malformed link the writers refuse, and lets any other failure surface', async () => {
    const parsed = parseCardRushMemberPrices([page(15600)]);
    ports.query.mockResolvedValueOnce(released);
    ports.acquire.mockResolvedValue({ host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: 9, requested: 1, unavailable: null, parsed });
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
    ports.acquire.mockResolvedValue({ host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: 0, requested: 0, unavailable: { code: 'SOURCE_UNAVAILABLE', reason: 'sitemap-http-403' },
      parsed: { observations: [], quarantine: [], sourceRows: 0, missingPrices: 0, productCrosswalks: [], setCrosswalks: [] } });
    ports.write.mockResolvedValue({ batchId: '23', inserted: 0, duplicate: false });
    expect(await collectCardRush({ runAt: opRun })).toMatchObject({ ran: true, requested: 0, batch: { id: '23', inserted: 0 }, unavailable: { reason: 'sitemap-http-403' } });
    expect(ports.write.mock.calls[0]!.slice(0, 2)).toEqual(['cardrush', { observations: [], quarantine: [{ sourceProductId: null, field: 'host', reason: 'sitemap-http-403' }], sourceRows: 0, missingPrices: 0 }]);
    expect(ports.write.mock.calls[0]![3]).toEqual({ ingestKey: `cardrush:www.cardrush-op.jp:${opRun.toISOString()}` });
    expect(ports.product).not.toHaveBeenCalled();
  });

  it('writes nothing when the run read no page and nothing refused it', async () => {
    ports.query.mockResolvedValueOnce(released);
    ports.acquire.mockResolvedValue({ host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: 9, requested: 0, unavailable: null,
      parsed: { observations: [], quarantine: [], sourceRows: 0, missingPrices: 0, productCrosswalks: [], setCrosswalks: [] } });
    expect(await collectCardRush({ runAt: opRun })).toMatchObject({ ran: true, requested: 0, batch: null });
    expect(ports.write).not.toHaveBeenCalled();
  });
});
