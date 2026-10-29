import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { query as dbQuery } from '@/lib/db';
import { MEMBER_PRICE_POLICIES, type MemberPriceSource, type MemberPriceUse } from '@cambridge-tcg/data-ingest/member-prices';
import { assertPriceObservationValues } from '@cambridge-tcg/data-spec';
import { DISPLAY_ONLY_INPUT_NOT_EXPORTED, DISPLAY_ONLY_INPUT_PAGES, DISPLAY_ONLY_INPUT_PAGES_END, displayOnlyInputsOffered, isDisplayOnlyInput, MemberPriceQueryError, type MemberPriceItem, type MemberPricePage, type MemberPriceQuery } from './member-feed-types';
export * from './member-feed-types';

const MAX_LIMIT = 500;
export function parseMemberPriceQuery(params: URLSearchParams): MemberPriceQuery {
  const query: MemberPriceQuery = { mode: 'current', limit: 100 };
  for (const key of ['source', 'game', 'set', 'sku', 'metric', 'q', 'mode', 'limit', 'cursor']) {
    if (params.getAll(key).length > 1) throw new MemberPriceQueryError(`Duplicate ${key}`);
  }
  const source = params.get('source');
  if (source) {
    if (!Object.hasOwn(MEMBER_PRICE_POLICIES, source)) throw new MemberPriceQueryError('Unknown price source');
    query.source = source as MemberPriceSource;
  }
  for (const key of ['game', 'set', 'sku', 'metric'] as const) {
    const value = params.get(key);
    if (value) {
      if (value.length > 160 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) throw new MemberPriceQueryError(`Invalid ${key}`);
      query[key] = value;
    }
  }
  const q = params.get('q')?.trim();
  if (q) {
    if (q.length > 120 || /[\x00-\x1f\x7f]/.test(q)) throw new MemberPriceQueryError('Invalid search');
    query.q = q;
  }
  const mode = params.get('mode');
  if (mode) {
    if (mode !== 'current' && mode !== 'history') throw new MemberPriceQueryError('Invalid price mode');
    query.mode = mode;
  }
  const limit = params.get('limit');
  if (limit) {
    if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > MAX_LIMIT) throw new MemberPriceQueryError('Limit must be 1–500');
    query.limit = Number(limit);
  }
  const cursor = params.get('cursor');
  if (cursor) {
    if (cursor.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cursor)) throw new MemberPriceQueryError('Invalid price cursor');
    query.cursor = cursor;
  }
  return query;
}
/** `page` is set only in a chain whose filtered snapshot holds display-only
 * rows: the page this cursor opens, from 2. Every other cursor is as before. */
interface Cursor { version: 1; binding: string; watermark: string; after: string; asOf: string; page?: number }
function cursorSecret(): string {
  const secret = process.env.MEMBER_PRICE_CURSOR_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error('member-price-cursor-secret-unavailable');
  return secret;
}
function binding(actor: { userId: string }, query: MemberPriceQuery, use: MemberPriceUse): string {
  return createHash('sha256').update(JSON.stringify([actor.userId, use, query.source ?? null, query.game ?? null, query.set ?? null, query.sku ?? null, query.metric ?? null, query.q ?? null, query.mode, query.limit])).digest('hex');
}
function encodeCursor(cursor: Cursor): string {
  const body = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  return `${body}.${createHmac('sha256', cursorSecret()).update(body).digest('base64url')}`;
}
function decodeCursor(value: string, expectedBinding: string): Cursor {
  try {
    const [body, signature, extra] = value.split('.');
    if (!body || !signature || extra) throw new Error();
    const expected = createHmac('sha256', cursorSecret()).update(body).digest();
    const provided = Buffer.from(signature, 'base64url');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error();
    const cursor = JSON.parse(Buffer.from(body, 'base64url').toString()) as Cursor;
    const id = /^(?:0|[1-9]\d{0,18})$/;
    if (cursor.version !== 1 || cursor.binding !== expectedBinding || !id.test(cursor.watermark) || !id.test(cursor.after) || typeof cursor.asOf !== 'string' || !Number.isFinite(Date.parse(cursor.asOf)) || Date.now() - Date.parse(cursor.asOf) > 24 * 60 * 60 * 1000 || Date.parse(cursor.asOf) > Date.now() + 60_000 || (cursor.page !== undefined && (!Number.isSafeInteger(cursor.page) || cursor.page < 2))) throw new Error();
    return cursor;
  } catch { throw new MemberPriceQueryError('Invalid, expired, or filter-mismatched price cursor'); }
}
/** Display-only sources member display can show today: an unrevoked
 * member_display release under the code's evidence, and at least one stored
 * observation. /prices names CardRush and TCGplayer in its filter and its
 * note only then, so no view implies prices that do not exist. A store that
 * cannot answer names none. Says nothing about any row's price.
 */
