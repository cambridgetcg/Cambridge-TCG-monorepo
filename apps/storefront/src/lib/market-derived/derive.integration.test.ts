import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { CARDRUSH_EVIDENCE_VERSION, MEMBER_PRICE_REVIEW_VERSION, TCGPLAYER_EVIDENCE_VERSION, type NativePriceObservation } from '@cambridge-tcg/data-ingest/member-prices';
import { TCGPLAYER_HEADLINE_CONDITION } from '@cambridge-tcg/data-ingest/tcgplayer/member-prices';
import { chainIndex, confidenceFor, crossRate, premiumQuantiles, referenceAmount, startIndex, toGbp, type IndexPair } from '@cambridge-tcg/data-spec';

vi.mock('server-only', () => ({}));
type TxQuery = import('@cambridge-tcg/db/compat').CompatQueryFn;
const state = vi.hoisted(() => ({ pool: null as unknown as import('pg').Pool }));
async function onPool<T>(pool: import('pg').Pool, fn: (query: TxQuery) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(async (sql, params) => { const { rows, rowCount } = await client.query(sql, params); return { rows, rowCount: rowCount ?? 0 }; });
    await client.query('COMMIT');
    return result;
  }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
vi.mock('@/lib/db', () => ({
  query: (sql: string, params?: unknown[]) => state.pool.query(sql, params),
  transaction: <T>(fn: (query: TxQuery) => Promise<T>) => onPool(state.pool, fn),
}));
import { writeMemberPriceBatch } from '../datafeed/member-price-writer';
import { writeProductCrosswalk, writeSetCrosswalk } from '../datafeed/crosswalks';
import { runMarketDerivation, type MarketDerivationResult } from './derive';

// Same explicit opt-in as the other storefront PostgreSQL tests: one
// disposable loopback *_test database, an isolated schema, never DATABASE_URL.
// The full migration chain stops at legacy 0106 on a fresh database, so the
// schema holds exactly what this job reads and writes: 0137 and 0139–0141.
const localUrl = process.env.MARKET_DERIVATION_TEST_DATABASE_URL;
const schema = `market_derive_test_${randomUUID().replaceAll('-', '')}`;
const bare = `market_derive_bare_${randomUUID().replaceAll('-', '')}`;
const no0139 = `market_derive_no0139_${randomUUID().replaceAll('-', '')}`;
const MIGRATIONS = ['0137_member_price_observations.sql', '0139_widen_price_sources.sql', '0140_price_source_crosswalks.sql', '0141_market_derived.sql'];
let admin: Pool;
let barePool: Pool;
let no0139Pool: Pool;

const D0 = '2026-10-28', D1 = '2026-10-29', D2 = '2026-10-30', D3 = '2026-10-31', D4 = '2026-11-06', D5 = '2026-11-16', D6 = '2026-11-26';
const QUOTES = { GBP: '0.8672', JPY: '162.53', USD: '1.0812' };
const RATE = { EUR: crossRate('1', QUOTES.GBP), JPY: crossRate(QUOTES.JPY, QUOTES.GBP), USD: crossRate(QUOTES.USD, QUOTES.GBP) };
const ecb = (day: string) => ({ source: 'ecb.europa.eu', as_of: shift(day, -1), fetched_at: `${day}T06:59:00.000Z`, perEur: QUOTES });
const derive = (day: string, fx: object | null = ecb(day)) => runMarketDerivation({ asOf: day, now: new Date(`${day}T07:00:00Z`), fx: fx as never });
function shift(day: string, days: number) { return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10); }
const n = (i: number) => String(i).padStart(3, '0');
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

function cardmarket(id: string, day: string, amount: string, override: Partial<NativePriceObservation> = {}): NativePriceObservation {
  return { source: 'cardmarket', sourceProductId: id, sku: null, setCode: null, mappingStatus: 'unmapped', game: 'one-piece', productName: `Product ${id}`, granularity: 'source-product', finish: null, language: null, condition: null, metric: 'trend', amount, currency: 'EUR', underlyingMarket: 'cardmarket', sourceUpdatedAt: `${day}T00:48:24.000Z`, retrievedAt: `${day}T05:30:00.000Z`, sourceUrl: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json', parserVersion: 'cardmarket-daily/2', crosswalkVersion: 'none', evidenceVersion: MEMBER_PRICE_REVIEW_VERSION, artifactSha256: 'a'.repeat(64), catalogSourceUrl: 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json', catalogUpdatedAt: '2026-08-01T12:00:00.000Z', catalogArtifactSha256: 'b'.repeat(64), quality: 'accepted', ...override };
}
function page(source: 'cardrush' | 'tcgplayer', id: string, at: string, amount: string, override: Partial<NativePriceObservation> = {}): NativePriceObservation {
  const yen = source === 'cardrush';
  return { ...cardmarket(id, D1, amount), source, granularity: 'printing', language: yen ? 'ja' : 'en', condition: yen ? null : TCGPLAYER_HEADLINE_CONDITION, metric: yen ? 'sell' : 'market', currency: yen ? 'JPY' : 'USD', underlyingMarket: source, sourceUpdatedAt: at, retrievedAt: at, sourceUrl: yen ? `https://www.cardrush-op.jp/product/${id}` : `https://www.tcgplayer.com/product/${id}`, parserVersion: `${source}-page/1`, evidenceVersion: yen ? CARDRUSH_EVIDENCE_VERSION : TCGPLAYER_EVIDENCE_VERSION, catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null, ...override };
}
const write = (rows: NativePriceObservation[]) => writeMemberPriceBatch(rows[0]!.source, { observations: rows, quarantine: [], sourceRows: rows.length, missingPrices: 0 });
const link = (source: 'cardmarket' | 'cardrush' | 'tcgplayer', id: string, sku: string, language: string | null) => writeProductCrosswalk({
  source, sourceProductId: id, finish: null, language, game: 'one-piece', mappingStatus: 'exact', sku, setCode: sku.split('-')[1]!, evidence: `number:${sku}`, crosswalkVersion: `${source}-fixture/1`,
});

