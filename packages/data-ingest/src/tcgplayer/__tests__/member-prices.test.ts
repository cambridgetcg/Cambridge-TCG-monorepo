import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPriceObservationValues } from '@cambridge-tcg/data-spec';
import { artifactDigest, CARDRUSH_EVIDENCE_VERSION, MEMBER_PRICE_REVIEW_VERSION, resolvePriceCrosswalk, TCGPLAYER_EVIDENCE_VERSION } from '../../member-prices';
import { createFetcher, type Fetcher } from '../../http';
import { tcgplayer } from '../index';
import {
  acquireTcgplayerPriceGuide, createTcgplayerFetcher, fetchTcgplayerCardsProductType, fetchTcgplayerSets, parseTcgplayerPriceGuide, parseTcgplayerSets,
  TCGPLAYER_CROSSWALK_VERSION, TCGPLAYER_PRICE_GUIDE_PARSER, TCGPLAYER_PRODUCT_LINES, TcgplayerUnavailableError, type TcgplayerSet,
} from '../member-prices';

// Trimmed responses read 2026-10-28; prices in them are synthetic stand-ins.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as Record<string, unknown> & { result: Record<string, unknown>[] };
const onePiece = TCGPLAYER_PRODUCT_LINES.find(line => line.slug === 'one-piece-card-game')!;
const japan = TCGPLAYER_PRODUCT_LINES.find(line => line.slug === 'pokemon-japan')!;
const magic = TCGPLAYER_PRODUCT_LINES.find(line => line.slug === 'magic')!;
const pokemon = TCGPLAYER_PRODUCT_LINES.find(line => line.slug === 'pokemon')!;
const romanceDawn = parseTcgplayerSets(onePiece, fixture('set-names-68.json')).find(set => set.setId === 3188)!;
const tripletBeat = parseTcgplayerSets(japan, fixture('set-names-85.json')).find(set => set.setId === 23598)!;
const readAt = '2026-10-28T15:00:00.000Z';
const guideUrl = 'https://infinite-api.tcgplayer.com/priceguide/set/3188/cards/?rows=5000&productTypeID=110';
const bytes = (body: unknown) => new TextEncoder().encode(JSON.stringify(body));
function parse(body: unknown = fixture('price-guide-3188-op01.json'), set: TcgplayerSet = romanceDawn, line = onePiece, retrievedAt = readAt) {
  return parseTcgplayerPriceGuide({ line, set, bytes: bytes(body), sourceUrl: guideUrl, retrievedAt });
}
/** One fixture row, changed; the rest of the trimmed guide stays as read. */
function withRow(change: Record<string, unknown>, productId = 454591, condition = 'Near Mint') {
  const body = fixture('price-guide-3188-op01.json');
  body.result = body.result.map(row => row.productID === productId && row.condition === condition ? { ...row, ...change } : row);
  return body;
}
const observation = (result: ReturnType<typeof parse>, productId: number, condition = 'near-mint') =>
  result.parsed.observations.find(row => row.sourceProductId === `tcgplayer:${productId}` && row.condition === condition);
function fakeFetcher(responses: (() => Response)[]): Fetcher & { urls: string[]; inits: (RequestInit | undefined)[] } {
  const urls: string[] = [], inits: (RequestInit | undefined)[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => { urls.push(url); inits.push(init); const next = responses.shift(); if (!next) throw new Error('unexpected request'); return next(); });
  return Object.assign(f, { urls, inits, count: 0, via_proxy: null, via_proxy_label: null }) as unknown as Fetcher & { urls: string[]; inits: (RequestInit | undefined)[] };
}
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