export async function displayOnlySourcesWithRows(): Promise<MemberPriceSource[]> {
  const candidates = (Object.keys(MEMBER_PRICE_POLICIES) as MemberPriceSource[]).filter(source => isDisplayOnlyInput(MEMBER_PRICE_POLICIES[source]) && MEMBER_PRICE_POLICIES[source].uses.includes('member-display'));
  if (!candidates.length) return [];
  try {
    const response = await dbQuery(`SELECT r.source FROM member_price_source_releases r
      JOIN jsonb_to_recordset($1::jsonb) AS p(source text, version text, "evidenceUrl" text)
        ON p.source=r.source AND p.version=r.evidence_version AND p."evidenceUrl"=r.evidence_url
      WHERE r.revoked_at IS NULL AND r.member_display
        AND EXISTS (SELECT 1 FROM member_price_observations o WHERE o.source=r.source AND o.evidence_version=r.evidence_version AND o.quality='accepted')`,
    [JSON.stringify(candidates.map(source => ({ source, version: MEMBER_PRICE_POLICIES[source].evidenceVersion, evidenceUrl: MEMBER_PRICE_POLICIES[source].evidenceUrl })))]);
    const present = new Set(response.rows.map(row => String(row.source)));
    return candidates.filter(source => present.has(source));
  } catch (error) {
    console.error('[member-prices] display-only check unavailable', error instanceof Error ? error.name : 'unknown');
    return [];
  }
}
// Both statements open with the committed-batch ceiling and the release rows
// this use may read under the code's evidence, as each statement finds them.
const snapshot = (releaseColumn: string) => `WITH ceiling AS (
      SELECT COALESCE($1::bigint, (SELECT MAX(id) FROM member_price_batches), 0) AS watermark
    ), allowed AS (
      SELECT r.*, COALESCE(p."displayOnly", false) AS display_only FROM member_price_source_releases r
      JOIN jsonb_to_recordset($2::jsonb) AS p(source text, version text, "evidenceUrl" text, "displayOnly" boolean)
        ON p.source=r.source AND p.version=r.evidence_version AND p."evidenceUrl"=r.evidence_url
      WHERE r.revoked_at IS NULL AND r.${releaseColumn}
    )`;
const permittedUses = `array_remove(ARRAY[CASE WHEN r.member_display THEN 'member-display' END, CASE WHEN r.member_api THEN 'member-api' END, CASE WHEN r.member_download THEN 'member-download' END],NULL) AS permitted_uses`;
// Filters apply to the row a key's view chose, never before choosing it, so an
// old SKU, set or name cannot bring back a superseded row.
const filters = `($3::text IS NULL OR o.game=$3)
        AND ($4::text IS NULL OR o.set_code=$4)
        AND ($5::text IS NULL OR o.sku=$5)
        AND ($6::text IS NULL OR o.metric=$6)
        AND ($7::text IS NULL OR strpos(lower(COALESCE(o.product_name,'')),lower($7))>0 OR strpos(lower(o.source_product_id),lower($7))>0)`;