// Fixture prices per day. Cardmarket maps 14 English SKUs and two Japanese
// ones (001, 004), and ten more products through their expansion's set key
// alone (op03, no product crosswalk, as Cardmarket's files allow); CardRush 14
// Japanese op01 SKUs and four op02; TCGplayer 14 English SKUs and three
// Japanese ones (001–003).
const OP03_EXPANSION = '5300';
const price = {
  cm: (i: number, day: string) => String(i + ({ [D1]: 1, [D2]: 2, [D4]: 3, [D5]: 4, [D6]: 5 } as Record<string, number>)[day]!),
  cmKeyed: (i: number, day: string) => String(2 * i + ({ [D1]: 0.5, [D2]: 1, [D4]: 1.5, [D5]: 2, [D6]: 2.5 } as Record<string, number>)[day]!),
  cmJa: (day: string) => ({ [D1]: '20', [D2]: '22', [D4]: '24', [D5]: '26', [D6]: '28' } as Record<string, string>)[day]!,
  cr: (i: number, day: string) => String((i + 1) * ({ [D1]: 100, [D2]: 110, [D4]: 120, [D5]: 130, [D6]: 140 } as Record<string, number>)[day]!),
  crOp02: (day: string) => ({ [D1]: '500', [D2]: '550', [D4]: '600', [D5]: '650', [D6]: '700' } as Record<string, string>)[day]!,
  tp: (i: number, day: string) => ({ [D1]: `${i}.99`, [D2]: `${i + 1}.49`, [D4]: `${i + 2}.25` } as Record<string, string>)[day]!,
  tpJa: (day: string) => ({ [D1]: '9.5', [D2]: '9.9', [D4]: '10.5' } as Record<string, string>)[day]!,
};
async function writeDay(day: string, sources: readonly ('cardmarket' | 'cardrush' | 'tcgplayer')[] = ['cardmarket', 'cardrush', 'tcgplayer']) {
  const at = `${day}T06:00:00.000Z`;
  if (sources.includes('cardmarket')) {
    await write([...range(1, 14).map(i => cardmarket(`cm-${i}`, day, price.cm(i, day))), cardmarket('cm-ja-1', day, price.cmJa(day)), cardmarket('cm-ja-4', day, price.cmJa(day)),
      ...range(1, 10).map(i => cardmarket(`cm-op03-${i}`, day, price.cmKeyed(i, day), { sourceSetKey: OP03_EXPANSION })),
      // An exact product crosswalk to op01 whose expansion maps to op03: two reviewed mappings disagree.
      cardmarket('cm-conflict', day, '5', { sourceSetKey: OP03_EXPANSION })]);
  }
  if (sources.includes('cardrush')) await write([...range(1, 14).map(i => page('cardrush', `cr-${i}`, at, price.cr(i, day))), ...range(1, 3).map(k => page('cardrush', `cr-op02-${k}`, at, price.crOp02(day)))]);
  if (sources.includes('tcgplayer')) await write([...range(1, 14).map(i => page('tcgplayer', `tp-${i}`, at, price.tp(i, day))), ...range(1, 3).map(i => page('tcgplayer', `tpj-${i}`, at, price.tpJa(day), { language: 'ja' }))]);
}
/** The test's own valuation of a day, from the fixture prices and data-spec's helpers. */
const gbp = {
  cm: (i: number, day: string) => toGbp(price.cm(i, day), RATE.EUR),
  cmKeyed: (i: number, day: string) => toGbp(price.cmKeyed(i, day), RATE.EUR),
  cmJa: (day: string) => toGbp(price.cmJa(day), RATE.EUR),
  cr: (i: number, day: string) => toGbp(price.cr(i, day), RATE.JPY),
  crOp02: (day: string) => toGbp(price.crOp02(day), RATE.JPY),
  tp: (i: number, day: string) => toGbp(price.tp(i, day), RATE.USD),
  tpJa: (day: string) => toGbp(price.tpJa(day), RATE.USD),
};
const level = (step: ReturnType<typeof chainIndex>) => { if (!step.ok) throw new Error('fixture series cannot chain'); return step.level; };
const pairs = (values: (day: string) => string[], previous: string, current: string): IndexPair[] => {
  const before = values(previous), after = values(current);
  return before.map((value, i) => ({ previous: value, current: after[i]! }));
};
const cardmarketValues = (day: string) => [...range(1, 14).map(i => gbp.cm(i, day)), gbp.cmJa(day), gbp.cmJa(day)];
const cardmarketKeyed = (day: string) => range(1, 10).map(i => gbp.cmKeyed(i, day));
const cardrushOp01 = (day: string) => range(1, 14).map(i => gbp.cr(i, day));
const tcgplayerValues = (day: string) => [...range(1, 14).map(i => gbp.tp(i, day)), ...range(1, 3).map(() => gbp.tpJa(day))];

