/**
 * The logic of the two manual official-image tools, Yu's decision of
 * 2026-10-30 (docs/decisions/2026-10-30-japanese-official-images.md):
 *
 * - runIngest (scripts/ingest-official-ja.mjs) reads Bandai's Japanese card
 *   lists and, with --apply, records card_images rows for base prints.
 *   Reading the lists is an outward act that needs Yu's word for the run,
 *   dry run included: a dry run only writes nothing.
 * - runUpload (scripts/upload-official-images.mjs) copies a reviewed
 *   selection of rows' publisher images to the bucket and records each
 *   object. --apply is the AWS write and the moment of publication: it needs
 *   Yu's word, D6 lifted for that upload, and the AWS profile they name at
 *   run time.
 *
 * Inert unless run by a person: both default to dry runs, and neither is
 * reached by a route, a cron or a test that touches anything real. This
 * module imports no database driver, no process module and nothing
 * server-only; the entry scripts own the environment, the one database
 * client, the lockfile and the AWS CLI call, and inject them.
 *
 * Exit codes: 0 done, 1 unexpected, 2 usage, 3 another run holds the lock,
 * 4 a refusal (a publisher host's or AWS's: stop and ask Yu, never retry),
 * 5 drift (the page, the selection or the bucket is not as reviewed).
 */

import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOfficialMediaReader, type OfficialMediaLane, type OfficialMediaReader, type OfficialMediaRobots } from "@cambridge-tcg/data-ingest/official-media";
import { bandaiJpSelectionValid, collectBandaiJpImages, type BandaiJpSelection, type BandaiJpSeriesCount } from "@cambridge-tcg/data-ingest/bandai-jp/collect";
import { BANDAI_JP_GAMES, type BandaiJpGameKey } from "@cambridge-tcg/data-ingest/bandai-jp";
import { laneSourceUrl, OFFICIAL_IMAGE_LANES, type OfficialImageGame, type OfficialImageLane } from "./official-image-lanes";
import { officialImageUrl } from "./image-publication";

export const OFFICIAL_MEDIA_BUCKET = "ctcg-card-images";
export const OFFICIAL_MEDIA_REGION = "us-east-1";
/** The session advisory lock both tools hold on their one client: card_images
 * is migration 0116, as 137, 140 and 141 name theirs. */
export const OFFICIAL_MEDIA_LOCK = "SELECT pg_try_advisory_lock(116, 1) AS locked";
export const UPLOAD_MAX_GONE = 10;
const IMAGE_MIN_BYTES = 1024, IMAGE_MAX_BYTES = 8 * 1024 * 1024, IMAGE_MIN_SIDE = 64, IMAGE_MAX_SIDE = 8192;
const ROBOTS_MAX_AGE_MS = 60 * 60 * 1000;
const PROFILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** The only variables the AWS CLI child sees. An endpoint override would
 * send the upload elsewhere while the tool recorded success, and other
 * credential variables would replace the named profile. */
export const AWS_CHILD_ENV = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "AWS_CA_BUNDLE"] as const;

export interface ToolQueryResult { rows: Record<string, unknown>[]; rowCount: number | null }
/** The run's one database client (a pg.Client in the scripts). */
export interface ToolDb { query(sql: string, params?: unknown[]): Promise<ToolQueryResult>; end(): Promise<void> }
export interface ToolTls { noSsl: boolean; caFile: string | null }
export type ToolExecFile = (file: string, args: readonly string[], options: { shell: false; timeout: number; env: Record<string, string> }) => Promise<{ stdout: string; stderr: string }>;