const answer = ` SELECT (SELECT watermark::text FROM ceiling) AS watermark,
      (SELECT count(*)::text FROM selected) AS total,
      (SELECT COALESCE(bool_or(display_only), false) FROM selected) AS display_only,
      COALESCE((SELECT jsonb_agg(to_jsonb(page) || jsonb_build_object('id',page.id::text,'amount',page.amount::text) ORDER BY page.id) FROM page),'[]'::jsonb) AS items`;
/** Every eligible observation under the watermark, ranked per key: history
 * mode, and the current view on a store without 0144, exactly as before it.
 * Its cost grows with every observation ever stored. $8 mode, $9 after, $10 limit.
 */
const rankedStatement = (releaseColumn: string) => `${snapshot(releaseColumn)}, eligible AS (
      SELECT o.*, r.display_only, ${permittedUses}, row_number() OVER (PARTITION BY o.source,o.source_product_id,o.metric,o.currency,COALESCE(o.finish,''),COALESCE(o.language,''),COALESCE(o.condition,'') ORDER BY o.source_updated_at DESC,o.id DESC) AS recency
      FROM member_price_observations o JOIN allowed r ON r.source=o.source AND r.evidence_version=o.evidence_version
      CROSS JOIN ceiling c
      WHERE o.batch_id <= c.watermark AND o.quality='accepted'
    ), selected AS (
      SELECT * FROM eligible o WHERE ($8::text='history' OR recency=1)
        AND ${filters}
    ), page AS (
      SELECT * FROM selected WHERE id>$9::bigint ORDER BY id LIMIT $10
    )${answer}`;
/** The same current view, read from member_price_latest (0144): one row a key
 * whatever the history. A key's row under the watermark is its latest when
 * that batch is under it, else its previous (the latest before that batch)
 * when that one is, else, for a key moved twice since the watermark (at most
 * the rows written in the day a cursor lives), the latest of the key's own
 * observations under it, read newest first from member_price_observations_key.
 * A key with no previous has no observation before its latest. $8 after, $9 limit.
 */
const latestStatement = (releaseColumn: string) => `${snapshot(releaseColumn)}, keyed AS (
      SELECT CASE WHEN l.batch_id <= c.watermark THEN l.observation_id ELSE l.previous_observation_id END AS id
      FROM member_price_latest l JOIN allowed r ON r.source=l.source AND r.evidence_version=l.evidence_version
      CROSS JOIN ceiling c
      WHERE l.batch_id <= c.watermark OR l.previous_batch_id <= c.watermark
      UNION ALL
      SELECT earlier.id FROM member_price_latest l JOIN allowed r ON r.source=l.source AND r.evidence_version=l.evidence_version
      CROSS JOIN ceiling c
      CROSS JOIN LATERAL (SELECT o.id FROM member_price_observations o
        WHERE o.source=l.source AND o.source_product_id=l.source_product_id AND o.metric=l.metric AND o.currency=l.currency
          AND COALESCE(o.finish,'')=l.finish AND COALESCE(o.language,'')=l.language AND COALESCE(o.condition,'')=l.condition
          AND o.evidence_version=l.evidence_version AND o.batch_id <= c.watermark AND o.quality='accepted'
        ORDER BY o.source_updated_at DESC, o.id DESC LIMIT 1) earlier
      WHERE l.batch_id > c.watermark AND l.previous_batch_id > c.watermark
    ), selected AS (
      SELECT o.id, r.display_only FROM keyed k JOIN member_price_observations o ON o.id=k.id
      JOIN allowed r ON r.source=o.source AND r.evidence_version=o.evidence_version
      CROSS JOIN ceiling c
      WHERE o.batch_id <= c.watermark AND o.quality='accepted'
        AND ${filters}
    ), page AS (
      SELECT o.*, r.display_only, ${permittedUses}
      FROM (SELECT id FROM selected WHERE id>$8::bigint ORDER BY id LIMIT $9) s
      JOIN member_price_observations o ON o.id=s.id JOIN allowed r ON r.source=o.source AND r.evidence_version=o.evidence_version
    )${answer}`;