describe('TCGplayer price-guide rows', () => {
  it('reads Market Price per printing and condition, with source time the instant of reading', () => {
    const result = parse();
    expect(result.parsed).toMatchObject({ sourceRows: 12, missingPrices: 0 });
    expect(result.parsed.observations).toHaveLength(12);
    expect(observation(result, 454591)).toMatchObject({
      source: 'tcgplayer', sourceProductId: 'tcgplayer:454591', sku: 'op-op01-064-en', setCode: 'op01', mappingStatus: 'exact', game: 'one-piece', productName: 'Alvida',
      granularity: 'printing', finish: 'normal', language: 'en', condition: 'near-mint', metric: 'market', amount: '1.5', currency: 'USD', underlyingMarket: 'tcgplayer',
      sourceUpdatedAt: readAt, retrievedAt: readAt, sourceUrl: guideUrl, parserVersion: TCGPLAYER_PRICE_GUIDE_PARSER, crosswalkVersion: TCGPLAYER_CROSSWALK_VERSION,
      evidenceVersion: TCGPLAYER_EVIDENCE_VERSION, catalogSourceUrl: null, quality: 'accepted', sourceSetKey: '3188',
    });
    // Every row names its set by TCGplayer's own set ID, mapped or not.
    expect(new Set(result.parsed.observations.map(row => row.sourceSetKey))).toEqual(new Set(['3188']));
    expect(observation(result, 456059)).toMatchObject({ mappingStatus: 'unmapped', setCode: null, sourceSetKey: '3188' });
    expect(observation(result, 454591, 'lightly-played')).toMatchObject({ amount: '0.25', sku: 'op-op01-064-en' });
    expect(new Set(result.parsed.observations.map(row => row.artifactSha256))).toEqual(new Set([artifactDigest(bytes(fixture('price-guide-3188-op01.json')))]));
    for (const row of result.parsed.observations) expect(() => assertPriceObservationValues(row)).not.toThrow();
    // TCGplayer's own number and lowest listing are not collected.
    expect(result.parsed.observations.map(row => row.metric)).toEqual(Array(12).fill('market'));
  });

  it('reads the grade apart from its finish words: "Near Mint Foil" on a Foil printing is near-mint, foil', () => {
    const result = parse();
    expect(observation(result, 454664)).toMatchObject({ finish: 'foil', condition: 'near-mint', sku: 'op-op01-120-en', mappingStatus: 'exact' });
    expect(observation(result, 454664, 'lightly-played')).toMatchObject({ finish: 'foil', amount: '66.5' });
  });

  it.each([[null, 'missing-market-price'], [undefined, 'missing-market-price'], [0, 'invalid-or-zero-price'], [-1.5, 'invalid-or-zero-price'], ['', 'invalid-or-zero-price'], [1e-7, 'invalid-or-zero-price']])(
    'quarantines a market price of %s and never stores a zero', (marketPrice, reason) => {
      const result = parse(withRow({ marketPrice }));
      expect(observation(result, 454591)).toBeUndefined();
      expect(result.parsed.observations).toHaveLength(11);
      expect(result.parsed.quarantine).toContainEqual({ sourceProductId: 'tcgplayer:454591', field: 'marketPrice', reason });
      expect(result.parsed.missingPrices).toBe(reason === 'missing-market-price' ? 1 : 0);
      expect(result.parsed.observations.every(row => Number(row.amount) > 0)).toBe(true);
    });

  it('keeps a whole-dollar price as written', () => {
    expect(observation(parse(withRow({ marketPrice: 580 })), 454591)!.amount).toBe('580');
  });

  it('excludes sealed product and rows from another product line', () => {
    const sealed = parse(withRow({ type: 'Sealed Products' }));
    expect(observation(sealed, 454591)).toBeUndefined();
    expect(sealed.parsed.quarantine).toContainEqual({ sourceProductId: 'tcgplayer:454591', field: 'type', reason: 'not-a-single-card' });
    const other = parse(withRow({ game: 'Pokemon' }));
    expect(other.parsed.quarantine).toContainEqual({ sourceProductId: 'tcgplayer:454591', field: 'game', reason: 'unexpected-product-line' });
  });

  it.each(['Mint', 'Near Mint Holofoil', 'Near Mint - Japanese', 'Near Mint Foil', 'Excellent', ''])('quarantines the condition %j on an English Normal printing', condition => {
    const result = parse(withRow({ condition }));
    expect(observation(result, 454591)).toBeUndefined();
    expect(result.parsed.quarantine).toContainEqual({ sourceProductId: 'tcgplayer:454591', field: 'condition', reason: 'unrecognised-condition' });
  });

  it('reads Japanese grades on the pokemon-japan line, in Japanese, and maps no slash number', () => {
    const result = parse(fixture('price-guide-23598-sv1a.json'), tripletBeat, japan);
    expect(result.parsed.observations.map(row => [row.sourceProductId, row.finish, row.condition, row.language, row.game, row.mappingStatus])).toEqual([
      ['tcgplayer:568126', 'normal', 'near-mint', 'ja', 'pokemon', 'unmapped'],
      ['tcgplayer:568192', 'holofoil', 'near-mint', 'ja', 'pokemon', 'unmapped'],
    ]);
    // 003/073 names no set: no set crosswalk, no product crosswalk, no guess.
    expect(result.setCrosswalk).toBeNull();
    expect(result.productCrosswalks).toEqual([]);
    for (const row of result.parsed.observations) expect(() => assertPriceObservationValues(row)).not.toThrow();
  });

  it('quarantines duplicates, an incomplete guide and malformed rows', () => {
    const body = fixture('price-guide-3188-op01.json');
    body.result.push({ ...body.result[0]! }, 'not-a-row' as never, { ...body.result[0]!, productID: 0 }, { ...body.result[0]!, printing: 'Foil/Etched' });
    body.total = 500;
    const result = parse(body);
    expect(result.parsed.sourceRows).toBe(16);
    expect(result.parsed.observations).toHaveLength(12);
    expect(result.parsed.quarantine).toEqual(expect.arrayContaining([
      { sourceProductId: null, field: 'total', reason: 'price-guide-incomplete' },
      { sourceProductId: 'tcgplayer:454591', reason: 'invalid-or-duplicate-price-identity' },
      { sourceProductId: null, reason: 'invalid-price-row' },
      { sourceProductId: null, reason: 'invalid-or-duplicate-price-identity' },
      { sourceProductId: 'tcgplayer:454591', field: 'printing', reason: 'unrecognised-printing' },
    ]));
  });

  it('refuses a read from before the permission', () => {
    expect(() => parse(undefined, romanceDawn, onePiece, '2026-10-27T23:59:59Z')).toThrow('tcgplayer-read-before-permission');
    expect(() => parse(undefined, romanceDawn, onePiece, 'yesterday')).toThrow();
  });
});

