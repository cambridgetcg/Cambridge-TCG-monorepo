import 'server-only';
import { transaction } from '@/lib/db';
import { MEMBER_PRICE_POLICIES, derivationAllowed } from '@cambridge-tcg/data-ingest/member-prices';
import { DERIVED_MARKET_METHOD_VERSION, DERIVED_MARKET_SOURCES, REFERENCE_FRESHNESS_DAYS, type DerivedMarketSource, type FxCurrency, type FxQuote } from '@cambridge-tcg/data-spec';
import { resolveLiveCrosswalk, type LiveCrosswalkRow } from '@/lib/datafeed/crosswalks';
import {
  DERIVATION_PERMITTED_FROM, HEADLINE_METRICS, SOURCE_CURRENCY, checkFxQuotes, computeIndices, computePremiums, computeReferences, contributionGaps, emptySkips,
  fxRecordFor, isCalendarDate, isHeadline, isPlaceableHeadline, scanRanges, valueProducts, valuesBySku,
  type ContributionGap, type DerivationCandidate, type DerivationSkips, type EcbQuotesInput, type PublishedLevel, type SeenObservation,
} from './method';
import { isNotProvisioned } from './provisioning';

/** The market derivation job (plan §3), method ctcg.market-derived/v1: one
 * run per derivation date, one transaction per run. The caller decides
 * whether it runs at all (the cron route's DATA_DERIVE_MARKET flag); this
 * module never reads the environment, a clock or the network.
 *
 * Inputs are read, in one statement, from sources whose release row is
 * unrevoked, has derivation set and holds the code's derivation evidence
 * (version and URL); exportability is read from the same rows. A source left
 * out, or one that is eligible but contributes no headline value, is named in
 * the result with its reason. A run that cannot be complete writes nothing: a
 * refusal returns before the first insert, and an error during the writes
 * rolls the whole transaction back. Missing tables, or the 0139 columns this
 * job reads, are reported as not provisioned, never as an empty success; any
 * other error is a failure. Nothing here publishes: rows are written for
 * readers that check revocation when they serve them.
 */

const WRITE_CHUNK = 500;
/** One derivation writer at a time across all dates: runs, chaining and the
 * idempotency check see each other's committed state. */
const RUN_LOCK = 'SELECT pg_advisory_xact_lock(141, 1)';
/** The pool's per-connection bounds (packages/db: statement_timeout 30 s,
 * idle_in_transaction_session_timeout 15 s) are sized for requests. This job
 * reads a week of observations in one statement, and a duplicate run waits on
 * RUN_LOCK, so it raises both for its own transaction only (SET LOCAL ends
 * with it), inside the route's 300 s: a statement that outlives them is
 * cancelled and the whole run rolls back, and a run the platform stops leaves
 * an idle transaction that the server ends within a minute. */
export const RUN_BOUNDS = ["SET LOCAL statement_timeout = '240s'", "SET LOCAL idle_in_transaction_session_timeout = '60s'"] as const;
/** The columns of 0139 this job reads: a database without them is not provisioned. */
const MIGRATION_0139_COLUMNS = ['derivation', 'derivation_evidence_version', 'derivation_evidence_url', 'source_set_key'] as const;

type Tx = Parameters<Parameters<typeof transaction>[0]>[0];
/** Why a source fed nothing into a run: its release row refused it before any
 * read, or (ContributionGap) it was eligible and no headline value survived. */
