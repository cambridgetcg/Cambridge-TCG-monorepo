import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transaction } from '@/lib/db';
import { MEMBER_PRICE_POLICIES, type NativePriceObservation } from '@cambridge-tcg/data-ingest/member-prices';
import { memberPriceObservationKey, validateMemberPriceWrite, writeMemberPriceBatch } from './member-price-writer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ transaction: vi.fn() }));
const parsed = { observations: [], quarantine: [], sourceRows: 0, missingPrices: 0 };
const observation: NativePriceObservation = {
  source: 'cardmarket', sourceProductId: '123', sku: null, mappingStatus: 'unmapped',
  game: 'one-piece', setCode: null, productName: 'Fixture', granularity: 'source-product',
  finish: null, language: null, condition: null, metric: 'trend', amount: '12.340000',
  currency: 'EUR', underlyingMarket: 'cardmarket', sourceUpdatedAt: '2026-09-06T00:00:00.000Z',
  retrievedAt: '2026-09-07T00:00:00.000Z', sourceUrl: 'https://example.test/prices.json',
  parserVersion: 'fixture/1', crosswalkVersion: 'none',
  evidenceVersion: MEMBER_PRICE_POLICIES.cardmarket.evidenceVersion, artifactSha256: 'a'.repeat(64),
  catalogSourceUrl: 'https://example.test/catalog.json', catalogUpdatedAt: '2026-08-01T00:00:00.000Z',
  catalogArtifactSha256: 'b'.repeat(64), quality: 'accepted',
};
const readAt = '2026-10-28T09:15:00.000Z';
const page = { granularity: 'printing', sourceUpdatedAt: readAt, retrievedAt: readAt, catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null };
const cardrush = { ...page, source: 'cardrush', game: 'one-piece', language: 'ja', finish: 'parallel', metric: 'sell', amount: '1500', currency: 'JPY', underlyingMarket: 'cardrush', evidenceVersion: MEMBER_PRICE_POLICIES.cardrush.evidenceVersion };
const tcgplayer = { ...page, source: 'tcgplayer', game: 'one-piece', language: 'en', condition: 'near-mint', metric: 'market', amount: '12.34', currency: 'USD', underlyingMarket: 'tcgplayer', evidenceVersion: MEMBER_PRICE_POLICIES.tcgplayer.evidenceVersion };
beforeEach(() => { vi.mocked(transaction).mockReset(); });

