import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

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
import { readFileSync } from 'node:fs';
import { parseCardRushMemberPrices } from '@cambridge-tcg/data-ingest/cardrush/member-prices';
import { deriveCollectorHealth, readLatestCollectorBatch } from './collector-health';
import { writeMemberPriceBatch } from '@/lib/datafeed/member-price-writer';

// Same explicit opt-in as price-sources.integration.test.ts: one disposable
// loopback database, an isolated schema, never DATABASE_URL.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const schema = `collector_health_test_${randomUUID().replaceAll('-', '')}`;
const empty = `${schema}_empty`;
const migration = (name: string) => readFile(new URL(`../../../../../drizzle/${name}`, import.meta.url), 'utf8');
let admin: Pool;
let bare: Pool;

const batch = (rows: number, quarantined: number) => ({
  observations: [], sourceRows: rows, missingPrices: 0,
  quarantine: Array.from({ length: quarantined }, (_, i) => ({ sourceProductId: `www.cardrush-op.jp/product/${i}`, reason: 'no-structured-price: upstream text stays private' })),
});

describe.skipIf(!localUrl)('page collector health PostgreSQL integration (explicit loopback DB only)', () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.includes('test') || url.search) throw new Error('Explicit disposable local test database required');
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE SCHEMA ${empty}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 4 });
    bare = new Pool({ connectionString: localUrl, options: `-c search_path=${empty}`, max: 1 });
    for (const name of ['0137_member_price_observations.sql', '0139_widen_price_sources.sql']) {
      const client = await state.pool.connect();
      try { await client.query('BEGIN'); await client.query(await migration(name)); await client.query('COMMIT'); }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
  });
  afterAll(async () => {
    if (state.pool) await state.pool.end();
    if (bare) await bare.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.query(`DROP SCHEMA IF EXISTS ${empty} CASCADE`); await admin.end(); }
  });

  const read = (source: string, pool = state.pool) => readLatestCollectorBatch(source, (sql, params) => pool.query(sql, params));

  it('says the table is not provisioned before 0137', async () => {
    await expect(read('cardrush', bare)).resolves.toEqual({ available: false, reason: 'member_price_batches is not provisioned (migration 0137)' });
  });

  it('reads the newest batch of the asked source only, with counts and no quarantine text', async () => {
    await expect(read('cardrush')).resolves.toEqual({ available: true, latest: null, latest_observed_at: null });
    await writeMemberPriceBatch('cardrush', batch(4, 1), undefined, { ingestKey: 'cardrush:www.cardrush-op.jp:2026-10-29T08:15:00.000Z' });
    await writeMemberPriceBatch('cardrush', batch(7, 3), undefined, { ingestKey: 'cardrush:www.cardrush-pokemon.jp:2026-10-29T10:15:00.000Z' });
    await writeMemberPriceBatch('tcgplayer', batch(9, 0), undefined, { ingestKey: 'tcgplayer:3188:2026-10-29T10:45:00.000Z' });

    const cardrush = await read('cardrush');
    expect(cardrush).toMatchObject({ available: true, latest: { source_rows: 7, missing_prices: 0, quarantined: 3 } });
    if (!cardrush.available || !cardrush.latest) throw new Error('expected a batch');
    const stored = (await state.pool.query(`SELECT inserted_at FROM member_price_batches WHERE ingest_key = 'cardrush:www.cardrush-pokemon.jp:2026-10-29T10:15:00.000Z'`)).rows[0];
    expect(cardrush.latest.inserted_at).toBe(new Date(stored.inserted_at).toISOString());
    expect(JSON.stringify(cardrush)).not.toContain('upstream text');
    await expect(read('tcgplayer')).resolves.toMatchObject({ available: true, latest: { source_rows: 9, quarantined: 0, observed: false }, latest_observed_at: null });
  });

  it('judges health by the newest batch that recorded observations, and calls quarantine-only batches failing', async () => {
    // Batches of quarantine only, minutes old: the collector runs and collects nothing.
    expect(deriveCollectorHealth(await read('cardrush'), 6 * 3600)).toMatchObject({ health: 'failing' });
    // A page priced (the 2026-10-28 fixture, its price replaced with a synthetic value), then a refused host's batch.
    const fixture = readFileSync(new URL('../../../../../../../packages/data-ingest/src/cardrush/__tests__/fixtures/cardrush-op-15600.html', import.meta.url));
    const { productCrosswalks: _p, setCrosswalks: _s, ...parsed } = parseCardRushMemberPrices([{ url: 'https://www.cardrush-op.jp/product/15600', bytes: fixture, retrievedAt: '2026-10-29T11:00:00.000Z' }]);
    await writeMemberPriceBatch('cardrush', parsed, undefined, { ingestKey: 'cardrush:www.cardrush-op.jp:2026-10-29T11:00:00.000Z' });
    const observedAt = new Date((await state.pool.query(`SELECT inserted_at FROM member_price_batches WHERE ingest_key = 'cardrush:www.cardrush-op.jp:2026-10-29T11:00:00.000Z'`)).rows[0].inserted_at).toISOString();
    await writeMemberPriceBatch('cardrush', { observations: [], quarantine: [{ sourceProductId: null, field: 'host', reason: 'robots-challenge' }], sourceRows: 0, missingPrices: 0 }, undefined, { ingestKey: 'cardrush:www.cardrush-pokemon.jp:2026-10-29T12:15:00.000Z' });
    const now = await read('cardrush');
    expect(now).toMatchObject({ available: true, latest: { source_rows: 0, quarantined: 1, observed: false }, latest_observed_at: observedAt });
    expect(deriveCollectorHealth(now, 6 * 3600)).toEqual({ health: 'healthy', reason: 'latest batch with observations within freshness budget' });
    expect(deriveCollectorHealth(now, 6 * 3600, Date.parse(observedAt) + 7 * 3_600_000)).toMatchObject({ health: 'stale' });
    expect(JSON.stringify(now)).not.toContain('robots-challenge');
  });
});
