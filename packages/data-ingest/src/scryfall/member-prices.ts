import { createFetcher } from '../http';
import { scryfall } from './index';
import type { IngestContext } from '../types';
import { artifactDigest, jsonObject, MEMBER_PRICE_REVIEW_VERSION, nativeAmount, resolvePriceCrosswalk, sourceTimestamp, type ExactPriceCrosswalk, type ParsedMemberPrices } from '../member-prices';

export const SCRYFALL_PRICE_PARSER = 'scryfall-daily-prices/1';
export function assertScryfallBulkUrl(value: string): string {
  const url = new URL(value);
  if (url.origin !== 'https://data.scryfall.io' || url.username || url.password || url.search || url.hash || !/^\/default-cards\/default-cards-\d+\.json$/.test(url.pathname)) throw new Error('unreviewed-scryfall-bulk-url');
  return url.href;
}
export function parseScryfallMemberPrices(input: {
  bytes: Uint8Array; sourceUrl: string; sourceUpdatedAt: string; retrievedAt: string;
  crosswalk?: readonly ExactPriceCrosswalk[]; crosswalkVersion?: string;
}): ParsedMemberPrices {
  const sourceUrl = assertScryfallBulkUrl(input.sourceUrl);
  const sourceUpdatedAt = sourceTimestamp(input.sourceUpdatedAt), retrievedAt = sourceTimestamp(input.retrievedAt);
  const cards: unknown = JSON.parse(new TextDecoder().decode(input.bytes));
  if (!Array.isArray(cards)) throw new Error('scryfall-default-cards-array-required');
  const artifactSha256 = artifactDigest(input.bytes);
  const result: ParsedMemberPrices = { observations: [], quarantine: [], sourceRows: cards.length, missingPrices: 0 };
  const seen = new Set<string>();
  for (const raw of cards) {
    let card: Record<string, unknown>;
    try { card = jsonObject(raw); } catch { result.quarantine.push({ sourceProductId: null, reason: 'invalid-scryfall-row' }); continue; }
    const id = typeof card.id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(card.id) ? card.id : null;
    if (card.object !== 'card' || !id || seen.has(id) || typeof card.lang !== 'string' || !Array.isArray(card.finishes)) { result.quarantine.push({ sourceProductId: id, reason: 'invalid-or-duplicate-printing-identity' }); continue; }
    seen.add(id);
    let prices: Record<string, unknown>;
    try { prices = jsonObject(card.prices); } catch { result.quarantine.push({ sourceProductId: id, reason: 'missing-prices-object' }); continue; }
    for (const metric of ['usd', 'usd_foil', 'usd_etched', 'eur', 'eur_foil']) {
      let amount: string | null;
      try { amount = nativeAmount(prices[metric]); } catch { result.quarantine.push({ sourceProductId: id, field: metric, reason: 'invalid-or-zero-price' }); continue; }
      if (amount === null) { result.missingPrices++; continue; }
      const finish = metric.endsWith('_foil') ? 'foil' : metric.endsWith('_etched') ? 'etched' : 'nonfoil';
      if (!card.finishes.includes(finish)) { result.quarantine.push({ sourceProductId: id, field: metric, reason: 'price-finish-not-present-on-printing' }); continue; }
      const mapping = resolvePriceCrosswalk('scryfall', id, finish, card.lang, 'magic', input.crosswalk ?? []);
      if (mapping.mappingStatus === 'ambiguous') result.quarantine.push({ sourceProductId: id, reason: 'ambiguous-crosswalk-no-sku-assigned' });
      result.observations.push({ source: 'scryfall', sourceProductId: id, ...mapping, game: 'magic', productName: typeof card.name === 'string' ? card.name : null,
        granularity: 'printing', finish, language: card.lang, condition: null, metric, amount, currency: metric.startsWith('eur') ? 'EUR' : 'USD', underlyingMarket: metric.startsWith('eur') ? 'cardmarket' : 'tcgplayer',
        sourceUpdatedAt, retrievedAt, sourceUrl, parserVersion: SCRYFALL_PRICE_PARSER, crosswalkVersion: input.crosswalkVersion ?? 'none', evidenceVersion: MEMBER_PRICE_REVIEW_VERSION, artifactSha256, catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null, quality: 'accepted' });
    }
  }
  return result;
}
/** One finite official index + default_cards fetch. No crawling or raw export. */
export async function acquireScryfallMemberPrices(ctx: IngestContext, crosswalk: readonly ExactPriceCrosswalk[] = [], crosswalkVersion = 'none') {
  const deadline = AbortSignal.timeout(300_000);
  ctx = { ...ctx, signal: ctx.signal ? AbortSignal.any([ctx.signal, deadline]) : deadline };
  const fetcher = createFetcher(ctx, scryfall.meta, { max_retries: 0 });
  const index = await fetcher('https://api.scryfall.com/bulk-data', { redirect: 'error' });
  if (!index.ok) throw new Error('scryfall-index-unavailable');
  const body = jsonObject(await index.json());
  if (!Array.isArray(body.data)) throw new Error('invalid-scryfall-index');
  const meta = body.data.map(jsonObject).find(row => row.type === 'default_cards');
  if (!meta || typeof meta.download_uri !== 'string') throw new Error('scryfall-default-cards-missing');
  const sourceUrl = assertScryfallBulkUrl(meta.download_uri);
  const sourceUpdatedAt = sourceTimestamp(meta.updated_at);
  const response = await fetcher(sourceUrl, { redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('scryfall-bulk-unavailable');
  const maxBytes = 512 * 1024 * 1024;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    if (ctx.signal?.aborted) { await reader.cancel(); throw new Error('scryfall-aborted'); }
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('scryfall-bulk-too-large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return parseScryfallMemberPrices({ bytes, sourceUrl, sourceUpdatedAt, retrievedAt: new Date().toISOString(), crosswalk, crosswalkVersion });
}
