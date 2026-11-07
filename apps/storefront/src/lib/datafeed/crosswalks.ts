import 'server-only';
import { query, transaction } from '@/lib/db';
import { MEMBER_PRICE_POLICIES, resolvePriceCrosswalk, type MemberPriceSource } from '@cambridge-tcg/data-ingest/member-prices';

/** A source product's mapping to a Cambridge SKU (migration 0140). exact needs
 * the source's own collector identifiers as evidence (e.g. title:OP01-001 [P]);
 * a name or number similarity is not a mapping. ambiguous records that review
 * found no single printing, so later runs do not guess one. finish and
 * language must match the observation's scope, including null.
 */
export interface ProductCrosswalkInput {
  source: MemberPriceSource;
  sourceProductId: string;
  finish: string | null;
  language: string | null;
  game: string;
  mappingStatus: 'exact' | 'ambiguous';
  sku: string | null;
  setCode: string | null;
  evidence: string;
  crosswalkVersion: string;
}
/** A source's own set key (e.g. a Cardmarket expansion ID) to a canonical set code. */
export interface SetCrosswalkInput {
  source: MemberPriceSource;
  sourceSetKey: string;
  game: string;
  setCode: string;
  evidence: string;
  crosswalkVersion: string;
}
/** foreign: the live row was another writer's, so a collector left it
 * standing and wrote nothing (collectorMaySupersede). */
export interface CrosswalkWrite { id: string; supersededId: string | null; unchanged: boolean; foreign?: true }
export interface CrosswalkWriteOptions {
  /** A collector's write: it supersedes only a live row of its own version
   * family. Without it (an operator's review) the write replaces whatever is live. */
  collector?: boolean;
}
export interface SourceProductRef { source: MemberPriceSource; sourceProductId: string; finish: string | null; language: string | null; game: string }
export interface ResolvedSku {
  sku: string | null;
  setCode: string | null;
  mappingStatus: 'exact' | 'unmapped' | 'ambiguous';
  /** The live crosswalk row consulted, so a derived row can name what it used. */
  crosswalkId: string | null;
  crosswalkVersion: string | null;
}

const RESOLVE_CHUNK = 1000;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
// NULL is an unknown scope; empty text would collide with it in the live key.
const scope = (value: unknown) => value === null || (typeof value === 'string' && value.length > 0);
const knownSource = (value: unknown): value is MemberPriceSource => typeof value === 'string' && Object.hasOwn(MEMBER_PRICE_POLICIES, value);
const productKey = (source: string, id: string, finish: string | null, language: string | null) => JSON.stringify([source, id, finish, language]);

/** Same SKU rule as observation parsing: a parseable SKU whose game, set and
 * language agree with the link. Runs before any transaction opens.
 */
export function validateProductCrosswalk(input: ProductCrosswalkInput): void {
  if (!knownSource(input.source) || !text(input.sourceProductId) || !text(input.game) || !scope(input.finish) ||
      !scope(input.language) || !text(input.evidence) || !text(input.crosswalkVersion)) throw new Error('invalid-price-crosswalk');
  if (input.mappingStatus === 'exact') {
    if (!text(input.sku) || !text(input.setCode)) throw new Error('price-crosswalk-not-exact');
    const link = { ...input, sku: input.sku, setCode: input.setCode };
    if (resolvePriceCrosswalk(input.source, input.sourceProductId, input.finish, input.language, input.game, [link]).mappingStatus !== 'exact') {
      throw new Error('price-crosswalk-not-exact');
    }
  } else if (input.mappingStatus !== 'ambiguous' || input.sku !== null || input.setCode !== null) {
    throw new Error('invalid-price-crosswalk');
  }
}
/** A crosswalk version names the rule that wrote it and that rule's revision:
 * 'cardrush-title/1', 'tcgplayer-number/1', 'cardmarket-expansions/2026-10-28.1'.
 * The family is the part up to and including the last '/'.
 */
export function crosswalkVersionFamily(version: string): string {
  const cut = version.lastIndexOf('/');
  return cut < 0 ? version : version.slice(0, cut + 1);
}
/** The one rule for collectors (Cardmarket, CardRush, TCGplayer): a collector
 * writing under `version` replaces a live row only when that row is its own
 * rule's, under any revision, so a corrected rule (cardrush-title/2) moves its
 * own earlier mappings on. A row of any other family is another writer's
 * decision, an operator's review above all, and stays live.
 */
