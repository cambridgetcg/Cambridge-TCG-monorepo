import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transaction } from '@/lib/db';
import { MEMBER_PRICE_POLICIES, type NativePriceObservation } from '@cambridge-tcg/data-ingest/member-prices';
import { validateMemberPriceWrite, writeMemberPriceBatch } from './member-price-writer';

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

  it('still checks source revocation before replay with an injected transaction', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const verifiedTransaction: typeof transaction = async work => work(query);
    await expect(writeMemberPriceBatch('cardmarket', parsed, verifiedTransaction))
      .rejects.toThrow('member-price-source-revoked-or-unreviewed');
    expect(query).toHaveBeenCalledTimes(2);
    expect(transaction).not.toHaveBeenCalled();
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
});