export type SourceExclusion = 'no-release-row' | 'revoked' | 'derivation-off' | 'evidence-mismatch' | ContributionGap;
export interface MarketDerivationInput {
  /** The derivation date, YYYY-MM-DD (UTC), not after `now`. */
  asOf: string;
  now: Date;
  /** ECB's quotes, injected; production passes fetchEcbEuroQuotes() from lib/fx/rates. */
  fx: EcbQuotesInput | null;
}
interface RunIdentity { asOf: string; methodVersion: typeof DERIVED_MARKET_METHOD_VERSION }
export type MarketDerivationResult = RunIdentity & (
  | {
    ok: true; ran: true; runId: string; inputBatchCeiling: string;
    inputEvidence: Partial<Record<DerivedMarketSource, string>>;
    fx: Partial<Record<FxCurrency, FxQuote>>;
    excludedSources: Partial<Record<DerivedMarketSource, SourceExclusion>>;
    written: { references: number; indices: number; premiums: number };
    skipped: DerivationSkips;
  }
  | { ok: true; ran: false; reason: 'already-derived'; runId: string }
  | { ok: false; ran: false; reason: 'not-provisioned' | 'fx-unavailable' | 'no-inputs' | 'out-of-order'; detail: string;
    excludedSources?: Partial<Record<DerivedMarketSource, SourceExclusion>>; skipped?: DerivationSkips }
);

const knownSource = (value: unknown): value is DerivedMarketSource => (DERIVED_MARKET_SOURCES as readonly unknown[]).includes(value);

export async function runMarketDerivation(input: MarketDerivationInput, runTransaction: typeof transaction = transaction): Promise<MarketDerivationResult> {
  const { asOf, now } = input;
  if (!isCalendarDate(asOf)) throw new RangeError('Derivation date must be a calendar date, YYYY-MM-DD.');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('A valid run time is required.');
  if (asOf > now.toISOString().slice(0, 10)) throw new RangeError('A derivation date cannot be after the run time.');
  const identity: RunIdentity = { asOf, methodVersion: DERIVED_MARKET_METHOD_VERSION };
  // FX is checked before any database work: fallback rates never start a run.
  const fxCheck = checkFxQuotes(input.fx, asOf);
  if (!fxCheck.ok) return { ...identity, ok: false, ran: false, reason: 'fx-unavailable', detail: fxCheck.detail };
  const quotes = input.fx!;
  try {
    return await runTransaction(tx => derive(tx, identity, quotes));
  } catch (error) {
    if (isNotProvisioned(error, MIGRATION_0139_COLUMNS)) {
      return { ...identity, ok: false, ran: false, reason: 'not-provisioned', detail: 'Market derivation storage (migrations 0137 and 0139–0141) is not provisioned here.' };
    }
    throw error;
  }
}