export function collectorMaySupersede(liveVersion: string, version: string): boolean {
  return crosswalkVersionFamily(liveVersion) === crosswalkVersionFamily(version);
}

export function validateSetCrosswalk(input: SetCrosswalkInput): void {
  if (!knownSource(input.source) || !text(input.sourceSetKey) || !text(input.game) || typeof input.setCode !== 'string' ||
      !/^[a-z0-9]+$/.test(input.setCode) || !text(input.evidence) || !text(input.crosswalkVersion)) throw new Error('invalid-price-set-crosswalk');
}

/** Writes the live mapping for one (source, product, finish, language). A
 * different mapping supersedes the live row; the same one is left in place,
 * and a collector leaves another writer's row in place too
 * (collectorMaySupersede), deciding under the same lock as the write.
 * Rows are never edited or deleted, and observations are never rewritten:
 * derivation reads whichever row is live when it runs.
 */
export async function writeProductCrosswalk(input: ProductCrosswalkInput, runTransaction: typeof transaction = transaction, options: CrosswalkWriteOptions = {}): Promise<CrosswalkWrite> {
  validateProductCrosswalk(input);
  return runTransaction(async tx => {
    // One writer per live key, so a re-map supersedes instead of racing the
    // unique index. Hash collisions only serialize unrelated keys.
    await tx('SELECT pg_advisory_xact_lock(140, hashtext($1::text))', [JSON.stringify(['product', input.source, input.sourceProductId, input.finish, input.language])]);
    const live = await tx(`SELECT id::text, sku, set_code, game, mapping_status, evidence, crosswalk_version FROM price_source_crosswalks
      WHERE source=$1 AND source_product_id=$2 AND finish IS NOT DISTINCT FROM $3::text AND language IS NOT DISTINCT FROM $4::text AND superseded_at IS NULL`,
    [input.source, input.sourceProductId, input.finish, input.language]);
    const current = live.rows[0] as Record<string, string | null> | undefined;
    if (current && current.sku === input.sku && current.set_code === input.setCode && current.game === input.game &&
        current.mapping_status === input.mappingStatus && current.evidence === input.evidence && current.crosswalk_version === input.crosswalkVersion) {
      return { id: String(current.id), supersededId: null, unchanged: true };
    }
    if (current && options.collector && !collectorMaySupersede(String(current.crosswalk_version), input.crosswalkVersion)) {
      return { id: String(current.id), supersededId: null, unchanged: true, foreign: true };
    }
    if (current) await tx('UPDATE price_source_crosswalks SET superseded_at=clock_timestamp() WHERE id=$1::bigint AND superseded_at IS NULL', [current.id]);
    const inserted = await tx(`INSERT INTO price_source_crosswalks (source,source_product_id,finish,language,sku,game,set_code,mapping_status,evidence,crosswalk_version)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text`,
    [input.source, input.sourceProductId, input.finish, input.language, input.sku, input.game, input.setCode, input.mappingStatus, input.evidence, input.crosswalkVersion]);
    return { id: String(inserted.rows[0].id), supersededId: current ? String(current.id) : null, unchanged: false };
  });
}

/** Writes the live set mapping for one (source, game, source set key), with
 * the same supersede-never-edit rule as products, collectors' included.
 */
