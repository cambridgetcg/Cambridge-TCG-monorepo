import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ query: vi.fn(), transaction: vi.fn() }));
import { transaction } from '@/lib/db';
import { RUN_BOUNDS, runMarketDerivation } from './derive';

const now = new Date('2026-10-28T07:00:00Z');
const fx = { source: 'ecb.europa.eu', as_of: '2026-10-27', perEur: { GBP: '0.8672', JPY: '162.53', USD: '1.0812' } };

describe('market derivation guards before any database work', () => {
  it.each(['2026-10-32', '2026-1-28', '', '2026-10-28T00:00:00Z'])('refuses the date %j as a programming error', async asOf => {
    const runTransaction = vi.fn();
    await expect(runMarketDerivation({ asOf, now, fx }, runTransaction)).rejects.toThrow(RangeError);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('refuses a date after the run time', async () => {
    const runTransaction = vi.fn();
    await expect(runMarketDerivation({ asOf: '2026-10-29', now, fx }, runTransaction)).rejects.toThrow(/after the run time/);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['fallback rates', { ...fx, source: 'fallback' }],
    ['no quotes', null],
    ['quotes from the future', { ...fx, as_of: '2026-10-29' }],
  ])('refuses %s without opening a transaction', async (_label, quotes) => {
    const runTransaction = vi.fn();
    expect(await runMarketDerivation({ asOf: '2026-10-28', now, fx: quotes }, runTransaction)).toMatchObject({ ok: false, ran: false, reason: 'fx-unavailable' });
    expect(runTransaction).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['42P01', 'relation "market_derivation_runs" does not exist'],
    ['42703', 'column "derivation" does not exist'],
    ['42703', 'column o.source_set_key does not exist'],
    ['42703', 'column r.derivation_evidence_url does not exist'],
  ])('reports PostgreSQL %s (%s) as not provisioned rather than an empty success', async (code, message) => {
    const runTransaction = vi.fn().mockRejectedValue(Object.assign(new Error(message), { code }));
    expect(await runMarketDerivation({ asOf: '2026-10-28', now, fx }, runTransaction)).toMatchObject({ ok: false, ran: false, reason: 'not-provisioned' });
  });

  it.each([
    ['23514', 'check violation'],
    // A column 0139 does not add is a defect in the statement, not missing storage.
    ['42703', 'column o.amount_native does not exist'],
    ['42703', 'column "derivation_flag" does not exist'],
    ['42703', 'undefined column'],
    // No function this job calls arrives with a migration: an operator mismatch is a defect.
    ['42883', 'operator does not exist: text = bigint'],
  ])('lets any other failure through to the caller: %s %s', async (code, message) => {
    const runTransaction = vi.fn().mockRejectedValue(Object.assign(new Error(message), { code }));
    await expect(runMarketDerivation({ asOf: '2026-10-28', now, fx }, runTransaction)).rejects.toThrow(message);
  });

  it('raises the pool\'s bounds for its own transaction, then takes the run lock, before reading anything', async () => {
    const tx = vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: '3', as_of: '2026-10-28' }], rowCount: 1 });
    expect(await runMarketDerivation({ asOf: '2026-10-28', now, fx }, async work => work(tx))).toMatchObject({ ok: true, ran: false, reason: 'already-derived', runId: '3' });
    expect(tx.mock.calls.slice(0, 3).map(call => call[0])).toEqual([
      "SET LOCAL statement_timeout = '240s'", "SET LOCAL idle_in_transaction_session_timeout = '60s'", 'SELECT pg_advisory_xact_lock(141, 1)',
    ]);
    expect(RUN_BOUNDS.every(bound => bound.startsWith('SET LOCAL '))).toBe(true);
    expect(tx).toHaveBeenCalledTimes(4);
  });
});
