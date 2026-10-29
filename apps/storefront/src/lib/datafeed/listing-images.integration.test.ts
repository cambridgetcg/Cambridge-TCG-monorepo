import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { parseCardRushMemberPrices } from '@cambridge-tcg/data-ingest/cardrush/member-prices';
import type { MemberPriceItem } from '@/lib/prices/member-feed-types';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ pool: null as unknown as import('pg').Pool, official: vi.fn() }));
vi.mock('@/lib/db', () => ({
  query: (sql: string, params?: unknown[]) => state.pool.query(sql, params),
  transaction: async <T>(fn: (query: (sql: string, params?: unknown[]) => Promise<import('pg').QueryResult>) => Promise<T>) => {
    const client = await state.pool.connect();
    try { await client.query('BEGIN'); const result = await fn((sql, params) => client.query(sql, params)); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  },
}));
// The official lane has its own tests (en-card-data); here it finds nothing.
vi.mock('@/lib/cards/en-card-data', () => ({ getEnCardImages: state.official }));
import { writeMemberPriceBatch } from './member-price-writer';
import { writeCardRushListingImages } from './listing-images';
import { readMemberPriceImages } from '../prices/member-images';

// Same explicit opt-in as the other member-price integration tests: one
// disposable loopback database, an isolated schema, never DATABASE_URL.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const schema = `listing_images_test_${randomUUID().replaceAll('-', '')}`;
const migration = (name: string) => readFile(new URL(`../../../drizzle/${name}`, import.meta.url), 'utf8');
const fixtures = new URL('../../../../../packages/data-ingest/src/cardrush/__tests__/fixtures/', import.meta.url);
// 15600 and 169 carry a synthetic og:image; 778 none.
const page = (id: number, retrievedAt: string, html?: string) => ({ url: `https://www.cardrush-op.jp/product/${id}`, bytes: html === undefined ? readFileSync(new URL(`cardrush-op-${id}.html`, fixtures)) : new TextEncoder().encode(html), retrievedAt });
const fixture = (id: number) => readFileSync(new URL(`cardrush-op-${id}.html`, fixtures), 'utf8');
const hexImage = (name: string) => `https://www.cardrush-op.jp/data/cardrush-op/_/${Buffer.from(`product/${name}`).toString('hex')}.jpg`;
let admin: Pool;
async function apply(name: string) {
  const client = await state.pool.connect();
  try { await client.query('BEGIN'); await client.query(await migration(name)); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
/** One run's pages through the writers, as the collector writes them. */
async function collect(key: string, pages: ReturnType<typeof page>[]) {
  const { productCrosswalks: _p, setCrosswalks: _s, listingImages, ...parsed } = parseCardRushMemberPrices(pages);
  const written = await writeMemberPriceBatch('cardrush', parsed, undefined, { ingestKey: `cardrush:www.cardrush-op.jp:${key}` });
  return { written, links: await writeCardRushListingImages(listingImages, parsed.observations) };
}
const links = async () => (await state.pool.query(`SELECT source_product_id, image_url, listing_url, first_seen_at, last_seen_at, artifact_sha256, withdrawn_at
  FROM price_source_listing_images ORDER BY source_product_id`)).rows;
const item = (product: number): MemberPriceItem => ({
  id: String(product), source: 'cardrush', sourceProductId: `www.cardrush-op.jp/product/${product}`, sku: null, mappingStatus: 'ambiguous', game: 'one-piece', setCode: null,
  productName: null, granularity: 'printing', finish: 'parallel', language: 'ja', condition: null, metric: 'sell', amount: '123', currency: 'JPY', underlyingMarket: 'cardrush',
  sourceUpdatedAt: '2026-10-28T15:00:00.000Z', retrievedAt: '2026-10-28T15:00:00.000Z', sourceUrl: `https://www.cardrush-op.jp/product/${product}`,
  parserVersion: 'cardrush-page/1', crosswalkVersion: 'cardrush-title/1', evidenceVersion: 'cardrush/2026-10-28.1', artifactSha256: 'a'.repeat(64),
  catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null, quality: 'accepted', permittedUses: ['member-display'], attribution: 'CardRush',
});

describe.skipIf(!localUrl)('CardRush listing image links PostgreSQL integration (explicit loopback DB only)', () => {
  beforeAll(async () => {
    const target = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.includes('test') || target.search) throw new Error('Explicit disposable local test database required');
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 4 });
    state.official.mockResolvedValue(new Map());
    await state.pool.query('CREATE TABLE users (id uuid PRIMARY KEY)');
    for (const name of ['0137_member_price_observations.sql', '0138_member_data_keys.sql', '0139_widen_price_sources.sql']) await apply(name);
  });
  afterAll(async () => {
    if (state.pool) await state.pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it('before 0145: the batch is written, no link is recorded, and /prices shows no listing image', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { written, links: recorded } = await collect('before-0145', [page(15600, '2026-10-28T15:00:00.000Z')]);
      expect(written).toMatchObject({ inserted: 1, duplicate: false });
      expect(recorded).toEqual({ written: 0, skipped: 'not-provisioned' });
      expect(warn).toHaveBeenCalledOnce();
      expect((await readMemberPriceImages([item(15600)])).byItem.size).toBe(0);
    } finally { warn.mockRestore(); }
  });

  it('records one link per observed listing, then moves a changed URL and its last sighting on', async () => {
    await apply('0145_price_source_listing_images.sql');
    const first = await collect('run-1', [page(15600, '2026-10-28T15:00:00.000Z'), page(169, '2026-10-28T15:00:02.000Z'), page(778, '2026-10-28T15:00:04.000Z')]);
    expect(first.links).toEqual({ written: 2 });
    const rows = await links();
    expect(rows.map(row => [row.source_product_id, row.image_url, row.listing_url, row.first_seen_at.toISOString(), row.last_seen_at.toISOString(), row.withdrawn_at])).toEqual([
      ['www.cardrush-op.jp/product/15600', hexImage('SYNTHETIC_15600.jpg'), 'https://www.cardrush-op.jp/product/15600', '2026-10-28T15:00:00.000Z', '2026-10-28T15:00:00.000Z', null],
      ['www.cardrush-op.jp/product/169', hexImage('SYNTHETIC_169.jpg'), 'https://www.cardrush-op.jp/product/169', '2026-10-28T15:00:02.000Z', '2026-10-28T15:00:02.000Z', null],
    ]);
    // Tied to the page read the observation came from.
    const digests = (await state.pool.query(`SELECT o.source_product_id FROM member_price_observations o JOIN price_source_listing_images l
      ON l.source = o.source AND l.source_product_id = o.source_product_id AND l.artifact_sha256 = o.artifact_sha256 GROUP BY 1 ORDER BY 1`)).rows;
    expect(digests.map(row => row.source_product_id)).toEqual(['www.cardrush-op.jp/product/15600', 'www.cardrush-op.jp/product/169']);

    // CardRush changes 15600's image; a later read replaces the URL.
    const changed = fixture(15600).replace(hexImage('SYNTHETIC_15600.jpg'), hexImage('SYNTHETIC_15600_B.jpg'));
    expect((await collect('run-2', [page(15600, '2026-10-29T09:00:00.000Z', changed)])).links).toEqual({ written: 1 });
    // An older read arriving late moves nothing back.
    expect((await collect('run-3', [page(15600, '2026-10-28T20:00:00.000Z')])).links).toEqual({ written: 0 });
    const moved = (await links())[0]!;
    expect([moved.image_url, moved.first_seen_at.toISOString(), moved.last_seen_at.toISOString()]).toEqual([hexImage('SYNTHETIC_15600_B.jpg'), '2026-10-28T15:00:00.000Z', '2026-10-29T09:00:00.000Z']);

    // /prices reads it back, bounded by key.
    const images = await readMemberPriceImages([item(15600), item(169), item(778)]);
    expect(Object.fromEntries(images.byItem)).toEqual({
      15600: { lane: 'cardrush-listing', url: hexImage('SYNTHETIC_15600_B.jpg') },
      169: { lane: 'cardrush-listing', url: hexImage('SYNTHETIC_169.jpg') },
    });
  });

  it('stops linking a withdrawn image, and keeps the withdrawal through later reads', async () => {
    await state.pool.query(`UPDATE price_source_listing_images SET withdrawn_at = now() WHERE source_product_id = 'www.cardrush-op.jp/product/169'`);
    expect((await readMemberPriceImages([item(169)])).byItem.size).toBe(0);
    const changed = fixture(169).replace(hexImage('SYNTHETIC_169.jpg'), hexImage('SYNTHETIC_169_B.jpg'));
    expect((await collect('run-4', [page(169, '2026-10-29T10:00:00.000Z', changed)])).links).toEqual({ written: 0 });
    const withdrawn = (await links())[1]!;
    expect([withdrawn.image_url, withdrawn.withdrawn_at === null]).toEqual([hexImage('SYNTHETIC_169.jpg'), false]);
    await expect(state.pool.query(`UPDATE price_source_listing_images SET withdrawn_at = NULL WHERE source_product_id = 'www.cardrush-op.jp/product/169'`)).rejects.toThrow(/stays withdrawn/);
    await expect(state.pool.query(`UPDATE price_source_listing_images SET first_seen_at = first_seen_at + interval '1 second'`)).rejects.toThrow(/keeps its listing and first sighting/);
    await expect(state.pool.query(`UPDATE price_source_listing_images SET last_seen_at = first_seen_at`)).rejects.toThrow(/only moves forward/);
    // Deleting the row is the way back: the next read links it again.
    await state.pool.query(`DELETE FROM price_source_listing_images WHERE source_product_id = 'www.cardrush-op.jp/product/169'`);
    expect((await collect('run-5', [page(169, '2026-10-29T11:00:00.000Z', changed)])).links).toEqual({ written: 1 });
    expect((await readMemberPriceImages([item(169)])).byItem.get('169')).toEqual({ lane: 'cardrush-listing', url: hexImage('SYNTHETIC_169_B.jpg') });
  });

  it.each([
    ['another source', { source: 'cardmarket' }],
    ['an http URL', { image_url: hexImage('SYNTHETIC_1.jpg').replace('https:', 'http:') }],
    ['a query string', { image_url: `${hexImage('SYNTHETIC_1.jpg')}?w=160` }],
    ['another host than the listing\'s', { image_url: hexImage('SYNTHETIC_1.jpg').replace('www.cardrush-op.jp', 'www.cardrush-db.jp') }],
    ['another host\'s directory', { image_url: hexImage('SYNTHETIC_1.jpg').replace('/cardrush-op/', '/cardrush-db/') }],
    ['a non-product image', { image_url: `https://www.cardrush-op.jp/data/cardrush-op/_/${Buffer.from('shop/logo.png').toString('hex')}.png` }],
    ['an over-long URL', { image_url: `https://www.cardrush-op.jp/data/cardrush-op/_/70726f647563742f${'61'.repeat(300)}.jpg` }],
    ['another listing URL', { listing_url: 'https://www.cardrush-op.jp/product/2' }],
    ['a sighting before the permission', { first_seen_at: '2026-10-27T23:59:59Z', last_seen_at: '2026-10-27T23:59:59Z' }],
    ['a last sighting before the first', { last_seen_at: '2026-10-28T00:00:00Z' }],
    ['a malformed digest', { artifact_sha256: 'A'.repeat(64) }],
  ] as const)('refuses %s', async (_name, override) => {
    const row = { source: 'cardrush', source_product_id: 'www.cardrush-op.jp/product/1', image_url: hexImage('SYNTHETIC_1.jpg'), listing_url: 'https://www.cardrush-op.jp/product/1',
      first_seen_at: '2026-10-28T12:00:00Z', last_seen_at: '2026-10-28T12:00:00Z', artifact_sha256: 'a'.repeat(64), ...override };
    const columns = Object.keys(row);
    await expect(state.pool.query(`INSERT INTO price_source_listing_images (${columns.join(',')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(',')})`, Object.values(row)))
      .rejects.toMatchObject({ code: expect.stringMatching(/^(23514|23503)$/) });
  });
});
