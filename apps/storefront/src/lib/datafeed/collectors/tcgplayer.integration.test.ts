import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { Fetcher } from '@cambridge-tcg/data-ingest/http';
import { parseTcgplayerPriceGuide, parseTcgplayerSets, TCGPLAYER_PRODUCT_LINES } from '@cambridge-tcg/data-ingest/tcgplayer/member-prices';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ pool: null as unknown as import('pg').Pool }));
vi.mock('@/lib/db', () => ({
  query: (sql: string, params?: unknown[]) => state.pool.query(sql, params),
  transaction: async <T>(fn: (query: (sql: string, params?: unknown[]) => Promise<import('pg').QueryResult>) => Promise<T>) => {
    const client = await state.pool.connect();
    try { await client.query('BEGIN'); const result = await fn((sql, params) => client.query(sql, params)); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  },
}));
import { collectTcgplayer } from './tcgplayer';
import { writeMemberPriceBatch } from '../member-price-writer';
import { writeProductCrosswalk } from '../crosswalks';

// Same explicit opt-in as price-sources.integration.test.ts: one disposable
// loopback database, an isolated schema, never DATABASE_URL.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const schema = `tcgplayer_collector_test_${randomUUID().replaceAll('-', '')}`;
const migration = (name: string) => readFile(new URL(`../../../../drizzle/${name}`, import.meta.url), 'utf8');
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../../../../packages/data-ingest/src/tcgplayer/__tests__/fixtures/${name}`, import.meta.url), 'utf8'));
let admin: Pool;

const lines = TCGPLAYER_PRODUCT_LINES.filter(line => line.slug === 'one-piece-card-game' || line.slug === 'pokemon-japan');
const row = (productID: number, number: string, game = 'One Piece Card Game', condition = 'Near Mint') =>
  ({ productID, productConditionID: 0, condition, game, isSupplemental: false, lowPrice: 0.5, marketPrice: 1.25, number, printing: 'Normal', productName: `Card ${productID}`, rarity: 'Common', sales: 0, set: 'Synthetic', setAbbrv: 'X', type: 'Cards' });
const guide = (rows: unknown[]) => ({ count: rows.length, total: rows.length, result: rows });
/** Set guides for the trimmed set lists: two fixtures as read, the rest synthetic. */
const guides: Record<number, unknown> = {
  3188: fixture('price-guide-3188-op01.json'),
  3189: guide([row(900001, 'ST01-001')]),
  17659: guide([row(900002, 'ST01-001')]),
  17675: guide([row(900003, 'P-001')]),
  24537: guide([row(900004, 'OP14-001'), row(900005, 'EB04-001')]),
  24664: guide([row(900006, 'OP16-001')]),
  23598: fixture('price-guide-23598-sv1a.json'),
  23599: guide([row(900007, '001/165', 'Pokemon Japan', 'Near Mint - Japanese')]),
  24172: guide([]),
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
/** A stand-in for the run's fetcher: the clock moves `step` per request, as
 * the shared bucket would make it, and `refuse` answers one URL with a 429.
 */
function source(clock: { at: number }, step: number, refuse?: string, answer: (url: string) => unknown = () => undefined) {
  const urls: string[] = [];
  const f = vi.fn(async (url: string) => {
    urls.push(url); clock.at += step;
    if (url === refuse) return new Response('Too many requests', { status: 429 });
    const given = answer(url);
    if (given !== undefined) return json(given);
    // No robots.txt on any host, as both data hosts answered on 2026-10-28: no rule, the recorded 10 s.
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    const set = /\/priceguide\/set\/(\d+)\/cards\//.exec(url);
    if (set) return json(guides[Number(set[1])]);
    const category = /SetNames\?categoryId=(\d+)&active=true$/.exec(url)?.[1] ?? /ProductTypes\/(\d+)\/$/.exec(url)?.[1];
    return json(fixture(url.includes('SetNames') ? `set-names-${category}.json` : `product-types-${category}.json`));
  });
  return Object.defineProperties(f, { count: { get: () => urls.length }, via_proxy: { value: null }, via_proxy_label: { value: null }, urls: { value: urls } }) as unknown as Fetcher & { urls: string[] };
}
const guideUrl = (setId: number, type: number) => `https://infinite-api.tcgplayer.com/priceguide/set/${setId}/cards/?rows=5000&productTypeID=${type}`;
const ROBOTS = ['https://www.tcgplayer.com/robots.txt', 'https://mpapi.tcgplayer.com/robots.txt', 'https://infinite-api.tcgplayer.com/robots.txt'];
/** A run that got its lease. */
async function collect(options: Parameters<typeof collectTcgplayer>[0]) {
  const run = await collectTcgplayer(options);
  if (!run.ran) throw new Error(`not run: ${run.reason}`);
  return run;
}
/** The 10 s a finished run's lease keeps between its end and the next run's
 * first request, as passed: these runs' clocks are simulated, the database's is not. */
const spacingPassed = () => state.pool.query(`UPDATE price_collector_leases SET expires_at = acquired_at + interval '1 millisecond' WHERE lease_key = 'tcgplayer' AND holder = 'request-spacing'`);
async function apply(name: string) {
  const client = await state.pool.connect();
  try { await client.query('BEGIN'); await client.query(await migration(name)); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

describe.skipIf(!localUrl)('TCGplayer collector PostgreSQL integration (explicit loopback DB only)', () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.includes('test') || url.search) throw new Error('Explicit disposable local test database required');
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 8 });
    // 0138 needs only the users table it references.
    await state.pool.query('CREATE TABLE users (id uuid PRIMARY KEY)');
    for (const name of ['0137_member_price_observations.sql', '0138_member_data_keys.sql', '0139_widen_price_sources.sql', '0140_price_source_crosswalks.sql', '0143_price_collector_leases.sql']) await apply(name);
    // Romance Dawn was read once already, earlier today.
    const onePiece = lines[0]!;
    const romanceDawn = parseTcgplayerSets(onePiece, fixture('set-names-68.json'))[0]!;
    const earlier = parseTcgplayerPriceGuide({ line: onePiece, set: romanceDawn, bytes: new TextEncoder().encode(JSON.stringify(guides[3188])), sourceUrl: guideUrl(3188, 110), retrievedAt: '2026-10-28T01:00:00.000Z' });
    await writeMemberPriceBatch('tcgplayer', earlier.parsed, undefined, { ingestKey: 'tcgplayer:3188:2026-10-28T01:00:00.000Z' });
    // An operator's live decision for one Romance Dawn printing, under its own version...
    await writeProductCrosswalk({ source: 'tcgplayer', sourceProductId: 'tcgplayer:454591', finish: 'normal', language: 'en', game: 'one-piece', mappingStatus: 'ambiguous', sku: null, setCode: null, evidence: 'operator: synthetic review for this test', crosswalkVersion: 'operator-review/1' });
    // ...and the collector's own earlier rule's answer for a starter-deck card.
    await writeProductCrosswalk({ source: 'tcgplayer', sourceProductId: 'tcgplayer:900001', finish: 'normal', language: 'en', game: 'one-piece', mappingStatus: 'ambiguous', sku: null, setCode: null, evidence: 'number:ST01-001 under an earlier rule', crosswalkVersion: 'tcgplayer-number/0' });
  });
  afterAll(async () => {
    if (state.pool) await state.pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it('reads never-read sets first, newest release first, one named batch per set, and writes their crosswalks', async () => {
    const clock = { at: Date.parse('2026-10-28T16:00:00.000Z') };
    const fetcher = source(clock, 10_000);
    const run = await collect({ fetcher, now: () => clock.at, lines });
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'all-sets-read', runAt: '2026-10-28T16:00:00.000Z', requests: 16, setsListed: 9, errors: [] });
    expect(fetcher.urls).toEqual([
      // robots.txt for every host, read this run, before any data.
      ...ROBOTS,
      'https://mpapi.tcgplayer.com/v2/Catalog/SetNames?categoryId=68&active=true',
      'https://mpapi.tcgplayer.com/v2/Catalog/SetNames?categoryId=85&active=true',
      'https://mpapi.tcgplayer.com/v2/Product/ProductTypes/68/',
      guideUrl(24664, 110), guideUrl(24537, 110),
      'https://mpapi.tcgplayer.com/v2/Product/ProductTypes/85/',
      guideUrl(23599, 143), guideUrl(23598, 143),
      guideUrl(3189, 110), guideUrl(17659, 110), guideUrl(17675, 110), guideUrl(24172, 143),
      // Read before, so last.
      guideUrl(3188, 110),
    ]);
    const batches = (await state.pool.query(`SELECT ingest_key, source_rows FROM member_price_batches WHERE ingest_key LIKE '%:2026-10-28T16:00:00.000Z' ORDER BY id`)).rows;
    expect(batches.map(batch => batch.ingest_key)).toEqual([24664, 24537, 23599, 23598, 3189, 17659, 17675, 24172, 3188].map(id => `tcgplayer:${id}:2026-10-28T16:00:00.000Z`));
    expect(batches.find(batch => batch.ingest_key.startsWith('tcgplayer:24172:'))!.source_rows).toBe(0);
    expect(run.sets.find(set => set.setId === 3188)).toMatchObject({ observations: 12, inserted: 12, mapped: 6, setCode: 'op01', duplicate: false });

    // Set crosswalks only where the number prefix is TCGplayer's own abbreviation.
    const sets = (await state.pool.query(`SELECT source_set_key, game, set_code, evidence FROM price_source_set_crosswalks WHERE source='tcgplayer' AND superseded_at IS NULL ORDER BY source_set_key`)).rows;
    expect(sets).toEqual([
      { source_set_key: '24664', game: 'one-piece', set_code: 'op16', evidence: 'abbreviation:OP16 number-prefix:OP16 products:1' },
      { source_set_key: '3188', game: 'one-piece', set_code: 'op01', evidence: 'abbreviation:OP01 number-prefix:OP01 products:6' },
      { source_set_key: '3189', game: 'one-piece', set_code: 'st01', evidence: 'abbreviation:ST-01 number-prefix:ST01 products:1' },
    ]);
    const links = (await state.pool.query(`SELECT source_product_id, finish, language, sku, mapping_status, crosswalk_version FROM price_source_crosswalks WHERE source='tcgplayer' AND superseded_at IS NULL`)).rows;
    expect(links).toEqual(expect.arrayContaining([
      // The operator's row stands; the collector does not supersede another writer's decision.
      { source_product_id: 'tcgplayer:454591', finish: 'normal', language: 'en', sku: null, mapping_status: 'ambiguous', crosswalk_version: 'operator-review/1' },
      { source_product_id: 'tcgplayer:453518', finish: 'foil', language: 'en', sku: null, mapping_status: 'ambiguous', crosswalk_version: 'tcgplayer-number/1' },
      // Its own earlier rule's answer is moved on by the current one.
      { source_product_id: 'tcgplayer:900001', finish: 'normal', language: 'en', sku: 'op-st01-001-en', mapping_status: 'exact', crosswalk_version: 'tcgplayer-number/1' },
    ]));
    expect((await state.pool.query(`SELECT crosswalk_version FROM price_source_crosswalks WHERE source_product_id = 'tcgplayer:900001' AND superseded_at IS NOT NULL`)).rows)
      .toEqual([{ crosswalk_version: 'tcgplayer-number/0' }]);
    // A pre-release printing never borrows the base set's SKU.
    expect(links.some(link => link.source_product_id === 'tcgplayer:900002')).toBe(false);
    expect(run.crosswalks).toEqual({ setWritten: 3, productWritten: links.length - 1, productUnchanged: 0, skipped: 1, failed: 0 });

    const stored = (await state.pool.query(`SELECT o.sku, o.mapping_status, o.condition, o.finish, o.language, o.metric, o.currency, o.amount::text, o.source_updated_at = o.retrieved_at AS read_clock, o.source_set_key
      FROM member_price_observations o JOIN member_price_batches b ON b.id = o.batch_id WHERE b.ingest_key = 'tcgplayer:3188:2026-10-28T16:00:00.000Z' AND o.source_product_id = 'tcgplayer:454591' ORDER BY o.condition`)).rows;
    expect(stored).toEqual([
      { sku: 'op-op01-064-en', mapping_status: 'exact', condition: 'lightly-played', finish: 'normal', language: 'en', metric: 'market', currency: 'USD', amount: '0.250000', read_clock: true, source_set_key: '3188' },
      { sku: 'op-op01-064-en', mapping_status: 'exact', condition: 'near-mint', finish: 'normal', language: 'en', metric: 'market', currency: 'USD', amount: '1.500000', read_clock: true, source_set_key: '3188' },
    ]);
    // Every row the run stored joins its set crosswalk by TCGplayer's own set ID.
    const joined = (await state.pool.query(`SELECT DISTINCT s.set_code FROM member_price_observations o JOIN member_price_batches b ON b.id = o.batch_id
      JOIN price_source_set_crosswalks s ON s.source = o.source AND s.game = o.game AND s.source_set_key = o.source_set_key AND s.superseded_at IS NULL
      WHERE b.ingest_key LIKE 'tcgplayer:%:2026-10-28T16:00:00.000Z' ORDER BY 1`)).rows.map(row => row.set_code);
    expect(joined).toEqual(['op01', 'op16', 'st01']);
  });

  it('starts the next run with the sets read longest ago, and stops before the budget runs out', async () => {
    await spacingPassed();
    const clock = { at: Date.parse('2026-10-28T17:00:00.000Z') };
    const fetcher = source(clock, 24_500);
    const run = await collect({ fetcher, now: () => clock.at, lines });
    // Ten requests (three of them robots.txt) take 245 s of the 270; 25 s is too little to begin another set.
    expect(run).toMatchObject({ status: 'ok', stoppedBy: 'budget', requests: 10, elapsedMs: 245_000 });
    expect(run.sets.map(set => set.setId)).toEqual([24664, 24537, 23599]);
    // An unchanged mapping is left as it is, not rewritten.
    expect(run.crosswalks).toMatchObject({ setWritten: 0, productWritten: 0, failed: 0 });
    expect(run.crosswalks.productUnchanged).toBeGreaterThan(0);
  });

  it('ends the run as SOURCE_UNAVAILABLE at a refusal, keeping what was written before it', async () => {
    await spacingPassed();
    const clock = { at: Date.parse('2026-10-28T18:00:00.000Z') };
    const fetcher = source(clock, 10_000, guideUrl(3189, 110));
    const before = (await state.pool.query('SELECT count(*)::int AS n FROM member_price_batches')).rows[0].n;
    const run = await collect({ fetcher, now: () => clock.at, lines });
    // The second run re-read 24664, 24537 and 23599, so 23598 and then 3189
    // are now the stalest. 23598 is written; 3189 is refused and the run ends.
    expect(run).toMatchObject({ status: 'source-unavailable', stoppedBy: 'source-unavailable', requests: 9, unavailable: { reason: 'http-429', status: 429, url: guideUrl(3189, 110), refused: true } });
    expect(fetcher.urls.slice(5)).toEqual(['https://mpapi.tcgplayer.com/v2/Product/ProductTypes/85/', guideUrl(23598, 143), 'https://mpapi.tcgplayer.com/v2/Product/ProductTypes/68/', guideUrl(3189, 110)]);
    expect(run.sets.map(set => set.setId)).toEqual([23598]);
    const after = (await state.pool.query('SELECT count(*)::int AS n FROM member_price_batches')).rows[0].n;
    expect(after - before).toBe(1);
  });

  it('runs one of two overlapping runs; the other makes no request at all', async () => {
    await spacingPassed();
    const clock = { at: Date.parse('2026-10-28T18:30:00.000Z') };
    const [first, second] = [source(clock, 10_000), source(clock, 10_000)];
    const runs = await Promise.all([collectTcgplayer({ fetcher: first, now: () => clock.at, lines }), collectTcgplayer({ fetcher: second, now: () => clock.at, lines })]);
    expect(runs.filter(run => !run.ran)).toEqual([{ ran: false, reason: 'run-in-progress', runAt: '2026-10-28T18:30:00.000Z', requests: 0 }]);
    expect(runs.find(run => run.ran)).toMatchObject({ status: 'ok', stoppedBy: 'all-sets-read' });
    // Only the run holding the lease asked TCGplayer anything.
    expect(first.urls.length * second.urls.length).toBe(0);
    expect(first.urls.length + second.urls.length).toBeGreaterThan(0);
    // The lease outlives the run by TCGplayer's 10 s Crawl-Delay, held by no run.
    expect((await state.pool.query(`SELECT holder, expires_at > now() + interval '9 seconds' AND expires_at <= now() + interval '10 seconds' AS spaced FROM price_collector_leases`)).rows)
      .toEqual([{ holder: 'request-spacing', spaced: true }]);
  });

  it('keeps the Crawl-Delay across two sequential runs: the one straight after sends nothing', async () => {
    await spacingPassed();
    const clock = { at: Date.parse('2026-10-28T18:35:00.000Z') };
    const [first, second] = [source(clock, 10_000), source(clock, 10_000)];
    expect(await collectTcgplayer({ fetcher: first, now: () => clock.at, lines })).toMatchObject({ ran: true, status: 'ok' });
    expect(first.urls.length).toBeGreaterThan(0);
    expect(await collectTcgplayer({ fetcher: second, now: () => clock.at, lines })).toEqual({ ran: false, reason: 'request-spacing', runAt: new Date(clock.at).toISOString(), requests: 0 });
    expect(second.urls).toEqual([]);
  });

  it('records a set that fails as read, with no observation, so the next run moves on', async () => {
    // Synthetic: one more One Piece set, never read, whose guide is malformed.
    const names = fixture('set-names-68.json');
    names.results.push({ setNameId: 990001, categoryId: 68, name: 'Synthetic Broken Set', cleanSetName: 'Synthetic Broken Set', urlName: 'synthetic-broken-set', abbreviation: 'ZZ01', releaseDate: '2026-10-01T00:00:00', isSupplemental: false, active: true });
    const answer = (url: string) => url.includes('SetNames?categoryId=68') ? names : url.includes('/set/990001/') ? { count: 0 } : undefined;
    const onePiece = lines.filter(line => line.slug === 'one-piece-card-game');
    // 42 s a request: after robots.txt, this run has budget for that one set only.
    await spacingPassed();
    const clockA = { at: Date.parse('2026-10-28T18:40:00.000Z') };
    const a = source(clockA, 42_000, undefined, answer);
    const first = await collect({ fetcher: a, now: () => clockA.at, lines: onePiece });
    // Never read, so first.
    expect(a.urls.slice(5)).toEqual([guideUrl(990001, 110)]);
    expect(first.stoppedBy).toBe('budget');
    expect(first.errors).toEqual([{ line: 'one-piece-card-game', setId: 990001, error: 'invalid-tcgplayer-price-guide', recorded: true }]);
    expect(first.sets.map(set => set.setId)).not.toContain(990001);
    const record = (await state.pool.query(`SELECT b.source_rows, b.missing_prices, b.quarantine, count(o.id)::int AS observations FROM member_price_batches b
      LEFT JOIN member_price_observations o ON o.batch_id = b.id WHERE b.ingest_key = 'tcgplayer:990001:2026-10-28T18:40:00.000Z' GROUP BY b.id`)).rows;
    expect(record).toEqual([{ source_rows: 0, missing_prices: 0, quarantine: [{ sourceProductId: null, field: 'set', reason: 'invalid-tcgplayer-price-guide' }], observations: 0 }]);

    // Without the record it would still be never read, and first again. Now
    // every set last read before it comes first, and it comes last.
    await spacingPassed();
    const clockB = { at: Date.parse('2026-10-28T18:50:00.000Z') };
    const b = source(clockB, 10_000, undefined, answer);
    const next = await collect({ fetcher: b, now: () => clockB.at, lines: onePiece });
    expect(next.stoppedBy).toBe('all-sets-read');
    expect(b.urls.indexOf(guideUrl(990001, 110))).toBe(b.urls.length - 1);
  });

  it('touches no TCGplayer host once the release is revoked', async () => {
    await spacingPassed();
    await state.pool.query(`UPDATE member_price_source_releases SET member_display=false WHERE source='tcgplayer'`);
    const clock = { at: Date.parse('2026-10-28T19:00:00.000Z') };
    const fetcher = source(clock, 10_000);
    expect(await collectTcgplayer({ fetcher, now: () => clock.at, lines })).toMatchObject({ status: 'release-revoked-or-unreviewed', stoppedBy: 'release', requests: 0 });
    expect(fetcher.urls).toEqual([]);
  });
});
