/**
 * The CardRush page collector — fixture-based, no network.
 *
 * Fixtures are trimmed excerpts of www.cardrush-op.jp pages read on
 * 2026-10-28 with the collector's identified User-Agent (each file's header
 * names its source page, read time and full-page sha256), with prices
 * replaced by synthetic values: raw CardRush prices are display-only, and the
 * page's figure and its product:price meta still agree. Cases the capture
 * did not contain (an English marker, a missing or zero price, several
 * prices, a challenge) are edits of those excerpts, made in this file and
 * named as edits where they are made.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPriceObservationValues, PAGE_SOURCE_COLLECTION_START } from '@cambridge-tcg/data-spec';
import { artifactDigest, CARDRUSH_EVIDENCE_VERSION, MEMBER_PRICE_REVIEW_VERSION, priceUseAllowed, resolvePriceCrosswalk, TCGPLAYER_EVIDENCE_VERSION } from '../../member-prices';
import { createFetcher } from '../../http';
import { cardrush } from '../index';
import { buildSku, SkuBuildError } from '@cambridge-tcg/sku';
import { acquireCardRushMemberPrices, cardRushRobotsAllow, compileCardRushRobots, cardRushSourceProductId, CARDRUSH_COLLECTOR_HOSTS, CARDRUSH_CROSSWALK_VERSION, CARDRUSH_MAX_BUDGET_MS, CARDRUSH_PAGE_RATE, CARDRUSH_PRICE_PARSER, CARDRUSH_ROBOTS_AGENTS, parseCardRushMemberPrices, type CardRushPage } from '../member-prices';

vi.mock('../../http', async importOriginal => {
  const actual = await importOriginal<typeof import('../../http')>();
  return { ...actual, createFetcher: vi.fn(actual.createFetcher) };
});
vi.mock('@cambridge-tcg/sku', async importOriginal => {
  const actual = await importOriginal<typeof import('@cambridge-tcg/sku')>();
  return { ...actual, buildSku: vi.fn(actual.buildSku) };
});

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');
const html = (id: number) => fixture(`cardrush-op-${id}.html`);
const readAt = '2026-10-28T15:00:00.000Z';
const encode = (text: string) => new TextEncoder().encode(text);
const page = (id: number, text = html(id), url = `https://www.cardrush-op.jp/product/${id}`): CardRushPage => ({ url, bytes: encode(text), retrievedAt: readAt });
const one = (input: CardRushPage) => parseCardRushMemberPrices([input]);
const IDENTIFIED_UA = 'cambridgetcg.com/1.0 (admin@cambridgetcg.com; +https://cambridgetcg.com) (cardrush-collector; permission cardrush/2026-10-28.1)';
/** A stand-in written from the intake record's summary of the six hosts'
 * robots.txt (2026-10-28: only GPTBot, Bytespider, TikTokSpider and
 * meta-externalagent are disallowed). Not a capture. */
const ROBOTS = 'User-agent: GPTBot\nUser-agent: Bytespider\nUser-agent: TikTokSpider\nUser-agent: meta-externalagent\nDisallow: /\n\nUser-agent: *\nDisallow:\n\nSitemap: https://www.cardrush-op.jp/sitemap.xml\n';