const undefinedTable = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42P01';
const unavailable = (reason: string): MemberPricePage => ({ status: 'unavailable', items: [], nextCursor: null, watermark: null, asOf: null, total: 0, count: 0, complete: false, reason });
/** Private composition only. Caller must resolve a real session/token before
 * passing actor. No public flag, cookies, membership tier, cache, or auth bypass.
 * Each statement obtains current release flags and source/evidence identity.
 * Revocation narrows an in-progress export immediately, deliberately overriding
 * snapshot completeness. complete means end of THIS filtered eligible result.
 */
export async function readMemberPrices(actor: { userId: string }, input: MemberPriceQuery, use: MemberPriceUse): Promise<MemberPricePage> {
  if (!actor?.userId?.trim()) throw new Error('member-price-actor-required');
  if (!['member-display', 'member-api', 'member-download'].includes(use)) throw new Error('invalid-member-price-use');
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined) params.set(key, String(value));
  const query = parseMemberPriceQuery(params);
  // Named for the API or a download, a display-only source is refused, as an
  // unknown source always was, rather than read as an empty success.
  if (query.source && !MEMBER_PRICE_POLICIES[query.source].uses.includes(use) && isDisplayOnlyInput(MEMBER_PRICE_POLICIES[query.source])) throw new MemberPriceQueryError(DISPLAY_ONLY_INPUT_NOT_EXPORTED);
  const bound = binding(actor, query, use);
  const cursor = query.cursor ? decodeCursor(query.cursor, bound) : null;
  // Display-only derivation inputs (CardRush, TCGplayer) join only the current
  // view of a narrowed search, at most DISPLAY_ONLY_INPUT_PAGE_LIMIT rows a
  // page and DISPLAY_ONLY_INPUT_PAGES pages a chain: looked at, not harvested.
  const offered = Object.entries(MEMBER_PRICE_POLICIES).filter(([source, policy]) => (!query.source || query.source === source) && policy.uses.includes(use)
    && (!isDisplayOnlyInput(policy) || displayOnlyInputsOffered(query)));
  // Display-only policies are marked, so the statement can say whether the
  // filtered snapshot holds any of their rows; every other policy is as before.
  const policies = offered.map(([source, policy]) => ({ source, version: policy.evidenceVersion, evidenceUrl: policy.evidenceUrl, ...(isDisplayOnlyInput(policy) ? { displayOnly: true } : {}) }));
  if (!policies.length) return { ...unavailable('This source is not permitted for the requested use.'), status: 'empty', complete: true };
  // 0 is a continuation that carries no page number.
  const pageNumber = cursor ? cursor.page ?? 0 : 1;
  if (pageNumber > DISPLAY_ONLY_INPUT_PAGES) throw new MemberPriceQueryError(DISPLAY_ONLY_INPUT_PAGES_END);
  const releaseColumn = use === 'member-display' ? 'member_display' : use === 'member-api' ? 'member_api' : 'member_download';
  try {
    // A single MVCC statement fixes count, rows, and committed watermark together.
    // No max(timestamp): writers enforce commit-ordered batch IDs and prevent late
    // inserts into already committed batches (migration0137). The current view
    // reads member_price_latest, which the observation insert itself keeps
    // (0144). A store without it (42P01) answers from the ranked statement, as
    // it did before 0144; a store without 0137 then fails as it always did.
    const shared = [cursor?.watermark ?? null, JSON.stringify(policies), query.game ?? null, query.set ?? null, query.sku ?? null, query.metric ?? null, query.q ?? null];
    const after = cursor?.after ?? '0';
    const ranked = () => dbQuery(rankedStatement(releaseColumn), [...shared, query.mode, after, query.limit + 1]);
    const response = query.mode === 'current'
      ? await dbQuery(latestStatement(releaseColumn), [...shared, after, query.limit + 1]).catch(error => { if (undefinedTable(error)) return ranked(); throw error; })
      : await ranked();
    const raw = response.rows[0];
    if (!raw) return unavailable('Price storage did not return a snapshot.');
    // A chain whose filtered snapshot holds display-only rows is numbered and
    // ends after DISPLAY_ONLY_INPUT_PAGES pages; one that holds none pages as before.
    const counted = raw.display_only === true;
    if (counted && pageNumber === 0) throw new MemberPriceQueryError('Invalid, expired, or filter-mismatched price cursor');
    const watermark = String(raw.watermark);
    const asOf = cursor?.asOf ?? new Date().toISOString();
    const rows = raw.items as Record<string, unknown>[];
    const more = rows.length > query.limit;
    const items: MemberPriceItem[] = rows.slice(0, query.limit).map(row => {
      const source = row.source as MemberPriceSource;
      const policy = MEMBER_PRICE_POLICIES[source];
      const item: MemberPriceItem = {
        id: String(row.id), source, sourceProductId: String(row.source_product_id), sku: row.sku as string | null, mappingStatus: row.mapping_status as MemberPriceItem['mappingStatus'],
        game: String(row.game), setCode: row.set_code as string | null, productName: row.product_name as string | null, granularity: row.granularity as MemberPriceItem['granularity'],
        finish: row.finish as string | null, language: row.language as string | null, condition: row.condition as string | null, metric: String(row.metric), amount: String(row.amount), currency: row.currency as MemberPriceItem['currency'], underlyingMarket: row.underlying_market as MemberPriceItem['underlyingMarket'],
        sourceUpdatedAt: new Date(String(row.source_updated_at)).toISOString(), retrievedAt: new Date(String(row.retrieved_at)).toISOString(), sourceUrl: String(row.source_url),
        parserVersion: String(row.parser_version), crosswalkVersion: String(row.crosswalk_version), evidenceVersion: String(row.evidence_version), artifactSha256: String(row.artifact_sha256), quality: 'accepted',
        catalogSourceUrl: row.catalog_source_url as string | null, catalogUpdatedAt: row.catalog_updated_at ? new Date(String(row.catalog_updated_at)).toISOString() : null, catalogArtifactSha256: row.catalog_artifact_sha256 as string | null,
        permittedUses: policy.uses.filter(allowedUse => (row.permitted_uses as string[]).includes(allowedUse)), attribution: policy.attribution,
      };
      // Historical/corrupt storage is not automatically a valid observation.
      // Reject the whole bounded page before serialization rather than emit a
      // converted amount, zero sentinel or guessed printing identity.
      assertPriceObservationValues(item);
      if (!item.permittedUses.includes(use)) throw new TypeError('Price observation does not permit this use.');
      return item;
    });
    // The last page a display-only chain may show issues no cursor and says why.
    const ended = counted && more && pageNumber >= DISPLAY_ONLY_INPUT_PAGES;
    const nextCursor = more && !ended ? encodeCursor({ version: 1, binding: bound, watermark, after: items.at(-1)!.id, asOf, ...(counted ? { page: pageNumber + 1 } : {}) }) : null;
    return { status: items.length ? 'available' : 'empty', items, nextCursor, watermark, asOf, total: Number(raw.total), count: items.length, complete: !more, ...(ended ? { reason: DISPLAY_ONLY_INPUT_PAGES_END } : {}) };
  } catch (error) {
    if (error instanceof MemberPriceQueryError) throw error;
    // Do not leak SQL, connection strings, or infrastructure details to members.
    console.error('[member-prices] read unavailable', error instanceof Error ? error.name : 'unknown');
    return unavailable('Member pricing storage is unavailable or has not been activated.');
  }
}
