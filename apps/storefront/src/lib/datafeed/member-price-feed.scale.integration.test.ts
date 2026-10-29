import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { MEMBER_PRICE_REVIEW_VERSION, type NativePriceObservation } from '@cambridge-tcg/data-ingest/member-prices';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ pool: null as unknown as import('pg').Pool, last: null as null | { sql: string; params?: unknown[] } }));
vi.mock('@/lib/db', () => ({
  query: (sql: string, params?: unknown[]) => { state.last = { sql, params }; return state.pool.query(sql, params); },
  transaction: async <T>(fn: (query: (sql: string, params?: unknown[]) => Promise<import('pg').QueryResult>) => Promise<T>) => {
    const client = await state.pool.connect();
    try { await client.query('BEGIN'); const result = await fn((sql, params) => client.query(sql, params)); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  },
}));
import { writeMemberPriceBatch } from './member-price-writer';
import { parseMemberPriceQuery, readMemberPrices, type MemberPricePage } from '../prices/member-feed';

// Scale proof for MIG-1, opt-in and not part of any default run: it loads
// MEMBER_PRICE_SCALE_BATCHES (default 60) One-Piece-shaped daily Cardmarket
// batches, 74,647 rows each (13,450 products, 5.55 metrics a product, close to
// the 73,343 the real 2026-10-28 file gave), about 4.5 million rows, which
// takes several minutes. Then it times the free feed and the writer before and
// after 0144 and prints EXPLAIN ANALYZE for each read. Run against a
// disposable loopback database:
//
//   MEMBER_PRICE_SCALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55611/member_feed_test \
//     pnpm --filter cambridgetcg-storefront exec vitest run --reporter=verbose src/lib/datafeed/member-price-feed.scale.integration.test.ts
//
// As in member-price-latest.integration.test.ts, 0144 is applied in a second
// schema ahead of the observations on one pool's search_path, so the other
// pool reads through the ranked statement, today's, over the same rows.
const localUrl = process.env.MEMBER_PRICE_SCALE_TEST_DATABASE_URL;
const batches = Number(process.env.MEMBER_PRICE_SCALE_BATCHES ?? 60);
const base = `member_price_scale_${randomUUID().replaceAll('-', '')}`;
const derived = `${base}_latest`;
const migration = (name: string) => readFile(new URL(`../../../drizzle/${name}`, import.meta.url), 'utf8');
let admin: Pool, ranked: Pool, latest: Pool;
const actor = { userId: 'fixture-member' };
const PRODUCTS = 13_450;
const DAY = 86_400_000;
const FIRST_GUIDE = Date.parse('2026-11-01T01:45:29Z');
const metricsOf = (product: number) => ['avg', 'low', 'trend', 'avg7', 'avg30', ...(product % 2 === 0 ? ['avg1'] : []), ...(product % 20 === 0 ? ['trend-foil'] : [])];
// The shape the writer would store, built server side: the same products,
// metrics and provenance as onePieceBatch below, so the fixture loads in
// minutes rather than hours. Each batch commits under 0137's lock and guards.
const LOAD = `CREATE FUNCTION fixture_one_piece_batch(n int) RETURNS void LANGUAGE plpgsql AS $$
DECLARE b bigint;
BEGIN
  INSERT INTO member_price_batches (ingest_key, source, source_rows, missing_prices) VALUES ('fixture-one-piece-' || n, 'cardmarket', ${PRODUCTS}, 0) RETURNING id INTO b;
  INSERT INTO member_price_observations (batch_id, observation_key, source, source_product_id, sku, mapping_status, game, set_code, product_name, granularity, finish, language, condition,
    metric, amount, currency, underlying_market, source_updated_at, retrieved_at, source_url, parser_version, crosswalk_version, evidence_version, artifact_sha256, quality,
    catalog_source_url, catalog_updated_at, catalog_artifact_sha256, source_set_key)
  SELECT b, md5(n || ':' || p || ':' || m) || md5(m || ':' || p || ':' || n), 'cardmarket', (100000 + p)::text, NULL, 'unmapped', 'one-piece', NULL,
    'Fixture Card ' || p || ' (OP' || lpad((p % 15 + 1)::text, 2, '0') || '-' || lpad((p % 120 + 1)::text, 3, '0') || ')', 'source-product',
    CASE WHEN m LIKE '%-foil' THEN 'foil' END, NULL, NULL, m, round((0.02 + random() * 80)::numeric, 2), 'EUR', 'cardmarket',
    to_timestamp(${FIRST_GUIDE / 1000}) + (n - 1) * interval '1 day', to_timestamp(${FIRST_GUIDE / 1000}) + (n - 1) * interval '1 day' + interval '3 hours 45 minutes',
    'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json', 'cardmarket-daily/2', 'none', '${MEMBER_PRICE_REVIEW_VERSION}',
    md5('guide' || n) || md5('guide' || n), 'accepted', 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json',
    to_timestamp(${FIRST_GUIDE / 1000}) + (n - 1) * interval '1 day' + interval '11 hours', md5('catalog' || n) || md5('catalog' || n), (5000 + p % 150)::text
  FROM generate_series(1, ${PRODUCTS}) p
  CROSS JOIN LATERAL unnest(ARRAY['avg','low','trend','avg7','avg30']
    || CASE WHEN p % 2 = 0 THEN ARRAY['avg1'] ELSE ARRAY[]::text[] END
    || CASE WHEN p % 20 = 0 THEN ARRAY['trend-foil'] ELSE ARRAY[]::text[] END) m;
END $$`;
/** Day n's file as the real parser and writer would carry it. */
function onePieceBatch(n: number): NativePriceObservation[] {
  const guide = new Date(FIRST_GUIDE + (n - 1) * DAY).toISOString();
  const rows: NativePriceObservation[] = [];
  for (let p = 1; p <= PRODUCTS; p++) for (const metric of metricsOf(p)) rows.push({
    source: 'cardmarket', sourceProductId: String(100000 + p), sku: null, setCode: null, mappingStatus: 'unmapped', game: 'one-piece',
    productName: `Fixture Card ${p} (OP${String(p % 15 + 1).padStart(2, '0')}-${String(p % 120 + 1).padStart(3, '0')})`, granularity: 'source-product',
    finish: metric.endsWith('-foil') ? 'foil' : null, language: null, condition: null, metric, amount: `${1 + ((p * 7 + n) % 80)}.${String((p + n) % 100).padStart(2, '0')}`,
    currency: 'EUR', underlyingMarket: 'cardmarket', sourceUpdatedAt: guide, retrievedAt: new Date(Date.parse(guide) + 13_500_000).toISOString(),
    sourceUrl: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json', parserVersion: 'cardmarket-daily/2', crosswalkVersion: 'none',
    evidenceVersion: MEMBER_PRICE_REVIEW_VERSION, artifactSha256: 'f'.repeat(64), catalogSourceUrl: 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json',
    catalogUpdatedAt: new Date(Date.parse(guide) + 39_600_000).toISOString(), catalogArtifactSha256: 'e'.repeat(64), quality: 'accepted', sourceSetKey: String(5000 + p % 150),
  });
  return rows;
}
const ms = (start: bigint) => Number(process.hrtime.bigint() - start) / 1e6;
const report: string[] = [];
const note = (line: string) => { report.push(line); console.log(`[member-price-scale] ${line}`); };
async function timedRead(pool: Pool, params: Record<string, string>, cursor?: string) {
  state.pool = pool;
  const start = process.hrtime.bigint();
  const page = await readMemberPrices(actor, { ...parseMemberPriceQuery(new URLSearchParams(params)), ...(cursor ? { cursor } : {}) }, 'member-api');
  const took = ms(start);
  const statement = state.last!;
  state.pool = latest;
  return { page, took, statement };
}
async function explain(pool: Pool, label: string, statement: { sql: string; params?: unknown[] }) {
  const plan = (await pool.query(`EXPLAIN (ANALYZE, BUFFERS) ${statement.sql}`, statement.params)).rows.map(row => row['QUERY PLAN'] as string);
  note(`${label} EXPLAIN ANALYZE:\n${plan.join('\n')}`);
}
async function writeTimed(label: string, n: number) {
  state.pool = latest;
  const rows = onePieceBatch(n);
  const start = process.hrtime.bigint();
  const result = await writeMemberPriceBatch('cardmarket', { observations: rows, quarantine: [], sourceRows: PRODUCTS, missingPrices: 0 });
  note(`${label}: writer stored ${result.inserted} rows (day ${n}) in ${ms(start).toFixed(0)} ms`);
  return result;
}
const answer = ({ asOf: _asOf, nextCursor: _cursor, ...rest }: MemberPricePage) => rest;
/** One transaction per statement list, as scripts/migrate.mjs applies a file. */
async function inTransaction(pool: Pool, ...statements: string[]) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); for (const sql of statements) await client.query(sql); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

