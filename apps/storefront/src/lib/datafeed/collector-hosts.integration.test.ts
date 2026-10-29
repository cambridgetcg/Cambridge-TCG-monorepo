import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { Fetcher } from '@cambridge-tcg/data-ingest/http';
import { TCGPLAYER_PRODUCT_LINES } from '@cambridge-tcg/data-ingest/tcgplayer/member-prices';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ pool: null as unknown as import('pg').Pool }));
vi.mock('@/lib/db', () => ({
  query: (sql: string, params?: unknown[]) => state.pool.query(sql, params),
  transaction: async <T>(fn: (query: (sql: string, params?: unknown[]) => Promise<import('pg').QueryResult>) => Promise<T>) => {
    const client = await state.pool.connect();
    try { await client.query('BEGIN'); const result = await fn((sql, params) => client.query(sql, params)); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  },
}));
import { readCollectorHosts, recordCollectorHostOutcomes, type HostOutcome } from './collector-hosts';
import { cardRushHostFor, collectCardRush } from './collectors/cardrush';
import { collectTcgplayer } from './collectors/tcgplayer';
import { deriveHostHealth, readCollectorHostStates } from '@/app/api/v1/sources/collector-health';

// Same explicit opt-in as the other member-price integration tests: one
// disposable loopback database, an isolated schema, never DATABASE_URL. The
// hosts answer through injected fetches; no request leaves the test.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const id = randomUUID().replaceAll('-', '');
const schema = `collector_hosts_test_${id}`, bare = `collector_hosts_bare_${id}`;
const migration = (name: string) => readFile(new URL(`../../../drizzle/${name}`, import.meta.url), 'utf8');
let admin: Pool, unprovisioned: Pool;
const run = (sql: string, params?: unknown[]) => state.pool.query(sql, params) as never;
async function apply(name: string) {
  const client = await state.pool.connect();
  try { await client.query('BEGIN'); await client.query(await migration(name)); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
const hostRow = async (source: string, host: string) => (await state.pool.query(
  `SELECT consecutive_refusals, last_refusal_reason, not_before, suspended_at, suspended_reason, cleared_by, last_success_at FROM price_collector_hosts WHERE source = $1 AND host = $2`, [source, host])).rows[0];
/** The 2 s a finished CardRush run's lease keeps before the host's next run may begin. */
const spacingPassed = () => vi.waitFor(async () => {
  expect((await state.pool.query(`SELECT count(*)::int AS n FROM price_collector_leases WHERE expires_at >= now()`)).rows[0].n).toBe(0);
}, { timeout: 5_000, interval: 100 });
const CLEAR = `UPDATE price_collector_hosts SET suspended_at = NULL, suspended_reason = NULL, consecutive_refusals = 0, not_before = NULL,
  cleared_at = now(), cleared_by = $3, updated_at = now() WHERE source = $1 AND host = $2`;

describe.skipIf(!localUrl)('collector host state PostgreSQL integration, migration 0146 (explicit loopback DB only)', () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.includes('test') || url.search) throw new Error('Explicit disposable local test database required');
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE SCHEMA ${bare}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 8 });
    unprovisioned = new Pool({ connectionString: localUrl, options: `-c search_path=${bare}`, max: 2 });
    // 0138 needs only the users table it references.
    await state.pool.query('CREATE TABLE users (id uuid PRIMARY KEY)');
    for (const name of ['0137_member_price_observations.sql', '0138_member_data_keys.sql', '0139_widen_price_sources.sql', '0140_price_source_crosswalks.sql', '0143_price_collector_leases.sql', '0146_price_collector_hosts.sql']) await apply(name);
  });
  afterAll(async () => {
    for (const pool of [state.pool, unprovisioned]) if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.query(`DROP SCHEMA IF EXISTS ${bare} CASCADE`); await admin.end(); }
  });

  it('refuses malformed rows in storage', async () => {
    const insert = (columns: string, values: string) => state.pool.query(`INSERT INTO price_collector_hosts (source, host, updated_at${columns}) VALUES ${values}`);
    for (const [columns, values, code] of [
      ['', "('scryfall', 'api.scryfall.com', now())", '23514'],
      ['', "('ebay', 'api.ebay.com', now())", '23514'],
      ['', "('cardrush', 'WWW.CARDRUSH-OP.JP', now())", '23514'],
      ['', "('cardrush', 'localhost', now())", '23514'],
      [', consecutive_refusals', "('cardrush', 'www.cardrush-op.jp', now(), -1)", '23514'],
      [', consecutive_refusals', "('cardrush', 'www.cardrush-op.jp', now(), 1)", '23514'],
      [', last_refusal_at, last_refusal_reason', "('cardrush', 'www.cardrush-op.jp', now(), now(), 'Forbidden by upstream')", '23514'],
      [', consecutive_refusals, last_refusal_at, last_refusal_reason, suspended_at', "('cardrush', 'www.cardrush-op.jp', now(), 3, now(), 'http-403', now())", '23514'],
      [', suspended_at, suspended_reason', "('cardrush', 'www.cardrush-op.jp', now(), now(), 'http-403')", '23514'],
      [', cleared_by', "('cardrush', 'www.cardrush-op.jp', now(), 'someone')", '23514'],
    ] as const) {
      await expect(insert(columns, values)).rejects.toMatchObject({ code });
    }
  });

  it('counts refusals in a row to a suspension, resets on success, and leaves a suspended row to a person', async () => {
    const host = 'www.cardrush-db.jp', now = Date.now();
    const refused: HostOutcome = { host, kind: 'refused', reason: 'http-429', retryAfter: '600' };
    let rows = await readCollectorHosts('cardrush', [host], run);
    expect(rows!.size).toBe(0);
    for (const [index, outcome] of [refused, refused, { host, kind: 'collected' } as const, refused, refused, refused].entries()) {
      expect(await recordCollectorHostOutcomes('cardrush', [outcome], rows, run, now + index * 1000)).toEqual({ recorded: 1 });
      rows = await readCollectorHosts('cardrush', [host], run);
    }
    expect(await hostRow('cardrush', host)).toMatchObject({ consecutive_refusals: 3, last_refusal_reason: 'http-429', suspended_reason: 'http-429' });
    const suspended = rows!.get(host)!;
    expect(suspended.suspendedAt).toBe(new Date(now + 5000).toISOString());
    expect(suspended.notBefore).toBe(new Date(now + 5000 + 600_000).toISOString());
    // A run's write never touches a suspended row, even one that read it before the suspension.
    expect(await recordCollectorHostOutcomes('cardrush', [{ host, kind: 'collected' }], new Map(), run, now + 9000)).toEqual({ recorded: 0 });
    expect(await hostRow('cardrush', host)).toMatchObject({ consecutive_refusals: 3, suspended_reason: 'http-429' });
    // No way out but a person's clearing, by name.
    await expect(state.pool.query(`UPDATE price_collector_hosts SET suspended_at = NULL, suspended_reason = NULL, consecutive_refusals = 0 WHERE host = $1`, [host])).rejects.toThrow('cleared by a person');
    await expect(state.pool.query(`UPDATE price_collector_hosts SET suspended_at = NULL, suspended_reason = NULL, consecutive_refusals = 0, cleared_by = 'x', cleared_at = now() - interval '1 hour' WHERE host = $1`, [host])).rejects.toThrow('cleared by a person');
    await expect(state.pool.query(`UPDATE price_collector_hosts SET suspended_at = now() WHERE host = $1`, [host])).rejects.toThrow('not moved');
    await expect(state.pool.query(`UPDATE price_collector_hosts SET host = 'www.cardrush-bs.jp' WHERE host = $1`, [host])).rejects.toThrow('keeps its source and host');
    await expect(state.pool.query(`DELETE FROM price_collector_hosts WHERE host = $1`, [host])).rejects.toThrow('not deleted');
    await expect(state.pool.query(`TRUNCATE price_collector_hosts`)).rejects.toThrow('not truncated');
    // The statement the migration documents.
    expect((await state.pool.query(CLEAR, ['cardrush', host, 'operator: CardRush confirmed the block was lifted'])).rowCount).toBe(1);
    expect(await hostRow('cardrush', host)).toMatchObject({ consecutive_refusals: 0, suspended_at: null, not_before: null, cleared_by: 'operator: CardRush confirmed the block was lifted' });
    rows = await readCollectorHosts('cardrush', [host], run);
    await recordCollectorHostOutcomes('cardrush', [{ host, kind: 'collected' }], rows, run, now + 10_000);
    expect(await hostRow('cardrush', host)).toMatchObject({ consecutive_refusals: 0, last_success_at: new Date(now + 10_000) });
    // Not suspended, a row may be deleted.
    expect((await state.pool.query(`DELETE FROM price_collector_hosts WHERE host = $1`, [host])).rowCount).toBe(1);
  });

  it('reads nothing and records nothing before 0146, without failing', async () => {
    const bareRun = (sql: string, params?: unknown[]) => unprovisioned.query(sql, params) as never;
    expect(await readCollectorHosts('tcgplayer', ['www.tcgplayer.com'], bareRun)).toBeNull();
    expect(await recordCollectorHostOutcomes('tcgplayer', [{ host: 'www.tcgplayer.com', kind: 'collected' }], new Map(), bareRun, Date.now())).toEqual({ recorded: 0, skipped: 'not-provisioned' });
    expect(await readCollectorHostStates(bareRun)).toEqual({ available: false, reason: 'price_collector_hosts is not provisioned (migration 0146)' });
  });

  it('runs CardRush end to end: waits out Retry-After, suspends after three refused runs, stays off until cleared', async () => {
    const runAt = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(2026, 9, 28, 2 * index, 15))).find(slot => cardRushHostFor(slot) === 'www.cardrush-op.jp')!;
    const host = 'www.cardrush-op.jp', calls: string[] = [];
    const refusing = (async (target: string) => { calls.push(target); return new Response('slow down', { status: 429, headers: { 'retry-after': '3600' } }); }) as unknown as typeof globalThis.fetch;
    const first = await collectCardRush({ runAt, context: { fetch: refusing } });
    expect(first).toMatchObject({ ran: true, unavailable: { reason: 'robots-http-429' }, hostState: { recorded: 1 } });
    const row = await hostRow('cardrush', host);
    expect(row).toMatchObject({ consecutive_refusals: 1, last_refusal_reason: 'robots-http-429', suspended_at: null });
    expect(new Date(row.not_before).getTime() - Date.now()).toBeGreaterThan(3_500_000);
    // The next run, whatever its schedule, asks nothing until then.
    await spacingPassed();
    expect(await collectCardRush({ runAt: new Date(runAt.getTime() + 60_000), context: { fetch: refusing } })).toMatchObject({ ran: false, reason: 'host-backing-off', requested: 0 });
    expect(calls).toEqual([`https://${host}/robots.txt`]);
    for (const expected of [2, 3]) {
      await state.pool.query(`UPDATE price_collector_hosts SET not_before = now() - interval '1 second' WHERE source = 'cardrush' AND host = $1`, [host]);
      await spacingPassed();
      await collectCardRush({ runAt: new Date(runAt.getTime() + expected * 60_000), context: { fetch: refusing } });
      expect(await hostRow('cardrush', host)).toMatchObject({ consecutive_refusals: expected });
    }
    expect(await hostRow('cardrush', host)).toMatchObject({ suspended_reason: 'robots-http-429' });
    // Suspended: no automatic resume, however long it waits.
    await state.pool.query(`UPDATE price_collector_hosts SET not_before = now() - interval '30 days' WHERE source = 'cardrush' AND host = $1`, [host]);
    await spacingPassed();
    calls.length = 0;
    expect(await collectCardRush({ runAt: new Date(runAt.getTime() + 5 * 60_000), context: { fetch: refusing } })).toMatchObject({ ran: false, reason: 'host-suspended', suspendedReason: 'robots-http-429' });
    expect(calls).toEqual([]);
    // Health names it, and the source reads failing.
    const hosts = deriveHostHealth('cardrush', await readCollectorHostStates(run), 6 * 3600);
    expect(hosts.hosts.find(entry => entry.host === host)).toMatchObject({ state: 'suspended', consecutive_refusals: 3, suspended_reason: 'robots-http-429' });
    // A person clears it; a run the host serves resets the count.
    await state.pool.query(CLEAR, ['cardrush', host, 'operator: test clearing']);
    await spacingPassed();
    const served = (async (target: string) => { calls.push(target); return new Response('', { status: target.endsWith('/robots.txt') ? 404 : 503 }); }) as unknown as typeof globalThis.fetch;
    // robots.txt none, the sitemap a 503 without Retry-After: a failure, not a refusal, so no change.
    expect(await collectCardRush({ runAt: new Date(runAt.getTime() + 6 * 60_000), context: { fetch: served } })).toMatchObject({ ran: true, unavailable: { reason: 'sitemap-http-503' }, hostState: { recorded: 0 } });
    expect(await hostRow('cardrush', host)).toMatchObject({ consecutive_refusals: 0, suspended_at: null, cleared_by: 'operator: test clearing' });
  }, 60_000);

  it('runs TCGplayer end to end: a refused robots.txt with an HTTP-date Retry-After holds every host off until then', async () => {
    const retryAt = new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 1000) * 1000);
    const urls: string[] = [];
    const refusing = Object.defineProperties(vi.fn(async (url: string) => {
      urls.push(url);
      return url === 'https://mpapi.tcgplayer.com/robots.txt' ? new Response('', { status: 503, headers: { 'retry-after': retryAt.toUTCString() } }) : new Response('', { status: 404 });
    }), { count: { get: () => urls.length }, via_proxy: { value: null }, via_proxy_label: { value: null } }) as unknown as Fetcher;
    const lines = TCGPLAYER_PRODUCT_LINES.filter(line => line.slug === 'one-piece-card-game');
    const first = await collectTcgplayer({ fetcher: refusing, lines });
    expect(first).toMatchObject({ ran: true, status: 'source-unavailable', unavailable: { reason: 'robots-http-503', refused: true }, hostState: { recorded: 1 } });
    expect(urls).toEqual(['https://www.tcgplayer.com/robots.txt', 'https://mpapi.tcgplayer.com/robots.txt']);
    expect(new Date((await hostRow('tcgplayer', 'mpapi.tcgplayer.com')).not_before).toISOString()).toBe(retryAt.toISOString());
    // www.tcgplayer.com answered, but the run was refused: its row is unchanged (none).
    expect(await hostRow('tcgplayer', 'www.tcgplayer.com')).toBeUndefined();
    // The 10 s the finished run's lease keeps, as passed.
    await state.pool.query(`UPDATE price_collector_leases SET expires_at = acquired_at + interval '1 millisecond' WHERE lease_key = 'tcgplayer' AND holder = 'request-spacing'`);
    expect(await collectTcgplayer({ fetcher: refusing, lines })).toMatchObject({ ran: false, reason: 'host-backing-off', host: 'mpapi.tcgplayer.com', notBefore: retryAt.toISOString(), requests: 0 });
    expect(urls).toHaveLength(2);
    // Health: refused, not yet failing (one refused run, and nothing served in the budget would make it failing).
    const hosts = deriveHostHealth('tcgplayer', await readCollectorHostStates(run), 6 * 3600);
    expect(hosts.hosts.map(entry => [entry.host, entry.state])).toEqual([['www.tcgplayer.com', 'never_run'], ['mpapi.tcgplayer.com', 'failing'], ['infinite-api.tcgplayer.com', 'never_run']]);
  }, 30_000);
});
