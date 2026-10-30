import { buildSku, type GameCode } from '@cambridge-tcg/sku';
import { assertPriceObservationValues } from '@cambridge-tcg/data-spec';
import { countedRefusal, createFetcher, pageHead, pageRefusal, readBounded, type HostRefusal } from '../http';
import { parseRobots, readRobotsTxt } from '../robots';
import { cardrush } from './index';
import { parseCardMetadata, parseSitemapProductUrls } from './discovery';
import { classifyCardRushSignal } from './classify';
import { artifactDigest, MEMBER_PRICE_POLICIES, CARDRUSH_EVIDENCE_VERSION, nativeAmount, resolvePriceCrosswalk, sourceTimestamp, type NativePriceObservation, type ParsedMemberPrices } from '../member-prices';
import type { IngestContext } from '../types';

/** CardRush product pages under Yu's written permission of 2026-10-28
 * (docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#cardrush).
 * The only permitted CardRush acquisition path: the legacy reader, scraper
 * and discovery helpers in index.ts and discovery.ts stay behind
 * CARDRUSH_ACQUISITION_ENABLED = false. Requests go out under Cambridge's
 * own identifying User-Agent at 0.5 rps per host, direct; a host that
 * refuses that is reported SOURCE_UNAVAILABLE and left alone for the run.
 * Each run reads the host's robots.txt first, through the same bucket, and
 * stops there if it disallows product pages to this collector or to everyone.
 * A stop that is the host refusing the collector is reported as `refused`, so
 * the run's host state can wait out its Retry-After (storefront 0146).
 */
export const CARDRUSH_PRICE_PARSER = 'cardrush-page/1';
export const CARDRUSH_CROSSWALK_VERSION = 'cardrush-title/1';
/** One bucket per host. burst 1: a fresh bucket never sends two requests within two seconds. */
export const CARDRUSH_PAGE_RATE = { rps: 0.5, burst: 1 } as const;
/** No run reads longer than the collector's budget: the cron route's
 * maxDuration (300 s) less room to write and report. */
export const CARDRUSH_MAX_BUDGET_MS = 270_000;

interface CollectorHost { game: string; code: GameCode; crosswalk: boolean }
/** The six hosts the 2026-05 and 2026-07 probes confirmed (intake record,
 * Gate B); cardrush-mtg.jp stays out until its sitemap and titles parse.
 * game is the observation slug. crosswalk marks a title grammar reviewed
 * against captured pages: One Piece on 2026-10-28. The other hosts' rows
 * land unmapped until theirs is.
 */
export const CARDRUSH_COLLECTOR_HOSTS: Readonly<Record<string, CollectorHost>> = Object.freeze({
  'www.cardrush-op.jp': { game: 'one-piece', code: 'op', crosswalk: true },
  'www.cardrush-pokemon.jp': { game: 'pokemon', code: 'pkm', crosswalk: false },
  'www.cardrush-db.jp': { game: 'dragon-ball', code: 'dbf', crosswalk: false },
  'www.cardrush-digimon.jp': { game: 'digimon', code: 'dmw', crosswalk: false },
  'www.cardrush-vanguard.jp': { game: 'vanguard', code: 'vng', crosswalk: false },
  'www.cardrush-bs.jp': { game: 'battle-spirits', code: 'bsr', crosswalk: false },
});

export interface CardRushPage { url: string; bytes: Uint8Array; retrievedAt: string }
/** A candidate for price_source_crosswalks, from the page's own identifiers. */
export interface CardRushProductCrosswalk {
  sourceProductId: string; finish: string | null; language: string | null; game: string;
  mappingStatus: 'exact' | 'ambiguous'; sku: string | null; setCode: string | null; evidence: string;
}
export interface CardRushSetCrosswalk { sourceSetKey: string; game: string; setCode: string; evidence: string }
/** Where a listing's own image lives on CardRush, read from the page its
 * observation came from. A URL to link to, never fetched or copied. Kept
 * beside the observations, not in them: every observation key goes to the
 * member CSV, and this never does. */