describe('CardRush product page parsing', () => {
  it('reads a stated grade, the structured price and an exact plain printing', () => {
    const input = page(15600);
    const result = one(input);
    expect(result.quarantine).toEqual([]);
    expect(result.observations).toEqual([{
      source: 'cardrush', sourceProductId: 'www.cardrush-op.jp/product/15600', sku: 'op-op01-006-ja', setCode: 'op01', mappingStatus: 'exact',
      game: 'one-piece', productName: '〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}', granularity: 'printing', finish: null, language: 'ja', condition: 'C',
      metric: 'sell', amount: '123', currency: 'JPY', underlyingMarket: 'cardrush', sourceUpdatedAt: readAt, retrievedAt: readAt,
      sourceUrl: 'https://www.cardrush-op.jp/product/15600', parserVersion: CARDRUSH_PRICE_PARSER, crosswalkVersion: CARDRUSH_CROSSWALK_VERSION,
      evidenceVersion: CARDRUSH_EVIDENCE_VERSION, artifactSha256: artifactDigest(input.bytes), catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null, quality: 'accepted',
      sourceSetKey: 'OP01',
    }]);
    expect(result.productCrosswalks).toEqual([{ sourceProductId: 'www.cardrush-op.jp/product/15600', finish: null, language: 'ja', game: 'one-piece', mappingStatus: 'exact', sku: 'op-op01-006-ja', setCode: 'op01', evidence: 'title:OP01-006 [UC]' }]);
    expect(result.setCrosswalks).toEqual([{ sourceSetKey: 'OP01', game: 'one-piece', setCode: 'op01', evidence: 'title-set:OP01' }]);
  });

  it.each([
    [169, { finish: 'parallel', condition: null, amount: '12345' }, 'title:OP01-001 [L/P] parallel'],
    [778, { finish: 'parallel', condition: null, amount: '2345' }, 'title:OP02-085[OP04] [SP] parallel'],
    [1555, { finish: 'parallel', condition: 'A-', amount: '9876' }, 'title:OP01-016[OP05] [SP] parallel'],
    [15693, { finish: 'parallel', condition: 'PSA10', amount: '4567' }, 'title:OP16-034 [R/P] parallel'],
    // Sold out (在庫なし) still lists the shop's price; the page has no purchase form.
    [12000, { finish: 'parallel', condition: 'PSA10', amount: '6789' }, 'title:OP06-047 [SP] parallel'],
  ] as const)('keeps parallel, special and reprint pages ambiguous rather than guess a printing (%s)', (id, fields, evidence) => {
    const result = one(page(id));
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({ ...fields, sku: null, setCode: null, mappingStatus: 'ambiguous', language: 'ja', metric: 'sell', currency: 'JPY' });
    // The printed set is kept as evidence even where no SKU is assigned; a reprint names its original set.
    expect(result.observations[0]!.sourceSetKey).toBe(/^title:([A-Z0-9]+)-/.exec(evidence)![1]);
    expect(result.quarantine).toEqual([{ sourceProductId: `www.cardrush-op.jp/product/${id}`, reason: 'ambiguous-crosswalk-no-sku-assigned' }]);
    expect(result.productCrosswalks).toEqual([expect.objectContaining({ mappingStatus: 'ambiguous', sku: null, setCode: null, evidence, finish: 'parallel' })]);
  });

  it('takes the language from a title marker and defaults to Japanese', () => {
    // Edit: an English marker on the 15600 excerpt's title.
    const english = html(15600).replace('<title>〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}</title>', '<title>お玉(英語版)【UC】{OP01-006}</title>');
    const result = one(page(15600, english));
    expect(result.observations[0]).toMatchObject({ language: 'en', condition: null, sku: 'op-op01-006-en', mappingStatus: 'exact' });
    expect(result.productCrosswalks[0]).toMatchObject({ language: 'en', evidence: 'title:OP01-006 [UC] en' });
    const conflicting = html(15600).replace('お玉(illust:sowsow)', 'お玉(英語版/韓国語版)');
    expect(one(page(15600, conflicting)).quarantine).toEqual([{ sourceProductId: 'www.cardrush-op.jp/product/15600', field: 'language', reason: 'conflicting-language-markers' }]);
  });

  it('quarantines a page without the structured price; there is no first-yen fallback', () => {
    // Edit: the selling_price block removed, a yen amount left in free text.
    const missing = html(1555).replace(/<p class="selling_price">[\s\S]*?<\/p>/, '<p>参考価格 9,876円</p>');
    const result = one(page(1555, missing));
    expect(result.observations).toEqual([]);
    expect(result.productCrosswalks).toEqual([]);
    expect(result.setCrosswalks).toEqual([]);
    expect(result.quarantine).toEqual([{ sourceProductId: 'www.cardrush-op.jp/product/1555', field: 'sell', reason: 'no-structured-price' }]);
  });

  it.each([
    ['0円', 'invalid-or-zero-price'], ['', 'unparseable-structured-price'], ['9,87円', 'unparseable-structured-price'],
    ['9.876円', 'unparseable-structured-price'], ['¥9,876', 'unparseable-structured-price'], ['9,976円', 'structured-prices-disagree'],
  ])('never stores a zero, malformed or contradicted price (%s)', (figure, reason) => {
    // Edit: the 1555 figure replaced; its product:price meta still says 9876.
    const edited = html(1555).replace('<span class="figure" id="pricech">9,876円</span>', `<span class="figure" id="pricech">${figure}</span>`);
    expect(one(page(1555, edited))).toMatchObject({ observations: [], quarantine: [{ field: 'sell', reason }] });
  });

  it('does not collapse a page that lists several prices or variations to one of them', () => {
    // Edit: a second stated condition with its own selling_price block.
    const block = /<div class="detail_section price">[\s\S]*?<\/div>\s*<\/div>/.exec(html(15600))![0];
    const several = html(15600).replace(block, `${block}\n<span class="goods_name">〔状態B〕</span>${block.replace('123円', '321円')}`);
    expect(one(page(15600, several))).toMatchObject({ observations: [], quarantine: [{ field: 'sell', reason: 'multiple-structured-prices' }] });
    // Edit: the shop platform's own variation flag set, however it is spaced.
    for (const flag of ['pConf.variationFlag = true;', 'pConf.variationFlag=true;', 'pConf.variProductFlag  =  true ;', 'pConf.variationFlag =\ttrue\n;']) {
      const variation = html(15600).replace('pConf.variationFlag = false;', flag);
      expect(one(page(15600, variation))).toMatchObject({ observations: [], quarantine: [{ field: 'sell', reason: 'variation-product-unreviewed' }] });
    }
    // A false flag, spaced either way, is not a variation.
    expect(one(page(15600, html(15600).replace('pConf.variationFlag = false;', 'pConf.variationFlag=false;'))).observations).toHaveLength(1);
  });

  it('records condition only where stated, and quarantines a marker it cannot read', () => {
    expect(one(page(169)).observations[0]?.condition).toBeNull();
    for (const marker of ['〔未開封〕', '〔状態A-〕〔PSA10鑑定済〕']) {
      const edited = html(15600).replace('<title>〔状態C〕', `<title>${marker}`);
      expect(one(page(15600, edited)).quarantine).toEqual([{ sourceProductId: 'www.cardrush-op.jp/product/15600', field: 'condition', reason: 'unrecognised-condition-marker' }]);
    }
  });

  it('quarantines a page that is not a single card', () => {
    // Edit: a supply listing title (no card identity, no rarity).
    const supply = html(15600).replace(/<title>[^<]*<\/title>/, '<title>ワンピースカードゲーム オフィシャルプレイマット</title>');
    expect(one(page(15600, supply))).toMatchObject({ observations: [], quarantine: [{ reason: 'not-a-single-card' }] });
  });

  it('host-qualifies source product IDs and refuses duplicates or unreviewed URLs', () => {
    expect(cardRushSourceProductId('https://www.cardrush-op.jp/product/1234')).toBe('www.cardrush-op.jp/product/1234');
    for (const url of ['http://www.cardrush-op.jp/product/1', 'https://cardrush-op.jp/product/1', 'https://www.cardrush-op.jp/product/01', 'https://www.cardrush-op.jp/product/1?x=1',
      'https://www.cardrush-mtg.jp/product/1', 'https://www.cardrush-op.jp.example/product/1', 'https://www.cardrush-op.jp/product-group/1']) expect(cardRushSourceProductId(url)).toBeNull();
    const result = parseCardRushMemberPrices([page(15600), page(15600), page(15600, html(15600), 'https://www.cardrush-op.jp.example/product/15600')]);
    expect(result.observations).toHaveLength(1);
    expect(result.quarantine.map(entry => entry.reason)).toEqual(['invalid-or-duplicate-source-product', 'invalid-or-duplicate-source-product']);
  });

  it('emits a set crosswalk only from a page whose identity the SKU builder accepts', () => {
    // Stand-in for a title the builder refuses: the parser's patterns and the
    // builder's agree today, and the builder is the one that decides.
    vi.mocked(buildSku).mockImplementationOnce(() => { throw new SkuBuildError('Set segment must match [a-z0-9]+: OP01', 'set'); });
    const refused = one(page(15600));
    expect(refused.setCrosswalks).toEqual([]);
    expect(refused.productCrosswalks).toEqual([expect.objectContaining({ mappingStatus: 'ambiguous', sku: null, setCode: null })]);
    expect(refused.observations[0]).toMatchObject({ mappingStatus: 'ambiguous', sku: null, setCode: null, sourceSetKey: 'OP01' });
    // A parallel page, which gets no SKU, still names its set once the builder accepts its identity.
    expect(one(page(169)).setCrosswalks).toEqual([{ sourceSetKey: 'OP01', game: 'one-piece', setCode: 'op01', evidence: 'title-set:OP01' }]);
  });

  it('lands other hosts unmapped until their title grammar is reviewed', () => {
    const result = one(page(15600, html(15600), 'https://www.cardrush-db.jp/product/15600'));
    expect(result.observations[0]).toMatchObject({ sourceProductId: 'www.cardrush-db.jp/product/15600', game: 'dragon-ball', sku: null, setCode: null, mappingStatus: 'unmapped', sourceSetKey: 'OP01' });
    expect(result.productCrosswalks).toEqual([]);
    expect(result.setCrosswalks).toEqual([]);
  });

  it('emits only observations the contract, release policy and crosswalk rule accept', () => {
    const result = parseCardRushMemberPrices([169, 778, 1555, 12000, 15600, 15693].map(id => page(id)));
    expect(result.observations).toHaveLength(6);
    for (const observation of result.observations) {
      expect(() => assertPriceObservationValues(observation)).not.toThrow();
      expect(priceUseAllowed('cardrush', 'member-display', observation.evidenceVersion)).toBe(true);
      expect(priceUseAllowed('cardrush', 'member-api', observation.evidenceVersion)).toBe(false);
    }
    for (const link of result.productCrosswalks.filter(link => link.mappingStatus === 'exact')) {
      expect(resolvePriceCrosswalk('cardrush', link.sourceProductId, link.finish, link.language, link.game, [{ source: 'cardrush', ...link, sku: link.sku!, setCode: link.setCode! }]).mappingStatus).toBe('exact');
    }
    expect(result.setCrosswalks.map(set => set.sourceSetKey)).toEqual(['OP01', 'OP02', 'OP06', 'OP16']);
    // Forward-only: a page read before the permission is not an observation.
    expect(parseCardRushMemberPrices([{ ...page(15600), retrievedAt: '2026-10-27T23:59:59.000Z' }]).quarantine).toEqual([{ sourceProductId: 'www.cardrush-op.jp/product/15600', reason: 'invalid-observation' }]);
    expect(Date.parse(PAGE_SOURCE_COLLECTION_START)).toBeLessThanOrEqual(Date.parse(readAt));
  });
});

