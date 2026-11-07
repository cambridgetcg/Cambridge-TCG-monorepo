import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { CARDRUSH_EVIDENCE_VERSION, MEMBER_PRICE_REVIEW_VERSION, TCGPLAYER_EVIDENCE_VERSION, type NativePriceObservation } from '@cambridge-tcg/data-ingest/member-prices';

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
import { writeMemberPriceBatch } from './member-price-writer';
import { DISPLAY_ONLY_INPUT_NOT_EXPORTED, DISPLAY_ONLY_INPUT_PAGES_END, MemberPriceQueryError, displayOnlySourcesWithRows, readMemberPrices, parseMemberPriceQuery, type MemberPricePage, type MemberPriceUse } from '../prices/member-feed';
import { resolveCrosswalkSkus, writeProductCrosswalk, writeSetCrosswalk, type ProductCrosswalkInput } from './crosswalks';

// Same explicit opt-in as member-prices.integration.test.ts: one disposable
// loopback database, an isolated schema, never DATABASE_URL.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const schema = `price_sources_test_${randomUUID().replaceAll('-', '')}`;
const migration = (name: string) => readFile(new URL(`../../../drizzle/${name}`, import.meta.url), 'utf8');
let admin: Pool;
const actor = { userId: 'fixture-member' };

