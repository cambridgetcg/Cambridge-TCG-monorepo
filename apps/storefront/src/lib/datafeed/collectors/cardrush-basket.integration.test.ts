import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { parseCardRushMemberPrices } from '@cambridge-tcg/data-ingest/cardrush/member-prices';

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
import { CARDRUSH_REREAD, chooseCardRushPages, readCardRushBasket } from './cardrush';
import { writeMemberPriceBatch } from '../member-price-writer';
import { writeSetCrosswalk } from '../crosswalks';

// Same explicit opt-in as the other member-price integration tests: one
// disposable loopback database, an isolated schema, never DATABASE_URL.
// Every listing here is synthetic: one observation parsed from a 2026-10-28
// fixture page (its price already replaced), copied under made-up product ids,
// read times, grades and set keys, at a made-up price.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const schema = `cardrush_basket_test_${randomUUID().replaceAll('-', '')}`;
const migration = (name: string) => readFile(new URL(`../../../../drizzle/${name}`, import.meta.url), 'utf8');
const fixtures = new URL('../../../../../../packages/data-ingest/src/cardrush/__tests__/fixtures/', import.meta.url);
const base = parseCardRushMemberPrices([{ url: 'https://www.cardrush-op.jp/product/778', bytes: readFileSync(new URL('cardrush-op-778.html', fixtures)), retrievedAt: '2026-10-28T12:00:00.000Z' }]).observations[0]!;
const HOUR = 3_600_000, DAY = 24 * HOUR;
const frozen = Date.parse(CARDRUSH_REREAD.frozenAt);
const op = (id: number) => `www.cardrush-op.jp/product/${id}`;
let runs = 0;
/** One batch of readings, each `at` ms from the frozen instant. */
async function read(listings: { id: number; at: number; set: string; condition?: string | null; host?: string; metric?: string }[]) {
  const observations = listings.map(({ id, at, set, condition = null, host = 'www.cardrush-op.jp', metric = base.metric }) => {
    const instant = new Date(frozen + at).toISOString();
    return { ...base, sourceProductId: `${host}/product/${id}`, sourceUrl: `https://${host}/product/${id}`, retrievedAt: instant, sourceUpdatedAt: instant, condition, sourceSetKey: set, metric, amount: '1000' };
  });
  await writeMemberPriceBatch('cardrush', { observations, quarantine: [], sourceRows: observations.length, missingPrices: 0 }, undefined, { ingestKey: `cardrush:basket-test:${++runs}` });
}
const basket = async (perSet?: number) => [...await readCardRushBasket('www.cardrush-op.jp', undefined, perSet)].sort();
async function apply(name: string) {
  const client = await state.pool.connect();
  try { await client.query('BEGIN'); await client.query(await migration(name)); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

describe.skipIf(!localUrl)('CardRush re-read basket PostgreSQL integration (explicit loopback DB only)', () => {
  let admin: Pool;
  beforeAll(async () => {
    const target = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.includes('test') || target.search) throw new Error('Explicit disposable local test database required');
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 4 });
    // 0138 needs only the users table it references.
    await state.pool.query('CREATE TABLE users (id uuid PRIMARY KEY)');
    for (const name of ['0137_member_price_observations.sql', '0138_member_data_keys.sql', '0139_widen_price_sources.sql', '0140_price_source_crosswalks.sql']) await apply(name);
    for (const [key, code] of [['OP01', 'op01'], ['OP02', 'op02']] as const) {
      await writeSetCrosswalk({ source: 'cardrush', game: 'one-piece', sourceSetKey: key, setCode: code, evidence: `title-set:${key}`, crosswalkVersion: 'cardrush-title/2' }, undefined, { collector: true });
    }
    // OP01: two first readings before the frozen instant and two after it.
    // OP02: two, both after it. Then what the basket leaves out: a listing
    // first read graded (read ungraded later), one whose printed set no set
    // crosswalk places, and another host's listing in a placed set.
    await read([
      { id: 101, at: -2 * DAY, set: 'OP01' }, { id: 102, at: -HOUR, set: 'OP01' }, { id: 105, at: -30 * 60_000, set: 'OP01', condition: 'C' },
      { id: 106, at: -10 * 60_000, set: 'OP09' }, { id: 107, at: -5 * 60_000, set: 'OP01', host: 'www.cardrush-db.jp' },
    ]);
    await read([{ id: 103, at: HOUR, set: 'OP01' }, { id: 105, at: 2 * HOUR, set: 'OP01' }, { id: 201, at: DAY, set: 'OP02' }]);
    await read([{ id: 202, at: 2 * DAY, set: 'OP02' }, { id: 104, at: 3 * DAY, set: 'OP01' }]);
  });
  afterAll(async () => {
    if (state.pool) await state.pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it('takes per set the listings first read closest to the frozen instant, those before it first, up to the per-set count', async () => {
    expect(await basket(1)).toEqual([op(102), op(201)]);
    expect(await basket(2)).toEqual([op(101), op(102), op(201), op(202)]);
    // Before it, however far, then the earliest after it.
    expect(await basket(3)).toEqual([op(101), op(102), op(103), op(201), op(202)]);
    expect(await basket(4)).toEqual([op(101), op(102), op(103), op(104), op(201), op(202)]);
    expect(await basket()).toEqual(await basket(CARDRUSH_REREAD.perSet));
  });

  it('leaves out a listing first read graded, one no set crosswalk places, and another host\'s', async () => {
    const members = await basket(30);
    for (const id of [op(105), op(106), 'www.cardrush-db.jp/product/107']) expect(members).not.toContain(id);
    // The query is per host: asked for the other host (which no run does; chooseCardRushPages reads a basket
    // only where titles place listings in a set), it finds that host's row alone.
    expect(await readCardRushBasket('www.cardrush-db.jp', undefined, 30)).toEqual(new Set(['www.cardrush-db.jp/product/107']));
  });

  it('keeps its members when they are read again, graded or not', async () => {
    const before = await basket(3);
    await read([{ id: 101, at: 5 * DAY, set: 'OP01' }, { id: 102, at: 5 * DAY + HOUR, set: 'OP01', condition: 'B' }, { id: 104, at: 4 * DAY, set: 'OP01' }]);
    expect(await basket(3)).toEqual(before);
  });

  it('gains a later first reading only in a set short of the per-set count', async () => {
    await read([{ id: 108, at: 6 * DAY, set: 'OP01' }, { id: 203, at: 6 * DAY, set: 'OP02' }]);
    expect(await basket(3)).toEqual([op(101), op(102), op(103), op(201), op(202), op(203)]);
    expect(await basket(30)).toEqual([op(101), op(102), op(103), op(104), op(108), op(201), op(202), op(203)]);
  });

  it('puts due members first in a One Piece run, read from the store as the collector reads them', async () => {
    const sitemap = [101, 102, 103, 104, 105, 106, 108, 201, 202, 203, 900].map(id => `https://${op(id)}`);
    const chosen = await chooseCardRushPages('www.cardrush-op.jp', sitemap, 11, undefined, frozen + 10 * DAY);
    // 104 (read 7 days before) is urgent; then the other due members oldest first,
    // 108 and 203 (read at one instant) in sitemap order; then 900, never read; then 106 and 105, the stalest.
    expect(chosen.urls).toEqual([104, 103, 201, 202, 101, 102, 108, 203, 900, 106, 105].map(id => `https://${op(id)}`));
    expect(chosen.reread).toEqual({ basket: 8, listed: 8, due: 8, chosen: 8, urgent: 1, lapsed: 3, oldestHours: 239 });
  });

  // Last, because it changes the set crosswalks the tests above read.
  it('counts only sell readings, places a listing only by its own game\'s live set crosswalk, and re-ranks a set when a crosswalk is remapped', async () => {
    // 301's only reading is a buy price, closer to the instant than any OP01 member; 106's key OP09 is
    // placed now, but for another game.
    await read([{ id: 301, at: -15 * 60_000, set: 'OP01', metric: 'buy' }]);
    await writeSetCrosswalk({ source: 'cardrush', game: 'pokemon', sourceSetKey: 'OP09', setCode: 'pk09', evidence: 'title-set:OP09', crosswalkVersion: 'cardrush-title/2' });
    expect(await basket(30)).toEqual([op(101), op(102), op(103), op(104), op(108), op(201), op(202), op(203)]);
    expect(await basket(1)).toEqual([op(102), op(201)]);
    // OP02 now places its listings in op01, superseding OP02 → op02: op02 has no members, and op01 ranks
    // all eight together, those first read before the instant first.
    await writeSetCrosswalk({ source: 'cardrush', game: 'one-piece', sourceSetKey: 'OP02', setCode: 'op01', evidence: 'review:OP02-remap-test', crosswalkVersion: 'cardrush-title/2' });
    expect(await basket(1)).toEqual([op(102)]);
    expect(await basket(3)).toEqual([op(101), op(102), op(103)]);
    expect(await basket(30)).toEqual([op(101), op(102), op(103), op(104), op(108), op(201), op(202), op(203)]);
  });
});
