import { buildSku, parseCardNumber, type GameCode } from '@cambridge-tcg/sku';
import { PAGE_SOURCE_COLLECTION_START } from '@cambridge-tcg/data-spec';
import { createFetcher, type Fetcher } from '../http';
import { tcgplayer } from './index';
import type { IngestContext } from '../types';
import { artifactDigest, jsonObject, MEMBER_PRICE_POLICIES, nativeAmount, resolvePriceCrosswalk, sourceTimestamp, TCGPLAYER_EVIDENCE_VERSION, type ExactPriceCrosswalk, type ParsedMemberPrices } from '../member-prices';

/** TCGplayer's pages are client-rendered: a set's price-guide page carries no
 * prices in its HTML and loads them, one request per set, from the endpoints
 * below (read from its own bundle, 2026-10-28). This module reads exactly
 * those, under the evidence-gated permission of 2026-10-28; the OAuth API
 * reader in ./index.ts stays locked.
 */
export const TCGPLAYER_PRICE_GUIDE_PARSER = 'tcgplayer-price-guide/1';
export const TCGPLAYER_CROSSWALK_VERSION = 'tcgplayer-number/1';
/** The condition a derivation reads as the headline (Market Price, Near Mint). */
export const TCGPLAYER_HEADLINE_CONDITION = 'near-mint';
/** One bucket per run across every TCGplayer host: www.tcgplayer.com's
 * robots.txt asks Crawl-Delay: 10, and the API hosts serve no robots.txt.
 */
export const TCGPLAYER_RATE_LIMIT = { rps: 0.1, burst: 1 } as const;
const CATALOG_API = 'https://mpapi.tcgplayer.com';
const PRICE_GUIDE_API = 'https://infinite-api.tcgplayer.com';
/** The page asks for a set's whole guide in one response. */
const PRICE_GUIDE_ROWS = 5000;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
/** TCGplayer refused this identified collector or could not serve it. The run
 * ends there; nothing is retried or routed around.
 */
const REFUSAL_STATUSES = new Set([401, 403, 429]);

export interface TcgplayerProductLine {
  /** TCGplayer's URL name for the product line. */
  slug: string;
  categoryId: number;
  /** The `game` text TCGplayer writes on each price-guide row. */
  gameLabel: string;
  /** Member-price game, as resolvePriceCrosswalk names it. */
  game: 'one-piece' | 'pokemon' | 'magic' | 'yu-gi-oh';
  language: 'en' | 'ja';
  /** Suffix TCGplayer adds to conditions ("Near Mint - Japanese"), or null. */
  conditionLanguage: string | null;
  collect: boolean;
}
/** 68 and 85, with their row labels, were read from TCGplayer on 2026-10-28.
 * 3, 1 and 2 come from the legacy category map and were not re-read, so none
 * is collected: a line is collected only once a probe has confirmed its
 * category id and the `game` label its rows carry (a row whose `game` differs
 * would be quarantined, never relabelled, but a wrong id would be read for
 * nothing). Pokemon (3) waits for that probe; Magic and Yu-Gi-Oh are listed
 * and off as well.
 */
export const TCGPLAYER_PRODUCT_LINES: readonly TcgplayerProductLine[] = [
  { slug: 'one-piece-card-game', categoryId: 68, gameLabel: 'One Piece Card Game', game: 'one-piece', language: 'en', conditionLanguage: null, collect: true },
  { slug: 'pokemon', categoryId: 3, gameLabel: 'Pokemon', game: 'pokemon', language: 'en', conditionLanguage: null, collect: false },
  { slug: 'pokemon-japan', categoryId: 85, gameLabel: 'Pokemon Japan', game: 'pokemon', language: 'ja', conditionLanguage: 'Japanese', collect: true },
  { slug: 'magic', categoryId: 1, gameLabel: 'Magic', game: 'magic', language: 'en', conditionLanguage: null, collect: false },
  { slug: 'yugioh', categoryId: 2, gameLabel: 'YuGiOh', game: 'yu-gi-oh', language: 'en', conditionLanguage: null, collect: false },
];
const GAME_CODES: Record<TcgplayerProductLine['game'], GameCode> = { 'one-piece': 'op', pokemon: 'pkm', magic: 'mtg', 'yu-gi-oh': 'ygo' };
/** The five grades the price-guide page shows; it reads "Near Mint Foil" and
 * "Near Mint Holofoil - Japanese" as Near Mint.
 */