async function derive(tx: Tx, identity: RunIdentity, quotes: EcbQuotesInput): Promise<MarketDerivationResult> {
  const { asOf, methodVersion } = identity;
  for (const bound of RUN_BOUNDS) await tx(bound);
  await tx(RUN_LOCK);
  // Idempotent per (as_of, method_version). A date before the latest run is
  // refused too: indices chain forward, so a run dated in the middle would
  // fork every series it touched.
  const runs = await tx(`SELECT id::text, as_of::text FROM market_derivation_runs WHERE method_version = $1 AND as_of >= $2::date ORDER BY as_of DESC`, [methodVersion, asOf]);
  const same = runs.rows.find(row => row.as_of === asOf);
  if (same) return { ...identity, ok: true, ran: false, reason: 'already-derived', runId: String(same.id) };
  if (runs.rows.length) return { ...identity, ok: false, ran: false, reason: 'out-of-order', detail: `A run for ${runs.rows[0].as_of} already exists; dates are derived in order.` };

  // Inputs and exportability, both from the release rows.
  const releases = await tx(`SELECT source, member_api, member_download, derivation, derivation_evidence_version, derivation_evidence_url, revoked_at IS NOT NULL AS revoked
    FROM member_price_source_releases`);
  const exportable = releases.rows.filter(row => row.member_api || row.member_download).map(row => String(row.source));
  const eligible = new Map<DerivedMarketSource, string>();
  const excludedSources: Partial<Record<DerivedMarketSource, SourceExclusion>> = {};
  for (const source of DERIVED_MARKET_SOURCES) {
    const row = releases.rows.find(release => release.source === source);
    const derivation = MEMBER_PRICE_POLICIES[source].derivation;
    if (!row) excludedSources[source] = 'no-release-row';
    else if (row.revoked) excludedSources[source] = 'revoked';
    else if (!row.derivation) excludedSources[source] = 'derivation-off';
    else if (!derivationAllowed(source, String(row.derivation_evidence_version)) || row.derivation_evidence_url !== derivation?.evidenceUrl) excludedSources[source] = 'evidence-mismatch';
    else eligible.set(source, String(row.derivation_evidence_version));
  }
  if (!eligible.size) return { ...identity, ok: false, ran: false, reason: 'no-inputs', detail: 'No source may feed a derivation now.', excludedSources };

  // The latest published level of each series a source that may feed this
  // run holds, with the inputs of the run that published it, so its products
  // can be valued again exactly as then. A series of a source left out cannot
  // chain today, so its date is no window.
  const published = await tx(`SELECT DISTINCT ON (i.index_key) i.index_key, i.market, i.as_of::text AS as_of, i.level::text AS level,
      r.input_batch_ceiling::text AS ceiling, r.fx::text AS fx
    FROM market_indices i JOIN market_derivation_runs r ON r.id = i.run_id
    WHERE i.method_version = $1 AND i.market = ANY($2::text[]) ORDER BY i.index_key, i.as_of DESC`, [methodVersion, [...eligible.keys()]]);
  const latest = new Map<string, PublishedLevel>();
  const priorRuns = new Map<string, { ceiling: string; rates: Partial<Record<FxCurrency, string>>; markets: Set<DerivedMarketSource> }>();
  for (const row of published.rows) {
    if (!knownSource(row.market)) throw new Error('market-derivation-unknown-source');
    latest.set(String(row.index_key), { asOf: String(row.as_of), level: String(row.level) });
    const date = String(row.as_of);
    const prior = priorRuns.get(date);
    if (prior) { prior.markets.add(row.market); continue; }
    const fx = JSON.parse(String(row.fx)) as Partial<Record<FxCurrency, FxQuote>>;
    priorRuns.set(date, { ceiling: String(row.ceiling), rates: Object.fromEntries(Object.entries(fx).map(([currency, quote]) => [currency, quote!.rate])), markets: new Set([row.market]) });
  }

  // One statement, one snapshot: the committed batch ceiling, the latest
  // headline-metric observation per key in each window, its live product
  // crosswalk, and the live set crosswalk of its source set key (0139, 0140).
  // Batches commit in id order (0137), so the ceiling is closed; a prior date
  // is re-read at its own run's ceiling, and only for the markets whose
  // series were last published on it.
  const windows = [{ as_of: asOf, ceiling: null as string | null, markets: [...eligible.keys()] },
    ...[...priorRuns].map(([date, run]) => ({ as_of: date, ceiling: run.ceiling, markets: [...run.markets].sort() }))];
  const params: unknown[] = [JSON.stringify([...eligible.keys()].map(source => ({ source, evidence_version: MEMBER_PRICE_POLICIES[source].evidenceVersion }))),
    asOf, JSON.stringify(windows), REFERENCE_FRESHNESS_DAYS, DERIVATION_PERMITTED_FROM];
  const bind = (value: unknown) => `$${params.push(value)}`;
  // Each window's bounds come from a parameter the planner cannot see into,
  // so each source's headline metrics and the ranges of its own windows are
  // also bound as constants, one arm each: member_price_observations_derivation
  // (0139) then reads each arm's range, and nothing between two windows or
  // before the earliest a source needs (scanRanges).
  const scans = [...eligible.keys()].flatMap(source => {
    const ranges = scanRanges(windows.filter(window => window.markets.includes(source)).map(window => window.as_of), REFERENCE_FRESHNESS_DAYS);
    const s = bind(source), m = bind(HEADLINE_METRICS[source]);
    return ranges.map(range => `(o.source = ${s} AND o.metric = ANY(${m}::text[]) AND o.source_updated_at >= ${bind(range.from)}::timestamptz AND o.source_updated_at < ${bind(range.to)}::timestamptz)`);
  });
  const read = await tx(`WITH ceiling AS (
      SELECT COALESCE(MAX(id), 0)::bigint AS watermark FROM member_price_batches
    ), inputs AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS i(source text, evidence_version text)
    ), windows AS (
      SELECT w.as_of, COALESCE(w.ceiling, c.watermark) AS ceiling, w.markets, w.as_of = $2::date AS current
      FROM jsonb_to_recordset($3::jsonb) AS w(as_of date, ceiling bigint, markets text[]) CROSS JOIN ceiling c
    ), latest AS (
      SELECT DISTINCT ON (w.as_of, o.source, o.source_product_id, COALESCE(o.finish, ''), COALESCE(o.language, ''), COALESCE(o.condition, ''), o.metric)
        w.as_of, w.current, o.source, o.source_product_id, o.finish, o.language, o.condition, o.metric, o.game, o.amount, o.currency, o.source_set_key
      FROM windows w
      JOIN member_price_observations o ON o.batch_id <= w.ceiling AND o.source = ANY(w.markets)
        AND o.source_updated_at >= (w.as_of - $4::int)::timestamp AT TIME ZONE 'UTC'
        AND o.source_updated_at < (w.as_of + 1)::timestamp AT TIME ZONE 'UTC'
      JOIN inputs i ON i.source = o.source AND i.evidence_version = o.evidence_version
      WHERE o.quality = 'accepted' AND o.retrieved_at >= $5::timestamptz
        AND (${scans.join(' OR ')})
      ORDER BY w.as_of, o.source, o.source_product_id, COALESCE(o.finish, ''), COALESCE(o.language, ''), COALESCE(o.condition, ''), o.metric, o.source_updated_at DESC, o.id DESC
    ), joined AS (
      SELECT l.*, c.id AS crosswalk_id, c.finish AS crosswalk_finish, c.language AS crosswalk_language, c.sku, c.game AS crosswalk_game,
        c.set_code, c.mapping_status, c.evidence, c.crosswalk_version, s.id AS set_crosswalk_id, s.set_code AS key_set_code
      FROM latest l LEFT JOIN price_source_crosswalks c ON c.superseded_at IS NULL AND c.source = l.source
        AND c.source_product_id = l.source_product_id AND c.finish IS NOT DISTINCT FROM l.finish AND c.language IS NOT DISTINCT FROM l.language
      LEFT JOIN price_source_set_crosswalks s ON s.superseded_at IS NULL AND s.source = l.source AND s.game = l.game AND s.source_set_key = l.source_set_key
    ) SELECT (SELECT watermark::text FROM ceiling) AS watermark,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('asOf', j.as_of::text, 'source', j.source, 'sourceProductId', j.source_product_id,
          'finish', j.finish, 'language', j.language, 'condition', j.condition, 'metric', j.metric, 'game', j.game, 'amount', j.amount::text,
          'currency', j.currency, 'crosswalk', CASE WHEN j.crosswalk_id IS NULL THEN NULL ELSE jsonb_build_object('id', j.crosswalk_id::text,
            'finish', j.crosswalk_finish, 'language', j.crosswalk_language, 'sku', j.sku, 'game', j.crosswalk_game, 'set_code', j.set_code,
            'mapping_status', j.mapping_status, 'evidence', j.evidence, 'crosswalk_version', j.crosswalk_version) END,
          'keySetCode', j.key_set_code)
        ORDER BY j.as_of, j.source, j.source_product_id, j.finish NULLS FIRST, j.language NULLS FIRST, j.condition NULLS FIRST, j.metric)
        FROM joined j WHERE j.crosswalk_id IS NOT NULL OR j.set_crosswalk_id IS NOT NULL), '[]'::jsonb) AS candidates,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('source', g.source, 'metric', g.metric, 'foil', g.foil, 'condition', g.condition, 'count', g.n))
        FROM (SELECT source, metric, finish IS NOT DISTINCT FROM 'foil' AS foil, condition, count(*)::int AS n
              FROM joined WHERE current AND crosswalk_id IS NULL AND set_crosswalk_id IS NULL GROUP BY 1, 2, 3, 4) g), '[]'::jsonb) AS unmapped`,
  params);
  const snapshot = read.rows[0];
  if (!snapshot) throw new Error('market-derivation-snapshot-missing');
  const inputBatchCeiling = String(snapshot.watermark);
  const byWindow = new Map<string, DerivationCandidate[]>();
  for (const raw of snapshot.candidates as Record<string, unknown>[]) {
    if (!knownSource(raw.source)) throw new Error('market-derivation-unknown-source');
    const product = { source: raw.source, sourceProductId: String(raw.sourceProductId), finish: raw.finish as string | null, language: raw.language as string | null, game: String(raw.game) };
    const resolved = resolveLiveCrosswalk(product, raw.crosswalk as LiveCrosswalkRow | null);
    const candidate: DerivationCandidate = {
      ...product, condition: raw.condition as string | null, metric: String(raw.metric), amount: String(raw.amount), currency: String(raw.currency),
      mapping: { status: resolved.mappingStatus, sku: resolved.sku, setCode: resolved.setCode },
      keySetCode: raw.keySetCode === null || raw.keySetCode === undefined ? null : String(raw.keySetCode),
    };
    const date = String(raw.asOf);
    const window = byWindow.get(date);
    if (window) window.push(candidate); else byWindow.set(date, [candidate]);
  }

  const skipped = emptySkips();
  // Current-window observations with neither crosswalk: counted, and seen
  // when a source that contributes nothing is given its reason.
  const unplaced: SeenObservation[] = [];
  for (const group of snapshot.unmapped as { source: DerivedMarketSource; metric: string; foil: boolean; condition: string | null; count: number }[]) {
    if (!knownSource(group.source)) throw new Error('market-derivation-unknown-source');
    const row = { source: group.source, finish: group.foil ? 'foil' : null, condition: group.condition, metric: group.metric, placeable: false };
    skipped[isHeadline(row) ? 'unmapped' : 'notHeadline'] += Number(group.count);
    unplaced.push(row);
  }
  const current = byWindow.get(asOf) ?? [];
  // Every currency a headline input needs must cross from ECB's quotes, or
  // the run does not happen: a missing rate never drops a source silently.
  const needed = current.filter(isPlaceableHeadline).map(candidate => SOURCE_CURRENCY[candidate.source]);
  const fx = fxRecordFor(quotes, needed);
  if (!fx.ok) return { ...identity, ok: false, ran: false, reason: 'fx-unavailable', detail: fx.detail, excludedSources };
  const today = valueProducts(current, fx.rates, skipped);
  // An eligible source that contributed nothing is named, with the step that left it empty.
  Object.assign(excludedSources, contributionGaps(eligible.keys(),
    [...unplaced, ...current.map(candidate => ({ ...candidate, placeable: isPlaceableHeadline(candidate) }))], today));
  const contributing = [...new Set([...today.values()].map(product => product.source))].sort();
  if (!contributing.length) {
    return { ...identity, ok: false, ran: false, reason: 'no-inputs', detail: `No fresh headline observation placed in a set for ${asOf}.`, excludedSources, skipped };
  }
  const inputEvidence = Object.fromEntries(contributing.map(source => [source, eligible.get(source)!])) as Partial<Record<DerivedMarketSource, string>>;
  const fxRecord = Object.fromEntries(contributing.map(source => [SOURCE_CURRENCY[source], fx.record[SOURCE_CURRENCY[source]]!])) as Partial<Record<FxCurrency, FxQuote>>;

  // Each prior date valued again at its own run's ceiling and recorded
  // crosses; today's crosswalks decide which products a series holds.
  const valuations = new Map<string, Map<string, string>>();
  for (const [date, run] of priorRuns) {
    const products = valueProducts(byWindow.get(date) ?? [], run.rates, emptySkips());
    valuations.set(date, new Map([...products.values()].map(product => [product.key, product.gbp])));
  }
  const indices = computeIndices(asOf, today, { latest, valuations }, skipped);
  const bySku = valuesBySku(today.values(), skipped);
  const references = computeReferences(bySku, exportable, skipped);
  const premiums = computePremiums(bySku, skipped);

  const run = await tx(`INSERT INTO market_derivation_runs (method_version, as_of, input_batch_ceiling, input_evidence, fx)
    VALUES ($1, $2::date, $3::bigint, $4::jsonb, $5::jsonb) RETURNING id::text`,
  [methodVersion, asOf, inputBatchCeiling, JSON.stringify(inputEvidence), JSON.stringify(fxRecord)]);
  const runId = String(run.rows[0].id);
  const head = [runId, methodVersion, asOf];
  const written = { references: 0, indices: 0, premiums: 0 };
  for (let offset = 0; offset < references.length; offset += WRITE_CHUNK) {
    const rows = references.slice(offset, offset + WRITE_CHUNK).map(row => ({ sku: row.sku, game: row.game, set_code: row.setCode, amount: row.amount, confidence: row.confidence, sources: row.sources }));
    written.references += (await tx(`INSERT INTO market_reference_prices (run_id, method_version, as_of, sku, game, set_code, amount, currency, confidence, sources, source_count)
      SELECT $1::bigint, $2, $3::date, r.sku, r.game, r.set_code, r.amount::numeric, 'GBP', r.confidence, r.sources, cardinality(r.sources)
      FROM jsonb_to_recordset($4::jsonb) AS r(sku text, game text, set_code text, amount text, confidence text, sources text[])`, [...head, JSON.stringify(rows)])).rowCount;
  }
  for (let offset = 0; offset < indices.length; offset += WRITE_CHUNK) {
    const rows = indices.slice(offset, offset + WRITE_CHUNK).map(row => ({ game: row.game, set_code: row.setCode, market: row.market, level: row.level, constituents: row.constituents, previous_as_of: row.previousAsOf }));
    written.indices += (await tx(`INSERT INTO market_indices (run_id, method_version, as_of, game, set_code, market, level, constituents, previous_as_of, sources)
      SELECT $1::bigint, $2, $3::date, r.game, r.set_code, r.market, r.level::numeric, r.constituents, r.previous_as_of, ARRAY[r.market]
      FROM jsonb_to_recordset($4::jsonb) AS r(game text, set_code text, market text, level text, constituents integer, previous_as_of date)`, [...head, JSON.stringify(rows)])).rowCount;
  }
  for (let offset = 0; offset < premiums.length; offset += WRITE_CHUNK) {
    const rows = premiums.slice(offset, offset + WRITE_CHUNK).map(row => ({
      game: row.game, set_code: row.setCode, market: row.market, base_market: row.baseMarket, ratio_p25: row.ratioP25, ratio_median: row.ratioMedian,
      ratio_p75: row.ratioP75, sku_count: row.skuCount, market_languages: row.marketLanguages, base_languages: row.baseLanguages,
    }));
    written.premiums += (await tx(`INSERT INTO market_premiums (run_id, method_version, as_of, game, set_code, market, base_market, ratio_p25, ratio_median, ratio_p75, sku_count, sources, market_languages, base_languages)
      SELECT $1::bigint, $2, $3::date, r.game, r.set_code, r.market, r.base_market, r.ratio_p25::numeric, r.ratio_median::numeric, r.ratio_p75::numeric, r.sku_count,
        ARRAY[r.base_market, r.market], r.market_languages, r.base_languages
      FROM jsonb_to_recordset($4::jsonb) AS r(game text, set_code text, market text, base_market text, ratio_p25 text, ratio_median text, ratio_p75 text,
        sku_count integer, market_languages text[], base_languages text[])`, [...head, JSON.stringify(rows)])).rowCount;
  }
  return { ...identity, ok: true, ran: true, runId, inputBatchCeiling, inputEvidence, fx: fxRecord, excludedSources, written, skipped };
}
