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
import { cardRushHostFor, chooseStalestCardRushPages, collectCardRush } from './cardrush';
import { writeMemberPriceBatch } from '../member-price-writer';
import { writeProductCrosswalk } from '../crosswalks';

// Same explicit opt-in as the other member-price integration tests: one
// disposable loopback database, an isolated schema, never DATABASE_URL.
// Pages come from the 2026-10-28 fixtures (prices replaced with synthetic
// values) through an injected fetch; the collector's real rate holds, so a
// run takes seconds.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const schema = `cardrush_collector_test_${randomUUID().replaceAll('-', '')}`;
const migration = (name: string) => readFile(new URL(`../../../../drizzle/${name}`, import.meta.url), 'utf8');
const fixtures = new URL('../../../../../../packages/data-ingest/src/cardrush/__tests__/fixtures/', import.meta.url);
const pageHtml = (id: number) => readFileSync(new URL(`cardrush-op-${id}.html`, fixtures));
const url = (id: number) => `https://www.cardrush-op.jp/product/${id}`;
const sitemapIds = [15600, 169, 778, 1555];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['https://www.cardrush-op.jp/', ...sitemapIds.map(url)].map(loc => `<url><loc>${loc}</loc></url>`).join('')}</urlset>`;
const runAt = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(2026, 9, 28, 2 * index, 15))).find(slot => cardRushHostFor(slot) === 'www.cardrush-op.jp')!;
let admin: Pool;
const calls: string[] = [];
const sentAt: number[] = [];
// A stand-in from the intake record's summary of the hosts' robots.txt (only
// named AI crawlers are disallowed); not a capture.
const robots = 'User-agent: GPTBot\nUser-agent: Bytespider\nDisallow: /\n\nUser-agent: *\nDisallow:\n';
const fetch = (async (target: string) => {
  calls.push(target); sentAt.push(Date.now());
  if (target === 'https://www.cardrush-op.jp/robots.txt') return new Response(robots, { status: 200, headers: { 'content-type': 'text/plain' } });
  if (target === 'https://www.cardrush-op.jp/sitemap.xml') return new Response(sitemap, { status: 200, headers: { 'content-type': 'text/xml; charset=UTF-8' } });
  return new Response(pageHtml(Number(target.split('/').pop())), { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } });
}) as unknown as typeof globalThis.fetch;
async function apply(name: string) {
  const client = await state.pool.connect();
  try { await client.query('BEGIN'); await client.query(await migration(name)); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
/** Waits out the 2 s a finished run's lease keeps before the host's next run may begin. */
const spacingPassed = () => vi.waitFor(async () => {
  expect((await state.pool.query(`SELECT count(*)::int AS n FROM price_collector_leases WHERE expires_at >= now()`)).rows[0].n).toBe(0);
}, { timeout: 5_000, interval: 100 });
const page = (id: number, retrievedAt: string, host = 'www.cardrush-op.jp') => ({ url: `https://${host}/product/${id}`, bytes: pageHtml(id), retrievedAt });
const strip = ({ productCrosswalks: _p, setCrosswalks: _s, ...parsed }: ReturnType<typeof parseCardRushMemberPrices>) => parsed;