const CONDITIONS = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'] as const;
// Finish words carry no hyphen, so " - Japanese" is always the language suffix.
const CONDITION_LABEL = new RegExp(`^(${CONDITIONS.join('|')})(?: ([A-Za-z0-9]+(?: [A-Za-z0-9]+)*))?(?: - ([A-Za-z]+))?$`);

export interface TcgplayerSet { setId: number; categoryId: number; name: string; abbreviation: string; urlName: string; releaseDate: string | null }
/** Shaped for the storefront's writeProductCrosswalk / writeSetCrosswalk. */
export interface TcgplayerProductCrosswalk {
  source: 'tcgplayer'; sourceProductId: string; finish: string; language: string; game: string;
  mappingStatus: 'exact' | 'ambiguous'; sku: string | null; setCode: string | null; evidence: string; crosswalkVersion: string;
}
export interface TcgplayerSetCrosswalk { source: 'tcgplayer'; sourceSetKey: string; game: string; setCode: string; evidence: string; crosswalkVersion: string }
export interface TcgplayerPriceGuide {
  parsed: ParsedMemberPrices;
  setCrosswalk: TcgplayerSetCrosswalk | null;
  productCrosswalks: TcgplayerProductCrosswalk[];
}

export class TcgplayerUnavailableError extends Error {
  readonly code = 'SOURCE_UNAVAILABLE';
  constructor(readonly reason: string, readonly status: number | null, readonly url: string) {
    super(`tcgplayer-source-unavailable:${reason}`);
    this.name = 'TcgplayerUnavailableError';
  }
}

/** Collection needs the permission's own evidence version; nothing else opens it. */
function assertEvidence(evidenceVersion: string): void {
  if (evidenceVersion !== TCGPLAYER_EVIDENCE_VERSION || MEMBER_PRICE_POLICIES.tcgplayer.evidenceVersion !== TCGPLAYER_EVIDENCE_VERSION) {
    throw new Error('tcgplayer-collection-evidence-required');
  }
}
function collectedLine(line: TcgplayerProductLine): TcgplayerProductLine {
  const known = TCGPLAYER_PRODUCT_LINES.find(entry => entry.slug === line.slug);
  if (!known || !known.collect || known.categoryId !== line.categoryId) throw new Error('tcgplayer-product-line-not-collected');
  return known;
}

/** Direct and identified (the module's User-Agent names Cambridge TCG and the
 * permission). It offers no proxy or unlocker option, ignores any caller rate,
 * and never retries a refusal.
 */
export function createTcgplayerFetcher(ctx: IngestContext): Fetcher {
  return createFetcher({ fetch: ctx.fetch, signal: ctx.signal, on_event: ctx.on_event, rate_limit: TCGPLAYER_RATE_LIMIT }, tcgplayer.meta, { max_retries: 0 });
}