export interface CardRushListingImage { sourceProductId: string; imageUrl: string }
export interface ParsedCardRushPrices extends ParsedMemberPrices {
  productCrosswalks: CardRushProductCrosswalk[];
  setCrosswalks: CardRushSetCrosswalk[];
  listingImages: CardRushListingImage[];
}
export interface CardRushAcquisition {
  host: string; game: string;
  /** Product URLs the host's sitemap listed this run. */
  sitemapProducts: number;
  /** Of those, the ones robots.txt disallows to this collector: never offered or requested. */
  robotsDisallowed: number;
  /** Product pages requested; the robots.txt and sitemap requests are not counted. */
  requested: number;
  unavailable: { code: 'SOURCE_UNAVAILABLE'; reason: string } | null;
  /** Set when the stop was the host refusing this collector (http.ts
   * hostRefusal: a 403, a 429, a 503 with Retry-After; or a challenge), or
   * its robots.txt disallowing it: the run's host state backs off from it. */
  refused: HostRefusal | null;
  parsed: ParsedCardRushPrices;
}

/** Host-qualified, so IDs from different hosts never collide within the source. */
export function cardRushSourceProductId(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  const id = /^\/product\/([1-9]\d{0,9})$/.exec(url.pathname)?.[1];
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !id || !Object.hasOwn(CARDRUSH_COLLECTOR_HOSTS, url.hostname)) return null;
  return `${url.hostname}/product/${id}`;
}

/** CardRush listing images are linked at CardRush's own URL, never copied
 * (the agents' reading of Yu's words of 2026-10-29, in the decision record).
 * A URL is kept only in the shape of the stored CardRush image URLs recorded
 * in apps/wholesale/src/lib/cardrush-hires-upload.ts (2026-07-05): on the
 * listing's own host, under that host's own directory (cardrush-op,
 * cardrushpokemon, cardrush-db; the other three hosts' directories are not on
 * record, so theirs must match their host's name, with or without the
 * hyphen), then /_/ and the hex of a product/ path. A shop logo or another
 * listing's image would mislead the reader it is shown to, so anything else
 * is no image. */
export const CARDRUSH_LISTING_IMAGE_MAX_LENGTH = 512;
const LISTING_IMAGE_PATH = /^\/data\/(cardrush-?[a-z]+)\/_\/70726f647563742f(?:[0-9a-f]{2})+\.(?:jpe?g|png|webp)$/;
export function cardRushListingImageUrl(value: unknown, host: string): string | null {
  if (typeof value !== 'string' || value.length > CARDRUSH_LISTING_IMAGE_MAX_LENGTH || /[\s?#\\]/.test(value) || !Object.hasOwn(CARDRUSH_COLLECTOR_HOSTS, host)) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  const directory = LISTING_IMAGE_PATH.exec(url.pathname)?.[1];
  const hostName = host.replace(/^www\./, '').replace(/\.jp$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hostname !== host || url.href !== value || !directory || directory.replaceAll('-', '') !== hostName.replaceAll('-', '')) return null;
  return value;
}
// The og:image pattern parseCardMetadata reads, without its fallback to the
// first CardRush image anywhere on the page, which can be another listing's.
const OG_IMAGE = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;

// Condition is recorded only where the title states it: 〔状態A-〕 or a
// grading marker such as 〔PSA10鑑定済〕. No marker means no stated condition.
const GRADE = /^状態([A-Z][+-]?)$/;
const GRADED = /^(PSA|BGS|CGC|ARS)\s?(\d{1,2}(?:\.\d)?)鑑定済$/;
const LANGUAGE_MARKERS: readonly [string, string][] = [['英語版', 'en'], ['韓国語版', 'ko'], ['中国語版', 'zh'], ['簡体字版', 'zh'], ['繁体字版', 'zh']];
const LANGUAGE_BRACKETS = new RegExp(`[(【](?:${LANGUAGE_MARKERS.map(([marker]) => marker).join('|')})[)】]`, 'g');
// One Piece base rarities. P, SP, TR, DON and any /P form are promos,
// specials or parallels whose printing the title does not single out.
const PLAIN_RARITIES: Partial<Record<GameCode, readonly string[]>> = { op: ['C', 'UC', 'R', 'SR', 'SEC', 'L'] };
// A plain name carries at most an illustrator credit: any other bracket or
// parenthetical may name a variant.
const PLAIN_NAME = /^[^()（）[\]［］【】{}〔〕]+(?:\(illust:[^()]+\))?$/;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeText = (value: string) => value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (match, dec, hex, name) =>
  dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name.toLowerCase()] ?? match);