describe('member price operator transaction', () => {
  it.each([
    { amount: 12.34 }, { amount: '1\n' }, { amount: '0' },
    { mappingStatus: 'exact' }, { mappingStatus: 'ambiguous', setCode: 'op01' },
    { sku: 'op-op01-001-en' }, { mappingStatus: 'unknown' },
    { sourceProductId: 123 }, { metric: '' },
    { language: 'en' }, { condition: 'near-mint' },
    { currency: 'USD', underlyingMarket: 'tcgplayer' },
    { source: 'scryfall', granularity: 'source-product' },
    { source: 'scryfall', granularity: 'printing', currency: 'USD', underlyingMarket: 'cardmarket' },
    { source: 'scryfall', granularity: 'printing', currency: 'EUR', underlyingMarket: 'tcgplayer' },
    { ...cardrush, sourceUpdatedAt: '2026-10-27T00:00:00.000Z' }, { ...cardrush, amount: '1500.5' },
    { ...cardrush, currency: 'USD', underlyingMarket: 'tcgplayer' }, { ...cardrush, granularity: 'source-product' },
    { ...cardrush, evidenceVersion: MEMBER_PRICE_POLICIES.cardmarket.evidenceVersion },
    { ...tcgplayer, retrievedAt: '2026-10-28T09:16:00.000Z' }, { ...tcgplayer, currency: 'JPY', underlyingMarket: 'cardrush', amount: '1500' },
    // Forward-only: a page read before the 2026-10-28 permission is never stored.
    { ...cardrush, sourceUpdatedAt: '2026-10-27T23:59:59.000Z', retrievedAt: '2026-10-27T23:59:59.000Z' },
    { ...tcgplayer, sourceUpdatedAt: '2026-07-11T12:00:00.000Z', retrievedAt: '2026-07-11T12:00:00.000Z' },
  ])('rejects malformed normalized values before any transaction %j', async fields => {
    const row = { ...observation, ...fields } as NativePriceObservation;
    const runTransaction = vi.fn();
    await expect(writeMemberPriceBatch(row.source, { ...parsed, observations: [row], sourceRows: 1 }, runTransaction))
      .rejects.toThrow();
    expect(runTransaction).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { mappingStatus: 'ambiguous' },
    { mappingStatus: 'exact', sku: 'op-op01-001-en', setCode: 'op01' },
    { metric: 'trend-foil', finish: 'foil' },
    { source: 'scryfall', game: 'magic', granularity: 'printing', language: 'en', finish: 'nonfoil', currency: 'USD', underlyingMarket: 'tcgplayer', metric: 'usd' },
    { source: 'scryfall', game: 'magic', granularity: 'printing', language: 'en', finish: 'foil', currency: 'EUR', underlyingMarket: 'cardmarket', metric: 'eur_foil' },
    cardrush, { ...cardrush, condition: 'B', mappingStatus: 'exact', sku: 'op-op01-001-ja-p1', setCode: 'op01' },
    tcgplayer, { ...tcgplayer, metric: 'listed-median', amount: '11.5' },
  ])('preserves valid source scopes and native precision %j', fields => {
    const row = { ...observation, ...fields } as NativePriceObservation;
    const before = structuredClone(row);
    expect(() => validateMemberPriceWrite(row, { source: row.source, as_of: row.sourceUpdatedAt, retrieved_at: row.retrievedAt })).not.toThrow();
    expect(row).toEqual(before);
  });

  it('still requires permission evidence and matching provenance after value validation', () => {
    const provenance = { source: observation.source, as_of: observation.sourceUpdatedAt, retrieved_at: observation.retrievedAt };
    expect(() => validateMemberPriceWrite({ ...observation, evidenceVersion: 'unreviewed' }, provenance)).toThrow('unreviewed-price-release');
    expect(() => validateMemberPriceWrite(observation, { ...provenance, as_of: observation.retrievedAt })).toThrow('price-writer-provenance-mismatch');
  });

  it('uses the supplied transaction without opening the default connection', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ source: 'cardmarket' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '7' }], rowCount: 1 });
    const verifiedTransaction: typeof transaction = async work => work(query);
    expect(await writeMemberPriceBatch('cardmarket', parsed, verifiedTransaction))
      .toEqual({ batchId: '7', inserted: 0, duplicate: true });
    expect(transaction).not.toHaveBeenCalled();
    expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(query.mock.calls[1][1]).toEqual([
      'cardmarket', MEMBER_PRICE_POLICIES.cardmarket.evidenceVersion,
      MEMBER_PRICE_POLICIES.cardmarket.evidenceUrl,
    ]);
  });

  it('re-checks a page source release under that source’s own evidence', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ source: 'cardrush' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '9' }], rowCount: 1 });
    const verifiedTransaction: typeof transaction = async work => work(query);
    await writeMemberPriceBatch('cardrush', parsed, verifiedTransaction);
    expect(query.mock.calls[1][0]).toContain('member_display');
    expect(query.mock.calls[1][1]).toEqual(['cardrush', 'cardrush/2026-10-28.1', MEMBER_PRICE_POLICIES.cardrush.evidenceUrl]);
  });

  it('still checks source revocation before replay with an injected transaction', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const verifiedTransaction: typeof transaction = async work => work(query);
    await expect(writeMemberPriceBatch('cardmarket', parsed, verifiedTransaction))
      .rejects.toThrow('member-price-source-revoked-or-unreviewed');
    expect(query).toHaveBeenCalledTimes(2);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('keys a named batch by its name, and refuses a name outside its source', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ source: 'tcgplayer' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '11' }], rowCount: 1 });
    const verifiedTransaction: typeof transaction = async work => work(query);
    await writeMemberPriceBatch('tcgplayer', parsed, verifiedTransaction, { ingestKey: 'tcgplayer:3188:2026-10-28T16:00:00.000Z' });
    expect(query.mock.calls[2][1]).toEqual(['tcgplayer:3188:2026-10-28T16:00:00.000Z']);
    for (const name of ['cardrush:3188:x', 'tcgplayer', 'tcgplayer:3188 x', '', `tcgplayer:${'x'.repeat(201)}`]) {
      await expect(writeMemberPriceBatch('tcgplayer', parsed, verifiedTransaction, { ingestKey: name })).rejects.toThrow('invalid-ingest-key');
    }
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('retains the existing application transaction when none is supplied', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ source: 'cardmarket' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '8' }], rowCount: 1 });
    vi.mocked(transaction).mockImplementation(async work => work(query));
    expect(await writeMemberPriceBatch('cardmarket', parsed))
      .toEqual({ batchId: '8', inserted: 0, duplicate: true });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('keys a collector batch by its named run, still under the release re-check', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ source: 'cardrush' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: '11' }], rowCount: 1 });
    const ingestKey = 'cardrush:www.cardrush-op.jp:2026-10-28T10:15:00.000Z';
    expect(await writeMemberPriceBatch('cardrush', parsed, async work => work(query), { ingestKey }))
      .toEqual({ batchId: '11', inserted: 0, duplicate: false });
    expect(query.mock.calls[2][1]).toEqual([ingestKey]);
    expect(query.mock.calls[3][1][0]).toBe(ingestKey);
  });

  it('keeps the source set key out of the observation key, so a re-read never duplicates a row', () => {
    const key = memberPriceObservationKey(observation);
    for (const sourceSetKey of ['5229', '5230', null, undefined]) expect(memberPriceObservationKey({ ...observation, sourceSetKey })).toBe(key);
    expect(memberPriceObservationKey({ ...observation, retrievedAt: '2026-09-08T00:00:00.000Z', sourceSetKey: '5229' })).toBe(key);
    // Identity fields still distinguish rows.
    expect(memberPriceObservationKey({ ...observation, sourceProductId: '124' })).not.toBe(key);
  });

  it('writes the source set key where a row carries one and the store has the column, and names no such column otherwise', async () => {
    // `column` is the store's answer to the writer's one probe per batch; undefined: no probe expected.
    const run = async (rows: NativePriceObservation[], column?: boolean) => {
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ source: 'cardmarket' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ id: '12' }], rowCount: 1 });
      if (column !== undefined) query.mockResolvedValueOnce({ rows: [{ present: column }], rowCount: 1 });
      query.mockResolvedValueOnce({ rows: [], rowCount: rows.length });
      await writeMemberPriceBatch('cardmarket', { ...parsed, observations: rows, sourceRows: rows.length }, async work => work(query));
      return query.mock.calls;
    };
    const named = [{ ...observation, sourceSetKey: '5229' }, { ...observation, sourceProductId: '124', sourceSetKey: null }];
    // A 0139 store: one probe, then the key is written.
    const migrated = await run(named, true);
    expect(migrated).toHaveLength(6);
    expect(migrated[4]![0]).toContain("attname = 'source_set_key'");
    const [keyed, keyedParams] = migrated[5]!;
    expect(keyed).toContain(',source_set_key)');
    expect(keyed).toContain("r->>'sourceSetKey'");
    expect(JSON.parse(keyedParams[1]).map((row: NativePriceObservation) => row.sourceSetKey)).toEqual(['5229', null]);
    // A 0137/0138 store (today's manual Cardmarket import): the same batch is
    // stored, without the key, rather than failing on a missing column.
    const before0139 = await run(named, false);
    expect(before0139).toHaveLength(6);
    const [bare, bareParams] = before0139[5]!;
    expect(bare).not.toContain('source_set_key');
    expect(bare).not.toContain('sourceSetKey');
    expect(JSON.parse(bareParams[1])).toHaveLength(2);
    // A batch with no key neither probes nor names the column: exactly the columns a 0137 store has.
    const plain = await run([observation, { ...observation, sourceProductId: '124', sourceSetKey: null }]);
    expect(plain).toHaveLength(5);
    expect(plain[4]![0]).not.toContain('source_set_key');
    expect(plain[4]![0]).not.toContain('sourceSetKey');
  });

  it.each([{ sourceSetKey: '' }, { sourceSetKey: '  ' }, { sourceSetKey: 5229 }])('refuses a blank or non-text source set key before any transaction %j', async fields => {
    const runTransaction = vi.fn();
    await expect(writeMemberPriceBatch('cardmarket', { ...parsed, observations: [{ ...observation, ...fields } as NativePriceObservation], sourceRows: 1 }, runTransaction)).rejects.toThrow('A source set key is non-empty text or null.');
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each(['cardmarket:www.cardrush-op.jp:run', 'cardrush:', 'cardrush:has space', `cardrush:${'x'.repeat(201)}`, 'cardrush:多'])(
    'refuses a run key that does not name its own source plainly before any transaction %j', async ingestKey => {
      const runTransaction = vi.fn();
      await expect(writeMemberPriceBatch('cardrush', parsed, runTransaction, { ingestKey })).rejects.toThrow('invalid-ingest-key');
      expect(runTransaction).not.toHaveBeenCalled();
    },
  );
});