export interface ToolDeps {
  out(line: string): void;
  err(line: string): void;
  fetch: typeof fetch;
  env: Readonly<Record<string, string | undefined>>;
  /** The lockfile: one official-media run at a time on this machine. */
  lock(): { ok: true; release(): void } | { ok: false; path: string };
  /** Opens the one client, from DATABASE_URL in the environment only. */
  openDb(tls: ToolTls): Promise<ToolDb>;
  execFile: ToolExecFile;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** A run that cannot start as asked (exit 2). The scripts throw it too, for
 * a missing DATABASE_URL or TLS setting; its message never holds a value. */
export class OfficialToolUsage extends Error {}
const Usage = OfficialToolUsage;
class Stop extends Error { constructor(readonly code: 3 | 4 | 5, message: string) { super(message); } }

/** Strict flags: every argument is a known flag, or a known flag's value. */
function parseFlags(argv: readonly string[], valued: readonly string[], bare: readonly string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (flags.has(arg)) throw new Usage(`repeated ${arg}`);
    if (bare.includes(arg)) flags.set(arg, true);
    else if (valued.includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Usage(`${arg} needs a value`);
      flags.set(arg, value); i += 1;
    } else throw new Usage(`unknown argument ${JSON.stringify(arg)}`);
  }
  return flags;
}
function tlsFrom(flags: Map<string, string | true>): ToolTls {
  const caFile = flags.get("--ca-file");
  if (flags.has("--no-ssl") && caFile !== undefined) throw new Usage("choose --no-ssl or --ca-file, not both");
  return { noSsl: flags.has("--no-ssl"), caFile: typeof caFile === "string" ? caFile : null };
}

async function lockedDb(deps: ToolDeps, tls: ToolTls): Promise<ToolDb> {
  const db = await deps.openDb(tls);
  const { rows } = await db.query(OFFICIAL_MEDIA_LOCK);
  if (rows[0]?.locked !== true) { await db.end(); throw new Stop(3, "another official-media run holds the database lock"); }
  return db;
}

/** Runs one tool body under the lockfile, mapping its stops to exit codes. */
async function underLock(deps: ToolDeps, body: (hold: { db: ToolDb | null }) => Promise<number>): Promise<number> {
  const lock = deps.lock();
  if (!lock.ok) { deps.err(`another official-media run holds ${lock.path}; stopped before any request`); return 3; }
  const hold: { db: ToolDb | null } = { db: null };
  try {
    return await body(hold);
  } catch (error) {
    if (error instanceof Stop) { deps.err(`stopped: ${error.message}`); return error.code; }
    if (error instanceof Usage) { deps.err(error.message); return 2; }
    deps.err(`failed: ${error instanceof Error ? error.name : "unknown"}`);
    return 1;
  } finally {
    if (hold.db) await hold.db.end().catch(() => {});
    lock.release();
  }
}

// ── Collection: ingest-official-ja.mjs ──────────────────────────────────

export const INGEST_USAGE = [
  "Usage: pnpm --filter cambridgetcg-storefront exec tsx scripts/ingest-official-ja.mjs --game op|dbf|all [--series id,…] [--apply] [--no-ssl | --ca-file <pem>]",
  "Reads Bandai's Japanese card-list pages (www.onepiece-cardgame.com, www.dbs-cardgame.com). Even the default dry run reads them:",
  "every run is an outward act that needs Yu's word for that run. The dry run prints counts only and writes nothing; --apply also",
  "records card_images rows for base prints, from DATABASE_URL in the environment. A host refusal (exit 4) means stop and ask Yu.",
].join("\n");

function ingestSelection(flags: Map<string, string | true>): BandaiJpSelection[] {
  const game = flags.get("--game");
  if (game !== "op" && game !== "dbf" && game !== "all") throw new Usage("--game must be op, dbf or all");
  const games: BandaiJpGameKey[] = game === "all" ? ["op", "dbf"] : [game];
  const series = flags.get("--series");
  if (series === undefined) return games.map((g) => ({ game: g, series: BANDAI_JP_GAMES[g].series }));
  if (typeof series !== "string" || !/^\d{6}(?:,\d{6})*$/.test(series)) throw new Usage("--series takes comma-separated six-digit series ids");
  const ids = series.split(",");
  if (new Set(ids).size !== ids.length) throw new Usage("--series repeats an id");
  const selection = games.map((g) => ({ game: g, series: BANDAI_JP_GAMES[g].series.filter((id) => ids.includes(id)) })).filter((s) => s.series.length > 0);
  const known = new Set(selection.flatMap((s) => s.series));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new Usage(`series not in the configured list: ${unknown.join(", ")}`);
  if (!bandaiJpSelectionValid(selection)) throw new Usage("no series selected");
  return selection;
}