describe('TCGplayer crosswalks from its own collector identifiers', () => {
  it('maps the set from its number prefix and the unmarked single-printing products exactly', () => {
    const result = parse();
    expect(result.setCrosswalk).toEqual({ source: 'tcgplayer', sourceSetKey: '3188', game: 'one-piece', setCode: 'op01', evidence: 'abbreviation:OP01 number-prefix:OP01 products:6', crosswalkVersion: TCGPLAYER_CROSSWALK_VERSION });
    const links = Object.fromEntries(result.productCrosswalks.map(link => [`${link.sourceProductId}/${link.finish}`, link]));
    expect(links['tcgplayer:454591/normal']).toMatchObject({ mappingStatus: 'exact', sku: 'op-op01-064-en', setCode: 'op01', language: 'en', evidence: 'number:OP01-064 printing:Normal set:3188/OP01' });
    // "(001)" restates the card's number; it is not a variant marker.
    expect(links['tcgplayer:454512/normal']).toMatchObject({ mappingStatus: 'exact', sku: 'op-op01-001-en' });
    expect(links['tcgplayer:454664/foil']).toMatchObject({ mappingStatus: 'exact', sku: 'op-op01-120-en' });
    expect(links['tcgplayer:453518/foil']).toMatchObject({ mappingStatus: 'ambiguous', sku: null, setCode: null, evidence: 'number:OP01-064 marker:(Box Topper)' });
    expect(links['tcgplayer:454513/foil']).toMatchObject({ mappingStatus: 'ambiguous', evidence: 'number:OP01-001 marker:(Parallel)' });
    expect(links['tcgplayer:454596/foil']).toMatchObject({ mappingStatus: 'ambiguous', evidence: 'number:OP01-068 printings:Foil,Normal' });
    expect(links['tcgplayer:454596/normal']).toMatchObject({ mappingStatus: 'ambiguous', evidence: 'number:OP01-068 printings:Foil,Normal' });
    // The DON!! card has no collector number: no crosswalk, unmapped.
    expect(Object.keys(links).some(key => key.startsWith('tcgplayer:456059'))).toBe(false);
    expect(observation(result, 456059)).toMatchObject({ mappingStatus: 'unmapped', sku: null });
    expect(observation(result, 453518)).toMatchObject({ mappingStatus: 'ambiguous', sku: null });
    expect(result.parsed.quarantine.filter(entry => entry.reason === 'ambiguous-crosswalk-no-sku-assigned').map(entry => entry.sourceProductId).sort())
      .toEqual(['tcgplayer:453518', 'tcgplayer:454513', 'tcgplayer:454596', 'tcgplayer:454596']);
    // Every exact link passes the same SKU rule the writers apply.
    for (const link of result.productCrosswalks.filter(link => link.mappingStatus === 'exact')) {
      expect(resolvePriceCrosswalk('tcgplayer', link.sourceProductId, link.finish, link.language, link.game, [{ ...link, sku: link.sku!, setCode: link.setCode! }]).mappingStatus).toBe('exact');
    }
  });

  it('leaves pre-release, combined and promotion sets unmapped though their numbers parse', () => {
    for (const abbreviation of ['OP01 PRE', 'OP14-EB04', 'OP-PR', '']) {
      const result = parse(undefined, { ...romanceDawn, abbreviation });
      expect(result.setCrosswalk).toBeNull();
      expect(result.productCrosswalks).toEqual([]);
      expect(result.parsed.observations.every(row => row.mappingStatus === 'unmapped')).toBe(true);
    }
  });

  it('maps nothing in a set whose numbers carry more than one prefix', () => {
    const result = parse(withRow({ number: 'OP02-001' }, 454664, 'Near Mint Foil'));
    // One product's rows now disagree; and the set has two prefixes.
    expect(result.setCrosswalk).toBeNull();
    expect(result.productCrosswalks).toEqual([]);
  });

  it('makes two unmarked products sharing a number ambiguous rather than choosing one', () => {
    const body = fixture('price-guide-3188-op01.json');
    body.result.push({ ...body.result[0]!, productID: 999001, productName: 'Alvida' });
    const result = parse(body);
    for (const id of ['tcgplayer:454591', 'tcgplayer:999001']) {
      expect(result.productCrosswalks.find(link => link.sourceProductId === id)).toMatchObject({ mappingStatus: 'ambiguous', evidence: 'number:OP01-064 shared-number' });
    }
  });
});