/** The structured price only: the one selling_price figure, cross-checked
 * against the product:price meta where the page carries it. No first-yen
 * fallback; a page that lists several prices is not guessed at.
 */
function structuredPrice(html: string): { amount: string } | { reason: string } {
  if (/pConf\.(?:variationFlag|variProductFlag)\s*=\s*true\s*;/.test(html)) return { reason: 'variation-product-unreviewed' };
  const blocks = [...html.matchAll(/<p class="selling_price">([\s\S]*?)<\/p>/g)];
  const figures = html.match(/id="pricech"/g)?.length ?? 0;
  if (blocks.length > 1 || figures > 1) return { reason: 'multiple-structured-prices' };
  const text = blocks[0] ? /<span class="figure" id="pricech">([^<]*)<\/span>/.exec(blocks[0][1])?.[1] : undefined;
  if (text === undefined) return { reason: 'no-structured-price' };
  const digits = /^\s*(\d{1,3}(?:,\d{3})+|\d+)円\s*$/.exec(text)?.[1]?.replaceAll(',', '');
  if (!digits) return { reason: 'unparseable-structured-price' };
  let amount: string;
  try { amount = nativeAmount(digits.replace(/^0+(?=\d)/, ''))!; } catch { return { reason: 'invalid-or-zero-price' }; }
  const metaAmount = /<meta property="product:price:amount" content="([^"]*)"/.exec(html)?.[1];
  const metaCurrency = /<meta property="product:price:currency" content="([^"]*)"/.exec(html)?.[1];
  if ((metaAmount !== undefined && metaAmount !== amount) || (metaCurrency !== undefined && metaCurrency !== 'JPY')) return { reason: 'structured-prices-disagree' };
  return { amount };
}

/** Parses product pages read in one run. Every page yields observations or
 * a quarantine entry; nothing is dropped and no zero or guessed price is stored.
 * A page with an observation and an og:image of the listing-image shape also
 * yields that URL, from the same read.
 */
