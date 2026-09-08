import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transaction } from '@/lib/db';
import { MEMBER_PRICE_POLICIES } from '@cambridge-tcg/data-ingest/member-prices';
import { writeMemberPriceBatch } from './member-price-writer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ transaction: vi.fn() }));
const parsed = { observations: [], quarantine: [], sourceRows: 0, missingPrices: 0 };
beforeEach(() => { vi.mocked(transaction).mockReset(); });

describe('member price operator transaction', () => {
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
