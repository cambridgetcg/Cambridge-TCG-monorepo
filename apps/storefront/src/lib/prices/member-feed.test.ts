import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { database } = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('@/lib/db', () => ({ query: database }));
import { DISPLAY_ONLY_INPUT_NOT_EXPORTED, DISPLAY_ONLY_INPUT_PAGES_END, MemberPriceQueryError, displayOnlySourcesWithRows, parseMemberPriceQuery, readMemberPrices } from './member-feed';
const parse = (value = '') => parseMemberPriceQuery(new URLSearchParams(value));
beforeEach(() => { database.mockReset(); });
describe('private member reader query boundary', () => {
  it('uses bounded current defaults and literal named search', () => {
    expect(parse()).toEqual({ mode: 'current', limit: 100 });
    expect(parse('q=Zoro+100%25&source=cardmarket&limit=500')).toMatchObject({ q: 'Zoro 100%', source: 'cardmarket', limit: 500 });
  });
  it.each(['limit=0','limit=501','limit=-1','limit=1.5','source=ebay','source=__proto__','mode=all','sku=a%27--','source=cardmarket&source=scryfall','cursor=unsigned','q='+ 'x'.repeat(121)])('rejects invalid query %s', value => expect(() => parse(value)).toThrow(MemberPriceQueryError));
  it('denies empty actors before any query', async () => {
    await expect(readMemberPrices({userId:''},parse(),'member-api')).rejects.toThrow(/actor/); expect(database).not.toHaveBeenCalled();
  });
  it('does not query display-only source for API or download', async () => {
    for (const source of ['scryfall','cardrush','tcgplayer']) expect(parse(`source=${source}`).source).toBe(source);
    // Scryfall reads there as empty, exactly as before.
    for (const use of ['member-api','member-download'] as const) expect(await readMemberPrices({userId:'test'},parse('source=scryfall'),use)).toMatchObject({ status: 'empty', items: [] });
    // CardRush and TCGplayer are refused there (400 at both routes), as an unknown source was before them.
    for (const source of ['cardrush','tcgplayer']) for (const use of ['member-api','member-download'] as const) {
      await expect(readMemberPrices({userId:'test'},parse(`source=${source}&limit=50&q=Zoro`),use)).rejects.toThrow(new MemberPriceQueryError(DISPLAY_ONLY_INPUT_NOT_EXPORTED));
    }
    expect(database).not.toHaveBeenCalled();
  });
  it('offers page sources to member display alone, each under its own evidence', async () => {
    database.mockResolvedValue({ rows: [{ watermark:'0',total:'0',items:[] }] });
    const offered = async (use: 'member-display' | 'member-api' | 'member-download') => {
      database.mockClear(); await readMemberPrices({userId:'test'},parse('limit=50&q=Zoro'),use);
      return JSON.parse(database.mock.calls[0]![1][1]) as { source: string; version: string }[];
    };
    expect(await offered('member-display')).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'cardrush', version: 'cardrush/2026-10-28.1' }),
      expect.objectContaining({ source: 'tcgplayer', version: 'tcgplayer/2026-10-28.1' }),
    ]));
    for (const use of ['member-api','member-download'] as const) expect((await offered(use)).map(policy => policy.source)).toEqual(['cardmarket']);
  });
  // Display-only derivation inputs can be looked at, not harvested.
  const offeredFor = async (value: string, use: 'member-display' | 'member-api' | 'member-download' = 'member-display') => {
    database.mockClear(); await readMemberPrices({userId:'test'},parse(value),use);
    return database.mock.calls.length ? (JSON.parse(database.mock.calls[0]![1][1]) as { source: string }[]).map(policy => policy.source) : null;
  };
  it('offers CardRush and TCGplayer only to the current view of a narrowed search, at most 50 rows a page', async () => {
    database.mockResolvedValue({ rows: [{ watermark:'0',total:'0',items:[] }] });
    for (const value of ['limit=50&q=Zoro', 'limit=1&sku=op-op01-001-ja', 'mode=current&limit=50&game=one-piece&set=op01']) expect(await offeredFor(value)).toEqual(['cardmarket','scryfall','cardrush','tcgplayer']);
    // A page over 50 rows, history, or a search narrowed by nothing but a game,
    // a set without its game or a metric leaves them out.
    for (const value of ['', 'limit=50', 'limit=1', 'limit=51&q=Zoro', 'limit=500&sku=op-op01-001-ja', 'mode=history&q=Zoro', 'mode=history&limit=1&game=one-piece&set=op01',
      'limit=50&game=one-piece', 'limit=50&set=op01', 'limit=50&metric=sell']) expect(await offeredFor(value)).toEqual(['cardmarket','scryfall']);
    // The statement is told which offered policies are display-only, and no other.
    database.mockClear(); await readMemberPrices({userId:'test'},parse('limit=50&q=Zoro'),'member-display');
    expect((JSON.parse(database.mock.calls[0]![1][1]) as { source: string; displayOnly?: true }[]).map(({ source, displayOnly }) => [source, displayOnly ?? false]))
      .toEqual([['cardmarket', false], ['scryfall', false], ['cardrush', true], ['tcgplayer', true]]);
    expect(database.mock.calls[0]![0]).toContain('bool_or(display_only)');
    for (const source of ['cardrush','tcgplayer']) {
      for (const value of [`source=${source}&mode=history&q=Zoro`, `source=${source}&limit=51&q=Zoro`, `source=${source}&mode=history&limit=500`, `source=${source}&limit=50`, `source=${source}&limit=50&game=one-piece`]) {
        expect(await offeredFor(value)).toBeNull();
        expect(await readMemberPrices({userId:'test'},parse(value),'member-display')).toMatchObject({ status: 'empty', items: [], complete: true });
      }
      expect(await offeredFor(`source=${source}&limit=50&q=Zoro`)).toEqual([source]);
    }
  });
  describe('a cursor chain whose snapshot holds display-only rows', () => {
    const secret = 'fixture-only-cursor-secret-not-a-production-key';
    const decode = (cursor: string) => JSON.parse(Buffer.from(cursor.split('.')[0]!, 'base64url').toString()) as Record<string, unknown>;
    const sign = (body: Record<string, unknown>) => { const encoded = Buffer.from(JSON.stringify(body)).toString('base64url'); return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`; };
    const rows = (count: number, from = 1) => Array.from({ length: count }, (_, i) => ({ ...cardrush, id: String(from + i), source_product_id: `cardrush-op.jp/product/${from + i}` }));
    beforeEach(() => { vi.stubEnv('MEMBER_PRICE_CURSOR_SECRET', secret); return () => vi.unstubAllEnvs(); });
    it('numbers its pages in the signed cursor and ends after three, saying why', async () => {
      const view = parse('limit=50&q=cardrush');
      const pages = [];
      let cursor: string | undefined;
      for (let read = 0; read < 3; read++) {
        database.mockResolvedValueOnce({ rows: [{ watermark: '9', total: '200', display_only: true, items: rows(51, read * 50 + 1) }] });
        const page = await readMemberPrices({ userId: 'test' }, { ...view, cursor }, 'member-display');
        pages.push(page);
        cursor = page.nextCursor ?? undefined;
      }
      expect(pages.map(page => page.nextCursor && decode(page.nextCursor).page)).toEqual([2, 3, null]);
      expect(pages[2]).toMatchObject({ status: 'available', count: 50, total: 200, complete: false, nextCursor: null, reason: DISPLAY_ONLY_INPUT_PAGES_END });
      expect(pages.flatMap(page => page.items)).toHaveLength(150);
      // A last page that runs out ends as complete, with no note.
      database.mockResolvedValueOnce({ rows: [{ watermark: '9', total: '120', display_only: true, items: rows(20, 101) }] });
      const short = await readMemberPrices({ userId: 'test' }, { ...view, cursor: pages[1]!.nextCursor! }, 'member-display');
      expect(short).toMatchObject({ status: 'available', count: 20, complete: true, nextCursor: null });
      expect(short).not.toHaveProperty('reason');
    });
    it('refuses a fourth page and a malformed number before any read, and an unnumbered cursor once its snapshot holds them', async () => {
      const view = parse('limit=50&q=cardrush');
      database.mockResolvedValueOnce({ rows: [{ watermark: '9', total: '200', display_only: true, items: rows(51) }] });
      const first = decode((await readMemberPrices({ userId: 'test' }, view, 'member-display')).nextCursor!);
      database.mockClear();
      await expect(readMemberPrices({ userId: 'test' }, { ...view, cursor: sign({ ...first, page: 4 }) }, 'member-display')).rejects.toThrow(new MemberPriceQueryError(DISPLAY_ONLY_INPUT_PAGES_END));
      for (const body of [{ ...first, page: 1 }, { ...first, page: 2.5 }, { ...first, page: '2' }]) {
        await expect(readMemberPrices({ userId: 'test' }, { ...view, cursor: sign(body) }, 'member-display')).rejects.toThrow(/Invalid, expired, or filter-mismatched price cursor/);
      }
      expect(database).not.toHaveBeenCalled();
      // A continuation minted without a number cannot reach a later page of display-only rows.
      const { page: _page, ...unnumbered } = first;
      database.mockResolvedValueOnce({ rows: [{ watermark: '9', total: '200', display_only: true, items: rows(51, 51) }] });
      await expect(readMemberPrices({ userId: 'test' }, { ...view, cursor: sign(unnumbered) }, 'member-display')).rejects.toThrow(/Invalid, expired, or filter-mismatched price cursor/);
    });
    it('leaves Cardmarket and Scryfall chains, and any view holding no display-only row, unnumbered and unbounded', async () => {
      // The mixed view offers CardRush and TCGplayer, but its snapshot holds none of their rows (today, before collection).
      for (const [value, use] of [['source=cardmarket&limit=50&q=cardrush', 'member-display'], ['limit=50&q=cardrush', 'member-api'], ['limit=50&q=Zoro&mode=history', 'member-display'], ['source=scryfall&limit=50&q=Zoro', 'member-display'], ['limit=50&q=Zoro', 'member-display']] as const) {
        const view = parse(value);
        const fixture = value.includes('scryfall') ? { ...row, source: 'scryfall', game: 'magic', granularity: 'printing', currency: 'USD', underlying_market: 'tcgplayer', language: 'en', metric: 'usd', permitted_uses: ['member-display'] } : { ...row, permitted_uses: ['member-display', 'member-api', 'member-download'] };
        let cursor: string | undefined;
        for (let read = 0; read < 5; read++) {
          database.mockResolvedValueOnce({ rows: [{ watermark: '9', total: '1000', display_only: false, items: Array.from({ length: 51 }, (_, i) => ({ ...fixture, id: String(read * 50 + i + 1) })) }] });
          const page = await readMemberPrices({ userId: 'test' }, { ...view, cursor }, use);
          expect(page.nextCursor).toBeTruthy();
          expect(decode(page.nextCursor!)).not.toHaveProperty('page');
          expect(page).not.toHaveProperty('reason');
          cursor = page.nextCursor!;
        }
      }
    });
  });
  it('names a display-only source for the /prices filter only when it holds rows, and none when the store cannot say', async () => {
    database.mockResolvedValueOnce({ rows: [{ source: 'tcgplayer' }] });
    expect(await displayOnlySourcesWithRows()).toEqual(['tcgplayer']);
    const [sql, args] = database.mock.calls[0]!;
    expect(sql).toContain('r.revoked_at IS NULL AND r.member_display');
    expect(sql).toContain('EXISTS (SELECT 1 FROM member_price_observations o');
    expect(JSON.parse(args[0]).map((policy: { source: string }) => policy.source)).toEqual(['cardrush', 'tcgplayer']);
    database.mockResolvedValueOnce({ rows: [] });
    expect(await displayOnlySourcesWithRows()).toEqual([]);
    database.mockRejectedValueOnce(new Error('private SQL host password'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { expect(await displayOnlySourcesWithRows()).toEqual([]); } finally { log.mockRestore(); }
  });
  it('changes nothing Cardmarket and Scryfall readers get, in any mode or page size', async () => {
    database.mockResolvedValue({ rows: [{ watermark:'0',total:'0',items:[] }] });
    const cardmarket = { source: 'cardmarket', version: 'member-prices/2026-09-07.1', evidenceUrl: 'https://www.cardmarket.com/en/Insight/Articles/the-state-of-cardmarket-2024' };
    const scryfall = { source: 'scryfall', version: 'member-prices/2026-09-07.1', evidenceUrl: 'https://scryfall.com/docs/api#use-of-scryfall-data-and-images' };
    for (const mode of ['current', 'history']) for (const limit of ['1', '50', '51', '100', '500']) {
      for (const use of ['member-display', 'member-api', 'member-download'] as const) {
        database.mockClear();
        await readMemberPrices({userId:'test'},parse(`source=cardmarket&mode=${mode}&limit=${limit}`),use);
        const [sql, args] = database.mock.calls[0]!;
        expect(JSON.parse(args[1])).toEqual([cardmarket]);
        // The current view reads one row a key (0144); history ranks every observation, as before.
        expect(args.slice(2)).toEqual(mode === 'current' ? [null, null, null, null, null, '0', Number(limit) + 1] : [null, null, null, null, null, mode, '0', Number(limit) + 1]);
        expect(sql.includes('FROM member_price_latest l')).toBe(mode === 'current');
        expect(sql).toContain(`r.${use.replace('-', '_')}`);
      }
      database.mockClear();
      await readMemberPrices({userId:'test'},parse(`source=scryfall&mode=${mode}&limit=${limit}`),'member-display');
      expect(JSON.parse(database.mock.calls[0]![1][1])).toEqual([scryfall]);
    }
    for (const use of ['member-api', 'member-download'] as const) for (const value of ['', 'mode=history', 'limit=500', 'limit=50']) expect(await offeredFor(value, use)).toEqual(['cardmarket']);
    // A stored Cardmarket row still reaches a 500-row history page.
    database.mockResolvedValue({ rows: [{ watermark: '1', total: '1', items: [row] }] });
    expect((await readMemberPrices({userId:'test'},parse('mode=history&limit=500'),'member-api')).items).toHaveLength(1);
  });
  it('answers the current view from the ranked statement, as before, on a store without 0144', async () => {
    const missing = Object.assign(new Error('relation "member_price_latest" does not exist'), { code: '42P01' });
    for (const [value, use] of [['', 'member-api'], ['limit=50&q=Zoro', 'member-display'], ['source=cardmarket&limit=1&sku=op-op01-001-en', 'member-download']] as const) {
      database.mockReset();
      database.mockRejectedValueOnce(missing).mockResolvedValueOnce({ rows: [{ watermark: '1', total: '1', items: [{ ...row, permitted_uses: ['member-display', 'member-api', 'member-download'] }] }] });
      const page = await readMemberPrices({ userId: 'test' }, parse(value), use);
      expect(page).toMatchObject({ status: 'available', count: 1, total: 1, complete: true });
      expect(database).toHaveBeenCalledTimes(2);
      const [[bounded, boundedArgs], [ranked, rankedArgs]] = database.mock.calls as [string, unknown[]][];
      expect(bounded).toContain('FROM member_price_latest l');
      expect(ranked).not.toContain('member_price_latest');
      expect(ranked).toContain("($8::text='history' OR recency=1)");
      // The same snapshot inputs, with today's mode parameter between them and the page bounds.
      expect(rankedArgs).toEqual([...boundedArgs.slice(0, 7), 'current', ...boundedArgs.slice(7)]);
    }
    // Any other failure is unavailable, with no second statement.
    database.mockReset();
    database.mockRejectedValueOnce(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { expect(await readMemberPrices({ userId: 'test' }, parse(), 'member-api')).toMatchObject({ status: 'unavailable', items: [] }); } finally { log.mockRestore(); }
    expect(database).toHaveBeenCalledTimes(1);
    // History never reads the latest table, so a missing one is never consulted.
    database.mockReset();
    database.mockResolvedValueOnce({ rows: [{ watermark: '0', total: '0', items: [] }] });
    await readMemberPrices({ userId: 'test' }, parse('mode=history'), 'member-api');
    expect(database).toHaveBeenCalledTimes(1);
    expect(database.mock.calls[0]![0]).not.toContain('member_price_latest');
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
    { amount: '1\n' }, { language: 'en' }, { condition: 'near-mint' },
    { mapping_status: 'exact' }, { mapping_status: 'ambiguous', set_code: 'sv01' },
    { sku: 'pkm-sv01-001-en' }, { permitted_uses: ['member-display'] }])(
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
  const cardrush = { ...row, source: 'cardrush', source_product_id: 'cardrush-op.jp/product/1234', game: 'one-piece',
    granularity: 'printing', finish: 'parallel', language: 'ja', metric: 'sell', amount: '1500.000000',
    currency: 'JPY', underlying_market: 'cardrush', source_updated_at: '2026-10-28T09:15:00Z', retrieved_at: '2026-10-28T09:15:00Z',
    evidence_version: 'cardrush/2026-10-28.1', catalog_source_url: null, catalog_updated_at: null, catalog_artifact_sha256: null,
    permitted_uses: ['member-display'] };
  it('projects a CardRush display row in whole yen, its read time as its source time', async () => {
    database.mockResolvedValue({ rows: [{ watermark: '1', total: '1', items: [cardrush] }] });
    const page = await readMemberPrices({ userId: 'test' }, parse('source=cardrush&limit=50&q=1234'), 'member-display');
    expect(page.items[0]).toMatchObject({ amount: '1500.000000', currency: 'JPY', underlyingMarket: 'cardrush',
      sourceUpdatedAt: '2026-10-28T09:15:00.000Z', retrievedAt: '2026-10-28T09:15:00.000Z', permittedUses: ['member-display'] });
    expect(page.items[0]!.attribution).toMatch(/CardRush/);
  });
  it.each([{ source_updated_at: '2026-10-27T00:00:00Z' }, { amount: '1500.500000' }, { currency: 'USD' }, { granularity: 'source-product' },
    { source_updated_at: '2026-10-27T09:15:00Z', retrieved_at: '2026-10-27T09:15:00Z' }])(
    'withholds an inconsistent CardRush page instead of emitting it %j', async invalid => {
      database.mockResolvedValue({ rows: [{ watermark: '1', total: '1', items: [{ ...cardrush, ...invalid }] }] });
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect(await readMemberPrices({ userId: 'test' }, parse('limit=50&q=1234'), 'member-display')).toMatchObject({ status: 'unavailable', items: [] });
      } finally { log.mockRestore(); }
    },
  );
  it.each([
    { granularity: 'source-product' },
    { currency: 'USD', underlying_market: 'cardmarket' },
    { currency: 'EUR', underlying_market: 'tcgplayer' },
    { currency: 'JPY', underlying_market: 'cardrush', amount: '1500' },
  ])('withholds inconsistent Scryfall display rows without returning a partial page %j', async invalid => {
    const scryfall = { ...row, source: 'scryfall', game: 'magic', granularity: 'printing',
      currency: 'USD', underlying_market: 'tcgplayer', language: 'en', metric: 'usd',
      permitted_uses: ['member-display'] };
    database.mockResolvedValue({ rows: [{ watermark: '1', total: '2', items: [scryfall, { ...scryfall, id: '2', ...invalid }] }] });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await readMemberPrices({ userId: 'test' }, parse('source=scryfall'), 'member-display'))
        .toMatchObject({ status: 'unavailable', items: [], complete: false });
    } finally { log.mockRestore(); }
  });
});