const countLine = (c: BandaiJpSeriesCount) =>
  `  ${c.game} ${c.series}: blocks ${c.blocks}, base ${c.base}, skipped ${c.skipped} (no reviewed variant mapping), quarantined ${c.quarantined}, duplicates ${c.duplicates}, conflicts ${c.conflicts}`;

const INSERT_SERIES = `INSERT INTO card_images (sku, lang, kind, source, source_url, attribution, license_note, retrieved_at)
SELECT r.sku, 'ja', 'official_sample', 'bandai-jp', r.source_url, r.attribution, r.license_note, r.retrieved_at
  FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[]) AS r(sku, source_url, attribution, license_note, retrieved_at)
ON CONFLICT (sku, lang, kind, source) DO NOTHING
RETURNING sku`;

export async function runIngest(argv: readonly string[], deps: ToolDeps): Promise<number> {
  let flags: Map<string, string | true>, selection: BandaiJpSelection[], tls: ToolTls;
  try {
    flags = parseFlags(argv, ["--game", "--series", "--ca-file"], ["--apply", "--no-ssl", "--help"]);
    if (flags.has("--help")) { deps.out(INGEST_USAGE); return 0; }
    selection = ingestSelection(flags);
    tls = tlsFrom(flags);
  } catch (error) {
    if (!(error instanceof Usage)) throw error;
    deps.err(`${error.message}\n${INGEST_USAGE}`);
    return 2;
  }
  const apply = flags.has("--apply");
  return underLock(deps, async (hold) => {
    // The database lock comes before any request, so a held run reads nothing.
    if (apply) hold.db = await lockedDb(deps, tls);
    deps.out(`ingest-official-ja: this run reads Bandai's Japanese card-list pages, an outward act needing Yu's word for it; ${apply ? "--apply: rows are recorded at the end" : "dry run: counts only, nothing written"}.`);
    const reader = createOfficialMediaReader({ lane: "ja", fetch: deps.fetch, now: deps.now, sleep: deps.sleep });
    const now = deps.now ?? Date.now;
    const result = await collectBandaiJpImages({ reader, selection, now: () => new Date(now()) });
    for (const count of result.counts) deps.out(countLine(count));
    deps.out(`  requests: ${result.requests}`);
    if (result.kind === "refused") throw new Stop(4, `${result.host} refused (${result.reason}${result.series ? `, series ${result.series}` : ""}); nothing written. Stop and ask Yu; do not retry.`);
    if (result.kind === "drift") throw new Stop(5, `${result.game} series ${result.series} is not shaped as reviewed (${result.reason}); nothing written. Narrow with --series or review the parser.`);
    const attempted = result.rowsBySeries.reduce((n, s) => n + s.rows.length, 0);
    deps.out(`  totals: ${result.counts.length} series, ${attempted} base rows to record, ${result.counts.reduce((n, c) => n + c.skipped, 0)} skipped, ${result.counts.reduce((n, c) => n + c.quarantined, 0)} quarantined, ${result.counts.reduce((n, c) => n + c.conflicts, 0)} conflicts`);
    if (!apply) { deps.out("dry run: nothing written"); return 0; }
    // One transaction, after every page was read: a stopped run writes nothing.
    const db = hold.db!;
    let inserted = 0;
    await db.query("BEGIN");
    try {
      for (const { rows } of result.rowsBySeries) {
        if (!rows.length) continue;
        const written = await db.query(INSERT_SERIES, [rows.map((r) => r.sku), rows.map((r) => r.source_url), rows.map((r) => r.attribution), rows.map((r) => r.license_note), rows.map((r) => r.retrieved_at)]);
        inserted += written.rowCount ?? 0;
      }
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      throw error;
    }
    deps.out(`applied: ${inserted} inserted, ${attempted - inserted} already present (left as they were)`);
    return 0;
  });
}

// ── Upload: upload-official-images.mjs ──────────────────────────────────

