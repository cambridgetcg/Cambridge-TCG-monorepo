import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { CARDRUSH_EVIDENCE_VERSION, MEMBER_PRICE_REVIEW_VERSION, TCGPLAYER_EVIDENCE_VERSION, type NativePriceObservation } from '@cambridge-tcg/data-ingest/member-prices';

vi.mock('server-only', () => ({}));
// Every statement the reader or writer sends, so a test can say which path answered.
const state = vi.hoisted(() => ({ pool: null as unknown as import('pg').Pool, statements: [] as string[] }));
vi.mock('@/lib/db', () => ({
  query: (sql: string, params?: unknown[]) => { state.statements.push(sql); return state.pool.query(sql, params); },
  transaction: async <T>(fn: (query: (sql: string, params?: unknown[]) => Promise<import('pg').QueryResult>) => Promise<T>) => {
    const client = await state.pool.connect();
    try { await client.query('BEGIN'); const result = await fn((sql, params) => { state.statements.push(sql); return client.query(sql, params); }); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  },
}));
import { writeMemberPriceBatch } from './member-price-writer';
import { MemberPriceQueryError, parseMemberPriceQuery, readMemberPrices, type MemberPricePage, type MemberPriceUse } from '../prices/member-feed';

// Same explicit opt-in as member-prices.integration.test.ts: one disposable
// loopback database, isolated schemas, never DATABASE_URL.
//
// MIG-1 (final review): the current view moved from ranking every observation
// to member_price_latest (0144). This suite proves the two answer alike. The
// observations live in one schema; 0144 is applied in a second schema ahead of
// it on one pool's search_path. The other pool sees no latest table, so the
// reader meets the real 42P01 there and answers from the ranked statement,
// byte for byte today's. Every read is made through both, over the same rows,
// and must agree on items, totals, completeness and cursors.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const base = `member_price_latest_test_${randomUUID().replaceAll('-', '')}`;
const derived = `${base}_latest`;
const migration = (name: string) => readFile(new URL(`../../../drizzle/${name}`, import.meta.url), 'utf8');
let admin: Pool, ranked: Pool, latest: Pool;
const actor = { userId: 'fixture-member' };
const uses = ['member-display', 'member-api', 'member-download'] as const;
// A fixed clock, so both paths open the same asOf and sign identical cursors.
const NOW = new Date('2027-04-01T09:00:00.000Z');

type Source = 'cardmarket' | 'scryfall' | 'cardrush' | 'tcgplayer';
interface Key { source: Source; sourceProductId: string; metric: string; currency: 'EUR' | 'USD' | 'JPY'; finish: string | null; language: string | null; condition: string | null; game: string; product: number }
// A small key space per source, so keys move often. Scryfall's finish holds
// NULL and '' on one product: the feed's partition has always merged them.
const KEYS: Key[] = [
  ...[1, 2, 3, 4, 5, 6].flatMap(product => [['trend', null], ['avg', null], ['trend-foil', 'foil']].map(([metric, finish]) =>
    ({ source: 'cardmarket' as const, sourceProductId: String(1000 + product), metric: metric!, currency: 'EUR' as const, finish, language: null, condition: null, game: product % 2 ? 'one-piece' : 'pokemon', product }))),
  ...[1, 2, 3].flatMap(product => [null, '', 'foil'].flatMap(finish => [['usd', 'USD'], ['eur', 'EUR']].map(([metric, currency]) =>
    ({ source: 'scryfall' as const, sourceProductId: `sf-${product}`, metric: metric!, currency: currency as 'USD' | 'EUR', finish, language: 'en', condition: null, game: 'magic', product })))),
  ...[1, 2, 3, 4].flatMap(product => [null, 'parallel'].flatMap(finish => [null, 'B'].map(condition =>
    ({ source: 'cardrush' as const, sourceProductId: `cardrush-op.jp/product/${product}`, metric: 'sell', currency: 'JPY' as const, finish, language: product === 4 ? 'en' : 'ja', condition, game: 'one-piece', product })))),
  ...[1, 2, 3, 4].flatMap(product => [null, 'foil'].flatMap(finish => ['near-mint', 'lightly-played'].map(condition =>
    ({ source: 'tcgplayer' as const, sourceProductId: `tcgplayer:${product}`, metric: 'market', currency: 'USD' as const, finish, language: 'en', condition, game: product % 2 ? 'one-piece' : 'pokemon', product })))),
];
const EVIDENCE: Record<Source, string> = { cardmarket: MEMBER_PRICE_REVIEW_VERSION, scryfall: MEMBER_PRICE_REVIEW_VERSION, cardrush: CARDRUSH_EVIDENCE_VERSION, tcgplayer: TCGPLAYER_EVIDENCE_VERSION };
const MARKET = { EUR: 'cardmarket', USD: 'tcgplayer', JPY: 'cardrush' } as const;
const SKUS = ['op-op01-001-en', 'op-op01-002-ja', 'op-op02-001-en'];

/** mulberry32: a small seeded generator, so a failing walk can be replayed. */
function generator(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!, chance: (p: number) => next() < p };
}
type Random = ReturnType<typeof generator>;
const iso = (ms: number) => new Date(ms).toISOString();
// Cardmarket and Scryfall carry their file's clock, in any order across
// batches; a page's source time is the instant it was read, from 2026-10-28.
function observe(key: Key, random: Random, at?: number): NativePriceObservation {
  const page = key.source === 'cardrush' || key.source === 'tcgplayer';
  const sourceUpdatedAt = iso(at ?? (page ? Date.parse('2026-10-28T00:00:00Z') + random.int(12 * 86_400) * 1000 : Date.parse('2026-09-01T00:00:00Z') + random.int(70 * 86_400) * 1000));
  const exact = random.chance(0.3);
  const sku = exact ? random.pick(SKUS) : null;
  return {
    source: key.source, sourceProductId: key.sourceProductId, sku, setCode: sku ? sku.split('-')[1]! : null, mappingStatus: exact ? 'exact' : random.pick(['unmapped', 'ambiguous'] as const),
    // Occasionally another game, so a filter must apply to the row a key chose.
    game: random.chance(0.05) ? random.pick(['one-piece', 'pokemon', 'magic']) : key.game,
    productName: random.pick([`Zoro Alpha ${key.product}`, `Luffy Beta ${key.product}`, `Nami (OP01-00${key.product})`, null]),
    granularity: key.source === 'cardmarket' ? 'source-product' : 'printing', finish: key.finish, language: key.language, condition: key.condition, metric: key.metric,
    amount: key.currency === 'JPY' ? String(100 + random.int(9000)) : `${1 + random.int(400)}.${String(random.int(100)).padStart(2, '0')}`,
    currency: key.currency, underlyingMarket: MARKET[key.currency], sourceUpdatedAt, retrievedAt: page ? sourceUpdatedAt : iso(Date.parse(sourceUpdatedAt) + 3_600_000),
    sourceUrl: `https://example.test/${key.source}/${key.sourceProductId}`, parserVersion: `${key.source}-fixture/1`, crosswalkVersion: exact ? 'exact/1' : 'none',
    evidenceVersion: EVIDENCE[key.source], artifactSha256: randomUUID().replaceAll('-', '').repeat(2),
    catalogSourceUrl: key.source === 'cardmarket' ? 'https://example.test/catalog.json' : null, catalogUpdatedAt: key.source === 'cardmarket' ? '2026-08-01T12:00:00.000Z' : null,
    catalogArtifactSha256: key.source === 'cardmarket' ? 'b'.repeat(64) : null, quality: 'accepted', sourceSetKey: random.chance(0.5) ? 'OP01' : null,
  };
}
const write = (rows: NativePriceObservation[]) => writeMemberPriceBatch(rows[0]!.source, { observations: rows, quarantine: [], sourceRows: rows.length, missingPrices: 0 });
async function apply(pool: Pool, name: string) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query(await migration(name)); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
// A batch written past the writer, as an operator's script might: under 0137's
// lock, into its own batch. Here it stores rows under another review's evidence.
async function directBatch(rows: NativePriceObservation[], evidenceVersion: string) {
  const client = await latest.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(137, 1)');
    const batch = await client.query(`INSERT INTO member_price_batches (ingest_key,source,source_rows,missing_prices) VALUES ($1,$2,$3,0) RETURNING id`, [`direct:${randomUUID()}`, rows[0]!.source, rows.length]);
    for (const row of rows) await client.query(`INSERT INTO member_price_observations
      (batch_id,observation_key,source,source_product_id,sku,mapping_status,game,set_code,product_name,granularity,finish,language,condition,metric,amount,currency,underlying_market,source_updated_at,retrieved_at,source_url,parser_version,crosswalk_version,evidence_version,artifact_sha256,quality)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'accepted')`,
    [batch.rows[0].id, randomUUID(), row.source, row.sourceProductId, row.sku, row.mappingStatus, row.game, row.setCode, row.productName, row.granularity, row.finish, row.language, row.condition, row.metric, row.amount, row.currency, row.underlyingMarket, row.sourceUpdatedAt, row.retrievedAt, row.sourceUrl, row.parserVersion, row.crosswalkVersion, evidenceVersion, row.artifactSha256]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

type Outcome = { ok: true; page: MemberPricePage } | { ok: false; error: string };
async function readThrough(pool: Pool, use: MemberPriceUse, params: Record<string, string>, cursor?: string): Promise<{ outcome: Outcome; statements: string[] }> {
  state.pool = pool;
  state.statements = [];
  try {
    const page = await readMemberPrices(actor, { ...parseMemberPriceQuery(new URLSearchParams(params)), ...(cursor ? { cursor } : {}) }, use);
    return { outcome: { ok: true, page }, statements: state.statements };
  } catch (error) {
    if (!(error instanceof MemberPriceQueryError)) throw error;
    return { outcome: { ok: false, error: error.message }, statements: state.statements };
  } finally { state.pool = latest; }
}
const watermarkOf = (cursor: string) => (JSON.parse(Buffer.from(cursor.split('.')[0]!, 'base64url').toString()) as { watermark: string }).watermark;
// Which way member_price_latest answered each key at the watermarks cursors carried.
const branches = { latest: 0, previous: 0, ownObservations: 0 };
let latestApplied = false;
let chains = 0, pages = 0;
/** One cursor chain through both paths, page by page; `between` runs after each page. */
async function compare(use: MemberPriceUse, params: Record<string, string>, between?: () => Promise<void>) {
  chains++;
  let cursor: string | undefined;
  for (let page = 0; page < 6; page++) {
    const bounded = await readThrough(latest, use, params, cursor);
    const before = await readThrough(ranked, use, params, cursor);
    expect({ use, params, page, outcome: bounded.outcome }).toEqual({ use, params, page, outcome: before.outcome });
    pages++;
    if (!bounded.outcome.ok) return;
    // Two broken paths would agree; neither may be unavailable.
    expect(bounded.outcome.page.status).not.toBe('unavailable');
    if (bounded.statements.length && (params.mode ?? 'current') === 'current') {
      // The ranked pool meets 42P01 and answers from today's statement; the
      // latest pool answers once 0144 is applied, in one statement.
      expect(before.statements.map(sql => sql.includes('FROM member_price_latest l'))).toEqual([true, false]);
      expect(bounded.statements.map(sql => sql.includes('FROM member_price_latest l'))).toEqual(latestApplied ? [true] : [true, false]);
      if (latestApplied && cursor) {
        const counts = (await latest.query(`SELECT count(*) FILTER (WHERE batch_id <= $1)::int AS latest, count(*) FILTER (WHERE batch_id > $1 AND previous_batch_id <= $1)::int AS previous,
          count(*) FILTER (WHERE batch_id > $1 AND previous_batch_id > $1)::int AS own FROM member_price_latest`, [watermarkOf(cursor)])).rows[0];
        branches.latest += counts.latest; branches.previous += counts.previous; branches.ownObservations += counts.own;
      }
    }
    cursor = bounded.outcome.page.nextCursor ?? undefined;
    if (!cursor) return;
    if (between) await between();
  }
}
// Each use against a spread of filters and page sizes, display-only bounds included.
const SWEEP: Record<string, string>[] = [
  {}, { limit: '1' }, { limit: '3' }, { limit: '50' }, { limit: '500' }, { mode: 'history', limit: '7' }, { mode: 'history', limit: '500' },
  { source: 'cardmarket', limit: '2' }, { source: 'scryfall', limit: '5' }, { source: 'cardrush', limit: '50', q: 'cardrush' }, { source: 'tcgplayer', limit: '3', q: 'tcgplayer' },
  { q: 'zoro', limit: '2' }, { q: 'Alpha', limit: '50' }, { q: 'OP01-00', limit: '4' }, { q: 'product/3', limit: '1' }, { q: '100', limit: '5' },
  { game: 'one-piece', limit: '6' }, { game: 'one-piece', set: 'op01', limit: '2' }, { set: 'op02', limit: '3' }, { sku: 'op-op01-001-en', limit: '1' },
  { metric: 'trend', limit: '4' }, { metric: 'market', q: 'Luffy', limit: '3' }, { metric: 'sell', limit: '50', game: 'one-piece', set: 'op01' }, { mode: 'history', q: 'Nami', limit: '3' },
];
const sweep = async () => { for (const use of uses) for (const params of SWEEP) await compare(use, params); };

function randomQuery(random: Random): [MemberPriceUse, Record<string, string>] {
  const params: Record<string, string> = {};
  if (random.chance(0.3)) params.source = random.pick(['cardmarket', 'scryfall', 'cardrush', 'tcgplayer']);
  if (random.chance(0.25)) params.game = random.pick(['one-piece', 'pokemon', 'magic']);
  if (random.chance(0.15)) params.set = random.pick(['op01', 'op02']);
  if (random.chance(0.12)) params.sku = random.pick(SKUS);
  if (random.chance(0.2)) params.metric = random.pick(['trend', 'avg', 'trend-foil', 'usd', 'eur', 'sell', 'market']);
  if (random.chance(0.4)) params.q = random.pick(['zoro', 'Alpha', 'luffy', 'OP01-00', '100', 'cardrush', 'product/3', 'tcgplayer:2', 'sf-']);
  if (random.chance(0.2)) params.mode = 'history';
  params.limit = String(random.pick([1, 2, 3, 5, 50, 100, 500]));
  return [random.pick(uses), params];
}
// The release rows as 0137 and 0139 seed them, restored between walks.
const RESTORE = `UPDATE member_price_source_releases SET revoked_at = NULL, member_display = true,
  member_api = source = 'cardmarket', member_download = source = 'cardmarket',
  evidence_version = CASE WHEN evidence_version LIKE 'flipped:%' THEN substr(evidence_version, 9) ELSE evidence_version END`;
const FLIPS = [
  `UPDATE member_price_source_releases SET revoked_at = CASE WHEN revoked_at IS NULL THEN now() END WHERE source = $1`,
  `UPDATE member_price_source_releases SET member_display = NOT member_display WHERE source = $1`,
  `UPDATE member_price_source_releases SET member_api = NOT member_api WHERE source = 'cardmarket' AND $1::text IS NOT NULL`,
  `UPDATE member_price_source_releases SET member_download = NOT member_download WHERE source = 'cardmarket' AND $1::text IS NOT NULL`,
  `UPDATE member_price_source_releases SET evidence_version = CASE WHEN evidence_version LIKE 'flipped:%' THEN substr(evidence_version, 9) ELSE 'flipped:' || evidence_version END WHERE source = $1`,
];
async function writable(): Promise<Source[]> {
  return (await latest.query(`SELECT source FROM member_price_source_releases WHERE revoked_at IS NULL AND member_display AND evidence_version NOT LIKE 'flipped:%' ORDER BY source`)).rows.map(row => row.source);
}
/** A batch of one writable source: a few rows, some keys more than once, and
 * now and then more than one 500-row chunk, so a key moves twice in one batch. */
async function randomBatch(random: Random) {
  const sources = await writable();
  if (!sources.length) return;
  const source = random.pick(sources);
  const keys = KEYS.filter(key => key.source === source);
  const count = random.chance(0.06) ? 501 + random.int(20) : 1 + random.int(10);
  await write(Array.from({ length: count }, () => observe(random.pick(keys), random)));
}
// Later than every random time, so each of these batches moves the keys it names.
let clock = Date.parse('2027-01-01T00:00:00Z');
/** Batches that each move some keys of one source: between two pages, those
 * keys have moved once (read from previous) or more (from their own rows). */
async function move(random: Random, times: number) {
  const sources = await writable();
  if (!sources.length) return;
  const source = random.pick(sources);
  const keys = KEYS.filter(key => key.source === source && random.chance(0.6));
  if (!keys.length) return;
  for (let n = 0; n < times; n++) await write(keys.map(key => observe(key, random, clock += 60_000)));
}
async function randomStep(random: Random) {
  const roll = random.next();
  if (roll < 0.6) await randomBatch(random);
  else if (roll < 0.85) await latest.query(random.pick(FLIPS), [random.pick(['cardmarket', 'scryfall', 'cardrush', 'tcgplayer'])]);
  else if (roll < 0.95) await latest.query(RESTORE);
  else await directBatch([observe(random.pick(KEYS.filter(key => key.source === 'cardmarket')), random)], 'member-prices/2025-01-01.0');
}

/** The derived index recomputed from the observations in plain code: per key,
 * the latest by (source time, id), and the latest of the batches before it. */
async function expectLatestDerived() {
  const observations = (await latest.query(`SELECT id::text, batch_id::text, source_updated_at, source, evidence_version, source_product_id, metric, currency,
    COALESCE(finish, '') AS finish, COALESCE(language, '') AS language, COALESCE(condition, '') AS condition FROM member_price_observations WHERE quality = 'accepted'`)).rows;
  const keyOf = (row: Record<string, unknown>) => JSON.stringify([row.source, row.evidence_version, row.source_product_id, row.metric, row.currency, row.finish, row.language, row.condition]);
  const later = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const at = (a.source_updated_at as Date).getTime() - (b.source_updated_at as Date).getTime();
    return at !== 0 ? at > 0 : BigInt(a.id as string) > BigInt(b.id as string);
  };
  const byKey = new Map<string, Record<string, unknown>[]>();
  for (const row of observations) byKey.set(keyOf(row), [...(byKey.get(keyOf(row)) ?? []), row]);
  const expected = [...byKey].map(([key, rows]) => {
    const top = rows.reduce((best, row) => later(row, best) ? row : best);
    const before = rows.filter(row => BigInt(row.batch_id as string) < BigInt(top.batch_id as string));
    const previous = before.length ? before.reduce((best, row) => later(row, best) ? row : best) : null;
    return [key, top.id, top.batch_id, (top.source_updated_at as Date).toISOString(), previous?.id ?? null, previous?.batch_id ?? null];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const stored = (await latest.query(`SELECT source, evidence_version, source_product_id, metric, currency, finish, language, condition, observation_id::text, batch_id::text, source_updated_at,
    previous_observation_id::text, previous_batch_id::text FROM member_price_latest`)).rows
    .map(row => [keyOf(row), row.observation_id, row.batch_id, (row.source_updated_at as Date).toISOString(), row.previous_observation_id, row.previous_batch_id])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  expect(stored).toEqual(expected);
  return stored.length;
}

// The walk compares a few thousand pages, past vitest's 5 s default.
describe.skipIf(!localUrl)('member price latest index PostgreSQL integration (explicit loopback DB only)', { timeout: 300_000 }, () => {
  let before0144: string[] = [];
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.includes('test') || url.search) throw new Error('Explicit disposable local test database required');
    process.env.AUTH_SECRET = 'fixture-only-cursor-secret-not-a-production-key';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${base}`);
    await admin.query(`CREATE SCHEMA ${derived}`);
    ranked = new Pool({ connectionString: localUrl, options: `-c search_path=${base}`, max: 4 });
    latest = new Pool({ connectionString: localUrl, options: `-c search_path=${derived},${base}`, max: 4 });
    state.pool = latest;
    await apply(ranked, '0137_member_price_observations.sql');
    await apply(ranked, '0139_widen_price_sources.sql');
  });
  afterAll(async () => {
    vi.useRealTimers();
    for (const pool of [ranked, latest]) if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${derived} CASCADE`); await admin.query(`DROP SCHEMA IF EXISTS ${base} CASCADE`); await admin.end(); }
  });

  it('answers exactly as before on a store without 0144, and the writer sends what it always sent', async () => {
    const random = generator(20261029);
    for (let i = 0; i < 40; i++) await randomBatch(random);
    // Rows under another review's evidence, newer than this review's: they
    // must never hide this review's latest, before 0144 or after it.
    await directBatch(KEYS.filter(key => key.source === 'cardmarket').slice(0, 6).map(key => observe(key, random, Date.parse('2026-12-01T00:00:00Z'))), 'member-prices/2025-01-01.0');
    state.statements = [];
    await write([observe(KEYS[0]!, random), { ...observe(KEYS[1]!, random), sourceSetKey: '5229' }]);
    before0144 = [...state.statements];
    expect(before0144.some(sql => sql.includes('member_price_latest'))).toBe(false);
    await sweep();
  });

  it('0144 backfills one row a key: its latest observation and the latest before its batch', async () => {
    await apply(latest, '0144_member_price_latest.sql');
    latestApplied = true;
    expect(await expectLatestDerived()).toBeGreaterThan(40);
    // The other review's rows are their own keys, beside this review's.
    expect((await latest.query(`SELECT count(*)::int AS n FROM member_price_latest WHERE evidence_version = 'member-prices/2025-01-01.0'`)).rows[0].n).toBe(6);
    await sweep();
  });

  it('answers every use, filter and page exactly as ranking every observation does, through random batches, revocations and batches committed between pages', async () => {
    for (const seed of [7, 1337, 20261029]) {
      const random = generator(seed);
      for (let step = 0; step < 70; step++) {
        await randomStep(random);
        const [use, params] = randomQuery(random);
        // Some chains see batches and release changes land between their pages.
        await compare(use, params, random.chance(0.5) ? async () => {
          if (random.chance(0.6)) await move(random, 1 + random.int(2));
          for (let n = random.int(3); n >= 0; n--) await randomStep(random);
        } : undefined);
      }
      await latest.query(RESTORE);
      await sweep();
      await expectLatestDerived();
    }
    // Each way the index answers a key under a cursor's watermark was taken.
    expect(branches.latest).toBeGreaterThan(0);
    expect(branches.previous).toBeGreaterThan(0);
    expect(branches.ownObservations).toBeGreaterThan(0);
    expect(chains).toBeGreaterThan(400);
    console.log(`[member-price-latest] ${chains} chains, ${pages} pages compared; keys answered at cursor watermarks by latest ${branches.latest}, previous ${branches.previous}, own observations ${branches.ownObservations}`);
  });

  it('reads a key moved twice since a cursor\'s watermark from its own observations, and leaves out a key first seen after it', async () => {
    const random = generator(42);
    const [x, y] = KEYS.filter(key => key.source === 'tcgplayer' && key.product === 2);
    const name = (row: NativePriceObservation) => ({ ...row, productName: 'Deep shelf', game: 'pokemon', sku: null, setCode: null, mappingStatus: 'unmapped' as const });
    // Later than every reading so far, so these rows are each key's latest.
    const t = clock += 86_400_000;
    clock += 86_400_000;
    await write([name(observe(x!, random, t)), name(observe(y!, random, t))]);
    const params = { q: 'Deep shelf', limit: '1' };
    const first = await readThrough(latest, 'member-display', params);
    expect(first.outcome.ok && first.outcome.page.count).toBe(1);
    const cursor = (first.outcome as { page: MemberPricePage }).page.nextCursor!;
    const watermark = watermarkOf(cursor);
    // x moves twice, y once, y again backwards in time (no move), and a new key arrives.
    await write([name(observe(x!, random, t + 60_000))]);
    await write([name(observe(x!, random, t + 120_000)), name(observe(y!, random, t + 60_000))]);
    await write([name(observe(y!, random, t - 60_000)), name(observe({ ...y!, sourceProductId: 'tcgplayer:first-seen-later', product: 9 }, random, t))]);
    const moved = (await latest.query(`SELECT source_product_id, finish, condition, batch_id > $1 AS moved, previous_batch_id > $1 AS twice FROM member_price_latest
      WHERE source = 'tcgplayer' AND source_product_id = 'tcgplayer:2' AND (finish, condition) IN ((''::text, 'near-mint'::text), ('', 'lightly-played'))`, [watermark])).rows;
    expect(moved).toEqual(expect.arrayContaining([expect.objectContaining({ condition: 'near-mint', moved: true, twice: true }), expect.objectContaining({ condition: 'lightly-played', moved: true, twice: false })]));
    const second = await readThrough(latest, 'member-display', params, cursor);
    const again = await readThrough(ranked, 'member-display', params, cursor);
    expect(second.outcome).toEqual(again.outcome);
    // Page 2 is the row y had at the watermark, and the chain still counts two.
    const page = (second.outcome as { page: MemberPricePage }).page;
    expect(page).toMatchObject({ total: 2, count: 1, complete: true, watermark });
    expect(page.items[0]).toMatchObject({ sourceProductId: 'tcgplayer:2', sourceUpdatedAt: iso(t) });
    await compare('member-display', params);
  });

  it('keeps a key\'s previous when one batch moves it in two statements', async () => {
    const random = generator(99);
    const key = KEYS.find(entry => entry.source === 'cardmarket' && entry.product === 5 && entry.metric === 'avg')!;
    const others = KEYS.filter(entry => entry.source === 'cardmarket' && entry.product !== 5);
    const t = clock += 3 * 86_400_000;
    clock += 86_400_000;
    await write([observe(key, random, t - 2 * 86_400_000)]);
    const before = (await latest.query(`SELECT observation_id::text, batch_id::text FROM member_price_latest WHERE source = 'cardmarket' AND source_product_id = $1 AND metric = 'avg' AND evidence_version = $2`, [key.sourceProductId, MEMBER_PRICE_REVIEW_VERSION])).rows[0];
    // 501 rows: the writer's first 500-row statement moves the key, its second moves it again.
    const rows = [observe(key, random, t), ...Array.from({ length: 499 }, (_, i) => observe(others[i % others.length]!, random, t - 86_400_000 - i * 1000)), observe(key, random, t + 1000)];
    const written = await write(rows);
    expect(written.inserted).toBe(501);
    const after = (await latest.query(`SELECT l.batch_id::text, l.previous_observation_id::text, l.previous_batch_id::text, o.source_updated_at FROM member_price_latest l
      JOIN member_price_observations o ON o.id = l.observation_id WHERE l.source = 'cardmarket' AND l.source_product_id = $1 AND l.metric = 'avg' AND l.evidence_version = $2`, [key.sourceProductId, MEMBER_PRICE_REVIEW_VERSION])).rows[0];
    expect(after).toMatchObject({ batch_id: written.batchId, previous_observation_id: before.observation_id, previous_batch_id: before.batch_id });
    expect((after.source_updated_at as Date).toISOString()).toBe(iso(t + 1000));
    await expectLatestDerived();
    await sweep();
  });

  it('leaves the writer\'s statements as they were: the insert itself advances the index, and rolls back with it', async () => {
    const random = generator(5);
    state.statements = [];
    await write([observe(KEYS[0]!, random), { ...observe(KEYS[1]!, random), sourceSetKey: '5229' }]);
    expect(state.statements).toEqual(before0144);
    const snapshot = async () => (await latest.query(`SELECT (SELECT count(*) FROM member_price_observations)::int AS observations, (SELECT md5(string_agg(l::text, ',' ORDER BY l::text)) FROM member_price_latest l) AS latest`)).rows[0];
    const held = await snapshot();
    const failing: Parameters<typeof writeMemberPriceBatch>[2] = async work => {
      const client = await latest.connect();
      try { await client.query('BEGIN'); await work(async (sql, params) => { const { rows, rowCount } = await client.query(sql, params); return { rows, rowCount: rowCount ?? 0 }; }); throw new Error('fixture failure after the inserts'); }
      finally { await client.query('ROLLBACK'); client.release(); }
    };
    await expect(writeMemberPriceBatch('cardmarket', { observations: KEYS.filter(key => key.source === 'cardmarket').map(key => observe(key, random, Date.parse('2027-01-01T00:00:00Z'))), quarantine: [], sourceRows: 18, missingPrices: 0 }, failing)).rejects.toThrow(/fixture failure/);
    expect(await snapshot()).toEqual(held);
    // While a batch is held open, readers on either path see neither its rows nor its index.
    const blocker = await latest.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(137, 1)');
      const batch = await blocker.query(`INSERT INTO member_price_batches (ingest_key,source,source_rows,missing_prices) VALUES ('held-open','cardmarket',1,0) RETURNING id`);
      const row = observe(KEYS[2]!, random, Date.parse('2027-02-01T00:00:00Z'));
      await blocker.query(`INSERT INTO member_price_observations (batch_id,observation_key,source,source_product_id,mapping_status,game,granularity,finish,metric,amount,currency,underlying_market,source_updated_at,retrieved_at,source_url,parser_version,crosswalk_version,evidence_version,artifact_sha256,quality)
        VALUES ($1,'held-open','cardmarket',$2,'unmapped','one-piece','source-product',$3,$4,9.99,'EUR','cardmarket',$5,$5,'https://example.test/held','fixture/1','none',$6,$7,'accepted')`,
      [batch.rows[0].id, row.sourceProductId, row.finish, row.metric, row.sourceUpdatedAt, MEMBER_PRICE_REVIEW_VERSION, 'c'.repeat(64)]);
      await compare('member-api', { source: 'cardmarket', limit: '5' });
      expect(await snapshot()).toEqual(held);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  });

  it('refuses any change to the index but an advance by the batch inserting it', async () => {
    const one = (await latest.query(`SELECT * FROM member_price_latest WHERE source = 'cardmarket' AND previous_observation_id IS NOT NULL ORDER BY observation_id LIMIT 1`)).rows[0];
    const later = [iso(clock += 86_400_000), iso(clock += 86_400_000)];
    await expect(latest.query(`DELETE FROM member_price_latest WHERE observation_id = $1`, [one.observation_id])).rejects.toThrow(/keeps every observed key/);
    await expect(latest.query(`TRUNCATE member_price_latest`)).rejects.toThrow(/keeps every observed key/);
    // Outside a writer's transaction, no row may move, forward or back, nor enter.
    await expect(latest.query(`UPDATE member_price_latest SET observation_id = previous_observation_id, batch_id = previous_batch_id WHERE observation_id = $1`, [one.observation_id])).rejects.toThrow(/advances only to an observation/);
    await expect(latest.query(`UPDATE member_price_latest SET source_updated_at = source_updated_at + interval '1 day' WHERE observation_id = $1`, [one.observation_id])).rejects.toThrow(/advances only to an observation/);
    await expect(latest.query(`INSERT INTO member_price_latest SELECT source, evidence_version, source_product_id || '-copy', metric, currency, finish, language, condition, observation_id, batch_id, source_updated_at, NULL, NULL
      FROM member_price_latest WHERE observation_id = $1`, [one.observation_id])).rejects.toThrow(/advances only to an observation/);
    // Inside one, only forward, to its own rows, keeping the replaced row as previous.
    const client = await latest.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(137, 1)');
      const batch = (await client.query(`INSERT INTO member_price_batches (ingest_key,source,source_rows,missing_prices) VALUES ('guard-fixture','cardmarket',1,0) RETURNING id::text`)).rows[0].id as string;
      const observation = (await client.query(`INSERT INTO member_price_observations (batch_id,observation_key,source,source_product_id,mapping_status,game,granularity,finish,language,condition,metric,amount,currency,underlying_market,source_updated_at,retrieved_at,source_url,parser_version,crosswalk_version,evidence_version,artifact_sha256,quality)
        VALUES ($1,'guard-fixture','cardmarket',$2,'unmapped','one-piece','source-product',NULLIF($3,''),NULL,NULL,$4,9.99,'EUR','cardmarket',$7,$7,'https://example.test/guard','fixture/1','none',$5,$6,'accepted') RETURNING id::text`,
      [batch, one.source_product_id, one.finish, one.metric, one.evidence_version, 'd'.repeat(64), later[0]])).rows[0].id as string;
      const advanced = (await client.query(`SELECT observation_id::text, previous_observation_id::text FROM member_price_latest WHERE source = $1 AND evidence_version = $2 AND source_product_id = $3 AND metric = $4 AND finish = $5`,
        [one.source, one.evidence_version, one.source_product_id, one.metric, one.finish])).rows[0];
      expect(advanced).toEqual({ observation_id: observation, previous_observation_id: String(one.observation_id) });
      const attempt = async (sql: string, params: unknown[], refusal: RegExp) => {
        await client.query('SAVEPOINT attempt');
        await expect(client.query(sql, params)).rejects.toThrow(refusal);
        await client.query('ROLLBACK TO SAVEPOINT attempt');
      };
      await attempt(`UPDATE member_price_latest SET observation_id = $2, batch_id = $3 WHERE observation_id = $1`, [observation, one.observation_id, one.batch_id], /advances only to an observation/);
      await attempt(`UPDATE member_price_latest SET previous_observation_id = NULL, previous_batch_id = NULL WHERE observation_id = $1`, [observation], /only moves forward/);
      await attempt(`INSERT INTO member_price_latest VALUES ($1,$2,$3,'other-metric',$4,$5,$6,$7,$8,$9,$10,NULL,NULL)`,
        [one.source, one.evidence_version, one.source_product_id, one.currency, one.finish, one.language, one.condition, observation, batch, later[0]], /advances only to an observation/);
      // A key missing from the index while it has earlier observations cannot be entered as new.
      await client.query('ALTER TABLE member_price_latest DISABLE TRIGGER member_price_latest_kept');
      await client.query(`DELETE FROM member_price_latest WHERE observation_id = $1`, [observation]);
      await client.query('ALTER TABLE member_price_latest ENABLE TRIGGER member_price_latest_kept');
      await attempt(`INSERT INTO member_price_observations (batch_id,observation_key,source,source_product_id,mapping_status,game,granularity,finish,metric,amount,currency,underlying_market,source_updated_at,retrieved_at,source_url,parser_version,crosswalk_version,evidence_version,artifact_sha256,quality)
        VALUES ($1,'guard-fixture-2','cardmarket',$2,'unmapped','one-piece','source-product',NULLIF($3,''),$4,8.88,'EUR','cardmarket',$7,$7,'https://example.test/guard','fixture/1','none',$5,$6,'accepted')`,
      [batch, one.source_product_id, one.finish, one.metric, one.evidence_version, 'e'.repeat(64), later[1]], /enters the latest member price index with its first observation/);
    } finally { await client.query('ROLLBACK'); client.release(); }
    await expectLatestDerived();
  });
});
