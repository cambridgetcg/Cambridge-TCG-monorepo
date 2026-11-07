import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ pool: null as unknown as import('pg').Pool }));
vi.mock('@/lib/db', () => ({ query: (sql: string, params?: unknown[]) => state.pool.query(sql, params) }));
import { acquireCollectorLease, COLLECTOR_SPACING_HOLDER, releaseCollectorLease, withCollectorLease } from './collector-lease';

// Same explicit opt-in as the other member-price integration tests: one
// disposable loopback database, an isolated schema, never DATABASE_URL.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const id = randomUUID().replaceAll('-', '');
const schema = `collector_lease_test_${id}`, bare = `collector_lease_bare_${id}`;
let admin: Pool, unprovisioned: Pool;
const leases = async () => (await state.pool.query('SELECT lease_key, holder, expires_at > now() AS live FROM price_collector_leases ORDER BY lease_key')).rows;

describe.skipIf(!localUrl)('collector run lease PostgreSQL integration (explicit loopback DB only)', () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.includes('test') || url.search) throw new Error('Explicit disposable local test database required');
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE SCHEMA ${bare}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 12 });
    unprovisioned = new Pool({ connectionString: localUrl, options: `-c search_path=${bare}`, max: 2 });
    await state.pool.query(await readFile(new URL('../../../drizzle/0143_price_collector_leases.sql', import.meta.url), 'utf8'));
  });
  afterAll(async () => {
    for (const pool of [state.pool, unprovisioned]) if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.query(`DROP SCHEMA IF EXISTS ${bare} CASCADE`); await admin.end(); }
  });

  it('lets exactly one of many concurrent runs take a key', async () => {
    const attempts = await Promise.all(Array.from({ length: 10 }, (_, index) => acquireCollectorLease('tcgplayer', { holder: `run-${index}` })));
    const won = attempts.filter(attempt => 'holder' in attempt);
    expect(won).toHaveLength(1);
    expect(attempts.filter(attempt => 'reason' in attempt && attempt.reason === 'run-in-progress')).toHaveLength(9);
    expect(await leases()).toEqual([{ lease_key: 'tcgplayer', holder: (won[0] as { holder: string }).holder, live: true }]);
    // Another key is another lease: CardRush hosts do not wait on each other.
    expect(await acquireCollectorLease('cardrush:www.cardrush-op.jp', { holder: 'op' })).toEqual({ holder: 'op' });
    expect(await acquireCollectorLease('cardrush:www.cardrush-db.jp', { holder: 'db' })).toEqual({ holder: 'db' });
  });

  it("deletes only its holder's row, and takes over a lease only once it has expired", async () => {
    const [holder] = (await state.pool.query(`SELECT holder FROM price_collector_leases WHERE lease_key='tcgplayer'`)).rows.map(row => row.holder as string);
    expect(await releaseCollectorLease('tcgplayer', 'someone-else')).toBe(false);
    expect((await leases()).find(row => row.lease_key === 'tcgplayer')).toMatchObject({ holder });
    // A holder whose time ran out (the platform stopped it) is replaced, not waited for.
    await state.pool.query(`UPDATE price_collector_leases SET acquired_at = now() - interval '10 minutes', expires_at = now() - interval '1 second' WHERE lease_key='tcgplayer'`);
    expect(await acquireCollectorLease('tcgplayer', { holder: 'next-run' })).toEqual({ holder: 'next-run' });
    // The stopped run's late release cannot delete the lease the next run holds.
    expect(await releaseCollectorLease('tcgplayer', holder!)).toBe(false);
    expect(await releaseCollectorLease('tcgplayer', 'next-run')).toBe(true);
    expect((await leases()).map(row => row.lease_key)).toEqual(['cardrush:www.cardrush-db.jp', 'cardrush:www.cardrush-op.jp']);
  });

  it('runs one of two overlapping collector runs and refuses the other before its work starts', async () => {
    const started: string[] = [];
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const first = withCollectorLease('cardmarket', async () => { started.push('first'); await gate; return 'first-summary'; });
    // The first run has its lease once its work has begun.
    await vi.waitFor(() => expect(started).toEqual(['first']));
    const second = await withCollectorLease('cardmarket', async () => { started.push('second'); return 'second-summary'; });
    expect(second).toEqual({ ran: false, reason: 'run-in-progress' });
    finish();
    expect(await first).toEqual({ ran: true, value: 'first-summary' });
    expect(started).toEqual(['first']);
    // Given back at the end, so the next scheduled run goes ahead.
    expect((await leases()).some(row => row.lease_key === 'cardmarket')).toBe(false);
    expect(await withCollectorLease('cardmarket', async () => 'third-summary')).toEqual({ ran: true, value: 'third-summary' });
  });

  it('refuses malformed rows in storage too', async () => {
    for (const [key, holder, expires] of [['CardRush', 'x', "now() + interval '1 minute'"], ['tcgplayer-x:', 'x', "now() + interval '1 minute'"], ['cardmarket-x', ' ', "now() + interval '1 minute'"], ['cardmarket-y', 'x', 'now()']] as const) {
      await expect(state.pool.query(`INSERT INTO price_collector_leases (lease_key, holder, acquired_at, expires_at) VALUES ($1, $2, now(), ${expires})`, [key, holder])).rejects.toMatchObject({ code: '23514' });
    }
  });

  it('keeps the spacing across two sequential runs: the next one cannot start until an interval after the last one ends', async () => {
    const key = 'cardrush:www.cardrush-bs.jp', spacingMs = 1_000;
    const sent: number[] = [];
    const request = async (label: string) => { sent.push(Date.now()); return label; };
    expect(await withCollectorLease(key, () => request('first'), { spacingMs })).toEqual({ ran: true, value: 'first' });
    // Straight after: refused, and its work (its first request) never starts.
    const second = vi.fn(() => request('second'));
    expect(await withCollectorLease(key, second, { spacingMs })).toEqual({ ran: false, reason: 'request-spacing' });
    expect(second).not.toHaveBeenCalled();
    expect((await leases()).find(row => row.lease_key === key)).toEqual({ lease_key: key, holder: COLLECTOR_SPACING_HOLDER, live: true });
    // A key's spacing holds that key only.
    expect(await withCollectorLease('cardrush:www.cardrush-vanguard.jp', () => request('other host'), { spacingMs })).toEqual({ ran: true, value: 'other host' });
    // Once the interval has passed the next run goes ahead, and its first request comes at least that long after the last one.
    await vi.waitFor(async () => expect(await withCollectorLease(key, second, { spacingMs })).toEqual({ ran: true, value: 'second' }), { timeout: 5_000, interval: 100 });
    expect(second).toHaveBeenCalledOnce();
    expect(sent.at(-1)! - sent[0]!).toBeGreaterThanOrEqual(spacingMs);
    // A late release by a holder whose lease was taken over cannot reset the new holder's row.
    expect(await acquireCollectorLease('tcgplayer', { holder: 'late' })).toEqual({ holder: 'late' });
    expect(await releaseCollectorLease('tcgplayer', 'stopped-run', undefined, 10_000)).toBe(false);
    expect((await leases()).find(row => row.lease_key === 'tcgplayer')).toMatchObject({ holder: 'late' });
  });

  it('never runs unleased on a store without 0143', async () => {
    const runQuery = (sql: string, params?: unknown[]) => unprovisioned.query(sql, params) as never;
    const work = vi.fn(async () => 'summary');
    expect(await withCollectorLease('tcgplayer', work, { runQuery })).toEqual({ ran: false, reason: 'lease-not-provisioned' });
    expect(work).not.toHaveBeenCalled();
  });
});