async function rows(table: string, day: string) {
  const columns = table === 'market_indices' ? 'index_key, level::text AS level, constituents, previous_as_of::text AS previous_as_of, sources'
    : table === 'market_reference_prices' ? 'sku, amount::text AS amount, confidence, sources, source_count'
      : 'set_code, market, base_market, ratio_p25::text AS p25, ratio_median::text AS median, ratio_p75::text AS p75, sku_count, sources, market_languages, base_languages';
  // Byte order, so the expected lists hold under any database collation
  // (en_US ignores the '*' in a game-wide index key at the first level).
  const order = table === 'market_indices' ? 'index_key COLLATE "C"' : table === 'market_reference_prices' ? 'sku COLLATE "C"' : 'market COLLATE "C", base_market COLLATE "C"';
  return (await state.pool.query(`SELECT ${columns} FROM ${table} WHERE as_of = $1 ORDER BY ${order}`, [day])).rows;
}
const counts = async () => (await state.pool.query(`SELECT (SELECT count(*) FROM market_derivation_runs)::int AS runs,
  (SELECT count(*) FROM market_reference_prices)::int AS refs, (SELECT count(*) FROM market_indices)::int AS indices, (SELECT count(*) FROM market_premiums)::int AS premiums`)).rows[0];
const ran = (result: MarketDerivationResult) => { if (!result.ok || !result.ran) throw new Error(`expected a run, got ${JSON.stringify(result)}`); return result; };

/** One arm of the snapshot's scan: a source, its headline metrics, and a
 * source_updated_at range, each bound as its own parameter. */
const SCAN_ARM = /\(o\.source = \$(\d+) AND o\.metric = ANY\(\$\d+::text\[\]\) AND o\.source_updated_at >= \$(\d+)::timestamptz AND o\.source_updated_at < \$(\d+)::timestamptz\)/g;
/** The ranges the snapshot statement bound as constants, as `source from→to`. */
function scanArms(sql: string, params: readonly unknown[]): string[] {
  const arms = [...sql.matchAll(SCAN_ARM)].map(([, source, from, to]) => `${params[Number(source) - 1]} ${params[Number(from) - 1]}→${params[Number(to) - 1]}`);
  // Besides the arms, the only bound on source_updated_at is each window's
  // own, from w.as_of, which the planner cannot see into.
  expect(sql.match(/o\.source_updated_at >=/g)).toHaveLength(arms.length + 1);
  expect(sql).toContain('o.source_updated_at >= (w.as_of - $4::int)::timestamp');
  return arms;
}
/** Derives `day`, recording the ranges its snapshot read; `rollBack` discards the run's writes. */
async function deriveScanned(day: string, rollBack = false) {
  const arms: string[] = [];
  const run = <T>(fn: (query: TxQuery) => Promise<T>) => onPool(state.pool, async query => {
    const result = await fn((sql, params) => {
      if (sql.includes('JOIN member_price_observations o ON')) arms.push(...scanArms(sql, params ?? []));
      return query(sql, params);
    });
    if (rollBack) throw Object.assign(new Error('rolled back'), { result });
    return result;
  }).catch((error: { result?: T }) => { if (!rollBack || !error.result) throw error; return error.result; });
  return { result: ran(await runMarketDerivation({ asOf: day, now: new Date(`${day}T07:00:00Z`), fx: ecb(day) }, run)), arms };
}

async function migrate(pool: Pool, files: readonly string[]) {
  for (const file of files) {
    const sql = await readFile(new URL(`../../../drizzle/${file}`, import.meta.url), 'utf8');
    await onPool(pool, query => query(sql));
  }
}