async function read(fetcher: Fetcher, url: string): Promise<{ bytes: Uint8Array; body: Record<string, unknown>; retrievedAt: string }> {
  if (fetcher.via_proxy !== null) throw new Error('tcgplayer-proxied-fetcher-refused');
  let response: Response;
  try {
    response = await fetcher(url, { redirect: 'error' });
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) throw error;
    // A redirect (a challenge page, a sign-in) lands here too.
    throw new TcgplayerUnavailableError('network-or-redirect', null, url);
  }
  // A live page has no clock of its own; this is the instant it was read.
  const retrievedAt = new Date().toISOString();
  if (REFUSAL_STATUSES.has(response.status) || response.status >= 500) {
    await response.body?.cancel();
    throw new TcgplayerUnavailableError(`http-${response.status}`, response.status, url);
  }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`tcgplayer-http-${response.status}`); }
  // A challenge or captcha answers with a page, not the page's data.
  if (!/\bjson\b/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel();
    throw new TcgplayerUnavailableError('non-json-response', response.status, url);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new TcgplayerUnavailableError('empty-response', response.status, url);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('tcgplayer-response-too-large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: Record<string, unknown>;
  try { body = jsonObject(JSON.parse(new TextDecoder().decode(bytes))); } catch { throw new TcgplayerUnavailableError('non-json-response', response.status, url); }
  if (Array.isArray(body.errors) && body.errors.length) throw new Error('tcgplayer-api-errors');
  return { bytes, body, retrievedAt };
}

export function tcgplayerSetListUrl(line: TcgplayerProductLine): string { return `${CATALOG_API}/v2/Catalog/SetNames?categoryId=${line.categoryId}&active=true`; }
export function tcgplayerProductTypesUrl(line: TcgplayerProductLine): string { return `${CATALOG_API}/v2/Product/ProductTypes/${line.categoryId}/`; }
export function tcgplayerPriceGuideUrl(setId: number, productTypeId: number): string { return `${PRICE_GUIDE_API}/priceguide/set/${setId}/cards/?rows=${PRICE_GUIDE_ROWS}&productTypeID=${productTypeId}`; }

/** A product line's sets, as its price-guide page lists them. */
export async function fetchTcgplayerSets(fetcher: Fetcher, evidenceVersion: string, line: TcgplayerProductLine): Promise<TcgplayerSet[]> {
  assertEvidence(evidenceVersion);
  return parseTcgplayerSets(line, (await read(fetcher, tcgplayerSetListUrl(collectedLine(line)))).body);
}
export function parseTcgplayerSets(line: TcgplayerProductLine, body: Record<string, unknown>): TcgplayerSet[] {
  if (!Array.isArray(body.results)) throw new Error('invalid-tcgplayer-set-list');
  const sets: TcgplayerSet[] = [];
  const seen = new Set<number>();
  for (const raw of body.results) {
    const row = jsonObject(raw);
    // A set from another line means the request did not answer what was asked.
    if (row.categoryId !== line.categoryId) throw new Error('tcgplayer-set-list-category-mismatch');
    const setId = row.setNameId;
    if (!Number.isSafeInteger(setId) || Number(setId) <= 0 || seen.has(Number(setId)) || row.active !== true || typeof row.name !== 'string' ||
        typeof row.abbreviation !== 'string' || typeof row.urlName !== 'string' || (row.releaseDate !== null && typeof row.releaseDate !== 'string')) continue;
    seen.add(Number(setId));
    sets.push({ setId: Number(setId), categoryId: line.categoryId, name: row.name, abbreviation: row.abbreviation, urlName: row.urlName, releaseDate: row.releaseDate as string | null });
  }
  return sets;
}

/** The line's "Cards" product type: the page asks for singles and sealed apart. */
export async function fetchTcgplayerCardsProductType(fetcher: Fetcher, evidenceVersion: string, line: TcgplayerProductLine): Promise<number> {
  assertEvidence(evidenceVersion);
  const { body } = await read(fetcher, tcgplayerProductTypesUrl(collectedLine(line)));
  const cards = Array.isArray(body.results) ? body.results.map(jsonObject).filter(row => row.productName === 'Cards') : [];
  if (cards.length !== 1 || !Number.isSafeInteger(cards[0]!.productTypeId) || Number(cards[0]!.productTypeId) <= 0) throw new Error('tcgplayer-cards-product-type-missing');
  return Number(cards[0]!.productTypeId);
}

/** One set's singles: one request, at the shared rate. */
export async function acquireTcgplayerPriceGuide(fetcher: Fetcher, evidenceVersion: string, input: { line: TcgplayerProductLine; set: TcgplayerSet; productTypeId: number }): Promise<TcgplayerPriceGuide> {
  assertEvidence(evidenceVersion);
  const line = collectedLine(input.line);
  if (input.set.categoryId !== line.categoryId || !Number.isSafeInteger(input.productTypeId) || input.productTypeId <= 0) throw new Error('tcgplayer-set-not-in-line');
  const sourceUrl = tcgplayerPriceGuideUrl(input.set.setId, input.productTypeId);
  const { bytes, retrievedAt } = await read(fetcher, sourceUrl);
  return parseTcgplayerPriceGuide({ line, set: input.set, bytes, sourceUrl, retrievedAt });
}

const kebab = (label: string) => label.toLowerCase().replace(/ +/g, '-');
interface Row { productId: number; number: string; name: string; finish: string; printing: string; condition: string; amount: string }
export function parseTcgplayerPriceGuide(input: { line: TcgplayerProductLine; set: TcgplayerSet; bytes: Uint8Array; sourceUrl: string; retrievedAt: string }): TcgplayerPriceGuide {
  const { line, set } = input;
  const retrievedAt = sourceTimestamp(input.retrievedAt);
  if (!(Date.parse(retrievedAt) >= Date.parse(PAGE_SOURCE_COLLECTION_START))) throw new Error('tcgplayer-read-before-permission');
  const body = jsonObject(JSON.parse(new TextDecoder().decode(input.bytes)));
  if (!Array.isArray(body.result)) throw new Error('invalid-tcgplayer-price-guide');
  const artifactSha256 = artifactDigest(input.bytes);
  const parsed: ParsedMemberPrices = { observations: [], quarantine: [], sourceRows: body.result.length, missingPrices: 0 };
  if (typeof body.total === 'number' && body.total > body.result.length) parsed.quarantine.push({ sourceProductId: null, field: 'total', reason: 'price-guide-incomplete' });

  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const raw of body.result) {
    let row: Record<string, unknown>;
    try { row = jsonObject(raw); } catch { parsed.quarantine.push({ sourceProductId: null, reason: 'invalid-price-row' }); continue; }
    const productId = Number.isSafeInteger(row.productID) && Number(row.productID) > 0 ? Number(row.productID) : null;
    const id = productId === null ? null : `tcgplayer:${productId}`;
    if (productId === null || typeof row.number !== 'string' || typeof row.productName !== 'string') { parsed.quarantine.push({ sourceProductId: id, reason: 'invalid-or-duplicate-price-identity' }); continue; }
    // Singles only; the request already names the Cards product type.
    if (row.type !== 'Cards') { parsed.quarantine.push({ sourceProductId: id, field: 'type', reason: 'not-a-single-card' }); continue; }
    if (row.game !== line.gameLabel) { parsed.quarantine.push({ sourceProductId: id, field: 'game', reason: 'unexpected-product-line' }); continue; }
    if (typeof row.printing !== 'string' || !/^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/.test(row.printing)) { parsed.quarantine.push({ sourceProductId: id, field: 'printing', reason: 'unrecognised-printing' }); continue; }
    const label = typeof row.condition === 'string' ? CONDITION_LABEL.exec(row.condition) : null;
    // The grade's finish words must be this row's printing, and its language
    // suffix this line's: a Japanese grade on an English line is refused.
    if (!label || (label[2] !== undefined && label[2] !== row.printing) || (label[3] ?? null) !== line.conditionLanguage) {
      parsed.quarantine.push({ sourceProductId: id, field: 'condition', reason: 'unrecognised-condition' }); continue;
    }
    const condition = kebab(label[1]!), finish = kebab(row.printing);
    const key = `${productId}\0${finish}\0${condition}`;
    if (seen.has(key)) { parsed.quarantine.push({ sourceProductId: id, reason: 'invalid-or-duplicate-price-identity' }); continue; }
    seen.add(key);
    let amount: string | null;
    try { amount = nativeAmount(row.marketPrice); } catch { parsed.quarantine.push({ sourceProductId: id, field: 'marketPrice', reason: 'invalid-or-zero-price' }); continue; }
    // No Market Price is no observation: quarantined and counted, never zero.
    if (amount === null) { parsed.missingPrices++; parsed.quarantine.push({ sourceProductId: id, field: 'marketPrice', reason: 'missing-market-price' }); continue; }
    rows.push({ productId, number: row.number.trim(), name: row.productName, finish, printing: row.printing, condition, amount });
  }

  const { setCrosswalk, productCrosswalks } = tcgplayerCrosswalks(line, set, rows);
  const exact: ExactPriceCrosswalk[] = productCrosswalks.flatMap(link => link.mappingStatus === 'exact' ? [{ ...link, sku: link.sku!, setCode: link.setCode! }] : []);
  const ambiguous = new Set(productCrosswalks.filter(link => link.mappingStatus === 'ambiguous').map(link => `${link.sourceProductId}\0${link.finish}`));
  for (const link of productCrosswalks) if (link.mappingStatus === 'ambiguous') parsed.quarantine.push({ sourceProductId: link.sourceProductId, reason: 'ambiguous-crosswalk-no-sku-assigned' });
  for (const row of rows) {
    const id = `tcgplayer:${row.productId}`;
    const mapping = ambiguous.has(`${id}\0${row.finish}`) ? { sku: null, setCode: null, mappingStatus: 'ambiguous' as const } : resolvePriceCrosswalk('tcgplayer', id, row.finish, line.language, line.game, exact);
    parsed.observations.push({ source: 'tcgplayer', sourceProductId: id, ...mapping, game: line.game, productName: row.name,
      granularity: 'printing', finish: row.finish, language: line.language, condition: row.condition, metric: 'market', amount: row.amount, currency: 'USD', underlyingMarket: 'tcgplayer',
      sourceUpdatedAt: retrievedAt, retrievedAt, sourceUrl: input.sourceUrl, parserVersion: TCGPLAYER_PRICE_GUIDE_PARSER, crosswalkVersion: TCGPLAYER_CROSSWALK_VERSION,
      evidenceVersion: TCGPLAYER_EVIDENCE_VERSION, artifactSha256, catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null, quality: 'accepted',
      // TCGplayer's own set ID, the key its set crosswalk is written under.
      sourceSetKey: String(set.setId) });
  }
  return { parsed, setCrosswalk, productCrosswalks };
}

