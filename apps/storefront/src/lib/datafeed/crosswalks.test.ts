import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query, transaction } from '@/lib/db';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ query: vi.fn(), transaction: vi.fn() }));
import { collectorMaySupersede, crosswalkVersionFamily, resolveCrosswalkSkus, resolveLiveCrosswalk, writeProductCrosswalk, writeSetCrosswalk, type ProductCrosswalkInput } from './crosswalks';

const exact: ProductCrosswalkInput = {
  source: 'cardrush', sourceProductId: 'cardrush-op.jp/product/1234', finish: 'parallel', language: 'ja', game: 'one-piece',
  mappingStatus: 'exact', sku: 'op-op01-001-ja-p1', setCode: 'op01', evidence: 'title:OP01-001 [P]', crosswalkVersion: 'cardrush-title/1',
};
beforeEach(() => { vi.mocked(query).mockReset(); vi.mocked(transaction).mockReset(); });

describe('price source crosswalk writes', () => {
  it.each([
    { source: 'ebay' }, { source: '__proto__' }, { sourceProductId: ' ' }, { evidence: '' }, { crosswalkVersion: ' ' },
    { finish: '' }, { language: '' }, { game: '' },
    { sku: 'OP-OP01-001-JA' }, { sku: 'op-op02-001-ja' }, { sku: 'op-op01-001-en' }, { game: 'pokemon' }, { sku: null },
    { mappingStatus: 'ambiguous' }, { mappingStatus: 'ambiguous', sku: null }, { mappingStatus: 'unmapped', sku: null, setCode: null },
  ])('refuses a guessed, malformed or mismatched mapping before any transaction %j', async fields => {
    const runTransaction = vi.fn();
    await expect(writeProductCrosswalk({ ...exact, ...fields } as ProductCrosswalkInput, runTransaction)).rejects.toThrow(/crosswalk/);
    expect(runTransaction).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('leaves an identical live mapping in place rather than superseding it', async () => {
    const tx = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '5', sku: exact.sku, set_code: exact.setCode, game: exact.game, mapping_status: 'exact', evidence: exact.evidence, crosswalk_version: exact.crosswalkVersion }], rowCount: 1 });
    expect(await writeProductCrosswalk(exact, async work => work(tx))).toEqual({ id: '5', supersededId: null, unchanged: true });
    expect(tx).toHaveBeenCalledTimes(2);
    expect(tx.mock.calls[0][0]).toContain('pg_advisory_xact_lock(140');
  });

  it('supersedes a different live mapping before inserting the new one', async () => {
    const tx = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '5', sku: 'op-op01-002-ja', set_code: 'op01', game: exact.game, mapping_status: 'exact', evidence: 'title:OP01-002', crosswalk_version: exact.crosswalkVersion }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '6' }], rowCount: 1 });
    expect(await writeProductCrosswalk(exact, async work => work(tx))).toEqual({ id: '6', supersededId: '5', unchanged: false });
    expect(tx.mock.calls[2][0]).toMatch(/^UPDATE price_source_crosswalks SET superseded_at/);
    expect(tx.mock.calls[3][0]).toContain('INSERT INTO price_source_crosswalks');
  });

  it("lets a collector move its own rule's mappings on after a version bump, and leaves another writer's row standing", async () => {
    expect(crosswalkVersionFamily('cardrush-title/1')).toBe('cardrush-title/');
    expect(crosswalkVersionFamily('cardmarket-expansions/2026-10-28.1')).toBe('cardmarket-expansions/');
    expect(collectorMaySupersede('cardrush-title/1', 'cardrush-title/2')).toBe(true);
    expect(collectorMaySupersede('tcgplayer-number/1', 'tcgplayer-number/2')).toBe(true);
    for (const [live, next] of [['operator-review/1', 'cardrush-title/2'], ['cardrush-title/1', 'tcgplayer-number/1'], ['cardrush-title', 'cardrush-title/1'], ['cardrush-titles/1', 'cardrush-title/1']]) {
      expect(collectorMaySupersede(live!, next!)).toBe(false);
    }
    const bumped = { ...exact, sku: 'op-op01-001-ja-p1', crosswalkVersion: 'cardrush-title/2' };
    const live = (version: string) => ({ rows: [{ id: '5', sku: 'op-op01-001-ja-p1', set_code: 'op01', game: exact.game, mapping_status: 'exact', evidence: exact.evidence, crosswalk_version: version }], rowCount: 1 });
    // The collector's own earlier revision: superseded by the bumped rule.
    const own = vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce(live('cardrush-title/1'))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: '6' }], rowCount: 1 });
    expect(await writeProductCrosswalk(bumped, async work => work(own), { collector: true })).toEqual({ id: '6', supersededId: '5', unchanged: false });
    expect(own.mock.calls[2][0]).toMatch(/^UPDATE price_source_crosswalks SET superseded_at/);
    // An operator's review: the collector writes nothing, under the same lock it would have written under.
    const review = vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce(live('operator-review/1'));
    expect(await writeProductCrosswalk(bumped, async work => work(review), { collector: true })).toEqual({ id: '5', supersededId: null, unchanged: true, foreign: true });
    expect(review).toHaveBeenCalledTimes(2);
    // An operator's own write replaces whatever is live.
    const operator = vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce(live('cardrush-title/1'))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: '7' }], rowCount: 1 });
    expect(await writeProductCrosswalk({ ...exact, crosswalkVersion: 'operator-review/2' }, async work => work(operator))).toEqual({ id: '7', supersededId: '5', unchanged: false });
  });

  it('applies the same rule to set mappings', async () => {
    const input = { source: 'tcgplayer' as const, sourceSetKey: '3188', game: 'one-piece', setCode: 'op01', evidence: 'abbreviation:OP01', crosswalkVersion: 'tcgplayer-number/2' };
    const live = (version: string) => ({ rows: [{ id: '8', set_code: 'op01', evidence: 'abbreviation:OP01', crosswalk_version: version }], rowCount: 1 });
    const review = vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce(live('operator-review/1'));
    expect(await writeSetCrosswalk(input, async work => work(review), { collector: true })).toEqual({ id: '8', supersededId: null, unchanged: true, foreign: true });
    const own = vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce(live('tcgplayer-number/1'))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: '9' }], rowCount: 1 });
    expect(await writeSetCrosswalk(input, async work => work(own), { collector: true })).toEqual({ id: '9', supersededId: '8', unchanged: false });
  });

  it.each([{ setCode: 'OP01' }, { setCode: 'op-01' }, { sourceSetKey: '' }, { evidence: ' ' }, { source: 'vinted' }])(
    'refuses an invalid set mapping before any transaction %j', async fields => {
      const runTransaction = vi.fn();
      await expect(writeSetCrosswalk({ source: 'cardmarket', sourceSetKey: '5229', game: 'one-piece', setCode: 'op01', evidence: 'idExpansion:5229', crosswalkVersion: 'cardmarket-expansions/1', ...fields } as never, runTransaction)).rejects.toThrow(/set-crosswalk/);
      expect(runTransaction).not.toHaveBeenCalled();
    },
  );
});

