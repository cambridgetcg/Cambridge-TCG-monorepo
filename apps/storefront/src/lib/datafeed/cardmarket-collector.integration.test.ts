import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { CARDMARKET_EVIDENCE_VERSION } from '@cambridge-tcg/data-ingest/member-prices';

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
import { transaction } from '@/lib/db';
import { collectCardmarketMemberPrices } from './cardmarket-collector';
import { writeSetCrosswalk } from './crosswalks';
import { CARDMARKET_ONE_PIECE_EXPANSIONS, CARDMARKET_SET_CROSSWALK_VERSION } from './cardmarket-expansions';

// Same explicit opt-in as price-sources.integration.test.ts: one disposable
// loopback database, an isolated schema, never DATABASE_URL.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const schema = `cardmarket_collector_test_${randomUUID().replaceAll('-', '')}`;
const migration = (name: string) => readFile(new URL(`../../../drizzle/${name}`, import.meta.url), 'utf8');
let admin: Pool;

// Synthetic files in Cardmarket's published shape; no Cardmarket data is copied.
const ORIGIN = 'https://downloads.s3.cardmarket.com/productCatalog';
const guide = (gameId: number, createdAt: string) => ({ version: 1, createdAt, priceGuides: [
  { idProduct: 900001, idCategory: 1621, avg: 2.12, low: 0.8, trend: 2.34, avg1: 2.02, avg7: 2.2, avg30: 2.12, 'avg-foil': null, 'low-foil': null, 'trend-foil': 0, 'avg1-foil': null, 'avg7-foil': null, 'avg30-foil': null },
  { idProduct: 900002, idCategory: 1621, avg: 732.5, low: 450, trend: 619.74, avg1: null, avg7: null, avg30: null },
  { idProduct: 900003, idCategory: 1622, avg: null, low: 89.9, trend: 99.5, avg1: null, avg7: null, avg30: null },
  { idProduct: 900099, idCategory: 1621, avg: 1, low: 1, trend: 1, avg1: null, avg7: null, avg30: null },
].map(row => ({ ...row, idProduct: row.idProduct + gameId })) });
const catalog = (gameId: number, kind: 'singles' | 'nonsingles') => ({ version: 1, createdAt: '2026-10-28T13:49:48+0100', products: (kind === 'singles'
  ? [{ idProduct: 900001, name: 'Fixture Leader (OP01-001)', idCategory: 1621, categoryName: 'One Piece Single', idExpansion: 5229, idMetacard: 1, dateAdded: '2022-12-28 22:11:43' },
     { idProduct: 900002, name: 'Fixture Leader (OP01-001)', idCategory: 1621, categoryName: 'One Piece Single', idExpansion: 5229, idMetacard: 1, dateAdded: '2022-12-28 22:12:38' }]
  : [{ idProduct: 900003, name: 'Fixture Booster Box', idCategory: 1622, categoryName: 'One Piece Booster Box', idExpansion: 5229, idMetacard: 2, dateAdded: '2022-12-28 22:13:50' }])
  .map(row => ({ ...row, idProduct: row.idProduct + gameId })) });