export const UPLOAD_USAGE = [
  "Usage: pnpm --filter cambridgetcg-storefront exec tsx scripts/upload-official-images.mjs --profile <name> --lang ja|en [--limit N] [--apply --expect <count>:<digest>] [--no-ssl | --ca-file <pem>]",
  "The dry run reads card_images (DATABASE_URL, from the environment) and prints the selection and its digest; it fetches nothing and runs no aws.",
  "--apply is the AWS write and the moment of publication: it needs Yu's word, D6 lifted for this upload, the profile they name, and",
  "--expect equal to the reviewed dry run. It fetches each publisher image, uploads it with put-object --if-none-match '*', and records it.",
].join("\n");

const SELECTION_WHERE = `lang = $1 AND source = $2 AND kind = 'official_sample' AND takedown_status = 'clear' AND s3_key IS NULL`;
// Takedown is per card: a row whose card has any official_sample row under
// takedown, in any language or variant, is held.
const CARD_HELD = `SELECT 1 FROM card_images t
                    WHERE t.kind = 'official_sample' AND t.takedown_status <> 'clear'
                      AND upper(split_part(t.sku, '-', 1)) = upper(split_part(card_images.sku, '-', 1))
                      AND upper(split_part(t.sku, '-', 2)) = upper(split_part(card_images.sku, '-', 2))
                      AND upper(split_part(t.sku, '-', 3)) = upper(split_part(card_images.sku, '-', 3))`;
const SELECT_UPLOAD = `SELECT sku, lang, kind, source, source_url, attribution, license_note FROM card_images
 WHERE ${SELECTION_WHERE}
   AND NOT EXISTS (${CARD_HELD})
 ORDER BY sku LIMIT $3`;
const COUNT_HELD = `SELECT count(*)::int AS held FROM card_images WHERE ${SELECTION_WHERE} AND EXISTS (${CARD_HELD})`;
const LOCK_ROW = `SELECT takedown_status, s3_key, EXISTS (${CARD_HELD}) AS held FROM card_images
 WHERE sku = $1 AND lang = $2 AND kind = $3 AND source = $4 FOR UPDATE NOWAIT`;
const RECORD_OBJECT = `UPDATE card_images SET s3_key = $5, sha256 = $6, width = $7, height = $8
 WHERE sku = $1 AND lang = $2 AND kind = $3 AND source = $4 AND s3_key IS NULL AND takedown_status = 'clear'`;

interface UploadRow { sku: string; lang: string; kind: string; source: string; source_url: string; attribution: string; license_note: string | null }
interface PlannedUpload { row: UploadRow; game: OfficialImageGame; url: URL; objectKey: string; contentType: "image/png" | "image/webp" }
const KEY_RE = /^([A-Z0-9]+)-([A-Z0-9]+)-([A-Z0-9]+)-([A-Z]{2})(?:-([A-Z0-9]+))?$/;

/** No network: what each selected row would upload, or why it may not. */
function preCheck(lane: OfficialImageLane, row: UploadRow): PlannedUpload | { reason: string } {
  const parts = row.sku.match(KEY_RE);
  if (!parts || parts[4] !== lane.lang.toUpperCase()) return { reason: "key-not-in-lane-language" };
  const game = parts[1]!.toLowerCase();
  if (!Object.hasOwn(lane.games, game)) return { reason: "game-outside-lane" };
  const url = laneSourceUrl(lane, game, row.source_url, row.sku);
  if (!url) return { reason: "source-url-outside-lane-or-names-another-card" };
  const ext = url.pathname.match(/\.(png|webp)$/)?.[1] as "png" | "webp" | undefined;
  if (!ext) return { reason: "not-png-or-webp" };
  const objectKey = `official/${row.sku}.${ext}`;
  if (officialImageUrl(objectKey) === null) return { reason: "object-key-unsafe" };
  if (lane.credits !== null && row.attribution !== lane.credits[game as OfficialImageGame]) return { reason: "credit-not-lane-credit" };
  if (lane.evidence !== null && row.license_note !== lane.evidence) return { reason: "evidence-not-lane-evidence" };
  return { row, game: game as OfficialImageGame, url, objectKey, contentType: ext === "png" ? "image/png" : "image/webp" };
}

