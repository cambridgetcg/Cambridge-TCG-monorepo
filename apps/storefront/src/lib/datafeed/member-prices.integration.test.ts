import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { MEMBER_PRICE_REVIEW_VERSION, type NativePriceObservation } from '@cambridge-tcg/data-ingest/member-prices';

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
import { writeMemberPriceBatch, validateMemberPriceWrite } from './member-price-writer';
import { readMemberPrices, parseMemberPriceQuery, MemberPriceQueryError } from '../prices/member-feed';

const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const schema = `member_price_test_${process.pid}`;
let admin: Pool;
function observation(id: string, override: Partial<NativePriceObservation> = {}): NativePriceObservation {
  return { source: 'cardmarket', sourceProductId: id, sku: null, setCode: null, mappingStatus: 'unmapped', game: 'one-piece', productName: `Product ${id}`, granularity: 'source-product', finish: null, language: null, condition: null, metric: 'trend', amount: '2.95', currency: 'EUR', underlyingMarket: 'cardmarket', sourceUpdatedAt: '2026-09-07T00:48:24.000Z', retrievedAt: '2026-09-07T12:00:00.000Z', sourceUrl: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json', parserVersion: 'cardmarket-daily/2', crosswalkVersion: 'none', evidenceVersion: MEMBER_PRICE_REVIEW_VERSION, artifactSha256: 'a'.repeat(64), catalogSourceUrl: 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json', catalogUpdatedAt: '2026-08-01T12:00:00.000Z', catalogArtifactSha256: 'b'.repeat(64), quality: 'accepted', ...override };
}
const write = (rows: NativePriceObservation[]) => writeMemberPriceBatch(rows[0]!.source, { observations: rows, quarantine: [], sourceRows: rows.length, missingPrices: 0 });
const query = (params: Record<string, string> = {}) => parseMemberPriceQuery(new URLSearchParams(params));
const actor = { userId: 'fixture-member' };