export function parseCardRushMemberPrices(pages: readonly CardRushPage[]): ParsedCardRushPrices {
  const result: ParsedCardRushPrices = { observations: [], quarantine: [], sourceRows: pages.length, missingPrices: 0, productCrosswalks: [], setCrosswalks: [], listingImages: [] };
  const seen = new Set<string>(), sets = new Set<string>();
  for (const page of pages) {
    const id = cardRushSourceProductId(page.url);
    if (!id || seen.has(id)) { result.quarantine.push({ sourceProductId: id, reason: 'invalid-or-duplicate-source-product' }); continue; }
    seen.add(id);
    const host = CARDRUSH_COLLECTOR_HOSTS[new URL(page.url).hostname]!;
    let html: string, retrievedAt: string;
    try { html = new TextDecoder('utf-8', { fatal: true }).decode(page.bytes); } catch { result.quarantine.push({ sourceProductId: id, reason: 'undecodable-page' }); continue; }
    try { retrievedAt = sourceTimestamp(page.retrievedAt); } catch { result.quarantine.push({ sourceProductId: id, reason: 'invalid-retrieval-time' }); continue; }
    const rawTitle = /<title>([^<]+)<\/title>/.exec(html)?.[1];
    if (!rawTitle) { result.quarantine.push({ sourceProductId: id, reason: 'no-title' }); continue; }
    const title = decodeText(rawTitle).trim();

    // Identity: the shared title parser's {SET-NUM} (or Digimon's bare ID),
    // then a reprint's {SET-NUM[RELEASE]}, which it does not read.
    const metadata = parseCardMetadata(html, page.url);
    const reprint = /\{([A-Z0-9]+)-(\d+)\[([A-Z0-9]+)\]\}/.exec(title);
    const identity = metadata?.set_code && metadata.card_number ? { set: metadata.set_code, number: metadata.card_number, release: null }
      : reprint ? { set: reprint[1]!, number: reprint[2]!, release: reprint[3]! } : null;
    const rarity = /【([^】]+)】\s*\{/.exec(title)?.[1] ?? metadata?.rarity ?? null;
    if (!identity && !rarity) { result.quarantine.push({ sourceProductId: id, reason: 'not-a-single-card' }); continue; }

    const markers = [...title.matchAll(/〔([^〕]*)〕/g)].map(match => match[1]!);
    let condition: string | null = null;
    if (markers.length > 1 || (markers.length === 1 && !title.startsWith('〔'))) { result.quarantine.push({ sourceProductId: id, field: 'condition', reason: 'unrecognised-condition-marker' }); continue; }
    if (markers.length) {
      const grade = GRADE.exec(markers[0]!), graded = GRADED.exec(markers[0]!);
      condition = grade ? grade[1]! : graded ? `${graded[1]}${graded[2]}` : null;
      if (!condition) { result.quarantine.push({ sourceProductId: id, field: 'condition', reason: 'unrecognised-condition-marker' }); continue; }
    }
    const languages = new Set(LANGUAGE_MARKERS.filter(([marker]) => title.includes(marker)).map(([, language]) => language));
    if (languages.size > 1) { result.quarantine.push({ sourceProductId: id, field: 'language', reason: 'conflicting-language-markers' }); continue; }
    const language = [...languages][0] ?? 'ja';
    const parallel = classifyCardRushSignal({ url: page.url, name: title, rarity, game: host.code, cardNumber: identity?.number ?? null })
      .some(claim => claim.attribute === 'edition_variant' && claim.value === 'parallel');
    const finish = parallel ? 'parallel' : null;

    const price = structuredPrice(html);
    if ('reason' in price) { result.quarantine.push({ sourceProductId: id, field: 'sell', reason: price.reason }); continue; }

    let crosswalk: CardRushProductCrosswalk | null = null, setCrosswalk: CardRushSetCrosswalk | null = null;
    if (host.crosswalk && identity) {
      const name = title.replace(/^〔[^〕]*〕/, '').replace(LANGUAGE_BRACKETS, '').split('【')[0]!;
      const plain = !finish && !identity.release && rarity !== null && (PLAIN_RARITIES[host.code] ?? []).includes(rarity) && PLAIN_NAME.test(name);
      const evidence = `title:${identity.set}-${identity.number}${identity.release ? `[${identity.release}]` : ''} [${rarity ?? '-'}]${finish ? ' parallel' : ''}${language !== 'ja' ? ` ${language}` : ''}`;
      // The SKU builder is the one judge of this identity, not a copy of its
      // patterns: a title whose set, number or language it refuses names no
      // SKU and no set.
      let built: string | null = null;
      try { built = buildSku({ game: host.code, set: identity.set, number: identity.number, lang: language }); } catch { built = null; }
      const sku = plain ? built : null;
      const setCode = identity.set.toLowerCase();
      const exact = sku !== null && resolvePriceCrosswalk('cardrush', id, finish, language, host.game, [{ source: 'cardrush', sourceProductId: id, finish, language, sku, game: host.game, setCode, evidence }]).mappingStatus === 'exact';
      crosswalk = { sourceProductId: id, finish, language, game: host.game, mappingStatus: exact ? 'exact' : 'ambiguous', sku: exact ? sku : null, setCode: exact ? setCode : null, evidence };
      if (built !== null) setCrosswalk = { sourceSetKey: identity.set, game: host.game, setCode, evidence: `title-set:${identity.set}` };
    }
    const mapping = crosswalk?.mappingStatus === 'exact'
      ? { sku: crosswalk.sku, setCode: crosswalk.setCode, mappingStatus: 'exact' as const }
      : { sku: null, setCode: null, mappingStatus: crosswalk ? 'ambiguous' as const : 'unmapped' as const };
    const observation: NativePriceObservation = { source: 'cardrush', sourceProductId: id, ...mapping, game: host.game, productName: title,
      granularity: 'printing', finish, language, condition, metric: 'sell', amount: price.amount, currency: 'JPY', underlyingMarket: 'cardrush',
      sourceUpdatedAt: retrievedAt, retrievedAt, sourceUrl: `https://${id}`, parserVersion: CARDRUSH_PRICE_PARSER, crosswalkVersion: CARDRUSH_CROSSWALK_VERSION,
      evidenceVersion: CARDRUSH_EVIDENCE_VERSION, artifactSha256: artifactDigest(page.bytes), catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null, quality: 'accepted',
      // The set code the title prints (OP01), the key its set crosswalk is
      // written under; null when the title names no set.
      sourceSetKey: identity?.set ?? null };
    try { assertPriceObservationValues(observation); } catch { result.quarantine.push({ sourceProductId: id, reason: 'invalid-observation' }); continue; }
    if (mapping.mappingStatus === 'ambiguous') result.quarantine.push({ sourceProductId: id, reason: 'ambiguous-crosswalk-no-sku-assigned' });
    result.observations.push(observation);
    if (crosswalk) result.productCrosswalks.push(crosswalk);
    if (setCrosswalk && !sets.has(setCrosswalk.setCode)) { sets.add(setCrosswalk.setCode); result.setCrosswalks.push(setCrosswalk); }
    const imageUrl = cardRushListingImageUrl(OG_IMAGE.exec(html)?.[1], id.split('/')[0]!);
    if (imageUrl) result.listingImages.push({ sourceProductId: id, imageUrl });
  }
  return result;
}

/** The names this collector's User-Agent answers to in robots.txt: its
 * product token (cambridgetcg.com), that token's letters before the dot (how
 * matchers that read only [A-Za-z_-] see it), and the collector's own name. */
export const CARDRUSH_ROBOTS_AGENTS: readonly string[] = ['cambridgetcg.com', 'cambridgetcg', 'cardrush-collector'];
/** robots.txt read once for a run: parsed and compiled here (robots.ts, the
 * parser TCGplayer's collector shares), then asked about each path (a host's
 * sitemap lists thousands). Stricter than RFC 9309, which would read only the
 * most specific group: the rules naming this collector and the rules for
 * every crawler must both allow a path. */
export function compileCardRushRobots(robots: string): (path: string) => boolean {
  const parsed = parseRobots(robots);
  const own = parsed.group(CARDRUSH_ROBOTS_AGENTS), everyone = parsed.group(['*']);
  return path => (own?.allows(path) ?? true) && (everyone?.allows(path) ?? true);
}
/** Whether robots.txt lets this collector read `path`: one question, for a
 * single path. A run compiles once with compileCardRushRobots. */
export function cardRushRobotsAllow(robots: string, path: string): boolean {
  return compileCardRushRobots(robots)(path);
}

/** One host, one run: its robots.txt and sitemap once each, then the pages
 * `choose` picks, at 0.5 rps until the budget runs out or the host refuses.
 * Refuses before any network work unless given the CardRush policy's evidence
 * version. A robots.txt that disallows product pages (or the sitemap) to this
 * collector or to every crawler stops the run as SOURCE_UNAVAILABLE; one the
 * host does not serve (404, 410) sets no rule. A listed page robots.txt
 * disallows is never offered to `choose`.
 */
export async function acquireCardRushMemberPrices(ctx: IngestContext, input: {
  evidenceVersion: string; host: string; budgetMs: number;
  choose: (productUrls: readonly string[], capacity: number) => readonly string[] | Promise<readonly string[]>;
}): Promise<CardRushAcquisition> {
  if (input.evidenceVersion !== MEMBER_PRICE_POLICIES.cardrush.evidenceVersion) throw new Error('cardrush-evidence-version-required');
  if (!Object.hasOwn(CARDRUSH_COLLECTOR_HOSTS, input.host)) throw new Error('unreviewed-cardrush-host');
  if (!Number.isSafeInteger(input.budgetMs) || input.budgetMs <= 0 || input.budgetMs > CARDRUSH_MAX_BUDGET_MS) throw new Error('invalid-cardrush-budget');
  const host = input.host, { game } = CARDRUSH_COLLECTOR_HOSTS[host]!;
  const deadline = Date.now() + input.budgetMs, budget = AbortSignal.timeout(input.budgetMs);
  const signal = ctx.signal ? AbortSignal.any([ctx.signal, budget]) : budget;
  // The caller's rate is ignored: this host gets its own bucket at the collector's rate.
  const fetcher = createFetcher({ ...ctx, signal, rate_limit: CARDRUSH_PAGE_RATE }, cardrush.meta, { max_retries: 0 });
  const interval = 1000 / CARDRUSH_PAGE_RATE.rps;
  const empty = (): ParsedCardRushPrices => ({ observations: [], quarantine: [], sourceRows: 0, missingPrices: 0, productCrosswalks: [], setCrosswalks: [], listingImages: [] });
  const stop = (reason: string, sitemapProducts = 0, refused: HostRefusal | null = null): CardRushAcquisition =>
    ({ host, game, sitemapProducts, robotsDisallowed: 0, requested: 0, unavailable: { code: 'SOURCE_UNAVAILABLE', reason }, refused, parsed: empty() });
  // robots.txt disallowing this collector refuses it, with no Retry-After.
  const disallowed: HostRefusal = { status: null, retryAfter: null };

  // Read once, first, through the host's own bucket (robots.ts). Not followed
  // if it redirects; a refusal or failure to serve it stops the run.
  let robots: string | null = null;
  try {
    const read = await readRobotsTxt(fetcher, host);
    if (read.kind === 'stop') return stop(read.reason === 'fetch-error' && signal.aborted ? 'budget-exhausted-before-robots' : `robots-${read.reason}`, 0, read.refused);
    if (read.kind === 'rules') robots = read.text;
  } catch {
    return stop(signal.aborted ? 'budget-exhausted-before-robots' : 'robots-fetch-error');
  }
  // Parsed and compiled once: the sitemap's every URL is asked below.
  const allowed: (path: string) => boolean = robots === null ? () => true : compileCardRushRobots(robots);
  if (!allowed('/product/')) return stop('robots-disallows-product-pages', 0, disallowed);
  if (!allowed('/sitemap.xml')) return stop('robots-disallows-sitemap', 0, disallowed);

  let sitemap: string;
  try {
    const response = await fetcher(`https://${host}/sitemap.xml`, { redirect: 'manual', headers: { Accept: 'application/xml, text/xml' } });
    const early = pageRefusal(response);
    if (early) { await response.body?.cancel(); return stop(`sitemap-${early}`, 0, countedRefusal(response, early)); }
    if (response.status !== 200) { await response.body?.cancel(); return stop(`sitemap-http-${response.status}`); }
    const bytes = await readBounded(response, 64 * 1024 * 1024);
    if (!bytes) return stop('sitemap-too-large');
    sitemap = new TextDecoder().decode(bytes);
    const challenge = pageRefusal(response, pageHead(bytes));
    if (challenge) return stop(`sitemap-${challenge}`, 0, countedRefusal(response, challenge));
  } catch {
    return stop(signal.aborted ? 'budget-exhausted-before-sitemap' : 'sitemap-fetch-error');
  }
  const productUrls = [...new Set(parseSitemapProductUrls(sitemap, host.replace(/^www\./, '')).product_urls)]
    .filter(url => cardRushSourceProductId(url) === url.replace(/^https:\/\//, ''));
  if (!productUrls.length) return stop('sitemap-empty-or-unparseable');
  const permitted = productUrls.filter(url => allowed(new URL(url).pathname));
  if (!permitted.length) return { ...stop('robots-disallows-product-pages', productUrls.length, disallowed), robotsDisallowed: productUrls.length };

  const capacity = Math.max(0, Math.floor((deadline - Date.now()) / interval));
  const listed = new Set(permitted);
  const chosen = await input.choose(permitted, capacity);
  if (chosen.length > capacity || new Set(chosen).size !== chosen.length || chosen.some(url => !listed.has(url))) throw new Error('cardrush-selection-outside-sitemap');

  const pages: CardRushPage[] = [], failed: ParsedMemberPrices['quarantine'] = [];
  let requested = 0, unavailable: CardRushAcquisition['unavailable'] = null, refused: HostRefusal | null = null;
  for (const url of chosen) {
    if (signal.aborted || Date.now() + interval > deadline) break;
    let response: Response;
    try {
      requested += 1;
      response = await fetcher(url, { redirect: 'manual', headers: { Accept: 'text/html' } });
    } catch {
      if (!signal.aborted) unavailable = { code: 'SOURCE_UNAVAILABLE', reason: 'fetch-error' };
      break;
    }
    const retrievedAt = new Date().toISOString();
    const id = cardRushSourceProductId(url);
    const early = pageRefusal(response);
    if (early) { await response.body?.cancel(); unavailable = { code: 'SOURCE_UNAVAILABLE', reason: early }; refused = countedRefusal(response, early); break; }
    if (response.status === 404 || response.status === 410) { await response.body?.cancel(); failed.push({ sourceProductId: id, reason: 'page-not-found' }); continue; }
    // Redirects are not followed: the page read must be the page the sitemap named.
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); failed.push({ sourceProductId: id, reason: 'page-redirected' }); continue; }
    if (response.status !== 200) { await response.body?.cancel(); unavailable = { code: 'SOURCE_UNAVAILABLE', reason: `http-${response.status}` }; break; }
    if (!/^text\/html\b/i.test(response.headers.get('content-type') ?? '')) { await response.body?.cancel(); failed.push({ sourceProductId: id, reason: 'unexpected-content-type' }); continue; }
    let bytes: Uint8Array | null;
    try { bytes = await readBounded(response, 4 * 1024 * 1024); } catch {
      if (!signal.aborted) unavailable = { code: 'SOURCE_UNAVAILABLE', reason: 'fetch-error' };
      break;
    }
    if (!bytes) { failed.push({ sourceProductId: id, reason: 'page-too-large' }); continue; }
    const challenge = pageRefusal(response, pageHead(bytes));
    if (challenge) { unavailable = { code: 'SOURCE_UNAVAILABLE', reason: challenge }; refused = countedRefusal(response, challenge); break; }
    pages.push({ url, bytes, retrievedAt });
  }
  const parsed = parseCardRushMemberPrices(pages);
  parsed.quarantine.push(...failed);
  parsed.sourceRows += failed.length;
  return { host, game, sitemapProducts: productUrls.length, robotsDisallowed: productUrls.length - permitted.length, requested, unavailable, refused, parsed };
}