function cardmarket(id: string, override: Partial<NativePriceObservation> = {}): NativePriceObservation {
  return { source: 'cardmarket', sourceProductId: id, sku: null, setCode: null, mappingStatus: 'unmapped', game: 'one-piece', productName: `Product ${id}`, granularity: 'source-product', finish: null, language: null, condition: null, metric: 'trend', amount: '2.95', currency: 'EUR', underlyingMarket: 'cardmarket', sourceUpdatedAt: '2026-09-07T00:48:24.000Z', retrievedAt: '2026-09-07T12:00:00.000Z', sourceUrl: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json', parserVersion: 'cardmarket-daily/2', crosswalkVersion: 'none', evidenceVersion: MEMBER_PRICE_REVIEW_VERSION, artifactSha256: 'a'.repeat(64), catalogSourceUrl: 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json', catalogUpdatedAt: '2026-08-01T12:00:00.000Z', catalogArtifactSha256: 'b'.repeat(64), quality: 'accepted', ...override };
}
const readAt = '2026-10-28T09:15:00.000Z';
function page(source: 'cardrush' | 'tcgplayer', id: string, override: Partial<NativePriceObservation> = {}): NativePriceObservation {
  const yen = source === 'cardrush';
  return { ...cardmarket(id), source, sourceProductId: id, productName: `Page ${id}`, granularity: 'printing', finish: 'parallel', language: yen ? 'ja' : 'en', condition: yen ? null : 'near-mint', metric: yen ? 'sell' : 'market', amount: yen ? '1500' : '12.34', currency: yen ? 'JPY' : 'USD', underlyingMarket: source, sourceUpdatedAt: readAt, retrievedAt: readAt, sourceUrl: yen ? `https://www.cardrush-op.jp/product/${id}` : `https://www.tcgplayer.com/product/${id}`, parserVersion: `${source}-page/1`, evidenceVersion: yen ? CARDRUSH_EVIDENCE_VERSION : TCGPLAYER_EVIDENCE_VERSION, catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null, ...override };
}
const write = (rows: NativePriceObservation[]) => writeMemberPriceBatch(rows[0]!.source, { observations: rows, quarantine: [], sourceRows: rows.length, missingPrices: 0 });
// asOf is the time a read opened its snapshot, so it differs on every read.
const answer = ({ asOf: _asOf, ...rest }: MemberPricePage) => rest;
const reads: [MemberPriceUse, Record<string, string>][] = (['member-api', 'member-download', 'member-display'] as const).flatMap(use => [
  [use, {}], [use, { mode: 'history' }], [use, { source: 'cardmarket' }], [use, { sku: 'op-op01-001-en' }], [use, { set: 'op01', mode: 'history' }],
] as [MemberPriceUse, Record<string, string>][]);
const snapshot = () => Promise.all(reads.map(([use, params]) => readMemberPrices(actor, parseMemberPriceQuery(new URLSearchParams(params)), use).then(answer)));
async function apply(name: string) {
  const client = await state.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(await migration(name));
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function refused(sql: string, constraint: string) {
  await expect(state.pool.query(sql)).rejects.toMatchObject({ constraint });
}

describe.skipIf(!localUrl)('price sources and crosswalks PostgreSQL integration (explicit loopback DB only)', () => {
  let before: Awaited<ReturnType<typeof snapshot>>;
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.includes('test') || url.search) throw new Error('Explicit disposable local test database required');
    process.env.AUTH_SECRET = 'fixture-only-cursor-secret-not-a-production-key';
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 8 });
    // A 0137/0138 database: 0138 needs only the users table it references.
    await state.pool.query('CREATE TABLE users (id uuid PRIMARY KEY)');
    await apply('0137_member_price_observations.sql');
    await apply('0138_member_data_keys.sql');
    await write([
      cardmarket('1'), cardmarket('1', { metric: 'trend-foil', finish: 'foil', amount: '3.99' }),
      cardmarket('2', { sku: 'op-op01-001-en', setCode: 'op01', mappingStatus: 'exact', crosswalkVersion: 'exact/1' }),
    ]);
    await write([cardmarket('2', { sku: 'op-op01-001-en', setCode: 'op01', mappingStatus: 'exact', crosswalkVersion: 'exact/1', sourceUpdatedAt: '2026-09-08T00:48:24.000Z', amount: '3.10' })]);
    await write([cardmarket('scryfall-id', { source: 'scryfall', game: 'magic', granularity: 'printing', finish: 'nonfoil', language: 'en', metric: 'usd', currency: 'USD', underlyingMarket: 'tcgplayer', sourceUrl: 'https://data.scryfall.io/default-cards/default-cards-20260907090000.json', parserVersion: 'scryfall-daily-prices/1', catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null })]);
    before = await snapshot();
  });
  afterAll(async () => {
    if (state.pool) await state.pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it('applies 0139 and 0140 over a seeded Cardmarket store without changing any free feed answer', async () => {
    expect(before.find((_, index) => reads[index]![0] === 'member-api')!.items.length).toBeGreaterThan(0);
    // /prices names no CardRush or TCGplayer prices before 0139, nor after it until a row is stored.
    expect(await displayOnlySourcesWithRows()).toEqual([]);
    // One transaction per file, as scripts/migrate.mjs applies them.
    await apply('0139_widen_price_sources.sql');
    await apply('0140_price_source_crosswalks.sql');
    expect(await snapshot()).toEqual(before);
    expect(await displayOnlySourcesWithRows()).toEqual([]);
    // Rows stored before 0139 keep no set key; nothing rewrote them.
    expect((await state.pool.query(`SELECT count(*)::int AS rows, count(source_set_key)::int AS keyed FROM member_price_observations`)).rows[0]).toEqual({ rows: 5, keyed: 0 });
    // Reading the same artifacts again, now with their set keys, adds no row:
    // the key is not part of an observation's identity. (A new quarantine
    // entry makes it a new batch, so the rows themselves meet the conflict.)
    const reread = await writeMemberPriceBatch('cardmarket', { observations: [
      cardmarket('1', { sourceSetKey: '5229' }), cardmarket('1', { metric: 'trend-foil', finish: 'foil', amount: '3.99', sourceSetKey: '5229' }),
      cardmarket('2', { sku: 'op-op01-001-en', setCode: 'op01', mappingStatus: 'exact', crosswalkVersion: 'exact/1', sourceSetKey: '5229' }),
    ], quarantine: [{ sourceProductId: null, reason: 'fixture-reread' }], sourceRows: 3, missingPrices: 0 });
    expect(reread).toMatchObject({ inserted: 0, duplicate: false });
    expect((await state.pool.query(`SELECT count(*)::int AS rows, count(source_set_key)::int AS keyed FROM member_price_observations`)).rows[0]).toEqual({ rows: 5, keyed: 0 });
    // The new batch moves the committed-batch ceiling; every answer is otherwise the same.
    const after = await snapshot();
    reads.forEach((_, index) => {
      const { watermark: _then, ...expected } = before[index]!;
      const { watermark: _now, ...actual } = after[index]!;
      expect(actual).toEqual(expected);
    });
    const releases = (await state.pool.query('SELECT * FROM member_price_source_releases ORDER BY source')).rows;
    expect(releases.find(row => row.source === 'cardmarket')).toMatchObject({
      evidence_version: 'member-prices/2026-09-07.1', evidence_url: 'https://www.cardmarket.com/en/Insight/Articles/the-state-of-cardmarket-2024',
      member_display: true, member_api: true, member_download: true, revoked_at: null,
      derivation: true, derivation_evidence_version: 'cardmarket-derivation/2026-10-28.1',
    });
    expect(releases.find(row => row.source === 'scryfall')).toMatchObject({ derivation: false, derivation_evidence_version: null });
    for (const source of ['cardrush', 'tcgplayer']) expect(releases.find(row => row.source === source)).toMatchObject({
      evidence_version: `${source}/2026-10-28.1`, member_display: true, member_api: false, member_download: false,
      derivation: true, derivation_evidence_version: `${source}/2026-10-28.1`,
    });
  });

  it('shows CardRush and TCGplayer rows in member display only; the API and downloads answer as before', async () => {
    expect((await write([page('cardrush', 'cardrush-op.jp/product/1234', { sourceSetKey: 'OP01' })])).inserted).toBe(1);
    expect((await write([page('tcgplayer', 'tcgplayer:453017', { sourceSetKey: '3188' })])).inserted).toBe(1);
    expect(await displayOnlySourcesWithRows()).toEqual(['cardrush', 'tcgplayer']);
    const display = await readMemberPrices(actor, parseMemberPriceQuery(new URLSearchParams({ source: 'cardrush', limit: '50', q: '1234' })), 'member-display');
    expect(display.items).toHaveLength(1);
    expect(display.items[0]).toMatchObject({ amount: '1500.000000', currency: 'JPY', underlyingMarket: 'cardrush', sourceUpdatedAt: readAt, retrievedAt: readAt, permittedUses: ['member-display'] });
    // The set key is stored for set crosswalks and stays out of the feed.
    expect(display.items[0]).not.toHaveProperty('sourceSetKey');
    expect((await state.pool.query(`SELECT source, source_set_key FROM member_price_observations WHERE source IN ('cardrush','tcgplayer') ORDER BY source`)).rows)
      .toEqual([{ source: 'cardrush', source_set_key: 'OP01' }, { source: 'tcgplayer', source_set_key: '3188' }]);
    // Looked at, not harvested: never in history, never in a page over 50
    // rows, never in a search narrowed by nothing but a game or a set alone.
    for (const params of [{ source: 'cardrush', mode: 'history', limit: '50', q: '1234' }, { source: 'cardrush', limit: '51', q: '1234' }, { mode: 'history' }, { limit: '500' },
      { source: 'cardrush', limit: '50' }, { limit: '50' }, { limit: '50', game: 'one-piece' }, { limit: '50', set: 'op01' }] as Record<string, string>[]) {
      const view = await readMemberPrices(actor, parseMemberPriceQuery(new URLSearchParams(params)), 'member-display');
      expect(view.items.some(item => item.source === 'cardrush' || item.source === 'tcgplayer')).toBe(false);
    }
    expect((await readMemberPrices(actor, parseMemberPriceQuery(new URLSearchParams({ limit: '50', q: 'Page' })), 'member-display')).items.map(item => item.source)).toEqual(expect.arrayContaining(['cardrush', 'tcgplayer']));
    // Named for the API or a download, either is refused (400), as an unknown source was before them.
    for (const source of ['cardrush', 'tcgplayer']) for (const use of ['member-api', 'member-download'] as const) {
      await expect(readMemberPrices(actor, parseMemberPriceQuery(new URLSearchParams({ source, limit: '50', q: 'Page' })), use)).rejects.toThrow(new MemberPriceQueryError(DISPLAY_ONLY_INPUT_NOT_EXPORTED));
    }
    const after = await snapshot();
    // Every read here is a 100-row or history view, which page sources never
    // join, so display answers stay unchanged too.
    reads.forEach(([use], index) => {
      // The watermark is the committed-batch ceiling across all sources, a
      // pagination boundary that any batch moves; the answer is the rest.
      const { watermark: _then, ...expected } = before[index]!;
      const { watermark: _now, ...actual } = after[index]!;
      expect(actual).toEqual(expected);
      expect(actual.items.every(item => item.source === 'cardmarket' || (use === 'member-display' && item.source === 'scryfall'))).toBe(true);
    });
    await expect(write([page('cardrush', 'invented-clock', { sourceUpdatedAt: '2026-10-27T00:00:00.000Z' })])).rejects.toThrow(/retrievedAt/);
  });

  it('lets no cursor walk show more than three pages of a view that includes CardRush or TCGplayer', async () => {
    const stored = Array.from({ length: 200 }, (_, i) => page('cardrush', `cardrush-op.jp/product/harvest-${i + 1}`));
    expect((await write(stored)).inserted).toBe(200);
    const walk = async (params: Record<string, string>, use: MemberPriceUse = 'member-display') => {
      const query = parseMemberPriceQuery(new URLSearchParams(params));
      const pages: MemberPricePage[] = [];
      let cursor: string | undefined;
      do {
        pages.push(await readMemberPrices(actor, { ...query, cursor }, use));
        cursor = pages.at(-1)!.nextCursor ?? undefined;
      } while (cursor && pages.length < 10);
      return pages;
    };
    for (const params of [{ q: 'harvest', limit: '50' }, { source: 'cardrush', q: 'harvest', limit: '50' }, { q: 'cardrush', limit: '50' }, { q: 'harvest', limit: '1' }] as Record<string, string>[]) {
      const pages = await walk(params);
      const limit = Number(params.limit);
      expect(pages).toHaveLength(3);
      expect(pages.flatMap(view => view.items)).toHaveLength(3 * limit);
      expect(pages.at(-1)).toMatchObject({ complete: false, nextCursor: null, reason: DISPLAY_ONLY_INPUT_PAGES_END });
      expect(pages.every(view => view.total >= 200)).toBe(true);
    }
    // A narrower search that fits in three pages ends complete, as before.
    const narrow = await walk({ q: 'harvest-19', limit: '50' });
    expect(narrow.map(view => view.count)).toEqual([11]);
    expect(narrow[0]).toMatchObject({ complete: true, nextCursor: null });
    // Cardmarket chains are not numbered or bounded, nor is a view that offers
    // CardRush and TCGplayer but matches none of their rows: one row a page
    // walks every stored row, as before.
    await write(Array.from({ length: 5 }, (_, i) => cardmarket(`mixed-${i + 1}`, { productName: `Mixed shelf ${i + 1}` })));
    for (const params of [{ source: 'cardmarket', mode: 'history', limit: '1' }, { q: 'Mixed shelf', limit: '1' }] as Record<string, string>[]) {
      const unbounded = await walk(params);
      expect(unbounded.length).toBeGreaterThan(3);
      expect(unbounded.at(-1)).toMatchObject({ complete: true, nextCursor: null });
      expect(unbounded.flatMap(view => view.items).length).toBe(unbounded[0]!.total);
      expect(unbounded.flatMap(view => view.items).every(item => item.source === 'cardmarket' || item.source === 'scryfall')).toBe(true);
    }
    const api = await walk({ q: 'harvest', limit: '1' }, 'member-api');
    expect(api).toEqual([expect.objectContaining({ status: 'empty', items: [] })]);
  });

  it('stores no page-source row read before collection was permitted, even past the writer', async () => {
    const before = '2026-10-27T23:59:59.000Z';
    await expect(write([page('cardrush', 'read-before-permission', { sourceUpdatedAt: before, retrievedAt: before })])).rejects.toThrow(/at or after 2026-10-28/);
    // The storage line holds without the writer's check: one direct batch, as the writer opens it.
    const client = await state.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(137, 1)');
      const batch = await client.query(`INSERT INTO member_price_batches (ingest_key,source,source_rows,missing_prices) VALUES ('forward-only-fixture','tcgplayer',1,0) RETURNING id`);
      const row = (retrievedAt: string, key: string) => client.query(`INSERT INTO member_price_observations
        (batch_id,observation_key,source,source_product_id,sku,mapping_status,game,set_code,product_name,granularity,finish,language,condition,metric,amount,currency,underlying_market,source_updated_at,retrieved_at,source_url,parser_version,crosswalk_version,evidence_version,artifact_sha256,quality)
        VALUES ($1,$2,'tcgplayer','tcgplayer:1',NULL,'unmapped','one-piece',NULL,NULL,'printing',NULL,'en','near-mint','market',12.34,'USD','tcgplayer',$3,$3,'https://www.tcgplayer.com/product/1','tcgplayer-page/1','none',$4,$5,'accepted')`,
      [batch.rows[0].id, key, retrievedAt, TCGPLAYER_EVIDENCE_VERSION, 'c'.repeat(64)]);
      await client.query('SAVEPOINT attempt');
      await expect(row(before, 'forward-only-before')).rejects.toMatchObject({ constraint: 'member_price_observations_page_sources_forward_only_check' });
      await client.query('ROLLBACK TO SAVEPOINT attempt');
      await row('2026-10-28T00:00:00.000Z', 'forward-only-from');
      // A blank set key is refused in storage too; NULL is the one spelling of "no set".
      await client.query('SAVEPOINT blank');
      await expect(client.query(`INSERT INTO member_price_observations
        (batch_id,observation_key,source,source_product_id,sku,mapping_status,game,set_code,product_name,granularity,finish,language,condition,metric,amount,currency,underlying_market,source_updated_at,retrieved_at,source_url,parser_version,crosswalk_version,evidence_version,artifact_sha256,quality,source_set_key)
        VALUES ($1,'blank-set-key','tcgplayer','tcgplayer:2',NULL,'unmapped','one-piece',NULL,NULL,'printing',NULL,'en','near-mint','market',12.34,'USD','tcgplayer',$2,$2,'https://www.tcgplayer.com/product/2','tcgplayer-page/1','none',$3,$4,'accepted',' ')`,
      [batch.rows[0].id, '2026-10-28T00:00:00.000Z', TCGPLAYER_EVIDENCE_VERSION, 'c'.repeat(64)])).rejects.toMatchObject({ constraint: 'member_price_observations_source_set_key_check' });
      await client.query('ROLLBACK TO SAVEPOINT blank');
    } finally { await client.query('ROLLBACK'); client.release(); }
  });

  it('rejects any export flag on a page source and any derivation on Scryfall', async () => {
    await refused(`UPDATE member_price_source_releases SET member_api=true WHERE source='cardrush'`, 'member_price_source_releases_page_sources_display_only_check');
    await refused(`UPDATE member_price_source_releases SET member_download=true WHERE source='cardrush'`, 'member_price_source_releases_page_sources_display_only_check');
    await refused(`UPDATE member_price_source_releases SET member_api=true WHERE source='tcgplayer'`, 'member_price_source_releases_page_sources_display_only_check');
    await refused(`UPDATE member_price_source_releases SET derivation=true, derivation_evidence_version='x', derivation_evidence_url='y' WHERE source='scryfall'`, 'member_price_source_releases_scryfall_derivation_check');
    await refused(`UPDATE member_price_source_releases SET derivation_evidence_version=NULL WHERE source='cardmarket'`, 'member_price_source_releases_derivation_evidence_check');
    await refused(`INSERT INTO member_price_source_releases (source,evidence_version,evidence_url) VALUES ('ebay','x','y')`, 'member_price_source_releases_source_check');
    // Revocation still narrows a page source on the next read.
    const tcgplayerView = () => readMemberPrices(actor, parseMemberPriceQuery(new URLSearchParams({ source: 'tcgplayer', limit: '50', q: '453017' })), 'member-display');
    expect((await tcgplayerView()).items).toHaveLength(1);
    await state.pool.query(`UPDATE member_price_source_releases SET member_display=false WHERE source='tcgplayer'`);
    expect((await tcgplayerView()).items).toEqual([]);
    // ...and /prices stops naming it.
    expect(await displayOnlySourcesWithRows()).toEqual(['cardrush']);
    await expect(write([page('tcgplayer', 'tcgplayer:after-revocation')])).rejects.toThrow(/revoked/);
  });

  it('supersedes a product crosswalk instead of editing it, and resolves exact SKUs only', async () => {
    const link: ProductCrosswalkInput = { source: 'cardrush', sourceProductId: 'cardrush-op.jp/product/1234', finish: 'parallel', language: 'ja', game: 'one-piece', mappingStatus: 'exact', sku: 'op-op01-001-ja-p1', setCode: 'op01', evidence: 'title:OP01-001 [P]', crosswalkVersion: 'cardrush-title/1' };
    const ref = { source: link.source, sourceProductId: link.sourceProductId, finish: link.finish, language: link.language, game: link.game };
    expect(await resolveCrosswalkSkus([ref])).toEqual([{ sku: null, setCode: null, mappingStatus: 'unmapped', crosswalkId: null, crosswalkVersion: null }]);
    const first = await writeProductCrosswalk(link);
    expect(first).toMatchObject({ supersededId: null, unchanged: false });
    expect(await writeProductCrosswalk(link)).toEqual({ id: first.id, supersededId: null, unchanged: true });
    expect((await resolveCrosswalkSkus([ref]))[0]).toEqual({ sku: 'op-op01-001-ja-p1', setCode: 'op01', mappingStatus: 'exact', crosswalkId: first.id, crosswalkVersion: 'cardrush-title/1' });

    const remap = await writeProductCrosswalk({ ...link, sku: 'op-op01-001-ja-p2', evidence: 'title:OP01-001 [P2]', crosswalkVersion: 'cardrush-title/2' });
    expect(remap).toMatchObject({ supersededId: first.id, unchanged: false });
    const [resolved, otherScope, otherGame] = await resolveCrosswalkSkus([ref, { ...ref, finish: null }, { ...ref, game: 'pokemon' }]);
    expect(resolved).toMatchObject({ sku: 'op-op01-001-ja-p2', mappingStatus: 'exact', crosswalkId: remap.id });
    expect(otherScope).toMatchObject({ sku: null, mappingStatus: 'unmapped' });
    expect(otherGame).toMatchObject({ sku: null, mappingStatus: 'ambiguous' });

    const history = (await state.pool.query(`SELECT id::text, sku, superseded_at FROM price_source_crosswalks WHERE source_product_id=$1 ORDER BY id`, [link.sourceProductId])).rows;
    expect(history.map(row => [row.id, row.sku, row.superseded_at !== null])).toEqual([[first.id, 'op-op01-001-ja-p1', true], [remap.id, 'op-op01-001-ja-p2', false]]);
    // Observations keep the identity they were written with; re-mapping rewrites no history.
    expect((await state.pool.query(`SELECT sku, mapping_status FROM member_price_observations WHERE source_product_id=$1`, [link.sourceProductId])).rows).toEqual([{ sku: null, mapping_status: 'unmapped' }]);

    const ambiguous = await writeProductCrosswalk({ ...link, mappingStatus: 'ambiguous', sku: null, setCode: null, evidence: 'title:OP01-001 (two parallels listed)' });
    expect((await resolveCrosswalkSkus([ref]))[0]).toEqual({ sku: null, setCode: null, mappingStatus: 'ambiguous', crosswalkId: ambiguous.id, crosswalkVersion: 'cardrush-title/1' });
    expect((await state.pool.query(`SELECT count(*)::int AS live FROM price_source_crosswalks WHERE source_product_id=$1 AND superseded_at IS NULL`, [link.sourceProductId])).rows[0].live).toBe(1);
  });

  it('serializes concurrent re-maps of one product and keeps its history append-only', async () => {
    const link: ProductCrosswalkInput = { source: 'tcgplayer', sourceProductId: 'tcgplayer:453017', finish: null, language: 'en', game: 'one-piece', mappingStatus: 'exact', sku: 'op-op01-001-en', setCode: 'op01', evidence: 'number:OP01-001', crosswalkVersion: 'tcgplayer-number/1' };
    const written = await Promise.all(['op-op01-001-en', 'op-op01-001-en-p1', 'op-op01-001-en-p2'].map(sku => writeProductCrosswalk({ ...link, sku })));
    expect(written.filter(result => result.supersededId === null)).toHaveLength(1);
    const live = (await state.pool.query(`SELECT id::text FROM price_source_crosswalks WHERE source_product_id=$1 AND superseded_at IS NULL`, [link.sourceProductId])).rows;
    expect(live).toHaveLength(1);
    await expect(state.pool.query(`UPDATE price_source_crosswalks SET sku='op-op01-009-en' WHERE id=$1`, [live[0].id])).rejects.toThrow(/append-only/);
    await expect(state.pool.query(`UPDATE price_source_crosswalks SET superseded_at=now(), evidence='rewritten' WHERE id=$1`, [live[0].id])).rejects.toThrow(/append-only/);
    await expect(state.pool.query(`UPDATE price_source_crosswalks SET superseded_at=now() WHERE source_product_id=$1 AND superseded_at IS NOT NULL`, [link.sourceProductId])).rejects.toThrow(/append-only/);
    // A live row is closed now, never ahead of time.
    await expect(state.pool.query(`UPDATE price_source_crosswalks SET superseded_at=clock_timestamp() + interval '1 day' WHERE id=$1`, [live[0].id])).rejects.toThrow(/append-only/);
    await expect(state.pool.query(`UPDATE price_source_crosswalks SET superseded_at=clock_timestamp() + interval '1 second' WHERE id=$1`, [live[0].id])).rejects.toThrow(/append-only/);
    // ...nor backdated before the closing transaction.
    await expect(state.pool.query(`UPDATE price_source_crosswalks SET superseded_at=transaction_timestamp() - interval '1 day' WHERE id=$1`, [live[0].id])).rejects.toThrow(/append-only/);
    await expect(state.pool.query(`DELETE FROM price_source_crosswalks WHERE id=$1`, [live[0].id])).rejects.toThrow(/append-only/);
    // A row enters live and stamped now: never pre-closed, never backdated.
    await expect(state.pool.query(`INSERT INTO price_source_crosswalks (source,source_product_id,finish,language,sku,game,set_code,mapping_status,evidence,crosswalk_version,superseded_at) VALUES ('tcgplayer','tcgplayer:pre-closed',NULL,'en','op-op01-002-en','one-piece','op01','exact','pre-closed','x',clock_timestamp() + interval '30 days')`))
      .rejects.toThrow(/enter live and stamped now/);
    await expect(state.pool.query(`INSERT INTO price_source_crosswalks (source,source_product_id,finish,language,sku,game,set_code,mapping_status,evidence,crosswalk_version,created_at) VALUES ('tcgplayer','tcgplayer:backdated',NULL,'en','op-op01-003-en','one-piece','op01','exact','backdated','x',clock_timestamp() - interval '7 days')`))
      .rejects.toThrow(/enter live and stamped now/);
    await expect(state.pool.query(`INSERT INTO price_source_crosswalks (source,source_product_id,finish,language,sku,game,set_code,mapping_status,evidence,crosswalk_version) VALUES ('tcgplayer','tcgplayer:453017',NULL,'en','op-op01-001-en','one-piece','op01','exact','duplicate live row','x')`))
      .rejects.toMatchObject({ constraint: 'price_source_crosswalks_live' });
    await expect(state.pool.query(`INSERT INTO price_source_crosswalks (source,source_product_id,finish,language,sku,game,set_code,mapping_status,evidence,crosswalk_version) VALUES ('tcgplayer','x','','en',NULL,'one-piece',NULL,'ambiguous','empty finish','x')`))
      .rejects.toMatchObject({ code: '23514' });
  });

  it('writes and supersedes set crosswalks per source and game', async () => {
    const set = { source: 'cardmarket' as const, sourceSetKey: '5229', game: 'one-piece', setCode: 'op01', evidence: 'idExpansion:5229', crosswalkVersion: 'cardmarket-expansions/1' };
    const first = await writeSetCrosswalk(set);
    expect(await writeSetCrosswalk(set)).toEqual({ id: first.id, supersededId: null, unchanged: true });
    // The same key under another game is another live row, not a re-map.
    expect(await writeSetCrosswalk({ ...set, game: 'pokemon', setCode: 'sv01' })).toMatchObject({ supersededId: null, unchanged: false });
    expect(await writeSetCrosswalk({ ...set, setCode: 'op01a', crosswalkVersion: 'cardmarket-expansions/2' })).toMatchObject({ supersededId: first.id, unchanged: false });
    const live = (await state.pool.query(`SELECT game, set_code FROM price_source_set_crosswalks WHERE superseded_at IS NULL ORDER BY game`)).rows;
    expect(live).toEqual([{ game: 'one-piece', set_code: 'op01a' }, { game: 'pokemon', set_code: 'sv01' }]);
    await expect(state.pool.query(`DELETE FROM price_source_set_crosswalks`)).rejects.toThrow(/append-only/);
    await expect(state.pool.query(`UPDATE price_source_set_crosswalks SET superseded_at=clock_timestamp() + interval '1 day' WHERE superseded_at IS NULL`)).rejects.toThrow(/append-only/);
    await expect(state.pool.query(`INSERT INTO price_source_set_crosswalks (source,source_set_key,game,set_code,evidence,crosswalk_version,created_at) VALUES ('cardmarket','9999','one-piece','op99','backdated','x',clock_timestamp() - interval '7 days')`))
      .rejects.toThrow(/enter live and stamped now/);
    // Closing now remains the permitted change.
    const closed = await state.pool.query(`UPDATE price_source_set_crosswalks SET superseded_at=clock_timestamp() WHERE superseded_at IS NULL AND game='pokemon' RETURNING superseded_at <= clock_timestamp() AS past`);
    expect(closed.rows).toEqual([{ past: true }]);
  });

  it('refuses TRUNCATE of the append-only evidence and crosswalk tables, as it refuses DELETE', async () => {
    const tables = ['member_price_batches', 'member_price_observations', 'price_source_crosswalks', 'price_source_set_crosswalks'];
    // Row triggers never fire on TRUNCATE, so each table has its own statement
    // guard; CASCADE alone could be refused by a dependant's.
    const guarded = await state.pool.query(`SELECT tgrelid::regclass::text AS name FROM pg_trigger WHERE tgrelid = ANY($1::regclass[]) AND (tgtype & 32) <> 0 ORDER BY 1`, [tables]);
    expect(guarded.rows.map(row => row.name)).toEqual([...tables].sort());
    const counts = async () => Promise.all(tables.map(async table => (await state.pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number));
    const before = await counts();
    expect(before.every(n => n > 0)).toBe(true);
    for (const table of tables) await expect(state.pool.query(`TRUNCATE ${table} CASCADE`)).rejects.toThrow(/append-only/);
    await expect(state.pool.query('TRUNCATE member_price_source_releases CASCADE')).rejects.toThrow(/append-only/);
    expect(await counts()).toEqual(before);
  });
});