describe('TCGplayer acquisition', () => {
  afterEach(() => { vi.useRealTimers(); });

  it.each([MEMBER_PRICE_REVIEW_VERSION, CARDRUSH_EVIDENCE_VERSION, '', 'tcgplayer/2026-10-28.2'])('refuses every request without the permission evidence (%j)', async version => {
    const fetcher = fakeFetcher([]);
    await expect(fetchTcgplayerSets(fetcher, version, onePiece)).rejects.toThrow('tcgplayer-collection-evidence-required');
    await expect(fetchTcgplayerCardsProductType(fetcher, version, onePiece)).rejects.toThrow('tcgplayer-collection-evidence-required');
    await expect(acquireTcgplayerPriceGuide(fetcher, version, { line: onePiece, set: romanceDawn, productTypeId: 110 })).rejects.toThrow('tcgplayer-collection-evidence-required');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('collects only the lines a probe has confirmed: One Piece (68) and Pokemon Japan (85)', () => {
    expect(TCGPLAYER_PRODUCT_LINES.filter(line => line.collect).map(line => [line.slug, line.categoryId, line.gameLabel])).toEqual([
      ['one-piece-card-game', 68, 'One Piece Card Game'], ['pokemon-japan', 85, 'Pokemon Japan'],
    ]);
  });

  it('refuses lines that are listed but not collected, and a set from another line', async () => {
    const fetcher = fakeFetcher([]);
    expect(magic.collect).toBe(false);
    await expect(fetchTcgplayerSets(fetcher, TCGPLAYER_EVIDENCE_VERSION, magic)).rejects.toThrow('tcgplayer-product-line-not-collected');
    // Category 3's id and row label come from the legacy map, not a probe.
    expect(pokemon.collect).toBe(false);
    await expect(fetchTcgplayerSets(fetcher, TCGPLAYER_EVIDENCE_VERSION, pokemon)).rejects.toThrow('tcgplayer-product-line-not-collected');
    await expect(fetchTcgplayerSets(fetcher, TCGPLAYER_EVIDENCE_VERSION, { ...pokemon, collect: true })).rejects.toThrow('tcgplayer-product-line-not-collected');
    await expect(fetchTcgplayerSets(fetcher, TCGPLAYER_EVIDENCE_VERSION, { ...onePiece, categoryId: 1 })).rejects.toThrow('tcgplayer-product-line-not-collected');
    await expect(acquireTcgplayerPriceGuide(fetcher, TCGPLAYER_EVIDENCE_VERSION, { line: onePiece, set: tripletBeat, productTypeId: 110 })).rejects.toThrow('tcgplayer-set-not-in-line');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reads set lists, the Cards product type and one set guide from the endpoints the page uses', async () => {
    const guide = fixture('price-guide-3188-op01.json');
    const fetcher = fakeFetcher([json(fixture('set-names-68.json')), json(fixture('product-types-68.json')), json(guide)]);
    const sets = await fetchTcgplayerSets(fetcher, TCGPLAYER_EVIDENCE_VERSION, onePiece);
    expect(sets.map(set => [set.setId, set.abbreviation])).toEqual([[3188, 'OP01'], [3189, 'ST-01'], [17659, 'ST-01 PRE'], [17675, 'OP-PR'], [24537, 'OP14-EB04'], [24664, 'OP16']]);
    expect(await fetchTcgplayerCardsProductType(fetcher, TCGPLAYER_EVIDENCE_VERSION, onePiece)).toBe(110);
    const result = await acquireTcgplayerPriceGuide(fetcher, TCGPLAYER_EVIDENCE_VERSION, { line: onePiece, set: sets[0]!, productTypeId: 110 });
    expect(fetcher.urls).toEqual([
      'https://mpapi.tcgplayer.com/v2/Catalog/SetNames?categoryId=68&active=true',
      'https://mpapi.tcgplayer.com/v2/Product/ProductTypes/68/',
      guideUrl,
    ]);
    // Never followed: a redirect (a sign-in, a challenge) fails the request and ends the run as SOURCE_UNAVAILABLE.
    expect(fetcher.inits.map(init => init?.redirect)).toEqual(['error', 'error', 'error']);
    expect(result.parsed.observations).toHaveLength(12);
    expect(result.parsed.observations[0]!.artifactSha256).toBe(artifactDigest(bytes(guide)));
    expect(Date.parse(result.parsed.observations[0]!.retrievedAt)).toBeGreaterThanOrEqual(Date.parse('2026-10-28T00:00:00Z'));
  });

  it('keeps sets with no release date, and refuses a list that answers for another line', () => {
    expect(parseTcgplayerSets(japan, fixture('set-names-85.json')).map(set => [set.setId, set.releaseDate])).toEqual([[23598, '2023-03-10T00:00:00'], [23599, '2023-06-16T00:00:00'], [24172, null]]);
    expect(() => parseTcgplayerSets(onePiece, fixture('set-names-85.json'))).toThrow('tcgplayer-set-list-category-mismatch');
  });

  it.each([
    [() => new Response('Too many', { status: 429, headers: { 'retry-after': '1' } }), 'http-429'],
    [() => new Response('Forbidden', { status: 403 }), 'http-403'],
    [() => new Response('Unavailable', { status: 503 }), 'http-503'],
    [() => new Response('<html>Verify you are human</html>', { status: 200, headers: { 'content-type': 'text/html' } }), 'non-json-response'],
    [() => new Response('<html>captcha</html>', { status: 200, headers: { 'content-type': 'application/json' } }), 'non-json-response'],
    [() => { throw new TypeError('fetch failed: redirect mode is set to error'); }, 'network-or-redirect'],
  ] as const)('reports SOURCE_UNAVAILABLE on a refusal (%#) and retries nothing', async (response, reason) => {
    const calls: string[] = [];
    const fetcher = createTcgplayerFetcher({ fetch: (async (url: string) => { calls.push(url); return response(); }) as unknown as typeof fetch });
    const failure = await acquireTcgplayerPriceGuide(fetcher, TCGPLAYER_EVIDENCE_VERSION, { line: onePiece, set: romanceDawn, productTypeId: 110 }).catch(error => error);
    expect(failure).toBeInstanceOf(TcgplayerUnavailableError);
    expect(failure).toMatchObject({ code: 'SOURCE_UNAVAILABLE', reason, url: guideUrl });
    expect(calls).toEqual([guideUrl]);
  });

  it('treats a missing set as that set\'s failure, not the source\'s', async () => {
    const fetcher = fakeFetcher([() => new Response('', { status: 404 })]);
    const failure = await acquireTcgplayerPriceGuide(fetcher, TCGPLAYER_EVIDENCE_VERSION, { line: onePiece, set: romanceDawn, productTypeId: 110 }).catch(error => error);
    expect(failure).not.toBeInstanceOf(TcgplayerUnavailableError);
    expect(String(failure)).toContain('tcgplayer-http-404');
  });

  it('identifies itself, routes through no proxy, and spaces every host 10 s apart whatever the caller asks', async () => {
    // Only the clock and timers the bucket uses; response bodies still stream.
    vi.useFakeTimers({ now: Date.parse(readAt), toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const seen: { url: string; at: number; init: RequestInit & { dispatcher?: unknown } }[] = [];
    const fetcher = createTcgplayerFetcher({
      rate_limit: { rps: 100, burst: 100 },
      fetch: (async (url: string, init: RequestInit) => { seen.push({ url, at: Date.now(), init }); return json(fixture('product-types-68.json'))(); }) as unknown as typeof fetch,
    });
    expect(fetcher.via_proxy).toBeNull();
    expect(fetcher.via_proxy_label).toBeNull();
    const reads = Promise.all([
      fetchTcgplayerCardsProductType(fetcher, TCGPLAYER_EVIDENCE_VERSION, onePiece),
      fetchTcgplayerCardsProductType(fetcher, TCGPLAYER_EVIDENCE_VERSION, onePiece),
      fetcher('https://infinite-api.tcgplayer.com/priceguide/set/3188/cards/'),
    ]);
    await vi.advanceTimersByTimeAsync(30_000);
    await reads;
    expect(seen.map(call => call.at - seen[0]!.at)).toEqual([0, 10_000, 20_000]);
    // The collector's own reads reach fetch with redirects refused.
    expect(seen.slice(0, 2).map(call => call.init.redirect)).toEqual(['error', 'error']);
    expect(fetcher.count).toBe(3);
    for (const { init } of seen) {
      const agent = new Headers(init.headers).get('user-agent')!;
      expect(agent).toContain('cambridgetcg.com');
      expect(agent).toContain('(tcgplayer-collector; permission tcgplayer/2026-10-28.1)');
      expect(init.dispatcher).toBeUndefined();
      expect(new Headers(init.headers).has('authorization')).toBe(false);
    }
    expect(tcgplayer.meta.rate_limit).toEqual({ rps: 0.1, burst: 1 });
  });

  it('refuses a fetcher that routes through a proxy', async () => {
    const proxied = createFetcher({ fetch: vi.fn() as unknown as typeof fetch }, tcgplayer.meta, { proxy_url: 'http://user:pass@brd.superproxy.io:33335' });
    await expect(fetchTcgplayerCardsProductType(proxied, TCGPLAYER_EVIDENCE_VERSION, onePiece)).rejects.toThrow('tcgplayer-proxied-fetcher-refused');
    expect(proxied.count).toBe(0);
  });
});