function transport(files: Record<string, unknown | number>) {
  const requests: { url: string; userAgent: string | null; encoding: string | null }[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    requests.push({ url, userAgent: headers.get('user-agent'), encoding: headers.get('accept-encoding') });
    const file = files[url];
    if (file === undefined) return new Response('not found', { status: 404 });
    if (typeof file === 'number') return new Response('refused', { status: file });
    const body = new TextEncoder().encode(JSON.stringify(file));
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json', 'content-length': String(body.byteLength) } });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, requests };
}
const files = (gameId: number, createdAt = '2026-10-28T02:45:29+0100') => ({
  [`${ORIGIN}/priceGuide/price_guide_${gameId}.json`]: guide(gameId, createdAt),
  [`${ORIGIN}/productList/products_singles_${gameId}.json`]: catalog(gameId, 'singles'),
  [`${ORIGIN}/productList/products_nonsingles_${gameId}.json`]: catalog(gameId, 'nonsingles'),
});
/** A run that got its lease. */
async function collect(...args: Parameters<typeof collectCardmarketMemberPrices>) {
  const result = await collectCardmarketMemberPrices(...args);
  if (!result.ran) throw new Error(`not run: ${result.reason}`);
  return result;
}
const releases = async () => (await state.pool.query('SELECT * FROM member_price_source_releases ORDER BY source')).rows;
const count = async (sql: string) => Number((await state.pool.query(sql)).rows[0].n);

describe.skipIf(!localUrl)('Cardmarket collector PostgreSQL integration (explicit loopback DB only)', () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.includes('test') || url.search) throw new Error('Explicit disposable local test database required');
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 4 });
    // 0138 needs only the users table it references.
    await state.pool.query('CREATE TABLE users (id uuid PRIMARY KEY)');
    for (const name of ['0137_member_price_observations.sql', '0138_member_data_keys.sql', '0139_widen_price_sources.sql', '0140_price_source_crosswalks.sql', '0143_price_collector_leases.sql']) {
      const client = await state.pool.connect();
      try { await client.query('BEGIN'); await client.query(await migration(name)); await client.query('COMMIT'); }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
  });
  afterAll(async () => {
    if (state.pool) await state.pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it('writes one batch and the reviewed set seed through the existing seam, leaving the release row as it was', async () => {
    const before = await releases();
    const { fetch, requests } = transport(files(18));
    const result = await collect(CARDMARKET_EVIDENCE_VERSION, { context: { fetch } });
    expect(result).toMatchObject({ ok: true, games: [{ gameId: 18, game: 'one-piece', status: 'completed-with-quarantine', duplicate: false }] });
    // The singles carry six and three prices, the box two; a zero foil trend and a product missing from the catalogues are quarantined.
    expect(result.games[0]).toMatchObject({ sourceRows: 4, observations: 11, inserted: 11, mappedObservations: 0, quarantined: 2 });
    expect(await releases()).toEqual(before);

    const rows = (await state.pool.query(`SELECT source_product_id, metric, amount::text, mapping_status, sku, set_code, language, condition, evidence_version, source_url, catalog_source_url, source_updated_at, source_set_key FROM member_price_observations ORDER BY source_product_id, metric`)).rows;
    expect(rows).toHaveLength(11);
    // Each row keeps its catalogue expansion, the key the reviewed set seed is joined on; set_code stays unclaimed.
    expect(new Set(rows.map(row => row.source_set_key))).toEqual(new Set(['5229']));
    expect(rows.every(row => row.evidence_version === CARDMARKET_EVIDENCE_VERSION && row.mapping_status === 'unmapped' && row.sku === null && row.set_code === null && row.language === null && row.condition === null)).toBe(true);
    expect(rows.every(row => row.source_url === `${ORIGIN}/priceGuide/price_guide_18.json` && new Date(row.source_updated_at).toISOString() === '2026-10-28T01:45:29.000Z')).toBe(true);
    expect(rows.filter(row => row.source_product_id === '900021').map(row => row.catalog_source_url)).toEqual([`${ORIGIN}/productList/products_nonsingles_18.json`, `${ORIGIN}/productList/products_nonsingles_18.json`]);
    const quarantine = (await state.pool.query(`SELECT quarantine FROM member_price_batches`)).rows[0].quarantine;
    expect(quarantine).toEqual(expect.arrayContaining([{ sourceProductId: '900019', field: 'trend-foil', reason: 'invalid-or-zero-price' }, { sourceProductId: '900117', reason: 'product-missing-from-supplied-catalog' }]));

    expect(result.setCrosswalks).toEqual({ status: 'completed', rows: CARDMARKET_ONE_PIECE_EXPANSIONS.length, written: CARDMARKET_ONE_PIECE_EXPANSIONS.length, superseded: 0, unchanged: 0, kept: 0 });
    const sets = (await state.pool.query(`SELECT source_set_key, game, set_code, crosswalk_version FROM price_source_set_crosswalks WHERE superseded_at IS NULL ORDER BY source_set_key::int`)).rows;
    expect(sets).toEqual(CARDMARKET_ONE_PIECE_EXPANSIONS.map(([id, setCode]) => ({ source_set_key: String(id), game: 'one-piece', set_code: setCode, crosswalk_version: CARDMARKET_SET_CROSSWALK_VERSION })));
    // Products are never given a SKU from these files.
    expect(await count('SELECT count(*) AS n FROM price_source_crosswalks')).toBe(0);
    // The stored expansion now reaches the reviewed set: what §3 needs to place a Cardmarket row in a set.
    expect((await state.pool.query(`SELECT DISTINCT s.set_code FROM member_price_observations o
      JOIN price_source_set_crosswalks s ON s.source = o.source AND s.game = o.game AND s.source_set_key = o.source_set_key AND s.superseded_at IS NULL`)).rows).toEqual([{ set_code: 'op01' }]);

    // Three official files, under Cambridge's own name, bytes unencoded.
    expect(requests.map(request => request.url)).toEqual([`${ORIGIN}/priceGuide/price_guide_18.json`, `${ORIGIN}/productList/products_singles_18.json`, `${ORIGIN}/productList/products_nonsingles_18.json`]);
    for (const request of requests) {
      expect(request.userAgent).toBe('cambridgetcg.com/1.0 (admin@cambridgetcg.com; +https://cambridgetcg.com) (cardmarket-collector; permission member-prices/2026-09-07.1, cardmarket-derivation/2026-10-28.1)');
      expect(request.encoding).toBe('identity');
    }
  });

  it('writes nothing new when the next run finds the same files', async () => {
    const result = await collect(CARDMARKET_EVIDENCE_VERSION, { context: transport(files(18)) });
    expect(result).toMatchObject({ ok: true, games: [{ status: 'completed-with-quarantine', inserted: 0, duplicate: true }] });
    expect(result.setCrosswalks).toMatchObject({ status: 'completed', written: 0, unchanged: CARDMARKET_ONE_PIECE_EXPANSIONS.length });
    expect(await count('SELECT count(*) AS n FROM member_price_batches')).toBe(1);
    expect(await count('SELECT count(*) AS n FROM price_source_set_crosswalks')).toBe(CARDMARKET_ONE_PIECE_EXPANSIONS.length);
  });

  it("leaves an operator's live set row standing on the next run", async () => {
    const [id] = CARDMARKET_ONE_PIECE_EXPANSIONS[0]!;
    await writeSetCrosswalk({ source: 'cardmarket', sourceSetKey: String(id), game: 'one-piece', setCode: 'op02', evidence: 'operator: synthetic review for this test', crosswalkVersion: 'operator-review/1' });
    const result = await collect(CARDMARKET_EVIDENCE_VERSION, { context: transport(files(18)) });
    expect(result.setCrosswalks).toMatchObject({ status: 'completed', written: 0, kept: 1, unchanged: CARDMARKET_ONE_PIECE_EXPANSIONS.length - 1 });
    expect((await state.pool.query(`SELECT set_code, crosswalk_version FROM price_source_set_crosswalks WHERE source_set_key = $1 AND superseded_at IS NULL`, [String(id)])).rows)
      .toEqual([{ set_code: 'op02', crosswalk_version: 'operator-review/1' }]);
  });

  it('reports a refusing host as SOURCE_UNAVAILABLE and asks it for nothing more', async () => {
    const { fetch, requests } = transport({ ...files(18, '2026-10-29T02:45:29+0100'), [`${ORIGIN}/priceGuide/price_guide_6.json`]: 403 });
    const result = await collect(CARDMARKET_EVIDENCE_VERSION, { games: [6, 18], context: { fetch } });
    expect(result.ok).toBe(false);
    expect(result.games).toEqual([
      { gameId: 6, game: 'pokemon', status: 'source-unavailable', code: 'SOURCE_UNAVAILABLE', detail: 'http-error', httpStatus: 403 },
      { gameId: 18, game: 'one-piece', status: 'not-started', code: 'source-unavailable' },
    ]);
    expect(requests.map(request => request.url)).toEqual([`${ORIGIN}/priceGuide/price_guide_6.json`]);
    expect(await count('SELECT count(*) AS n FROM member_price_batches')).toBe(1);
  });

  it('rolls a batch back whole when the budget runs out inside its write', async () => {
    const controller = new AbortController();
    // Ends the budget just after the batch row is inserted, before its observations.
    const runTransaction: typeof transaction = work => transaction(tx => work(async (sql, params) => {
      const result = await tx(sql, params);
      if (sql.startsWith('INSERT INTO member_price_batches')) controller.abort();
      return result;
    }));
    const { fetch } = transport(files(18, '2026-10-30T02:45:29+0100'));
    const result = await collect(CARDMARKET_EVIDENCE_VERSION, { context: { fetch, signal: controller.signal }, runTransaction });
    expect(result.games).toEqual([{ gameId: 18, game: 'one-piece', status: 'budget-exhausted', code: 'cardmarket-collection-budget-exhausted' }]);
    expect(result.setCrosswalks).toMatchObject({ status: 'skipped', code: 'budget-exhausted' });
    expect(await count('SELECT count(*) AS n FROM member_price_batches')).toBe(1);
    expect(await count('SELECT count(*) AS n FROM member_price_observations')).toBe(11);
  });

  it('runs one of two overlapping runs; the other downloads and writes nothing', async () => {
    const { fetch, requests } = transport(files(18, '2026-11-01T02:45:29+0100'));
    const before = await count('SELECT count(*) AS n FROM member_price_batches');
    const results = await Promise.all([collectCardmarketMemberPrices(CARDMARKET_EVIDENCE_VERSION, { context: { fetch } }), collectCardmarketMemberPrices(CARDMARKET_EVIDENCE_VERSION, { context: { fetch } })]);
    expect(results.filter(result => !result.ran)).toEqual([{ ran: false, reason: 'run-in-progress' }]);
    expect(results.find(result => result.ran)).toMatchObject({ ok: true, games: [{ status: 'completed-with-quarantine', inserted: 11 }] });
    // One run's three files, once.
    expect(requests.map(request => request.url)).toEqual([`${ORIGIN}/priceGuide/price_guide_18.json`, `${ORIGIN}/productList/products_singles_18.json`, `${ORIGIN}/productList/products_nonsingles_18.json`]);
    expect(await count('SELECT count(*) AS n FROM member_price_batches')).toBe(before + 1);
    expect(await count('SELECT count(*) AS n FROM price_collector_leases')).toBe(0);
  });

  it('stops before any download when the release is revoked', async () => {
    await state.pool.query(`UPDATE member_price_source_releases SET member_display=false WHERE source='cardmarket'`);
    try {
      const { fetch, requests } = transport(files(18, '2026-10-31T02:45:29+0100'));
      const result = await collect(CARDMARKET_EVIDENCE_VERSION, { context: { fetch } });
      expect(result.games).toEqual([{ gameId: 18, game: 'one-piece', status: 'revoked-or-unreviewed', code: 'member-price-acquisition-revoked-or-unreviewed' }]);
      expect(result.setCrosswalks).toMatchObject({ status: 'skipped', code: 'revoked-or-unreviewed' });
      expect(requests).toEqual([]);
    } finally {
      await state.pool.query(`UPDATE member_price_source_releases SET member_display=true WHERE source='cardmarket'`);
    }
  });
});
