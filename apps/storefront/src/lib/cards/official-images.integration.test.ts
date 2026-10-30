import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { BANDAI_JP_GAMES } from '@cambridge-tcg/data-ingest/bandai-jp';
import type { ToolDeps, ToolExecFile } from './official-image-tools';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ pool: null as unknown as import('pg').Pool }));
vi.mock('@/lib/db', () => ({ query: (sql: string, params?: unknown[]) => state.pool.query(sql, params) }));
import { runIngest, runUpload, selectionDigest } from './official-image-tools';
import { getOfficialCardImages, getSameLanguageImages } from './en-card-data';

// Same explicit opt-in as the other storefront integration tests: one
// disposable loopback database, an isolated schema, never DATABASE_URL.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const schema = `official_images_test_${randomUUID().replaceAll('-', '')}`;
const migration = (name: string) => readFile(new URL(`../../../drizzle/${name}`, import.meta.url), 'utf8');
const fixtures = new URL('../../../../../packages/data-ingest/src/__tests__/fixtures/', import.meta.url);
const OP_PAGE = readFileSync(new URL('bandai-jp-op01-sample.html', fixtures), 'utf8');
const FW_PAGE = readFileSync(new URL('bandai-jp-dbf-fb10-list.html', fixtures), 'utf8');

function png(width = 600, height = 838): Uint8Array {
  const bytes = new Uint8Array(4096);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}