export function selectionDigest(rows: readonly Pick<UploadRow, "sku" | "source_url">[]): string {
  const lines = rows.map((r) => `${r.sku}\t${r.source_url}`).sort();
  return `${rows.length}:${createHash("sha256").update(lines.join("\n")).digest("hex")}`;
}

/** Width and height read from the bytes: PNG IHDR; WebP VP8, VP8L or VP8X. */
export function imageDimensions(bytes: Uint8Array, contentType: "image/png" | "image/webp"): { width: number; height: number } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  const u16 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8);
  const u24 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b) || ascii(12, 16) !== "IHDR") return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length < 30 || ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP") return null;
  const chunk = ascii(12, 16);
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: u16(26) & 0x3fff, height: u16(28) & 0x3fff };
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = (bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { width: u24(24) + 1, height: u24(27) + 1 };
  return null;
}

/** The CLI's own error code, never its other output. */
function awsFailure(error: unknown): string {
  const stderr = typeof (error as { stderr?: unknown })?.stderr === "string" ? (error as { stderr: string }).stderr : "";
  const code = stderr.match(/An error occurred \((\w+)\)/)?.[1];
  if (code) return code;
  const e = error as { killed?: boolean; signal?: unknown; code?: unknown };
  if (e?.killed || e?.signal) return "aws-failed (timeout)";
  return `aws-failed (exit ${typeof e?.code === "number" ? e.code : "?"})`;
}
const isLockNotAvailable = (error: unknown) => (error as { code?: unknown })?.code === "55P03";

export async function runUpload(argv: readonly string[], deps: ToolDeps): Promise<number> {
  let flags: Map<string, string | true>, tls: ToolTls, lane: OfficialImageLane, profile: string, limit: number | null, expect: string | null;
  try {
    flags = parseFlags(argv, ["--profile", "--lang", "--limit", "--expect", "--ca-file"], ["--apply", "--no-ssl", "--help"]);
    if (flags.has("--help")) { deps.out(UPLOAD_USAGE); return 0; }
    const p = flags.get("--profile"), l = flags.get("--lang"), n = flags.get("--limit"), e = flags.get("--expect");
    if (typeof p !== "string" || !PROFILE_RE.test(p)) throw new Usage("--profile <name> is required: letters, digits, '.', '_' or '-', starting with a letter or digit");
    if (l !== "ja" && l !== "en") throw new Usage("--lang ja|en is required");
    if (n !== undefined && (typeof n !== "string" || !/^[1-9]\d{0,5}$/.test(n))) throw new Usage("--limit takes a positive whole number");
    if (e !== undefined && (!flags.has("--apply") || typeof e !== "string" || !/^\d+:[0-9a-f]{64}$/.test(e))) throw new Usage("--expect <count>:<sha256> goes with --apply");
    profile = p; lane = OFFICIAL_IMAGE_LANES[l]; limit = n === undefined ? null : Number(n); expect = typeof e === "string" ? e : null;
    tls = tlsFrom(flags);
  } catch (error) {
    if (!(error instanceof Usage)) throw error;
    deps.err(`${error.message}\n${UPLOAD_USAGE}`);
    return 2;
  }
  const apply = flags.has("--apply");
  return underLock(deps, async (hold) => {
    const db = hold.db = await lockedDb(deps, tls);
    deps.out(`upload-official-images: ${lane.lang} lane (${lane.source}); ${apply ? "--apply: uploads to the bucket and records each object" : "dry run: reads card_images only, fetches nothing, runs no aws"}.`);
    const selected = (await db.query(SELECT_UPLOAD, [lane.lang, lane.source, limit])).rows as unknown as UploadRow[];
    const held = Number((await db.query(COUNT_HELD, [lane.lang, lane.source])).rows[0]?.held ?? 0);
    const planned: PlannedUpload[] = [], failures = new Map<string, number>();
    for (const row of selected) {
      const plan = preCheck(lane, row);
      if ("reason" in plan) failures.set(plan.reason, (failures.get(plan.reason) ?? 0) + 1);
      else planned.push(plan);
    }
    const hosts = new Map<string, number>();
    for (const plan of planned) hosts.set(plan.url.hostname, (hosts.get(plan.url.hostname) ?? 0) + 1);
    for (const [host, count] of hosts) deps.out(`  ${host}: ${count}`);
    deps.out(`  held (card under takedown): ${held}`);
    for (const [reason, count] of failures) deps.out(`  pre-check failed, ${reason}: ${count}`);
    const digest = selectionDigest(selected);
    deps.out(`selection: ${digest.replace(":", " ")}`);
    if (!apply) {
      deps.out(failures.size ? "dry run: --apply would be refused until every pre-check passes" : `dry run: to upload exactly this selection, add --apply --expect ${digest}`);
      return 0;
    }
    if (failures.size) throw new Stop(5, "pre-checks failed; nothing fetched or uploaded");
    if (expect !== digest) throw new Stop(5, "--expect does not match a fresh selection; review a new dry run");
    return applyUpload(deps, db, lane, profile, planned);
  });
}