describe('SKU resolution through live crosswalks', () => {
  const ref = { source: exact.source, sourceProductId: exact.sourceProductId, finish: exact.finish, language: exact.language, game: exact.game };
  const row = { id: '7', source: exact.source, source_product_id: exact.sourceProductId, finish: exact.finish, language: exact.language, sku: exact.sku, game: exact.game, set_code: exact.setCode, mapping_status: 'exact', evidence: exact.evidence, crosswalk_version: exact.crosswalkVersion };

  it('returns exact SKUs only, in input order, and never guesses across scope', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [row], rowCount: 1 });
    const resolved = await resolveCrosswalkSkus([{ ...ref, finish: null }, ref, { ...ref, sourceProductId: 'other' }]);
    expect(resolved.map(result => result.mappingStatus)).toEqual(['unmapped', 'exact', 'unmapped']);
    expect(resolved[1]).toEqual({ sku: exact.sku, setCode: 'op01', mappingStatus: 'exact', crosswalkId: '7', crosswalkVersion: exact.crosswalkVersion });
    expect(query).toHaveBeenCalledOnce();
  });

  it.each([{ mapping_status: 'ambiguous', sku: null, set_code: null }, { sku: 'op-op02-001-ja-p1' }, { game: 'pokemon' }])(
    'resolves a doubtful live row as ambiguous with no SKU %j', async fields => {
      vi.mocked(query).mockResolvedValue({ rows: [{ ...row, ...fields }], rowCount: 1 });
      const [resolved] = await resolveCrosswalkSkus([ref]);
      expect(resolved).toMatchObject({ sku: null, setCode: null, mappingStatus: 'ambiguous', crosswalkId: '7' });
    },
  );

  it('bounds each lookup and asks nothing for an empty list', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await resolveCrosswalkSkus([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    await resolveCrosswalkSkus(Array.from({ length: 2001 }, (_, index) => ({ ...ref, sourceProductId: String(index) })));
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('resolves a row read inside a caller\'s own snapshot by the same rule, without a query', () => {
    expect(resolveLiveCrosswalk(ref, row)).toEqual({ sku: exact.sku, setCode: 'op01', mappingStatus: 'exact', crosswalkId: '7', crosswalkVersion: exact.crosswalkVersion });
    expect(resolveLiveCrosswalk(ref, null)).toEqual({ sku: null, setCode: null, mappingStatus: 'unmapped', crosswalkId: null, crosswalkVersion: null });
    expect(resolveLiveCrosswalk(ref, { ...row, sku: 'op-op01-001-en' })).toMatchObject({ sku: null, mappingStatus: 'ambiguous', crosswalkId: '7' });
    expect(resolveLiveCrosswalk({ ...ref, game: 'pokemon' }, row)).toMatchObject({ sku: null, mappingStatus: 'ambiguous' });
    expect(query).not.toHaveBeenCalled();
  });
});