/** Exact only from TCGplayer's own collector identifiers, never a name match:
 * - The set maps when every numbered single carries one prefix (OP01-064 →
 *   op01) equal to TCGplayer's abbreviation for the set (OP01, ST-01). Pre-
 *   release, anniversary and combined sets (OP02 PRE, OP14-EB04) differ, so
 *   their stamped or mixed printings never borrow the base set's SKUs. A slash
 *   number (003/073) names no set and maps nothing.
 * - A product maps exact when, in a mapped set, it has one printing, no
 *   variant marker in its name, and no other unmarked product shares its
 *   number. "(001)" restates the number and is not a marker; "(Parallel)",
 *   "(Box Topper)" and the like are, and no reviewed table yet turns them
 *   into SKU variants, so those products are ambiguous, as are two printings
 *   of one product.
 */
function tcgplayerCrosswalks(line: TcgplayerProductLine, set: TcgplayerSet, rows: readonly Row[]) {
  const gameCode = GAME_CODES[line.game];
  const products = new Map<number, { number: string; name: string; printings: Set<string>; finishes: Set<string>; consistent: boolean }>();
  for (const row of rows) {
    const product = products.get(row.productId);
    if (!product) { products.set(row.productId, { number: row.number, name: row.name, printings: new Set([row.printing]), finishes: new Set([row.finish]), consistent: true }); continue; }
    product.printings.add(row.printing); product.finishes.add(row.finish);
    if (product.number !== row.number || product.name !== row.name) product.consistent = false;
  }
  const ownNumber = (number: string) => {
    const parts = parseCardNumber(gameCode, number);
    // The set must be the number's own prefix, not a promo namespace or a slash total.
    return parts && parts.confirmed && number.toLowerCase().startsWith(`${parts.set}-`) ? parts : null;
  };
  const abbreviation = set.abbreviation.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  const numbered = rows.filter(row => row.number !== '');
  const prefixes = new Set(numbered.map(row => ownNumber(row.number)?.set ?? null));
  const setCode = numbered.length && prefixes.size === 1 && prefixes.has(abbreviation) && abbreviation ? abbreviation : null;
  const setCrosswalk: TcgplayerSetCrosswalk | null = setCode ? {
    source: 'tcgplayer', sourceSetKey: String(set.setId), game: line.game, setCode,
    evidence: `abbreviation:${set.abbreviation} number-prefix:${setCode.toUpperCase()} products:${new Set(numbered.map(row => row.productId)).size}`, crosswalkVersion: TCGPLAYER_CROSSWALK_VERSION,
  } : null;
  const productCrosswalks: TcgplayerProductCrosswalk[] = [];
  if (!setCode) return { setCrosswalk, productCrosswalks };
  const markers = (name: string, number: string, cardNumber: string) =>
    [...name.matchAll(/\(([^()]*)\)/g)].map(match => match[1]!.trim()).filter(marker => marker !== cardNumber && marker !== number);
  const unmarked = new Map<string, number>();
  for (const [, product] of products) {
    const parts = ownNumber(product.number);
    if (parts && product.consistent && product.printings.size === 1 && !markers(product.name, product.number, parts.number).length) unmarked.set(product.number, (unmarked.get(product.number) ?? 0) + 1);
  }
  for (const [productId, product] of products) {
    const parts = ownNumber(product.number);
    if (!parts || parts.set !== setCode) continue;
    const base = { source: 'tcgplayer' as const, sourceProductId: `tcgplayer:${productId}`, language: line.language, game: line.game, crosswalkVersion: TCGPLAYER_CROSSWALK_VERSION };
    const found = markers(product.name, product.number, parts.number);
    const reason = !product.consistent ? 'inconsistent-rows'
      : product.printings.size !== 1 ? `printings:${[...product.printings].sort().join(',')}`
      : found.length ? `marker:${found.map(marker => `(${marker})`).join('')}`
      : (unmarked.get(product.number) ?? 0) > 1 ? 'shared-number' : null;
    for (const finish of product.finishes) {
      const printing = [...product.printings].find(label => kebab(label) === finish)!;
      if (reason) {
        productCrosswalks.push({ ...base, finish, mappingStatus: 'ambiguous', sku: null, setCode: null, evidence: `number:${product.number} ${reason}` });
      } else {
        productCrosswalks.push({ ...base, finish, mappingStatus: 'exact', sku: buildSku({ game: gameCode, set: setCode, number: parts.number, lang: line.language }), setCode,
          evidence: `number:${product.number} printing:${printing} set:${set.setId}/${set.abbreviation}` });
      }
    }
  }
  return { setCrosswalk, productCrosswalks };
}