async function applyUpload(deps: ToolDeps, db: ToolDb, lane: OfficialImageLane, profile: string, planned: readonly PlannedUpload[]): Promise<number> {
  const env: Record<string, string> = {};
  for (const name of AWS_CHILD_ENV) { const value = deps.env[name]; if (typeof value === "string") env[name] = value; }
  const aws = (args: readonly string[]) => deps.execFile("aws", args, { shell: false, timeout: 120_000, env });
  // Preflight, before any request: the CLI must run.
  try {
    const { stdout, stderr } = await aws(["--version"]);
    if (!/aws-cli\/\d+\.\d+\.\d+/.test(`${stdout} ${stderr}`)) throw new Stop(4, "aws --version did not report a version");
  } catch (error) {
    if (error instanceof Stop) throw error;
    throw new Stop(4, `aws is not usable: ${awsFailure(error)}`);
  }
  const now = deps.now ?? Date.now;
  const reader: OfficialMediaReader = createOfficialMediaReader({ lane: lane.lang as OfficialMediaLane, fetch: deps.fetch, now: deps.now, sleep: deps.sleep });
  const robots = new Map<string, OfficialMediaRobots>();
  const tally = { uploaded: 0, adopted: 0, changed: 0, held: 0, gone: 0 };
  const summary = () => `uploaded ${tally.uploaded}, adopted ${tally.adopted}, changed ${tally.changed}, held ${tally.held}, gone ${tally.gone}`;
  const dir = await mkdtemp(join(tmpdir(), "ctcg-official-"));
  try {
    for (const plan of planned) {
      const host = plan.url.hostname;
      let rules = robots.get(host);
      if (!rules || rules.kind === "stop" || now() - rules.readAt > ROBOTS_MAX_AGE_MS) {
        rules = await reader.readRobotsTxt(host);
        robots.set(host, rules);
        if (rules.kind === "stop") throw new Stop(4, `${host} robots.txt: ${rules.reason}; ${summary()}`);
      }
      if (rules.kind === "rules" && !rules.allows(plan.url.pathname + plan.url.search)) throw new Stop(4, `${host} robots.txt disallows ${plan.row.sku}'s image; ${summary()}`);
      const answer = await reader.get(plan.url.href, { accept: plan.contentType, maxBytes: IMAGE_MAX_BYTES });
      if (answer.kind === "gone") {
        tally.gone += 1;
        if (tally.gone > UPLOAD_MAX_GONE) throw new Stop(5, `more than ${UPLOAD_MAX_GONE} images gone; ${summary()}`);
        continue;
      }
      if (answer.kind === "stop") throw new Stop(answer.reason === "too-large" ? 5 : 4, `${host} answered ${answer.reason} for ${plan.row.sku}; ${summary()}`);
      const contentType = answer.contentType.split(";")[0]!.trim().toLowerCase();
      const size = imageDimensions(answer.bytes, plan.contentType);
      if (contentType !== plan.contentType || answer.bytes.length < IMAGE_MIN_BYTES || !size
        || [size.width, size.height].some((side) => side < IMAGE_MIN_SIDE || side > IMAGE_MAX_SIDE)) {
        throw new Stop(5, `${plan.row.sku}: not the expected ${plan.contentType} image; ${summary()}`);
      }
      const sha256 = createHash("sha256").update(answer.bytes).digest();
      const hex = sha256.toString("hex"), b64 = sha256.toString("base64");
      const pk = [plan.row.sku, plan.row.lang, plan.row.kind, plan.row.source];

      await db.query("BEGIN");
      let open = true;
      try {
        let locked: ToolQueryResult;
        try { locked = await db.query(LOCK_ROW, pk); } catch (error) {
          if (isLockNotAvailable(error)) throw new Stop(3, `${plan.row.sku} is locked by another session; ${summary()}`);
          throw error;
        }
        const current = locked.rows[0];
        if (!current || current.takedown_status !== "clear" || current.s3_key !== null) { await db.query("ROLLBACK"); open = false; tally.changed += 1; continue; }
        if (current.held === true) { await db.query("ROLLBACK"); open = false; tally.held += 1; continue; }

        const file = join(dir, `${tally.uploaded + tally.adopted}.${plan.objectKey.split(".").pop()}`);
        await writeFile(file, answer.bytes, { mode: 0o600 });
        let adopted = false;
        try {
          const put = await aws(["s3api", "put-object", "--bucket", OFFICIAL_MEDIA_BUCKET, "--key", plan.objectKey, "--body", file,
            "--content-type", plan.contentType, "--checksum-sha256", b64, "--if-none-match", "*", "--profile", profile,
            "--region", OFFICIAL_MEDIA_REGION, "--output", "json", "--no-cli-pager"]);
          let response: { ChecksumSHA256?: unknown };
          try { response = JSON.parse(put.stdout) as { ChecksumSHA256?: unknown }; } catch { response = {}; }
          if (response.ChecksumSHA256 !== b64) throw new Stop(5, `${plan.objectKey}: the bucket's checksum differs from the fetched image; ${summary()}`);
        } catch (error) {
          if (error instanceof Stop) throw error;
          const code = awsFailure(error);
          if (code === "ConditionalRequestConflict") throw new Stop(4, `${plan.objectKey}: ${code}; ${summary()}`);
          if (code !== "PreconditionFailed") throw new Stop(4, `${plan.objectKey}: ${code}; ${summary()}`);
          // The object already exists (a crash between upload and record, say):
          // adopt it only when its stored SHA-256 and length are ours. Never overwrite.
          let head: { ChecksumSHA256?: unknown; ContentLength?: unknown };
          try {
            const out = await aws(["s3api", "head-object", "--bucket", OFFICIAL_MEDIA_BUCKET, "--key", plan.objectKey, "--checksum-mode", "ENABLED",
              "--profile", profile, "--region", OFFICIAL_MEDIA_REGION, "--output", "json", "--no-cli-pager"]);
            head = JSON.parse(out.stdout) as typeof head;
          } catch (headError) {
            throw new Stop(4, `${plan.objectKey} exists and could not be read back: ${awsFailure(headError)}; ${summary()}`);
          }
          if (typeof head.ChecksumSHA256 !== "string") throw new Stop(5, `${plan.objectKey} exists with no stored SHA-256 to compare; ${summary()}`);
          if (head.ChecksumSHA256 !== b64 || Number(head.ContentLength) !== answer.bytes.length) throw new Stop(5, `${plan.objectKey} exists with other bytes; ${summary()}`);
          adopted = true;
        } finally {
          await rm(file, { force: true });
        }
        const recorded = await db.query(RECORD_OBJECT, [...pk, plan.objectKey, hex, size.width, size.height]);
        if (recorded.rowCount !== 1) throw new Stop(5, `${plan.row.sku}: the row changed before it was recorded; ${summary()}`);
        await db.query("COMMIT"); open = false;
        if (adopted) tally.adopted += 1; else tally.uploaded += 1;
        deps.out(`  ${adopted ? "adopted" : "uploaded"} ${plan.objectKey}`);
      } finally {
        if (open) await db.query("ROLLBACK").catch(() => {});
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  deps.out(`done: ${summary()}`);
  return 0;
}