describe.skipIf(!localUrl)('market derivation PostgreSQL integration (explicit loopback *_test database only)', () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || !/^\/[A-Za-z0-9_]+_test$/.test(url.pathname) || url.search || url.hash) {
      throw new Error('MARKET_DERIVATION_TEST_DATABASE_URL must name a disposable loopback *_test database.');
    }
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE SCHEMA ${bare}`);
    await admin.query(`CREATE SCHEMA ${no0139}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 8 });
    barePool = new Pool({ connectionString: localUrl, options: `-c search_path=${bare}`, max: 2 });
    no0139Pool = new Pool({ connectionString: localUrl, options: `-c search_path=${no0139}`, max: 2 });
    await migrate(state.pool, MIGRATIONS);
    await migrate(barePool, MIGRATIONS.slice(0, 3));
    await migrate(no0139Pool, MIGRATIONS.filter(file => !file.startsWith('0139')));

    for (const i of range(1, 14)) {
      await link('cardmarket', `cm-${i}`, `op-op01-${n(i)}-en`, null);
      await link('cardrush', `cr-${i}`, `op-op01-${n(i)}-ja`, 'ja');
      await link('tcgplayer', `tp-${i}`, `op-op01-${n(i)}-en`, 'en');
    }
    await link('cardmarket', 'cm-ja-1', 'op-op01-001-ja', null);
    await link('cardmarket', 'cm-ja-4', 'op-op01-004-ja', null);
    for (const k of range(1, 3)) await link('cardrush', `cr-op02-${k}`, `op-op02-${n(k)}-ja`, 'ja');
    for (const i of range(1, 3)) await link('tcgplayer', `tpj-${i}`, `op-op01-${n(i)}-ja`, 'ja');
    await link('cardrush', 'cr-stale', 'op-op02-004-ja', 'ja');
    await link('cardmarket', 'cm-15', 'op-op01-015-en', null);
    await link('cardmarket', 'cm-conflict', 'op-op01-016-en', null);
    await writeSetCrosswalk({ source: 'cardmarket', sourceSetKey: OP03_EXPANSION, game: 'one-piece', setCode: 'op03', evidence: `idExpansion:${OP03_EXPANSION}`, crosswalkVersion: 'cardmarket-fixture/1' });
    // The same key live in another game, as a source with a host per game
    // (CardRush) can hold: the set join keeps to the observation's own game,
    // or every op03 product would be placed twice and left out as ambiguous.
    await writeSetCrosswalk({ source: 'cardmarket', sourceSetKey: OP03_EXPANSION, game: 'pokemon', setCode: 'sv1', evidence: `idExpansion:${OP03_EXPANSION}`, crosswalkVersion: 'cardmarket-fixture/1' });

    // Read before Cardmarket's derivation was permitted: never an input.
    await write([cardmarket('cm-15', '2026-10-27', '7', { retrievedAt: '2026-10-27T12:00:00.000Z' })]);
    // One CardRush page read on 2026-10-28, never again: fresh through 2026-11-04 only.
    await write([page('cardrush', 'cr-stale', `${D0}T09:00:00.000Z`, '700')]);
    await writeDay(D1);
    // Not headlines: another condition, a stated grade, another metric; and an unmapped product.
    await write([page('tcgplayer', 'tp-1', `${D1}T06:00:00.000Z`, '0.5', { condition: 'lightly-played' })]);
    await write([page('cardrush', 'cr-1', `${D1}T06:00:00.000Z`, '50', { condition: '状態B' })]);
    // cm-unmapped names an expansion no set crosswalk maps: still unmapped.
    await write([cardmarket('cm-1', D1, '99', { metric: 'avg7' }), cardmarket('cm-unmapped', D1, '3', { sourceSetKey: '9999' })]);
    // Scryfall is never an input, whatever it holds.
    await write([cardmarket('scryfall-id', D1, '4', { source: 'scryfall', game: 'one-piece', granularity: 'printing', language: 'en', metric: 'usd', currency: 'USD', underlyingMarket: 'tcgplayer', sourceUrl: 'https://data.scryfall.io/default-cards/default-cards-20261029090000.json', parserVersion: 'scryfall-daily-prices/1', catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null })]);
  });
  afterAll(async () => {
    await state.pool?.end();
    await barePool?.end();
    await no0139Pool?.end();
    if (admin) { for (const name of [schema, bare, no0139]) await admin.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`); await admin.end(); }
  });

  it('reports storage without 0141, or without 0139\'s columns, as not provisioned and writes nothing', async () => {
    for (const pool of [barePool, no0139Pool]) {
      const result = await runMarketDerivation({ asOf: D1, now: new Date(`${D1}T07:00:00Z`), fx: ecb(D1) }, fn => onPool(pool, fn));
      expect(result).toMatchObject({ ok: false, ran: false, reason: 'not-provisioned' });
    }
    expect((await no0139Pool.query('SELECT count(*)::int AS n FROM market_derivation_runs')).rows[0].n).toBe(0);
  });

  it('refuses a fallback FX table before reading anything, and records no run', async () => {
    const result = await derive(D1, { ...ecb(D1), source: 'fallback' });
    expect(result).toMatchObject({ ok: false, ran: false, reason: 'fx-unavailable', detail: expect.stringMatching(/never fallback/) });
    expect(await derive(D1, null)).toMatchObject({ ok: false, reason: 'fx-unavailable' });
    expect(await counts()).toEqual({ runs: 0, refs: 0, indices: 0, premiums: 0 });
  });

  it('derives the first day: references only where two unexported sources map one SKU, base indices, premiums', async () => {
    // Two runs at once: the advisory lock lets one derive and the other see it.
    const [first, second] = await Promise.all([derive(D1), derive(D1)]);
    const result = ran([first, second].find(r => r.ran) ?? first);
    expect([first, second].map(r => r.ran).sort()).toEqual([false, true]);
    expect([first, second].find(r => !r.ran)).toMatchObject({ ok: true, ran: false, reason: 'already-derived', runId: result.runId });
    expect(result).toMatchObject({
      inputEvidence: { cardmarket: 'cardmarket-derivation/2026-10-28.1', cardrush: 'cardrush/2026-10-28.1', tcgplayer: 'tcgplayer/2026-10-28.1' },
      fx: { EUR: { rate: RATE.EUR, source: 'ecb.europa.eu', as_of: D0 }, JPY: { rate: RATE.JPY, source: 'ecb.europa.eu', as_of: D0 }, USD: { rate: RATE.USD, source: 'ecb.europa.eu', as_of: D0 } },
      excludedSources: {}, written: { references: 3, indices: 7, premiums: 3 },
    });
    expect(result.skipped).toMatchObject({ notHeadline: 2, unmapped: 1, setConflict: 1, setKeyOnly: 10, ambiguousHeadline: 0, referenceExportedSources: 15 });

    const ja1 = [gbp.cmJa(D1), gbp.cr(1, D1), gbp.tpJa(D1)];
    const ja2 = [gbp.cr(2, D1), gbp.tpJa(D1)];
    const ja3 = [gbp.cr(3, D1), gbp.tpJa(D1)];
    expect(await rows('market_reference_prices', D1)).toEqual([
      { sku: 'op-op01-001-ja', amount: referenceAmount(ja1), confidence: confidenceFor(ja1), sources: ['cardmarket', 'cardrush', 'tcgplayer'], source_count: 3 },
      { sku: 'op-op01-002-ja', amount: referenceAmount(ja2), confidence: confidenceFor(ja2), sources: ['cardrush', 'tcgplayer'], source_count: 2 },
      { sku: 'op-op01-003-ja', amount: referenceAmount(ja3), confidence: confidenceFor(ja3), sources: ['cardrush', 'tcgplayer'], source_count: 2 },
    ]);
    // Cardmarket with CardRush (op-op01-004-ja) or with TCGplayer (every -en SKU) is never a reference.
    expect((await state.pool.query(`SELECT count(*)::int AS n FROM market_reference_prices WHERE sku = 'op-op01-004-ja' OR sku LIKE '%-en'`)).rows[0].n).toBe(0);

    expect(await rows('market_indices', D1)).toEqual([
      // 26 Cardmarket products: 16 with product crosswalks and 10 through their
      // expansion alone. cm-15 was read before derivation was permitted;
      // cm-unmapped's expansion maps to no set; cm-conflict's two mappings disagree.
      { index_key: 'one-piece:*:cardmarket', level: '100', constituents: 26, previous_as_of: null, sources: ['cardmarket'] },
      // 18 CardRush products in the game; op02 has four, too few for its own series.
      { index_key: 'one-piece:*:cardrush', level: '100', constituents: 18, previous_as_of: null, sources: ['cardrush'] },
      { index_key: 'one-piece:*:tcgplayer', level: '100', constituents: 17, previous_as_of: null, sources: ['tcgplayer'] },
      { index_key: 'one-piece:op01:cardmarket', level: '100', constituents: 16, previous_as_of: null, sources: ['cardmarket'] },
      { index_key: 'one-piece:op01:cardrush', level: '100', constituents: 14, previous_as_of: null, sources: ['cardrush'] },
      { index_key: 'one-piece:op01:tcgplayer', level: '100', constituents: 17, previous_as_of: null, sources: ['tcgplayer'] },
      // A set's index from Cardmarket products no product crosswalk maps.
      { index_key: 'one-piece:op03:cardmarket', level: '100', constituents: 10, previous_as_of: null, sources: ['cardmarket'] },
    ]);
    expect(startIndex(cardrushOp01(D1))).toMatchObject({ ok: true, constituents: 14 });
    // Keyed-only products have no SKU: never a reference or a premium side.
    expect((await state.pool.query(`SELECT count(*)::int AS n FROM market_reference_prices WHERE set_code = 'op03'`)).rows[0].n).toBe(0);
    expect((await state.pool.query(`SELECT count(*)::int AS n FROM market_premiums WHERE set_code = 'op03'`)).rows[0].n).toBe(0);

    // Card identity drops the language: CardRush's Japanese and Cardmarket's
    // product aggregate of one card compare. A source with two SKUs of one
    // card (Cardmarket 001 and 004, TCGplayer 001–003) is left out of it.
    const quartiles = (values: { market: string; baseMarket: string }[]) => {
      const q = premiumQuantiles(values);
      if (!q.ok) throw new Error('fixture premium has too few SKUs');
      return { p25: q.ratioP25, median: q.ratioMedian, p75: q.ratioP75, sku_count: q.skuCount };
    };
    expect(await rows('market_premiums', D1)).toEqual([
      { set_code: 'op01', market: 'cardrush', base_market: 'cardmarket', ...quartiles([2, 3, ...range(5, 14)].map(i => ({ market: gbp.cr(i, D1), baseMarket: gbp.cm(i, D1) }))),
        sources: ['cardmarket', 'cardrush'], market_languages: ['ja'], base_languages: ['*'] },
      { set_code: 'op01', market: 'tcgplayer', base_market: 'cardmarket', ...quartiles(range(5, 14).map(i => ({ market: gbp.tp(i, D1), baseMarket: gbp.cm(i, D1) }))),
        sources: ['cardmarket', 'tcgplayer'], market_languages: ['en'], base_languages: ['*'] },
      { set_code: 'op01', market: 'tcgplayer', base_market: 'cardrush', ...quartiles(range(4, 14).map(i => ({ market: gbp.tp(i, D1), baseMarket: gbp.cr(i, D1) }))),
        sources: ['cardrush', 'tcgplayer'], market_languages: ['en'], base_languages: ['ja'] },
    ]);
    const run = (await state.pool.query(`SELECT input_batch_ceiling::text AS ceiling, input_evidence, fx FROM market_derivation_runs WHERE id = $1`, [result.runId])).rows[0];
    expect(run).toEqual({ ceiling: result.inputBatchCeiling, input_evidence: result.inputEvidence, fx: result.fx });
  });

  it('is idempotent per date and method, and refuses a date before the latest run', async () => {
    const before = await counts();
    expect(await derive(D1)).toMatchObject({ ok: true, ran: false, reason: 'already-derived' });
    expect(await derive(D0)).toMatchObject({ ok: false, ran: false, reason: 'out-of-order' });
    expect(await counts()).toEqual(before);
  });

  it('never leaves a partial run: a failed write rolls the whole day back', async () => {
    // A TCGplayer page read after the first run, on its date: later runs
    // must value that date at its own run's ceiling, without it.
    await write([page('tcgplayer', 'tp-1', `${D1}T20:00:00.000Z`, '99.99')]);
    await writeDay(D2);
    const before = await counts();
    const failing = <T>(fn: (query: TxQuery) => Promise<T>) => onPool(state.pool, query => fn((sql, params) => {
      if (sql.includes('INSERT INTO market_premiums')) throw new Error('simulated failure');
      return query(sql, params);
    }));
    await expect(runMarketDerivation({ asOf: D2, now: new Date(`${D2}T07:00:00Z`), fx: ecb(D2) }, failing)).rejects.toThrow('simulated failure');
    expect(await counts()).toEqual(before);
  });

  it('chains the second day over products valued on both days, from the first run\'s inputs', async () => {
    const result = ran(await derive(D2));
    expect(result.written).toEqual({ references: 3, indices: 7, premiums: 3 });
    const indices = await rows('market_indices', D2);
    expect(indices.map(row => [row.index_key, row.level, row.constituents, row.previous_as_of])).toEqual([
      ['one-piece:*:cardmarket', level(chainIndex('100', [...pairs(cardmarketValues, D1, D2), ...pairs(cardmarketKeyed, D1, D2)])), 26, D1],
      ['one-piece:*:cardrush', level(chainIndex('100', [...pairs(cardrushOp01, D1, D2), ...range(1, 3).map(() => ({ previous: gbp.crOp02(D1), current: gbp.crOp02(D2) })), { previous: toGbp('700', RATE.JPY), current: toGbp('700', RATE.JPY) }])), 18, D1],
      // tp-1's late page is not in the first run's ceiling, so the step uses its 06:00 value.
      ['one-piece:*:tcgplayer', level(chainIndex('100', pairs(tcgplayerValues, D1, D2))), 17, D1],
      ['one-piece:op01:cardmarket', level(chainIndex('100', pairs(cardmarketValues, D1, D2))), 16, D1],
      ['one-piece:op01:cardrush', level(chainIndex('100', pairs(cardrushOp01, D1, D2))), 14, D1],
      ['one-piece:op01:tcgplayer', level(chainIndex('100', pairs(tcgplayerValues, D1, D2))), 17, D1],
      ['one-piece:op03:cardmarket', level(chainIndex('100', pairs(cardmarketKeyed, D1, D2))), 10, D1],
    ]);
    // Every CardRush yen price rose 10%. GBP values are rounded per product
    // to 6 places before summing, so the level is 110 to within that rounding.
    expect(indices.find(row => row.index_key === 'one-piece:op01:cardrush').level).toBe('110.000005');
  });

  // Each check of a source's release row, and a source that is eligible but
  // has nothing placed, run inside a transaction that rolls back: the next
  // run is computed in full and then discarded, so later dates are untouched.
  it.each<[string, string, string]>([
    ['revoked', `UPDATE member_price_source_releases SET revoked_at = now() WHERE source = 'tcgplayer'`, 'revoked'],
    ['derivation evidence of another version', `UPDATE member_price_source_releases SET derivation_evidence_version = 'tcgplayer/2027-01-01.1' WHERE source = 'tcgplayer'`, 'evidence-mismatch'],
    ['derivation evidence at another URL', `UPDATE member_price_source_releases SET derivation_evidence_url = 'repo:docs/decisions/elsewhere.md#tcgplayer' WHERE source = 'tcgplayer'`, 'evidence-mismatch'],
    // A temporary view shadows the table for this session: the row is gone without breaking foreign keys.
    ['no release row', `CREATE TEMP VIEW member_price_source_releases AS SELECT * FROM ${schema}.member_price_source_releases WHERE source <> 'tcgplayer'`, 'no-release-row'],
    ['no crosswalk left for its observations', `UPDATE price_source_crosswalks SET superseded_at = clock_timestamp() WHERE source = 'tcgplayer' AND superseded_at IS NULL`, 'no-mapped-headline'],
  ])('leaves a source out of the next run, by name, when %s', async (_label, setup, reason) => {
    const before = await counts();
    const rolledBack = <T>(fn: (query: TxQuery) => Promise<T>) => onPool(state.pool, async query => {
      await query(setup);
      const result = await fn(query);
      throw Object.assign(new Error('rolled back'), { result });
    }).catch((error: { result?: T }) => { if (!error.result) throw error; return error.result; });
    const result = ran(await runMarketDerivation({ asOf: D3, now: new Date(`${D3}T07:00:00Z`), fx: ecb(D3) }, rolledBack));
    expect(result.excludedSources).toEqual({ tcgplayer: reason });
    expect(Object.keys(result.inputEvidence).sort()).toEqual(['cardmarket', 'cardrush']);
    expect(result.fx).not.toHaveProperty('USD');
    expect(result.written).toEqual({ references: 0, indices: 5, premiums: 1 });
    expect(await counts()).toEqual(before);
  });

  it('leaves a revoked source out of the next run entirely, and chains the rest', async () => {
    await state.pool.query(`UPDATE member_price_source_releases SET derivation = false WHERE source = 'tcgplayer'`);
    const result = ran(await derive(D3));
    expect(result).toMatchObject({ inputEvidence: { cardmarket: 'cardmarket-derivation/2026-10-28.1', cardrush: 'cardrush/2026-10-28.1' }, excludedSources: { tcgplayer: 'derivation-off' } });
    expect(result.inputEvidence).not.toHaveProperty('tcgplayer');
    expect(result.fx).not.toHaveProperty('USD');
    // No reference can stand on Cardmarket and CardRush alone.
    expect(result.written).toEqual({ references: 0, indices: 5, premiums: 1 });
    const sources = (await state.pool.query(`SELECT DISTINCT unnest(sources) AS source FROM (
      SELECT sources FROM market_reference_prices WHERE as_of = $1 UNION ALL SELECT sources FROM market_indices WHERE as_of = $1
      UNION ALL SELECT sources FROM market_premiums WHERE as_of = $1) s ORDER BY 1`, [D3])).rows.map(row => row.source);
    expect(sources).toEqual(['cardmarket', 'cardrush']);
    // No observation since the second day: the latest fresh ones carry the series flat.
    const d2 = new Map((await rows('market_indices', D2)).map(row => [row.index_key, row.level]));
    expect((await rows('market_indices', D3)).map(row => [row.index_key, row.level, row.previous_as_of])).toEqual(
      ['one-piece:*:cardmarket', 'one-piece:*:cardrush', 'one-piece:op01:cardmarket', 'one-piece:op01:cardrush', 'one-piece:op03:cardmarket'].map(key => [key, d2.get(key), D2]));
  });

  it('chains a returning source from its latest published level after a gap, and drops stale inputs', async () => {
    await state.pool.query(`UPDATE member_price_source_releases SET derivation = true WHERE source = 'tcgplayer'`);
    await writeDay(D4);
    const result = ran(await derive(D4));
    expect(result.written).toEqual({ references: 3, indices: 7, premiums: 3 });
    const d2 = new Map((await rows('market_indices', D2)).map(row => [row.index_key, row.level]));
    const d3 = new Map((await rows('market_indices', D3)).map(row => [row.index_key, row.level]));
    const indices = new Map((await rows('market_indices', D4)).map(row => [row.index_key, row]));
    expect(indices.get('one-piece:op01:tcgplayer')).toMatchObject({ previous_as_of: D2, constituents: 17, level: level(chainIndex(d2.get('one-piece:op01:tcgplayer'), pairs(tcgplayerValues, D2, D4))) });
    expect(indices.get('one-piece:op01:cardmarket')).toMatchObject({ previous_as_of: D3, constituents: 16, level: level(chainIndex(d3.get('one-piece:op01:cardmarket'), pairs(cardmarketValues, D2, D4))) });
    expect(indices.get('one-piece:op03:cardmarket')).toMatchObject({ previous_as_of: D3, constituents: 10, level: level(chainIndex(d3.get('one-piece:op03:cardmarket'), pairs(cardmarketKeyed, D2, D4))) });
    // cr-stale was last read on 2026-10-28, more than seven days before: 17 of 18 remain.
    expect(indices.get('one-piece:*:cardrush')).toMatchObject({ previous_as_of: D3, constituents: 17 });
    // Every series still has exactly one base row.
    expect((await state.pool.query(`SELECT index_key, count(*)::int AS n FROM market_indices WHERE previous_as_of IS NULL GROUP BY 1 ORDER BY 1`)).rows.every(row => row.n === 1)).toBe(true);
    expect(await derive(D4)).toMatchObject({ ok: true, ran: false, reason: 'already-derived', runId: result.runId });
  });

  // Ten days after the last run, every series' latest level is older than
  // the freshness week, so chaining needs that day's own window: a scan from
  // a week before today would find none of it and write no index.
  it('chains across a gap longer than the freshness week, reading each window\'s own week and nothing between', async () => {
    await writeDay(D5, ['cardmarket', 'cardrush']);
    const { result, arms } = await deriveScanned(D5);
    expect(arms).toEqual(['cardmarket', 'cardrush', 'tcgplayer'].flatMap(source => [
      `${source} 2026-10-30T00:00:00Z→2026-11-07T00:00:00Z`, `${source} 2026-11-09T00:00:00Z→2026-11-17T00:00:00Z`,
    ]));
    expect(result).toMatchObject({ excludedSources: { tcgplayer: 'no-fresh-observations' }, written: { references: 0, indices: 5, premiums: 1 } });
    const d4 = new Map((await rows('market_indices', D4)).map(row => [row.index_key, row.level]));
    expect((await rows('market_indices', D5)).map(row => [row.index_key, row.level, row.constituents, row.previous_as_of])).toEqual([
      ['one-piece:*:cardmarket', level(chainIndex(d4.get('one-piece:*:cardmarket'), [...pairs(cardmarketValues, D4, D5), ...pairs(cardmarketKeyed, D4, D5)])), 26, D4],
      ['one-piece:*:cardrush', level(chainIndex(d4.get('one-piece:*:cardrush'), [...pairs(cardrushOp01, D4, D5), ...range(1, 3).map(() => ({ previous: gbp.crOp02(D4), current: gbp.crOp02(D5) }))])), 17, D4],
      ['one-piece:op01:cardmarket', level(chainIndex(d4.get('one-piece:op01:cardmarket'), pairs(cardmarketValues, D4, D5))), 16, D4],
      ['one-piece:op01:cardrush', level(chainIndex(d4.get('one-piece:op01:cardrush'), pairs(cardrushOp01, D4, D5))), 14, D4],
      ['one-piece:op03:cardmarket', level(chainIndex(d4.get('one-piece:op03:cardmarket'), pairs(cardmarketKeyed, D4, D5))), 10, D4],
    ]);
  });

  // TCGplayer's series stopped at D4, twenty days before D6. While TCGplayer
  // may feed a run, that day adds its own week to TCGplayer's scan alone;
  // once it may not, the day is no window at all. Either way the scan never
  // reaches back from today to the stopped series.
  it('never widens the scan for a series that stopped long ago', async () => {
    await writeDay(D6, ['cardmarket', 'cardrush']);
    const open = await deriveScanned(D6, true);
    expect(open.arms).toEqual([
      'cardmarket 2026-11-09T00:00:00Z→2026-11-17T00:00:00Z', 'cardmarket 2026-11-19T00:00:00Z→2026-11-27T00:00:00Z',
      'cardrush 2026-11-09T00:00:00Z→2026-11-17T00:00:00Z', 'cardrush 2026-11-19T00:00:00Z→2026-11-27T00:00:00Z',
      'tcgplayer 2026-10-30T00:00:00Z→2026-11-07T00:00:00Z', 'tcgplayer 2026-11-19T00:00:00Z→2026-11-27T00:00:00Z',
    ]);
    expect(open.result.excludedSources).toEqual({ tcgplayer: 'no-fresh-observations' });

    await state.pool.query(`UPDATE member_price_source_releases SET derivation = false WHERE source = 'tcgplayer'`);
    const { result, arms } = await deriveScanned(D6);
    expect(arms).toEqual([
      'cardmarket 2026-11-09T00:00:00Z→2026-11-17T00:00:00Z', 'cardmarket 2026-11-19T00:00:00Z→2026-11-27T00:00:00Z',
      'cardrush 2026-11-09T00:00:00Z→2026-11-17T00:00:00Z', 'cardrush 2026-11-19T00:00:00Z→2026-11-27T00:00:00Z',
    ]);
    expect(result).toMatchObject({ excludedSources: { tcgplayer: 'derivation-off' }, written: { references: 0, indices: 5, premiums: 1 } });
    expect((await rows('market_indices', D6)).map(row => [row.index_key, row.constituents, row.previous_as_of])).toEqual([
      ['one-piece:*:cardmarket', 26, D5], ['one-piece:*:cardrush', 17, D5], ['one-piece:op01:cardmarket', 16, D5],
      ['one-piece:op01:cardrush', 14, D5], ['one-piece:op03:cardmarket', 10, D5],
    ]);
  });
});