describe('CardRush robots.txt rules', () => {
  it('answers to its product token, the token as letters, and its collector name, all in its User-Agent', () => {
    for (const agent of CARDRUSH_ROBOTS_AGENTS) expect(IDENTIFIED_UA.toLowerCase()).toContain(agent);
    expect(cardRushRobotsAllow('User-agent: cambridgetcg.com/1.0\nDisallow: /product/', '/product/1')).toBe(false);
    expect(cardRushRobotsAllow('User-agent: cambridge\nDisallow: /product/', '/product/1')).toBe(true);
  });

  it('reads groups, wildcards, end anchors and the longest rule as RFC 9309 does', () => {
    const robots = '\uFEFFUser-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /product/*/reviews\nDisallow: /product/9$\nAllow: /product/9$ \n# Disallow: /product/\nDisallow: /search?q=\n';
    expect(cardRushRobotsAllow(robots, '/product/')).toBe(true);
    expect(cardRushRobotsAllow(robots, '/product/12/reviews')).toBe(false);
    // Equal length: allow wins.
    expect(cardRushRobotsAllow(robots, '/product/9')).toBe(true);
    expect(cardRushRobotsAllow(robots, '/search?q=x')).toBe(false);
    // A rule's punctuation is literal, not a pattern.
    expect(cardRushRobotsAllow('User-agent: *\nDisallow: /product/1.5', '/product/105')).toBe(true);
    // Rules before any user-agent line belong to no group.
    expect(cardRushRobotsAllow('Disallow: /\nUser-agent: *\nAllow: /', '/product/')).toBe(true);
    expect(cardRushRobotsAllow('', '/product/')).toBe(true);
  });

  // A run asks about every URL a host's sitemap lists (about 15,000 on
  // www.cardrush-op.jp): the rules are parsed and compiled once, not per URL.
  it('compiles each rule once, however many paths it is asked about, and answers as a single question does', () => {
    const robots = 'User-agent: cambridgetcg\nDisallow: /product/*/reviews\n\nUser-agent: *\nDisallow: /product/9$\nAllow: /product/9$\nDisallow: /search\n';
    const paths = ['/product/', '/product/9', '/product/90', '/product/12/reviews', '/search?q=x', '/sitemap.xml'];
    let built = 0;
    vi.stubGlobal('RegExp', new Proxy(RegExp, { construct(target, args) { built += 1; return Reflect.construct(target, args); } }));
    try {
      const allowed = compileCardRushRobots(robots);
      expect(built).toBe(4);
      for (let id = 0; id < 15_000; id += 1) allowed(`/product/${id}`);
      expect(paths.map(allowed)).toEqual([true, true, true, false, false, true]);
      expect(built).toBe(4);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(paths.map(path => cardRushRobotsAllow(robots, path))).toEqual(paths.map(compileCardRushRobots(robots)));
  });
});

describe('CardRush page acquisition', () => {
  const sitemap = fixture('cardrush-op-sitemap.xml');
  const listed = ['https://www.cardrush-op.jp/product/1', 'https://www.cardrush-op.jp/product/2', 'https://www.cardrush-op.jp/product/3', 'https://www.cardrush-op.jp/product/169',
    'https://www.cardrush-op.jp/product/778', 'https://www.cardrush-op.jp/product/1555', 'https://www.cardrush-op.jp/product/12000', 'https://www.cardrush-op.jp/product/15600', 'https://www.cardrush-op.jp/product/15693'];
  const htmlResponse = (text: string, init: ResponseInit = {}) => new Response(text, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' }, ...init });
  type Call = { url: string; at: number; headers: Headers; init: RequestInit & { dispatcher?: unknown } };
  function upstream(pages: Record<string, () => Response>, sitemapResponse = () => new Response(sitemap, { status: 200, headers: { 'content-type': 'text/xml; charset=UTF-8' } }),
    robotsResponse = () => new Response(ROBOTS, { status: 200, headers: { 'content-type': 'text/plain' } })) {
    const calls: Call[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, at: Date.now(), headers: new Headers(init.headers), init });
      if (url === 'https://www.cardrush-op.jp/robots.txt') return robotsResponse();
      if (url === 'https://www.cardrush-op.jp/sitemap.xml') return sitemapResponse();
      const id = Number(url.split('/').pop());
      const known = [169, 778, 1555, 12000, 15600, 15693].includes(id);
      return (pages[url] ?? (() => known ? htmlResponse(html(id)) : new Response('', { status: 404 })))();
    });
    return { calls, fetch: fetch as unknown as typeof globalThis.fetch, mock: fetch };
  }
  async function run(input: Parameters<typeof acquireCardRushMemberPrices>[1], fetch: typeof globalThis.fetch) {
    const pending = acquireCardRushMemberPrices({ fetch }, input);
    await vi.runAllTimersAsync();
    return pending;
  }
  const choose = (urls: string[]) => vi.fn(async (_available: readonly string[], capacity: number) => urls.slice(0, capacity));
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(new Date(readAt)); vi.mocked(createFetcher).mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it.each([MEMBER_PRICE_REVIEW_VERSION, TCGPLAYER_EVIDENCE_VERSION, '', 'cardrush/2026-10-28.2'])('refuses before any network work without the CardRush evidence version (%j)', async evidenceVersion => {
    const { fetch, mock } = upstream({});
    const picker = choose(listed);
    await expect(acquireCardRushMemberPrices({ fetch }, { evidenceVersion, host: 'www.cardrush-op.jp', budgetMs: 60_000, choose: picker })).rejects.toThrow('cardrush-evidence-version-required');
    expect(mock).not.toHaveBeenCalled(); expect(picker).not.toHaveBeenCalled(); expect(createFetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['www.cardrush-mtg.jp', 60_000, 'unreviewed-cardrush-host'], ['cardrush-op.jp', 60_000, 'unreviewed-cardrush-host'], ['__proto__', 60_000, 'unreviewed-cardrush-host'],
    ['www.cardrush-op.jp', CARDRUSH_MAX_BUDGET_MS + 1, 'invalid-cardrush-budget'], ['www.cardrush-op.jp', 0, 'invalid-cardrush-budget'],
    ['www.cardrush-op.jp', -1, 'invalid-cardrush-budget'], ['www.cardrush-op.jp', 1.5, 'invalid-cardrush-budget'],
  ] as const)('refuses an unreviewed host or budget before any network work (%s, %s)', async (host, budgetMs, code) => {
    const { fetch, mock } = upstream({});
    await expect(acquireCardRushMemberPrices({ fetch }, { evidenceVersion: CARDRUSH_EVIDENCE_VERSION, host, budgetMs, choose: choose(listed) })).rejects.toThrow(code);
    expect(mock).not.toHaveBeenCalled(); expect(createFetcher).not.toHaveBeenCalled();
  });

  it('reads robots.txt and the sitemap once, then chosen pages directly, identified, at most one request per two seconds', async () => {
    const { calls, fetch } = upstream({});
    const picker = choose(['https://www.cardrush-op.jp/product/15600', 'https://www.cardrush-op.jp/product/169', 'https://www.cardrush-op.jp/product/1555']);
    const result = await run({ evidenceVersion: CARDRUSH_EVIDENCE_VERSION, host: 'www.cardrush-op.jp', budgetMs: 60_000, choose: picker }, fetch);
    // robots.txt at 0 s and the sitemap at 2 s leave 58 s: 29 pages.
    expect(picker).toHaveBeenCalledWith(listed, 29);
    expect(result).toMatchObject({ host: 'www.cardrush-op.jp', game: 'one-piece', sitemapProducts: listed.length, robotsDisallowed: 0, requested: 3, unavailable: null });
    expect(result.parsed.observations.map(row => row.sourceProductId)).toEqual(['www.cardrush-op.jp/product/15600', 'www.cardrush-op.jp/product/169', 'www.cardrush-op.jp/product/1555']);
    expect(calls.map(call => call.url)).toEqual(['https://www.cardrush-op.jp/robots.txt', 'https://www.cardrush-op.jp/sitemap.xml', 'https://www.cardrush-op.jp/product/15600', 'https://www.cardrush-op.jp/product/169', 'https://www.cardrush-op.jp/product/1555']);
    for (let index = 1; index < calls.length; index += 1) expect(calls[index]!.at - calls[index - 1]!.at).toBeGreaterThanOrEqual(2000);
    for (const call of calls) {
      expect(call.headers.get('user-agent')).toBe(IDENTIFIED_UA);
      expect([...call.headers.keys()].filter(name => /^sec-|^upgrade-insecure/i.test(name))).toEqual([]);
      expect(call.init.redirect).toBe('manual');
      expect(call.init.dispatcher).toBeUndefined();
    }
    // One fetcher for the host: no proxy options, no retries, the collector's own rate.
    expect(createFetcher).toHaveBeenCalledTimes(1);
    const [context, meta, options] = vi.mocked(createFetcher).mock.calls[0]!;
    expect(options).toEqual({ max_retries: 0 });
    expect(context.rate_limit).toEqual(CARDRUSH_PAGE_RATE);
    expect(meta).toBe(cardrush.meta);
    const made = vi.mocked(createFetcher).mock.results[0]!.value as ReturnType<typeof createFetcher>;
    expect(made.via_proxy).toBeNull(); expect(made.via_proxy_label).toBeNull();
  });

  it('holds the collector rate even when the caller asks for a faster one', async () => {
    const { calls, fetch } = upstream({});
    const pending = acquireCardRushMemberPrices({ fetch, rate_limit: { rps: 100, burst: 100 } }, { evidenceVersion: CARDRUSH_EVIDENCE_VERSION, host: 'www.cardrush-op.jp', budgetMs: 60_000, choose: choose(listed.slice(3, 6)) });
    await vi.runAllTimersAsync();
    await pending;
    expect(calls).toHaveLength(5);
    for (let index = 1; index < calls.length; index += 1) expect(calls[index]!.at - calls[index - 1]!.at).toBeGreaterThanOrEqual(2000);
  });

  it.each([
    ['403', () => new Response('denied', { status: 403 }), 'http-403'],
    ['429', () => new Response('slow down', { status: 429, headers: { 'retry-after': '60' } }), 'http-429'],
    ['challenge header', () => new Response('<html></html>', { status: 403, headers: { 'cf-mitigated': 'challenge' } }), 'challenge-challenge'],
    // Edit: Cloudflare's interstitial title on an otherwise successful answer.
    ['challenge page', () => htmlResponse('<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>'), 'challenge-page'],
  ])('stops the host for the run when it refuses the identified collector (%s)', async (_label, refused, reason) => {
    const { calls, fetch } = upstream({ 'https://www.cardrush-op.jp/product/169': refused });
    const result = await run({ evidenceVersion: CARDRUSH_EVIDENCE_VERSION, host: 'www.cardrush-op.jp', budgetMs: 60_000, choose: choose(['https://www.cardrush-op.jp/product/15600', 'https://www.cardrush-op.jp/product/169', 'https://www.cardrush-op.jp/product/1555']) }, fetch);
    expect(result.unavailable).toEqual({ code: 'SOURCE_UNAVAILABLE', reason });
    expect(result.requested).toBe(2);
    expect(calls.map(call => call.url)).not.toContain('https://www.cardrush-op.jp/product/1555');
    // What was read before the refusal is kept; the refused page is not a row.
    expect(result.parsed.observations.map(row => row.sourceProductId)).toEqual(['www.cardrush-op.jp/product/15600']);
    expect(result.parsed.quarantine).toEqual([]);
  });

  it('reports a refused sitemap without choosing or requesting any page', async () => {
    const picker = choose(listed);
    const { calls, fetch } = upstream({}, () => new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } }));
    const result = await run({ evidenceVersion: CARDRUSH_EVIDENCE_VERSION, host: 'www.cardrush-op.jp', budgetMs: 60_000, choose: picker }, fetch);
    expect(result).toMatchObject({ requested: 0, sitemapProducts: 0, unavailable: { code: 'SOURCE_UNAVAILABLE', reason: 'sitemap-challenge-challenge' } });
    expect(calls.map(call => call.url)).toEqual(['https://www.cardrush-op.jp/robots.txt', 'https://www.cardrush-op.jp/sitemap.xml']); expect(picker).not.toHaveBeenCalled();
  });

  it('quarantines gone and redirected pages without following the redirect', async () => {
    const { calls, fetch } = upstream({
      'https://www.cardrush-op.jp/product/1': () => new Response('', { status: 404 }),
      'https://www.cardrush-op.jp/product/2': () => new Response(null, { status: 301, headers: { location: 'https://www.cardrush-op.jp/' } }),
    });
    const result = await run({ evidenceVersion: CARDRUSH_EVIDENCE_VERSION, host: 'www.cardrush-op.jp', budgetMs: 60_000, choose: choose(listed.slice(0, 2)) }, fetch);
    expect(result.unavailable).toBeNull();
    expect(result.parsed.quarantine).toEqual([{ sourceProductId: 'www.cardrush-op.jp/product/1', reason: 'page-not-found' }, { sourceProductId: 'www.cardrush-op.jp/product/2', reason: 'page-redirected' }]);
    expect(result.parsed.sourceRows).toBe(2);
    expect(calls.map(call => call.url)).not.toContain('https://www.cardrush-op.jp/');
  });

  it('sizes the choice to the budget and refuses a choice outside the sitemap or over capacity', async () => {
    const { fetch } = upstream({});
    const picker = choose(listed);
    const result = await run({ evidenceVersion: CARDRUSH_EVIDENCE_VERSION, host: 'www.cardrush-op.jp', budgetMs: 9_000, choose: picker }, fetch);
    // 9 s less robots.txt and the sitemap, two seconds apart: 7 s, three pages.
    expect(picker).toHaveBeenCalledWith(listed, 3);
    expect(result.requested).toBeLessThanOrEqual(3);
    for (const chosen of [['https://www.cardrush-op.jp/product/99999'], [listed[0]!, listed[0]!], listed.concat(listed)]) {
      const pending = acquireCardRushMemberPrices({ fetch }, { evidenceVersion: CARDRUSH_EVIDENCE_VERSION, host: 'www.cardrush-op.jp', budgetMs: 9_000, choose: async () => chosen });
      const settled = pending.catch(error => error);
      await vi.runAllTimersAsync();
      expect(await settled).toMatchObject({ message: 'cardrush-selection-outside-sitemap' });
    }
  });

  const robotsRun = async (robots: () => Response, picker = choose(listed)) => {
    const { calls, fetch } = upstream({}, undefined, robots);
    const result = await run({ evidenceVersion: CARDRUSH_EVIDENCE_VERSION, host: 'www.cardrush-op.jp', budgetMs: 60_000, choose: picker }, fetch);
    return { result, calls: calls.map(call => call.url), picker };
  };
  const text = (body: string) => () => new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } });

  it.each([
    ['for every crawler', 'User-agent: *\nDisallow: /product/\n'],
    ['for every crawler, by wildcard', 'User-agent: *\nDisallow: /*product\n'],
    ['for the whole site', 'User-agent: *\nDisallow: /\n'],
    ['for this collector by product token', 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: cambridgetcg.com\nDisallow: /product\n\nUser-agent: *\nAllow: /\n'],
    ['for this collector by name, any case', '# ours\nUser-Agent: CardRush-Collector/1.0\nDisallow: /product/\n'],
    ['for this collector though everyone else may', 'User-agent: *\nAllow: /product/\n\nUser-agent: cambridgetcg\nDisallow: /\n'],
  ])('stops before the sitemap when robots.txt disallows product pages %s', async (_label, robots) => {
    const { result, calls, picker } = await robotsRun(text(robots));
    expect(result).toMatchObject({ requested: 0, sitemapProducts: 0, unavailable: { code: 'SOURCE_UNAVAILABLE', reason: 'robots-disallows-product-pages' } });
    expect(calls).toEqual(['https://www.cardrush-op.jp/robots.txt']);
    expect(picker).not.toHaveBeenCalled();
  });

  it.each([
    ['the recorded rules, which name other crawlers only', ROBOTS],
    ['a longer allow over a shorter disallow', 'User-agent: *\nDisallow: /\nAllow: /product/\nAllow: /sitemap.xml\n'],
    ['an empty disallow', 'User-agent: *\nDisallow:\n'],
    ['rules for another path', 'User-agent: *\nDisallow: /cart\nDisallow: /*?\n'],
    ['no robots.txt at all (404)', null],
  ])('reads on under %s', async (_label, robots) => {
    const { result, calls } = await robotsRun(robots === null ? () => new Response('', { status: 404 }) : text(robots));
    expect(result.unavailable).toBeNull();
    expect(result.robotsDisallowed).toBe(0);
    expect(calls.slice(0, 2)).toEqual(['https://www.cardrush-op.jp/robots.txt', 'https://www.cardrush-op.jp/sitemap.xml']);
    expect(result.requested).toBe(listed.length);
  });

  it('compiles robots.txt once per run, not once per listed URL', async () => {
    const many = Array.from({ length: 15_000 }, (_, index) => `https://www.cardrush-op.jp/product/${index + 1}`);
    const big = `<?xml version="1.0" encoding="UTF-8"?><urlset>${many.map(url => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;
    const regexpsBuilt = async (sitemapXml: string) => {
      let built = 0;
      const { fetch } = upstream({}, () => new Response(sitemapXml, { status: 200, headers: { 'content-type': 'text/xml' } }), text('User-agent: *\nDisallow: /product/7$\nDisallow: /cart\n'));
      vi.stubGlobal('RegExp', new Proxy(RegExp, { construct(target, args) { built += 1; return Reflect.construct(target, args); } }));
      try {
        const result = await run({ evidenceVersion: CARDRUSH_EVIDENCE_VERSION, host: 'www.cardrush-op.jp', budgetMs: 60_000, choose: async () => [] }, fetch);
        return { built, result };
      } finally {
        vi.unstubAllGlobals();
      }
    };
    const small = await regexpsBuilt(sitemap);
    const large = await regexpsBuilt(big);
    expect(large.result).toMatchObject({ sitemapProducts: 15_000, robotsDisallowed: 1, requested: 0, unavailable: null });
    expect(large.built).toBe(small.built);
  });

  it('never offers a listed page robots.txt disallows', async () => {
    const offered = vi.fn(async (available: readonly string[], capacity: number) => available.slice(0, capacity));
    const { result, calls, picker } = await robotsRun(text('User-agent: *\nDisallow: /product/15600$\nDisallow: /product/1$\n'), offered);
    expect(picker.mock.calls[0]![0]).toEqual(listed.filter(url => !url.endsWith('/product/15600') && !url.endsWith('/product/1')));
    expect(result).toMatchObject({ sitemapProducts: listed.length, robotsDisallowed: 2, unavailable: null });
    expect(calls).not.toContain('https://www.cardrush-op.jp/product/15600');
    expect(calls).not.toContain('https://www.cardrush-op.jp/product/1');
  });

  it.each([
    ['403', () => new Response('denied', { status: 403 }), 'robots-http-403'],
    ['429', () => new Response('slow down', { status: 429 }), 'robots-http-429'],
    ['503', () => new Response('down', { status: 503 }), 'robots-http-503'],
    ['500', () => new Response('error', { status: 500 }), 'robots-http-500'],
    ['redirect, not followed', () => new Response(null, { status: 301, headers: { location: 'https://cdn.example/robots.txt' } }), 'robots-http-301'],
    ['challenge header', () => new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } }), 'robots-challenge-challenge'],
    ['challenge page', () => new Response('<html><head><title>Just a moment...</title></head></html>', { status: 200 }), 'robots-challenge-page'],
    ['oversized', () => new Response('#'.repeat(512 * 1024 + 1), { status: 200 }), 'robots-too-large'],
    ['network failure', () => { throw new TypeError('fetch failed'); }, 'robots-fetch-error'],
    ['a sitemap it disallows', () => new Response('User-agent: *\nDisallow: /sitemap.xml\n', { status: 200 }), 'robots-disallows-sitemap'],
  ])('stops when robots.txt cannot be read or forbids the sitemap (%s)', async (_label, robots, reason) => {
    const { result, calls, picker } = await robotsRun(robots);
    expect(result.unavailable).toEqual({ code: 'SOURCE_UNAVAILABLE', reason });
    expect(calls).toEqual(['https://www.cardrush-op.jp/robots.txt']);
    expect(picker).not.toHaveBeenCalled();
  });

  it('reads robots.txt through the host bucket, identified, and does not follow it anywhere', async () => {
    const { calls, fetch } = upstream({});
    await run({ evidenceVersion: CARDRUSH_EVIDENCE_VERSION, host: 'www.cardrush-op.jp', budgetMs: 60_000, choose: choose([]) }, fetch);
    const [robots, sitemapCall] = calls;
    expect(robots).toMatchObject({ url: 'https://www.cardrush-op.jp/robots.txt' });
    expect(robots!.headers.get('user-agent')).toBe(IDENTIFIED_UA);
    expect(robots!.init.redirect).toBe('manual');
    expect(robots!.init.dispatcher).toBeUndefined();
    expect(sitemapCall!.at - robots!.at).toBeGreaterThanOrEqual(2000);
    // The one fetcher, so the one bucket.
    expect(createFetcher).toHaveBeenCalledTimes(1);
  });

  it('collects the six confirmed hosts and nothing else', () => {
    expect(Object.keys(CARDRUSH_COLLECTOR_HOSTS)).toEqual(['www.cardrush-op.jp', 'www.cardrush-pokemon.jp', 'www.cardrush-db.jp', 'www.cardrush-digimon.jp', 'www.cardrush-vanguard.jp', 'www.cardrush-bs.jp']);
    expect(Object.values(CARDRUSH_COLLECTOR_HOSTS).map(host => host.code)).toEqual([...cardrush.meta.games]);
    expect(cardrush.meta.rate_limit).toEqual(CARDRUSH_PAGE_RATE);
    expect(cardrush.meta.user_agent_suffix).toContain(`permission ${CARDRUSH_EVIDENCE_VERSION}`);
  });
});
