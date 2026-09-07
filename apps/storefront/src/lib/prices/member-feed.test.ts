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
});
