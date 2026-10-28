import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ query: vi.fn() }));
import { acquireCollectorLease, COLLECTOR_LEASE_TTL_MS, COLLECTOR_SPACING_HOLDER, releaseCollectorLease, withCollectorLease } from './collector-lease';

/** A lease table stand-in: the take answers with the holder when `free`, and
 * otherwise names who held the key (a run, or a finished run's spacing). */
function table(free = true, heldBy = 'another-run') {
  return vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('INSERT INTO price_collector_leases')) return { rows: [free ? { holder: params[1], held_by: null } : { holder: null, held_by: heldBy }], rowCount: 1 };
    if (sql.startsWith('DELETE FROM price_collector_leases') || sql.startsWith('UPDATE price_collector_leases')) return { rows: [], rowCount: 1 };
    throw new Error(`unexpected query: ${sql}`);
  });
}
const missing = () => vi.fn(async () => { throw Object.assign(new Error('relation "price_collector_leases" does not exist'), { code: '42P01' }); });
beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });

describe('collector run lease', () => {
  it('outlasts the 300 s cron function, so an expired lease never belongs to a live run', () => {
    expect(COLLECTOR_LEASE_TTL_MS).toBeGreaterThan(300_000);
  });

  it('takes a free or expired lease in one statement and names its holder', async () => {
    const runQuery = table();
    expect(await acquireCollectorLease('cardrush:www.cardrush-op.jp', { runQuery, holder: 'run-1' })).toEqual({ holder: 'run-1' });
    const [sql, params] = runQuery.mock.calls[0]!;
    expect(sql).toMatch(/ON CONFLICT \(lease_key\) DO UPDATE SET[\s\S]*WHERE lease\.expires_at < now\(\)\s*RETURNING holder\)/);
    expect(params).toEqual(['cardrush:www.cardrush-op.jp', 'run-1', COLLECTOR_LEASE_TTL_MS]);
    // A fresh holder each run unless one is given.
    const [first, second] = [await acquireCollectorLease('tcgplayer', { runQuery }), await acquireCollectorLease('tcgplayer', { runQuery })];
    expect('holder' in first && 'holder' in second && first.holder !== second.holder).toBe(true);
  });

  it('answers run-in-progress while another run holds the lease, and request-spacing while the last run\'s spacing runs out', async () => {
    expect(await acquireCollectorLease('tcgplayer', { runQuery: table(false) })).toEqual({ ran: false, reason: 'run-in-progress' });
    expect(await acquireCollectorLease('tcgplayer', { runQuery: table(false, COLLECTOR_SPACING_HOLDER) })).toEqual({ ran: false, reason: 'request-spacing' });
  });

  it('refuses to run unleased when the lease table does not exist', async () => {
    expect(await acquireCollectorLease('cardmarket', { runQuery: missing() })).toEqual({ ran: false, reason: 'lease-not-provisioned' });
    const other = vi.fn(async () => { throw Object.assign(new Error('connection reset'), { code: '08006' }); });
    await expect(acquireCollectorLease('cardmarket', { runQuery: other })).rejects.toThrow('connection reset');
  });

  it.each([
    ['', {}, 'invalid-collector-lease-key'], ['CardRush', {}, 'invalid-collector-lease-key'], ['cardrush:', {}, 'invalid-collector-lease-key'],
    ['cardrush:www.cardrush-op.jp/x', {}, 'invalid-collector-lease-key'],
    ['tcgplayer', { ttlMs: 0 }, 'invalid-collector-lease-ttl'], ['tcgplayer', { ttlMs: 1.5 }, 'invalid-collector-lease-ttl'],
    ['tcgplayer', { ttlMs: 3_600_001 }, 'invalid-collector-lease-ttl'], ['tcgplayer', { holder: ' ' }, 'invalid-collector-lease-holder'],
    ['tcgplayer', { holder: COLLECTOR_SPACING_HOLDER }, 'invalid-collector-lease-holder'],
  ] as const)('refuses a malformed lease (%j, %j) before any query', async (key, options, code) => {
    const runQuery = table();
    await expect(acquireCollectorLease(key, { ...options, runQuery })).rejects.toThrow(code);
    expect(runQuery).not.toHaveBeenCalled();
  });

  it("releases only its own holder's row: deleted, or left to expire one request interval later", async () => {
    const runQuery = table();
    expect(await releaseCollectorLease('cardmarket', 'run-1', runQuery)).toBe(true);
    expect(runQuery.mock.calls[0]).toEqual(['DELETE FROM price_collector_leases WHERE lease_key = $1 AND holder = $2', ['cardmarket', 'run-1']]);
    expect(await releaseCollectorLease('tcgplayer', 'run-1', runQuery, 10_000)).toBe(true);
    const [sql, params] = runQuery.mock.calls[1]!;
    expect(sql).toMatch(/^UPDATE price_collector_leases SET holder = \$3, expires_at = now\(\) \+ \$4::integer \* interval '1 millisecond'\s+WHERE lease_key = \$1 AND holder = \$2$/);
    expect(params).toEqual(['tcgplayer', 'run-1', COLLECTOR_SPACING_HOLDER, 10_000]);
    for (const spacing of [-1, 1.5, 60_001]) await expect(releaseCollectorLease('tcgplayer', 'run-1', runQuery, spacing)).rejects.toThrow('invalid-collector-lease-spacing');
  });

  it('runs the work under the lease and gives it back, whether the work succeeds or throws', async () => {
    const runQuery = table();
    const work = vi.fn(async () => 'summary');
    expect(await withCollectorLease('cardmarket', work, { runQuery, holder: 'run-2' })).toEqual({ ran: true, value: 'summary' });
    expect(runQuery.mock.calls.map(call => call[0].split(' ')[0])).toEqual(['WITH', 'DELETE']);
    expect(runQuery.mock.calls[1]![1]).toEqual(['cardmarket', 'run-2']);
    runQuery.mockClear();
    await expect(withCollectorLease('cardmarket', async () => { throw new Error('collector-failed'); }, { runQuery })).rejects.toThrow('collector-failed');
    expect(runQuery.mock.calls.map(call => call[0].split(' ')[0])).toEqual(['WITH', 'DELETE']);
    // A page collector's spacing outlives its run, failed or not.
    runQuery.mockClear();
    await expect(withCollectorLease('tcgplayer', async () => { throw new Error('collector-failed'); }, { runQuery, spacingMs: 10_000 })).rejects.toThrow('collector-failed');
    expect(runQuery.mock.calls.map(call => [call[0].split(' ')[0], call[1]![3]])).toEqual([['WITH', undefined], ['UPDATE', 10_000]]);
    await expect(withCollectorLease('tcgplayer', async () => 'never', { runQuery, spacingMs: -1 })).rejects.toThrow('invalid-collector-lease-spacing');
  });

  it('starts no work when refused, and never lets a failed release hide the result', async () => {
    for (const runQuery of [table(false), missing()]) {
      const work = vi.fn();
      expect(await withCollectorLease('cardmarket', work, { runQuery })).toMatchObject({ ran: false });
      expect(work).not.toHaveBeenCalled();
    }
    const flaky = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith('WITH')) return { rows: [{ holder: params[1], held_by: null }], rowCount: 1 };
      throw new Error('connection reset');
    });
    expect(await withCollectorLease('cardmarket', async () => 'summary', { runQuery: flaky })).toEqual({ ran: true, value: 'summary' });
    expect(console.error).toHaveBeenCalledWith('[collector-lease] release failed; the lease will expire', 'cardmarket', 'Error');
  });
});