function webp(width = 600, height = 838): Uint8Array {
  const bytes = new Uint8Array(4096);
  bytes.set([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8X'), 10, 0, 0, 0, 0, 0, 0, 0]);
  const w = width - 1, h = height - 1;
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24);
  return bytes;
}
const sha = (bytes: Uint8Array, encoding: 'hex' | 'base64') => createHash('sha256').update(bytes).digest(encoding);

/** Pages and images as the publisher would answer; every request is recorded. */
const requests: string[] = [];
const fetchMock = (async (input: string | URL | Request) => {
  const url = String(input);
  requests.push(url);
  if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
  if (url === BANDAI_JP_GAMES.op.series_url('550101')) return new Response(OP_PAGE, { headers: { 'content-type': 'text/html; charset=UTF-8' } });
  if (url === BANDAI_JP_GAMES.dbf.series_url('584010')) return new Response(FW_PAGE, { headers: { 'content-type': 'text/html; charset=UTF-8' } });
  if (/\/images\/cardlist\/card\/OP01-\d+\.png/.test(url)) return new Response(png().slice(), { headers: { 'content-type': 'image/png' } });
  if (/\/fw\/images\/cards\/card\/jp\/FB10-\d+(?:_f)?\.webp$/.test(url)) return new Response(webp().slice(), { headers: { 'content-type': 'image/webp' } });
  return new Response('', { status: 404 });
}) as typeof fetch;
/** The AWS CLI as it answers a successful conditional put. */
const uploads: string[] = [];
const aws: ToolExecFile = async (_file, args) => {
  if (args[0] === '--version') return { stdout: 'aws-cli/2.17.0 Python/3.12.0', stderr: '' };
  if (args[1] === 'put-object') {
    const key = args[args.indexOf('--key') + 1]!;
    uploads.push(key);
    return { stdout: JSON.stringify({ ETag: '"e"', ChecksumSHA256: sha(key.endsWith('.png') ? png() : webp(), 'base64') }), stderr: '' };
  }
  throw new Error('unexpected aws call');
};

let admin: Pool;
const out: string[] = [];
function deps(): ToolDeps {
  let t = Date.UTC(2026, 9, 30, 12);
  return {
    out: (line) => out.push(line), err: (line) => out.push(`ERR ${line}`), fetch: fetchMock, env: { PATH: '/usr/bin' },
    lock: () => ({ ok: true, release: () => {} }),
    // One client per run, as the scripts open it.
    openDb: async () => {
      const client = new Client({ connectionString: localUrl, options: `-c search_path=${schema}` });
      await client.connect();
      return { query: (sql, params) => client.query(sql, params as unknown[]), end: () => client.end() };
    },
    execFile: aws, now: () => t, sleep: async (ms) => { t += ms; },
  };
}
const rows = async () => (await state.pool.query(`SELECT sku, lang, kind, source, s3_key, sha256, width, height, takedown_status, attribution, license_note
  FROM card_images ORDER BY sku, source`)).rows;
const enRow = (sku: string, takedown = 'clear') => state.pool.query(
  `INSERT INTO card_images (sku, lang, kind, source, source_url, s3_key, attribution, takedown_status, retrieved_at)
   VALUES ($1, 'en', 'official_sample', 'bandai-en', $2, $3, '©Eiichiro Oda/Shueisha', $4, '2026-07-13T00:00:00Z')`,
  [sku, `https://en.onepiece-cardgame.com/images/cardlist/card/${sku.split('-').slice(1, 3).join('-')}.png`, `official/${sku}.png`, takedown]);

describe.skipIf(!localUrl)('Japanese official images PostgreSQL integration (explicit loopback DB only)', () => {
  beforeAll(async () => {
    const target = new URL(localUrl!);
    if (!['127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.includes('test') || target.search) throw new Error('Explicit disposable local test database required');
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    state.pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 4 });
    for (const name of ['0116_en_card_data.sql', '0122_card_texts_attributes.sql']) await state.pool.query(await migration(name));
  });
  afterAll(async () => {
    if (state.pool) await state.pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it('holds the advisory lock before any request: a held lock reads nothing', async () => {
    const blocker = new Client({ connectionString: localUrl });
    await blocker.connect();
    try {
      await blocker.query('SELECT pg_advisory_lock(116, 1)');
      requests.length = 0;
      expect(await runIngest(['--game', 'op', '--series', '550101', '--apply', '--no-ssl'], deps())).toBe(3);
      expect(requests).toEqual([]);
    } finally { await blocker.end(); }
  });

  it('ingest --apply records base prints once, and never touches a row already there', async () => {
    // A removed Japanese row with a collected key stays as it is.
    await state.pool.query(`INSERT INTO card_images (sku, lang, kind, source, source_url, attribution, takedown_status)
      VALUES ('OP-OP01-016-JA', 'ja', 'official_sample', 'bandai-jp', 'https://www.onepiece-cardgame.com/images/cardlist/card/OP01-016.png', 'kept', 'removed')`);
    expect(await runIngest(['--game', 'all', '--series', '550101,584010', '--apply', '--no-ssl'], deps())).toBe(0);
    expect(out.at(-1)).toBe('applied: 5 inserted, 1 already present (left as they were)');
    const all = await rows();
    expect(all.map((r) => r.sku)).toEqual(['DBF-FB10-001-JA', 'DBF-FB10-002-JA', 'DBF-FB10-123-JA', 'OP-OP01-001-JA', 'OP-OP01-002-JA', 'OP-OP01-016-JA']);
    expect(all.find((r) => r.sku === 'OP-OP01-016-JA')).toMatchObject({ takedown_status: 'removed', attribution: 'kept' });
    expect(all.find((r) => r.sku === 'OP-OP01-001-JA')).toMatchObject({ lang: 'ja', kind: 'official_sample', source: 'bandai-jp', s3_key: null, takedown_status: 'clear', attribution: BANDAI_JP_GAMES.op.credit, license_note: 'cambridge.official-ja-media/2026-10-30' });
    expect(await runIngest(['--game', 'all', '--series', '550101,584010', '--apply', '--no-ssl'], deps())).toBe(0);
    expect(out.at(-1)).toBe('applied: 0 inserted, 6 already present (left as they were)');
  });

  it('uploads the reviewed selection, holding a card under takedown in any language, and records each object by its full key [C21]', async () => {
    await enRow('OP-OP01-001-EN');
    await enRow('OP-OP01-002-EN', 'removed');
    // Another row with a Japanese key's sku but another source: never selected, never updated.
    await state.pool.query(`INSERT INTO card_images (sku, lang, kind, source, source_url, attribution)
      VALUES ('OP-OP01-001-JA', 'ja', 'official_sample', 'other-source', 'https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png', 'x')`);
    out.length = 0;
    expect(await runUpload(['--profile', 'named', '--lang', 'ja', '--no-ssl'], deps())).toBe(0);
    expect(out).toContain('  held (card under takedown): 1');
    const selected = (await state.pool.query(`SELECT sku, source_url FROM card_images WHERE lang = 'ja' AND source = 'bandai-jp' AND takedown_status = 'clear' AND s3_key IS NULL AND sku <> 'OP-OP01-002-JA'`)).rows;
    const digest = selectionDigest(selected);
    expect(out).toContain(`selection: ${digest.replace(':', ' ')}`);
    expect(await runUpload(['--profile', 'named', '--lang', 'ja', '--no-ssl', '--apply', '--expect', digest], deps())).toBe(0);
    expect(out.at(-1)).toBe('done: uploaded 4, adopted 0, changed 0, held 0, gone 0');
    expect(uploads.sort()).toEqual(['official/DBF-FB10-001-JA.webp', 'official/DBF-FB10-002-JA.webp', 'official/DBF-FB10-123-JA.webp', 'official/OP-OP01-001-JA.png']);
    const all = await rows();
    expect(all.find((r) => r.sku === 'OP-OP01-001-JA' && r.source === 'bandai-jp')).toMatchObject({ s3_key: 'official/OP-OP01-001-JA.png', sha256: sha(png(), 'hex'), width: 600, height: 838 });
    expect(all.find((r) => r.sku === 'OP-OP01-001-JA' && r.source === 'other-source')).toMatchObject({ s3_key: null, sha256: null });
    expect(all.find((r) => r.sku === 'OP-OP01-002-JA')).toMatchObject({ s3_key: null });
    // A fresh dry run now selects nothing; the held row still waits.
    expect(await runUpload(['--profile', 'named', '--lang', 'ja', '--no-ssl'], deps())).toBe(0);
    expect(out).toContain(`selection: ${selectionDigest([]).replace(':', ' ')}`);
  });

  it('readers show a Japanese request its own-language image, else the English one, and the switch turns the lane off', async () => {
    const images = await getOfficialCardImages(['OP-OP01-001-JP', 'OP-OP01-001-JP-V11DZ', 'FB-FB10-001-JP-P1', 'OP-OP01-002-JP', 'op-op01-001-en']);
    expect(images.get('OP-OP01-001-JP')).toMatchObject({ language: 'ja', url: 'https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-001-JA.png', attribution: BANDAI_JP_GAMES.op.credit });
    expect(images.get('OP-OP01-001-JP-V11DZ')?.reference).toMatchObject({ requested_sku: 'OP-OP01-001-JP-V11DZ', depicted_sku: 'OP-OP01-001-JA' });
    expect(images.get('FB-FB10-001-JP-P1')).toMatchObject({ language: 'ja', url: 'https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/DBF-FB10-001-JA.webp' });
    // OP01-002: the English row is removed and the Japanese one held, so neither shows.
    expect(images.has('OP-OP01-002-JP')).toBe(false);
    expect(images.get('op-op01-001-en')).toMatchObject({ language: 'en' });
    const off = await getOfficialCardImages(['OP-OP01-001-JP'], { OFFICIAL_IMAGES_JA: 'off' });
    expect(off.get('OP-OP01-001-JP')).toMatchObject({ language: 'en' });
    expect((await getSameLanguageImages(['OP-OP01-001-JP'], { OFFICIAL_IMAGES_JA: 'off' })).size).toBe(0);
  });

  it('a takedown is per card: one statement on game, set and number removes every language', async () => {
    await state.pool.query(`UPDATE card_images SET takedown_status = 'removed'
      WHERE kind = 'official_sample' AND upper(split_part(sku, '-', 1)) = 'OP' AND upper(split_part(sku, '-', 2)) = 'OP01' AND upper(split_part(sku, '-', 3)) = '001'`);
    const images = await getOfficialCardImages(['OP-OP01-001-JP', 'op-op01-001-en']);
    expect(images.size).toBe(0);
  });
});
