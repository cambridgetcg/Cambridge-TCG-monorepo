/**
 * ingest-official-ja.mjs — collect Japanese official sample-image addresses.
 *
 * Yu, 2026-10-30, chose to self-host Japanese official images as the English
 * ones are (docs/decisions/2026-10-30-japanese-official-images.md). This
 * tool reads Bandai's Japanese One Piece and Fusion World card-list pages and
 * records card_images rows (lang ja, source bandai-jp) for base prints. It
 * reads list pages only, never an image or a detail page.
 *
 * EVERY RUN READS BANDAI'S PAGES, the default dry run included: running it at
 * all is the collection act, which needs Yu's word for that run. The dry run
 * prints counts and writes nothing. A host refusal (exit 4) means stop and
 * ask Yu, never retry. Nothing schedules this tool.
 *
 *   pnpm --filter cambridgetcg-storefront exec tsx scripts/ingest-official-ja.mjs --game op|dbf|all [--series id,…] [--apply] [--no-ssl | --ca-file <pem>]
 *
 * --game is required: a bare run prints usage and does nothing. --apply reads
 * the database URL from the environment only (DATABASE_URL), with verified
 * TLS (--ca-file or PGSSLROOTCERT) or --no-ssl for a loopback database, and
 * writes everything in one transaction after every page was read
 * (ON CONFLICT DO NOTHING; no row is ever updated).
 *
 * This file owns the environment, the lockfile and the one database client;
 * the logic lives in src/lib/cards/official-image-tools.ts.
 */

import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
// The storefront package is CommonJS to tsx, so the tools arrive as one default export.
import tools from "../src/lib/cards/official-image-tools.ts";

const { OfficialToolUsage, runIngest } = tools;

const LOCK_PATH = join(tmpdir(), "ctcg-official-media.lock");

/** One official-media run at a time: created exclusively, removed only by
 * the process that created it. */
function lock() {
  let fd;
  try {
    fd = openSync(LOCK_PATH, "wx", 0o600);
  } catch (error) {
    if (error && error.code === "EEXIST") return { ok: false, path: LOCK_PATH };
    throw error;
  }
  writeSync(fd, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), tool: "ingest-official-ja" }));
  closeSync(fd);
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    try {
      if (JSON.parse(readFileSync(LOCK_PATH, "utf8")).pid === process.pid) unlinkSync(LOCK_PATH);
    } catch {
      // Already gone, or no longer ours.
    }
  };
  process.once("exit", release);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { release(); process.exit(130); });
  return { ok: true, release };
}

/** The run's one client: a pool would drop the session lock on an idle
 * connection and could split a transaction across connections. */
async function openDb({ noSsl, caFile }) {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new OfficialToolUsage("DATABASE_URL is not set in the environment.");
  let url;
  try { url = new URL(raw); } catch { throw new OfficialToolUsage("DATABASE_URL is not a URL."); }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  const ca = caFile ?? process.env.PGSSLROOTCERT ?? null;
  if (noSsl && !loopback) throw new OfficialToolUsage("--no-ssl is allowed only for a loopback database.");
  if (noSsl && ca) throw new OfficialToolUsage("Choose either --ca-file/PGSSLROOTCERT or --no-ssl, not both.");
  if (!noSsl && !ca) throw new OfficialToolUsage("Verified TLS is required: --ca-file or PGSSLROOTCERT, or --no-ssl for loopback only.");
  let ssl = false;
  if (!noSsl) {
    const pem = readFileSync(ca, "utf8");
    if (!pem.includes("-----BEGIN CERTIFICATE-----")) throw new OfficialToolUsage("The CA file holds no PEM certificate.");
    ssl = { ca: pem, rejectUnauthorized: true };
  }
  // pg lets sslmode in the URL override the explicit verified TLS object.
  url.searchParams.delete("sslmode");
  const client = new pg.Client({ connectionString: url.toString(), ssl });
  await client.connect();
  return { query: (sql, params) => client.query(sql, params), end: () => client.end() };
}

process.exitCode = await runIngest(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  fetch: globalThis.fetch,
  env: process.env,
  lock,
  openDb,
  execFile: async () => { throw new Error("the ingest runs no other program"); },
});