describe.skipIf(!localUrl)('member prices PostgreSQL integration (explicit loopback DB only)', () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.includes('test') || url.search) throw new Error('Explicit disposable local test database required');
    process.env.AUTH_SECRET = 'fixture-only-cursor-secret-not-a-production-key';
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 8 });
    await state.pool.query(await readFile(new URL('../../../drizzle/0137_member_price_observations.sql', import.meta.url), 'utf8'));
  });
  afterAll(async () => {
    if (state.pool) await state.pool.end();
    if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
  });
  it('writes native evidence once, keeps source/catalog clocks, refuses fabricated provenance', async () => {
    const row = observation('1');
    expect(() => validateMemberPriceWrite(row, { source: 'cardmarket', as_of: row.retrievedAt, retrieved_at: row.retrievedAt })).toThrow(/provenance/);
    const first = await write([row]); expect(first.inserted).toBe(1);
    const again = await write([{ ...row, retrievedAt: '2026-09-08T12:00:00Z' }]); expect(again.duplicate).toBe(true);
    const page = await readMemberPrices(actor, query({ source: 'cardmarket' }), 'member-api');
    expect(page.items[0]).toMatchObject({ amount: '2.950000', sourceUpdatedAt: row.sourceUpdatedAt, catalogUpdatedAt: row.catalogUpdatedAt, catalogArtifactSha256: row.catalogArtifactSha256, retrievedAt: row.retrievedAt });
  });
  it('uses one release-aware projection and excludes display-only Scryfall from both feed uses', async () => {
    await write([observation('scryfall-id', { source: 'scryfall', game: 'magic', granularity: 'printing', finish: 'nonfoil', language: 'en', metric: 'usd', currency: 'USD', underlyingMarket: 'tcgplayer', sourceUrl: 'https://data.scryfall.io/default-cards/default-cards-20260907090000.json', parserVersion: 'scryfall-daily-prices/1', catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null })]);
    expect((await readMemberPrices(actor, query(), 'member-display')).items.some(row => row.source === 'scryfall')).toBe(true);
    for (const use of ['member-api','member-download'] as const) expect((await readMemberPrices(actor, query(), use)).items.every(row => row.source === 'cardmarket')).toBe(true);
  });
  it('does not resurrect an old SKU, set, or name in current mode after mapping is removed', async () => {
    const old = observation('mapping', { sku: 'op-op01-001-en', setCode: 'op01', mappingStatus: 'exact', productName: 'Old name', crosswalkVersion: 'exact/1' });
    await write([old]);
    await write([observation('mapping', { sourceUpdatedAt: '2026-09-08T00:48:24Z', productName: 'New name', mappingStatus: 'ambiguous', crosswalkVersion: 'ambiguous/2' })]);
    const filters: Record<string, string>[] = [{ sku: old.sku! }, { set: 'op01' }, { q: 'Old name' }];
    for (const filter of filters) {
      expect((await readMemberPrices(actor, query(filter), 'member-api')).items).toHaveLength(0);
      expect((await readMemberPrices(actor, query({ ...filter, mode: 'history' }), 'member-api')).items).toHaveLength(1);
    }
  });
  it('binds cursor to actor, use, filters, limits and rejects forgery before any query', async () => {
    await write([observation('cursor-1'),observation('cursor-2'),observation('cursor-3')]);
    const base = query({ q: 'cursor', limit: '1' });
    const first = await readMemberPrices(actor, base, 'member-api'); expect(first.nextCursor).toBeTruthy();
    const decoded = Buffer.from(first.nextCursor!.split('.')[0]!, 'base64url').toString();
    expect(decoded).not.toContain(actor.userId);
    expect(JSON.parse(decoded).binding).toMatch(/^[a-f0-9]{64}$/);
    for (const input of [{ ...base, q: 'different' }, { ...base, limit: 2 }]) await expect(readMemberPrices(actor, { ...input, cursor: first.nextCursor! }, 'member-api')).rejects.toBeInstanceOf(MemberPriceQueryError);
    await expect(readMemberPrices({userId:'other'}, {...base,cursor:first.nextCursor!}, 'member-api')).rejects.toBeInstanceOf(MemberPriceQueryError);
    await expect(readMemberPrices(actor, {...base,cursor:first.nextCursor!}, 'member-download')).rejects.toBeInstanceOf(MemberPriceQueryError);
    await expect(readMemberPrices(actor, {...base,cursor:first.nextCursor!.slice(0,-2)+'xx'}, 'member-api')).rejects.toBeInstanceOf(MemberPriceQueryError);
    await expect(readMemberPrices({userId:' '}, base, 'member-api')).rejects.toThrow(/actor/);
  });
  it('pages a closed committed ID ceiling while later ingestion waits then commits without duplication or omission', async () => {
    const base = query({ q: 'cursor', limit: '1', mode: 'history' });
    const first = await readMemberPrices(actor, base, 'member-api');
    const blocker = await state.pool.connect();
    await blocker.query('BEGIN'); await blocker.query('SELECT pg_advisory_xact_lock(137,1)');
    const allocated = await blocker.query(`INSERT INTO member_price_batches(ingest_key,source,source_rows,missing_prices) VALUES ('held','cardmarket',0,0) RETURNING id::text`);
    let finished = false;
    const pending = write([observation('cursor-new')]).then(value => { finished = true; return value; });
    // Querying another connection proves held batch is absent from committed max.
    const during = await readMemberPrices(actor, base, 'member-api');
    expect(during.watermark).toBe(first.watermark); expect(finished).toBe(false);
    await blocker.query('COMMIT'); blocker.release();
    const later = await pending; expect(BigInt(later.batchId)).toBeGreaterThan(BigInt(allocated.rows[0].id));
    const ids = first.items.map(row => row.sourceProductId); let next = first.nextCursor;
    while (next) { const page = await readMemberPrices(actor, { ...base, cursor: next }, 'member-api'); expect(page.watermark).toBe(first.watermark); ids.push(...page.items.map(row => row.sourceProductId)); next = page.nextCursor; }
    expect(ids).toEqual(['cursor-1','cursor-2','cursor-3']);
    expect(new Set(ids).size).toBe(ids.length);
    expect((await readMemberPrices(actor, query({q:'cursor'}), 'member-api')).items).toHaveLength(4);
    await expect(state.pool.query(`INSERT INTO member_price_batches(ingest_key,source,source_rows,missing_prices) VALUES ('unguarded','cardmarket',0,0)`)).rejects.toThrow(/advisory/);
    await expect(state.pool.query(`UPDATE member_price_observations SET amount=1 WHERE source_product_id='1'`)).rejects.toThrow(/append-only/);
    // No source row can arrive after its original batch committed.
    await expect(state.pool.query(`INSERT INTO member_price_observations OVERRIDING SYSTEM VALUE SELECT id+100000,batch_id,observation_key||'-late',source,source_product_id,sku,mapping_status,game,set_code,product_name,granularity,finish,language,condition,metric,amount,currency,underlying_market,source_updated_at,retrieved_at,source_url,parser_version,crosswalk_version,evidence_version,artifact_sha256,catalog_source_url,catalog_updated_at,catalog_artifact_sha256,quality FROM member_price_observations WHERE source_product_id='1'`)).rejects.toThrow(/original uncommitted batch/);
  });
  it('enforces runtime flags, evidence versions and immediate revocation even on existing cursors', async () => {
    const base = query({ q: 'cursor', limit: '1' });
    const first = await readMemberPrices(actor, base, 'member-api');
    await state.pool.query(`UPDATE member_price_source_releases SET member_api=false WHERE source='cardmarket'`);
    expect((await readMemberPrices(actor, {...base,cursor:first.nextCursor!}, 'member-api')).items).toHaveLength(0);
    expect((await readMemberPrices(actor, base, 'member-download')).items).toHaveLength(1);
    await state.pool.query(`UPDATE member_price_source_releases SET member_api=true,evidence_version='unreviewed' WHERE source='cardmarket'`);
    expect((await readMemberPrices(actor, base, 'member-api')).items).toHaveLength(0);
    await state.pool.query(`UPDATE member_price_source_releases SET evidence_version=$1,revoked_at=now() WHERE source='cardmarket'`, [MEMBER_PRICE_REVIEW_VERSION]);
    expect((await readMemberPrices(actor, base, 'member-display')).items).toHaveLength(0);
    await expect(write([observation('revoked')])).rejects.toThrow(/revoked/);
  });
});
