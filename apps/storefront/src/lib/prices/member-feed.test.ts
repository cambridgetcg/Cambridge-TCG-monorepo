import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { database } = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('@/lib/db', () => ({ query: database }));
import { MemberPriceQueryError, parseMemberPriceQuery, readMemberPrices } from './member-feed';
const parse = (value = '') => parseMemberPriceQuery(new URLSearchParams(value));
beforeEach(() => { database.mockReset(); });
describe('private member reader query boundary', () => {
  it('uses bounded current defaults and literal named search', () => {
    expect(parse()).toEqual({ mode: 'current', limit: 100 });
    expect(parse('q=Zoro+100%25&source=cardmarket&limit=500')).toMatchObject({ q: 'Zoro 100%', source: 'cardmarket', limit: 500 });
  });
  it.each(['limit=0','limit=501','limit=-1','limit=1.5','source=cardrush','mode=all','sku=a%27--','source=cardmarket&source=scryfall','cursor=unsigned','q='+ 'x'.repeat(121)])('rejects invalid query %s', value => expect(() => parse(value)).toThrow(MemberPriceQueryError));
  it('denies empty actors before any query', async () => {
    await expect(readMemberPrices({userId:''},parse(),'member-api')).rejects.toThrow(/actor/); expect(database).not.toHaveBeenCalled();
  });
  it('does not query display-only source for API or download', async () => {
    for (const use of ['member-api','member-download'] as const) expect((await readMemberPrices({userId:'test'},parse('source=scryfall'),use)).items).toEqual([]);
    expect(database).not.toHaveBeenCalled();
  });
  it('returns honest unavailable on storage failure, without leaking SQL or credentials', async () => {
    database.mockRejectedValue(new Error('private SQL host password'));
    const log = vi.spyOn(console,'error').mockImplementation(() => {});
    const page = await readMemberPrices({userId:'test'},parse(),'member-api');
    expect(page.status).toBe('unavailable'); expect(page.complete).toBe(false); expect(JSON.stringify(page)).not.toMatch(/password|SQL host/);
    log.mockRestore();
  });
  it('uses a single release-bound snapshot statement rather than timestamp pagination', async () => {
    database.mockResolvedValue({ rows: [{ watermark:'0',total:'0',items:[] }] });
    const page = await readMemberPrices({userId:'test'},parse(),'member-api');
    expect(page).toMatchObject({status:'empty',watermark:'0',complete:true,count:0,total:0}); expect(database).toHaveBeenCalledTimes(1);
    const sql = database.mock.calls[0]![0];
    expect(sql).toContain('o.batch_id <= c.watermark'); expect(sql).toContain('r.member_api'); expect(sql).toContain('r.revoked_at IS NULL'); expect(sql).toContain('r.evidence_version=o.evidence_version');
  });
  const row = {
    id: '1', source: 'cardmarket', source_product_id: '123', sku: null, mapping_status: 'unmapped',
    game: 'pokemon', set_code: null, product_name: 'Example', granularity: 'source-product',
    finish: null, language: null, condition: null, metric: 'trend', amount: '12.340000',
    currency: 'EUR', underlying_market: 'cardmarket', source_updated_at: '2026-09-06T00:00:00Z',
    retrieved_at: '2026-09-07T00:00:00Z', source_url: 'https://example.test/prices.json',
    parser_version: 'test/1', crosswalk_version: 'test/1', evidence_version: 'test/1', artifact_sha256: 'a'.repeat(64),
    catalog_source_url: 'https://example.test/catalog.json', catalog_updated_at: '2026-08-01T00:00:00Z',
    catalog_artifact_sha256: 'b'.repeat(64), permitted_uses: ['member-api'],
  };
  it('preserves native units, scope and source times through the storage projection', async () => {
    database.mockResolvedValue({ rows: [{ watermark: '1', total: '1', items: [row] }] });
    const page = await readMemberPrices({ userId: 'test' }, parse(), 'member-api');
    expect(page.status).toBe('available');
    expect(page.items[0]).toMatchObject({ amount: '12.340000', currency: 'EUR', sku: null,
      metric: 'trend', granularity: 'source-product', sourceUpdatedAt: '2026-09-06T00:00:00.000Z',
      retrievedAt: '2026-09-07T00:00:00.000Z', permittedUses: ['member-api'] });
  });
  it.each([{ amount: '0.000000' }, { amount: 'Infinity' }, { currency: 'GBP' },
    { mapping_status: 'exact' }, { sku: 'pkm-sv01-001-en' }, { permitted_uses: ['member-display'] }])(
    'withholds an entire invalid response page instead of emitting incorrect prices %j', async invalid => {
      database.mockResolvedValue({ rows: [{ watermark: '1', total: '1', items: [{ ...row, ...invalid }] }] });
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect(await readMemberPrices({ userId: 'test' }, parse(), 'member-api')).toMatchObject({
          status: 'unavailable', items: [], complete: false,
        });
      } finally { log.mockRestore(); }
    },
  );
});