export async function writeSetCrosswalk(input: SetCrosswalkInput, runTransaction: typeof transaction = transaction, options: CrosswalkWriteOptions = {}): Promise<CrosswalkWrite> {
  validateSetCrosswalk(input);
  return runTransaction(async tx => {
    await tx('SELECT pg_advisory_xact_lock(140, hashtext($1::text))', [JSON.stringify(['set', input.source, input.game, input.sourceSetKey])]);
    const live = await tx(`SELECT id::text, set_code, evidence, crosswalk_version FROM price_source_set_crosswalks
      WHERE source=$1 AND game=$2 AND source_set_key=$3 AND superseded_at IS NULL`, [input.source, input.game, input.sourceSetKey]);
    const current = live.rows[0] as Record<string, string> | undefined;
    if (current && current.set_code === input.setCode && current.evidence === input.evidence && current.crosswalk_version === input.crosswalkVersion) {
      return { id: String(current.id), supersededId: null, unchanged: true };
    }
    if (current && options.collector && !collectorMaySupersede(current.crosswalk_version, input.crosswalkVersion)) {
      return { id: String(current.id), supersededId: null, unchanged: true, foreign: true };
    }
    if (current) await tx('UPDATE price_source_set_crosswalks SET superseded_at=clock_timestamp() WHERE id=$1::bigint AND superseded_at IS NULL', [current.id]);
    const inserted = await tx(`INSERT INTO price_source_set_crosswalks (source,source_set_key,game,set_code,evidence,crosswalk_version)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text`,
    [input.source, input.sourceSetKey, input.game, input.setCode, input.evidence, input.crosswalkVersion]);
    return { id: String(inserted.rows[0].id), supersededId: current ? String(current.id) : null, unchanged: false };
  });
}

/** A live price_source_crosswalks row as read, columns by their SQL names. */
export interface LiveCrosswalkRow {
  id: string;
  finish: string | null;
  language: string | null;
  sku: string | null;
  game: string;
  set_code: string | null;
  mapping_status: string;
  evidence: string;
  crosswalk_version: string;
}

/** One product's resolution from its live crosswalk row, or from none. Only
 * an exact row whose SKU still passes the observation SKU rule yields a SKU;
 * an ambiguous row, a failing SKU or a game disagreement resolves as
 * ambiguous, and no row as unmapped. Nothing is guessed. Callers that hold
 * their own snapshot (the market derivation reads observations and live rows
 * in one statement) resolve through this, so both paths share one rule.
 */
export function resolveLiveCrosswalk(product: SourceProductRef, row: LiveCrosswalkRow | null | undefined): ResolvedSku {
  if (!row) return { sku: null, setCode: null, mappingStatus: 'unmapped', crosswalkId: null, crosswalkVersion: null };
  const found = { crosswalkId: String(row.id), crosswalkVersion: String(row.crosswalk_version) };
  // Source product IDs are unique within a source, so a live row for
  // another game is a conflicting identity, not a different product.
  if (row.mapping_status !== 'exact' || row.game !== product.game) return { sku: null, setCode: null, mappingStatus: 'ambiguous', ...found };
  const mapping = resolvePriceCrosswalk(product.source, product.sourceProductId, product.finish, product.language, product.game, [{
    source: product.source, sourceProductId: product.sourceProductId, finish: row.finish, language: row.language,
    sku: String(row.sku), game: String(row.game), setCode: String(row.set_code), evidence: String(row.evidence),
  }]);
  return { ...mapping, ...found };
}

/** Resolves each source product to a SKU through its live crosswalk, in input
 * order, by resolveLiveCrosswalk's rule.
 */
export async function resolveCrosswalkSkus(products: readonly SourceProductRef[], runQuery: typeof query = query): Promise<ResolvedSku[]> {
  const results: ResolvedSku[] = [];
  for (let offset = 0; offset < products.length; offset += RESOLVE_CHUNK) {
    const chunk = products.slice(offset, offset + RESOLVE_CHUNK);
    const rows = await runQuery(`SELECT c.id::text, c.source, c.source_product_id, c.finish, c.language, c.sku, c.game, c.set_code, c.mapping_status, c.evidence, c.crosswalk_version
      FROM price_source_crosswalks c
      WHERE c.superseded_at IS NULL AND (c.source, c.source_product_id) IN (SELECT p.source, p.product FROM jsonb_to_recordset($1::jsonb) AS p(source text, product text))`,
    [JSON.stringify(chunk.map(product => ({ source: product.source, product: product.sourceProductId })))]);
    // The live index allows one row per key, so this map is exact.
    const live = new Map(rows.rows.map(row => [productKey(row.source, row.source_product_id, row.finish, row.language), row as LiveCrosswalkRow]));
    for (const product of chunk) results.push(resolveLiveCrosswalk(product, live.get(productKey(product.source, product.sourceProductId, product.finish, product.language))));
  }
  return results;
}