describe.skipIf(!localUrl)('CardRush collector PostgreSQL integration (explicit loopback DB only)', () => {
  beforeAll(async () => {
    const target = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.includes('test') || target.search) throw new Error('Explicit disposable local test database required');
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 8 });
    // 0138 needs only the users table it references.
    await state.pool.query('CREATE TABLE users (id uuid PRIMARY KEY)');
    for (const name of ['0137_member_price_observations.sql', '0138_member_data_keys.sql', '0139_widen_price_sources.sql', '0140_price_source_crosswalks.sql', '0143_price_collector_leases.sql']) await apply(name);
    // Earlier readings: 15600 priced at 01:00; 778 only quarantined (its batch
    // is stamped now); another host's page, which this host never counts.
    await writeMemberPriceBatch('cardrush', strip(parseCardRushMemberPrices([page(15600, '2026-10-28T01:00:00.000Z')])), undefined, { ingestKey: 'cardrush:www.cardrush-op.jp:seed-1' });
    await writeMemberPriceBatch('cardrush', { observations: [], quarantine: [{ sourceProductId: 'www.cardrush-op.jp/product/778', reason: 'page-redirected' }], sourceRows: 1, missingPrices: 0 }, undefined, { ingestKey: 'cardrush:www.cardrush-op.jp:seed-2' });
    await writeMemberPriceBatch('cardrush', strip(parseCardRushMemberPrices([page(169, '2026-10-28T00:30:00.000Z', 'www.cardrush-db.jp')])), undefined, { ingestKey: 'cardrush:www.cardrush-db.jp:seed-3' });
    // An operator's live decision for 169, under its own crosswalk version.
    await writeProductCrosswalk({ source: 'cardrush', sourceProductId: 'www.cardrush-op.jp/product/169', finish: 'parallel', language: 'ja', game: 'one-piece', mappingStatus: 'ambiguous', sku: null, setCode: null, evidence: 'operator: the title names no parallel number', crosswalkVersion: 'operator-review/1' });
    // The collector's own earlier rule left 15600 ambiguous; the current rule (cardrush-title/1) maps it.
    await writeProductCrosswalk({ source: 'cardrush', sourceProductId: 'www.cardrush-op.jp/product/15600', finish: null, language: 'ja', game: 'one-piece', mappingStatus: 'ambiguous', sku: null, setCode: null, evidence: 'title:OP01-006 [UC] under an earlier rule', crosswalkVersion: 'cardrush-title/0' });
  });
  afterAll(async () => {
    if (state.pool) await state.pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it('chooses never-read pages first, then the oldest reading, counting quarantine and only this host', async () => {
    expect(await chooseStalestCardRushPages('www.cardrush-op.jp', sitemapIds.map(url), 3)).toEqual([url(169), url(1555), url(15600)]);
    expect(await chooseStalestCardRushPages('www.cardrush-op.jp', sitemapIds.map(url), 9)).toEqual([url(169), url(1555), url(15600), url(778)]);
  });

  it('runs one host stalest-first and writes one batch and its crosswalks through the writers', async () => {
    const summary = await collectCardRush({ runAt, context: { fetch } });
    expect(calls).toEqual(['https://www.cardrush-op.jp/robots.txt', 'https://www.cardrush-op.jp/sitemap.xml', url(169), url(1555), url(15600), url(778)]);
    expect(summary).toMatchObject({ ran: true, host: 'www.cardrush-op.jp', requested: 4, observed: 4, quarantined: 3, sitemapProducts: 4, robotsDisallowed: 0,
      batch: { inserted: 4, duplicate: false }, crosswalks: { written: 5, unchanged: 0, skipped: 1, refused: 0 } });
    expect(summary.unavailable).toBeUndefined();
    const batch = (await state.pool.query('SELECT id::text, source, source_rows, quarantine FROM member_price_batches WHERE ingest_key=$1', [`cardrush:www.cardrush-op.jp:${runAt.toISOString()}`])).rows;
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({ source: 'cardrush', source_rows: 4 });
    expect(batch[0].quarantine.map((entry: { reason: string }) => entry.reason)).toEqual(Array(3).fill('ambiguous-crosswalk-no-sku-assigned'));
    const rows = (await state.pool.query(`SELECT source_product_id, sku, mapping_status, set_code, finish, language, condition, metric, amount::text, currency, underlying_market, source_updated_at = retrieved_at AS page_time, retrieved_at >= timestamptz '2026-10-28T00:00:00Z' AS forward
      FROM member_price_observations WHERE batch_id=$1::bigint ORDER BY id`, [batch[0].id])).rows;
    // The printed set code is kept on every row, mapped or not, and joins the run's set crosswalks.
    expect((await state.pool.query(`SELECT o.source_product_id, o.source_set_key, s.set_code FROM member_price_observations o
      LEFT JOIN price_source_set_crosswalks s ON s.source = o.source AND s.game = o.game AND s.source_set_key = o.source_set_key AND s.superseded_at IS NULL
      WHERE o.batch_id=$1::bigint ORDER BY o.id`, [batch[0].id])).rows).toEqual([
      { source_product_id: 'www.cardrush-op.jp/product/169', source_set_key: 'OP01', set_code: 'op01' },
      { source_product_id: 'www.cardrush-op.jp/product/1555', source_set_key: 'OP01', set_code: 'op01' },
      { source_product_id: 'www.cardrush-op.jp/product/15600', source_set_key: 'OP01', set_code: 'op01' },
      { source_product_id: 'www.cardrush-op.jp/product/778', source_set_key: 'OP02', set_code: 'op02' },
    ]);
    expect(rows).toEqual([
      { source_product_id: 'www.cardrush-op.jp/product/169', sku: null, mapping_status: 'ambiguous', set_code: null, finish: 'parallel', language: 'ja', condition: null, metric: 'sell', amount: '12345.000000', currency: 'JPY', underlying_market: 'cardrush', page_time: true, forward: true },
      { source_product_id: 'www.cardrush-op.jp/product/1555', sku: null, mapping_status: 'ambiguous', set_code: null, finish: 'parallel', language: 'ja', condition: 'A-', metric: 'sell', amount: '9876.000000', currency: 'JPY', underlying_market: 'cardrush', page_time: true, forward: true },
      { source_product_id: 'www.cardrush-op.jp/product/15600', sku: 'op-op01-006-ja', mapping_status: 'exact', set_code: 'op01', finish: null, language: 'ja', condition: 'C', metric: 'sell', amount: '123.000000', currency: 'JPY', underlying_market: 'cardrush', page_time: true, forward: true },
      { source_product_id: 'www.cardrush-op.jp/product/778', sku: null, mapping_status: 'ambiguous', set_code: null, finish: 'parallel', language: 'ja', condition: null, metric: 'sell', amount: '2345.000000', currency: 'JPY', underlying_market: 'cardrush', page_time: true, forward: true },
    ]);
    const products = (await state.pool.query(`SELECT source_product_id, mapping_status, sku, crosswalk_version, evidence FROM price_source_crosswalks WHERE superseded_at IS NULL ORDER BY source_product_id`)).rows;
    expect(products).toEqual([
      { source_product_id: 'www.cardrush-op.jp/product/1555', mapping_status: 'ambiguous', sku: null, crosswalk_version: 'cardrush-title/1', evidence: 'title:OP01-016[OP05] [SP] parallel' },
      { source_product_id: 'www.cardrush-op.jp/product/15600', mapping_status: 'exact', sku: 'op-op01-006-ja', crosswalk_version: 'cardrush-title/1', evidence: 'title:OP01-006 [UC]' },
      // The operator's row stands; this run did not supersede it.
      { source_product_id: 'www.cardrush-op.jp/product/169', mapping_status: 'ambiguous', sku: null, crosswalk_version: 'operator-review/1', evidence: 'operator: the title names no parallel number' },
      { source_product_id: 'www.cardrush-op.jp/product/778', mapping_status: 'ambiguous', sku: null, crosswalk_version: 'cardrush-title/1', evidence: 'title:OP02-085[OP04] [SP] parallel' },
    ]);
    // A version bump within the collector's own family moves its earlier mapping on.
    expect((await state.pool.query(`SELECT crosswalk_version, mapping_status, superseded_at IS NOT NULL AS superseded FROM price_source_crosswalks
      WHERE source_product_id = 'www.cardrush-op.jp/product/15600' ORDER BY id`)).rows).toEqual([
      { crosswalk_version: 'cardrush-title/0', mapping_status: 'ambiguous', superseded: true },
      { crosswalk_version: 'cardrush-title/1', mapping_status: 'exact', superseded: false },
    ]);
    expect((await state.pool.query(`SELECT game, source_set_key, set_code, evidence FROM price_source_set_crosswalks WHERE superseded_at IS NULL ORDER BY source_set_key`)).rows).toEqual([
      { game: 'one-piece', source_set_key: 'OP01', set_code: 'op01', evidence: 'title-set:OP01' },
      { game: 'one-piece', source_set_key: 'OP02', set_code: 'op02', evidence: 'title-set:OP02' },
    ]);
  }, 60_000);

  it('repeats a run key without a second batch, and leaves unchanged crosswalks in place', async () => {
    await spacingPassed();
    calls.length = 0;
    const before = Number((await state.pool.query('SELECT count(*) FROM member_price_observations')).rows[0].count);
    const summary = await collectCardRush({ runAt, context: { fetch } });
    expect(summary).toMatchObject({ batch: { inserted: 0, duplicate: true }, crosswalks: { written: 0, unchanged: 5, skipped: 1, refused: 0 } });
    expect(Number((await state.pool.query('SELECT count(*) FROM member_price_observations')).rows[0].count)).toBe(before);
    expect(Number((await state.pool.query('SELECT count(*) FROM price_source_crosswalks')).rows[0].count)).toBe(5);
  }, 60_000);

  it('runs one of two overlapping runs of a host; the other sends no request', async () => {
    await spacingPassed();
    calls.length = 0;
    const summaries = await Promise.all([collectCardRush({ runAt, context: { fetch } }), collectCardRush({ runAt, context: { fetch } })]);
    expect(summaries.filter(summary => !summary.ran)).toEqual([{ ran: false, reason: 'run-in-progress', host: 'www.cardrush-op.jp', runAt: runAt.toISOString(), requested: 0, observed: 0, quarantined: 0 }]);
    expect(summaries.find(summary => summary.ran)).toMatchObject({ ran: true, requested: 4 });
    // One robots.txt, one sitemap and four pages: the host saw one run's requests, at one run's rate.
    expect(calls.filter(target => target.endsWith('/robots.txt'))).toHaveLength(1);
    expect(calls.filter(target => target.endsWith('/sitemap.xml'))).toHaveLength(1);
    expect(calls.filter(target => target.includes('/product/'))).toHaveLength(4);
    // The lease outlives the run by one request interval, held by no run.
    expect((await state.pool.query(`SELECT lease_key, holder, expires_at <= now() + interval '2 seconds' AS spaced FROM price_collector_leases`)).rows)
      .toEqual([{ lease_key: 'cardrush:www.cardrush-op.jp', holder: 'request-spacing', spaced: true }]);
  }, 60_000);

  it('keeps 2 s between one run\'s last request and the next run\'s first, across sequential runs', async () => {
    await spacingPassed();
    calls.length = 0; sentAt.length = 0;
    expect(await collectCardRush({ runAt, context: { fetch } })).toMatchObject({ ran: true, requested: 4 });
    const lastRequest = sentAt.at(-1)!;
    // Straight after: refused before its robots.txt.
    expect(await collectCardRush({ runAt, context: { fetch } })).toEqual({ ran: false, reason: 'request-spacing', host: 'www.cardrush-op.jp', runAt: runAt.toISOString(), requested: 0, observed: 0, quarantined: 0 });
    expect(calls).toHaveLength(6);
    await spacingPassed();
    expect(await collectCardRush({ runAt, context: { fetch } })).toMatchObject({ ran: true, requested: 4 });
    expect(calls[6]).toBe('https://www.cardrush-op.jp/robots.txt');
    expect(sentAt[6]! - lastRequest).toBeGreaterThanOrEqual(2_000);
  }, 60_000);

  it('records a run the host refused as that host\'s batch: no observation, the refusal named', async () => {
    await spacingPassed();
    calls.length = 0;
    // Another run in the same slot, so another run key; the host now refuses its robots.txt.
    const refusedAt = new Date(runAt.getTime() + 60_000);
    const order = await chooseStalestCardRushPages('www.cardrush-op.jp', sitemapIds.map(url), 9);
    const refusing = (async (target: string) => { calls.push(target); return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } }); }) as unknown as typeof globalThis.fetch;
    const summary = await collectCardRush({ runAt: refusedAt, context: { fetch: refusing } });
    expect(summary).toMatchObject({ ran: true, host: 'www.cardrush-op.jp', requested: 0, observed: 0, unavailable: { code: 'SOURCE_UNAVAILABLE', reason: 'robots-http-403' }, batch: { inserted: 0, duplicate: false } });
    expect(calls).toEqual(['https://www.cardrush-op.jp/robots.txt']);
    const batch = (await state.pool.query(`SELECT b.source_rows, b.quarantine, count(o.id)::int AS observations FROM member_price_batches b
      LEFT JOIN member_price_observations o ON o.batch_id = b.id WHERE b.ingest_key = $1 GROUP BY b.id`, [`cardrush:www.cardrush-op.jp:${refusedAt.toISOString()}`])).rows;
    expect(batch).toEqual([{ source_rows: 0, quarantine: [{ sourceProductId: null, field: 'host', reason: 'robots-http-403' }], observations: 0 }]);
    // The refusal names no page, so the next run's choice of pages is unchanged by it.
    expect(await chooseStalestCardRushPages('www.cardrush-op.jp', sitemapIds.map(url), 9)).toEqual(order);
  }, 60_000);

  it('does no network work once the release row is revoked', async () => {
    await spacingPassed();
    calls.length = 0;
    await state.pool.query(`UPDATE member_price_source_releases SET revoked_at = now() WHERE source = 'cardrush'`);
    expect(await collectCardRush({ runAt, context: { fetch } })).toMatchObject({ ran: false, reason: 'release-revoked-or-unreviewed' });
    expect(calls).toEqual([]);
  });
});