describe.skipIf(!localUrl)('member price feed at scale (opt-in, explicit loopback DB only)', { timeout: 3_600_000 }, () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.includes('test') || url.search) throw new Error('Explicit disposable local test database required');
    process.env.AUTH_SECRET = 'fixture-only-cursor-secret-not-a-production-key';
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${base}`);
    await admin.query(`CREATE SCHEMA ${derived}`);
    ranked = new Pool({ connectionString: localUrl, options: `-c search_path=${base}`, max: 2 });
    latest = new Pool({ connectionString: localUrl, options: `-c search_path=${derived},${base}`, max: 2 });
    state.pool = latest;
    for (const name of ['0137_member_price_observations.sql', '0139_widen_price_sources.sql']) await inTransaction(ranked, await migration(name));
    await ranked.query(LOAD);
    const start = process.hrtime.bigint();
    for (let n = 1; n <= batches; n++) await inTransaction(ranked, 'SELECT pg_advisory_xact_lock(137, 1)', `SELECT fixture_one_piece_batch(${n})`);
    await ranked.query('VACUUM ANALYZE member_price_observations');
    const size = (await ranked.query(`SELECT count(*)::int AS rows, pg_total_relation_size('member_price_observations') AS bytes FROM member_price_observations`)).rows[0];
    note(`loaded ${batches} daily batches, ${size.rows} rows, ${(Number(size.bytes) / 2 ** 20).toFixed(0)} MiB with indexes (${(Number(size.bytes) / size.rows).toFixed(0)} B a row), in ${(ms(start) / 1000).toFixed(0)} s`);
  }, 3_600_000);
  afterAll(async () => {
    for (const pool of [ranked, latest]) if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${derived} CASCADE`); await admin.query(`DROP SCHEMA IF EXISTS ${base} CASCADE`); await admin.end(); }
    console.log(`\n[member-price-scale] summary\n${report.filter(line => !line.includes('EXPLAIN')).join('\n')}`);
  });

  it('serves a current-mode page well under a second once 0144 is applied, with the same answer', async () => {
    // Before 0144: today's statement, over every observation.
    const before = await timedRead(ranked, {});
    note(`before 0144: current page 1 (member-api, 100 rows) in ${before.took.toFixed(0)} ms, total ${before.page.total}`);
    await explain(ranked, 'before 0144, current page 1', before.statement);
    await writeTimed('before 0144', batches + 1);

    const applied = process.hrtime.bigint();
    await inTransaction(latest, await migration('0144_member_price_latest.sql'));
    const sizes = (await latest.query(`SELECT (SELECT count(*) FROM member_price_latest)::int AS keys, pg_total_relation_size('member_price_latest') AS latest,
      pg_relation_size('member_price_observations_key') AS key_index, (SELECT count(*) FROM member_price_observations)::int AS rows`)).rows[0];
    note(`0144 applied over ${sizes.rows} rows in ${(ms(applied) / 1000).toFixed(1)} s: ${sizes.keys} keys, member_price_latest ${(Number(sizes.latest) / 2 ** 20).toFixed(1)} MiB, member_price_observations_key ${(Number(sizes.key_index) / 2 ** 20).toFixed(0)} MiB (${(Number(sizes.key_index) / sizes.rows).toFixed(0)} B a row)`);

    const first = await timedRead(latest, {});
    const same = await timedRead(ranked, {});
    expect(answer(first.page)).toEqual(answer(same.page));
    expect(first.page.total).toBe(sizes.keys);
    note(`after 0144: current page 1 in ${first.took.toFixed(0)} ms (ranked statement over the same rows: ${same.took.toFixed(0)} ms), total ${first.page.total}`);
    await explain(latest, 'after 0144, current page 1', first.statement);
    expect(first.took).toBeLessThan(1000);

    // A daily file lands between page 1 and page 2: every key's latest is now
    // newer than the cursor's watermark, so page 2 reads each key's previous.
    await writeTimed('after 0144', batches + 2);
    const second = await timedRead(latest, {}, first.page.nextCursor!);
    const secondRanked = await timedRead(ranked, {}, first.page.nextCursor!);
    expect(answer(second.page)).toEqual(answer(secondRanked.page));
    note(`after 0144: cursor page 2, one file after its watermark, in ${second.took.toFixed(0)} ms (ranked: ${secondRanked.took.toFixed(0)} ms)`);
    await explain(latest, 'after 0144, cursor page one file later', second.statement);
    expect(second.took).toBeLessThan(1000);

    // A second file within the cursor's day (not the daily schedule, but
    // possible by hand): each key is read from its own observations.
    await writeTimed('after 0144', batches + 3);
    const third = await timedRead(latest, {}, second.page.nextCursor!);
    const thirdRanked = await timedRead(ranked, {}, second.page.nextCursor!);
    expect(answer(third.page)).toEqual(answer(thirdRanked.page));
    note(`after 0144: cursor page 3, two files after its watermark (every key read from its own observations) in ${third.took.toFixed(0)} ms (ranked: ${thirdRanked.took.toFixed(0)} ms)`);
    await explain(latest, 'after 0144, cursor page two files later', third.statement);

    // A narrowed search, as /prices sends one.
    const search = await timedRead(latest, { q: 'OP03-01', limit: '50' });
    note(`after 0144: q=OP03-01 limit 50 in ${search.took.toFixed(0)} ms, total ${search.page.total}`);
    expect(search.took).toBeLessThan(1000);

    // History is unchanged by 0144: it ranks and counts every observation still.
    const history = await timedRead(latest, { mode: 'history' });
    note(`history mode page 1 (unchanged by 0144) in ${history.took.toFixed(0)} ms, total ${history.page.total}, status ${history.page.status}`);
  });
});
