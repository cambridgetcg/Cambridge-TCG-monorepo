/**
 * upload-official-images.mjs — copy reviewed official sample images to
 * Cambridge's bucket and record each object.
 *
 * The one path by which official images reach the bucket (the old
 * backfill-card-images-s3.mjs refuses to run). Yu's decision of 2026-10-30:
 * docs/decisions/2026-10-30-japanese-official-images.md.
 *
 *   pnpm --filter cambridgetcg-storefront exec tsx scripts/upload-official-images.mjs --profile <name> --lang ja|en [--limit N] [--apply --expect <count>:<digest>] [--no-ssl | --ca-file <pem>]
 *
 * --profile and --lang are required; English rows are handled only with an
 * explicit --lang en, under the same rules. The dry run reads card_images
 * (production data, from DATABASE_URL in the environment) and prints the
 * selection with its digest; it fetches nothing and runs no aws.
 *
 * --apply IS THE AWS WRITE AND THE MOMENT OF PUBLICATION (the bucket is
 * public-read). It needs Yu's word, D6 lifted for this upload and the AWS
 * profile he names at run time, and --expect equal to the dry run he
 * reviewed. Per row it fetches the publisher image (identified, at least 2 s
 * apart per host, robots.txt honoured), uploads it with
 * put-object --if-none-match '*' (never overwriting) and records it by the
 * row's full primary key. It stops on any refusal.
 *
 * This file owns the environment, the lockfile, the one database client and
 * the AWS CLI call; the logic lives in src/lib/cards/official-image-tools.ts.
 */

import { execFile } from "node:child_process";
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import pg from "pg";
// The storefront package is CommonJS to tsx, so the tools arrive as one default export.
import tools from "../src/lib/cards/official-image-tools.ts";

const { OfficialToolUsage, runUpload } = tools;

const LOCK_PATH = join(tmpdir(), "ctcg-official-media.lock");
const execFileAsync = promisify(execFile);

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
  writeSync(fd, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), tool: "upload-official-images" }));
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

process.exitCode = await runUpload(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  fetch: globalThis.fetch,
  env: process.env,
  lock,
  openDb,
  // No shell, a fixed program, the tool's allowlisted environment and a timeout.
  execFile: (file, args, options) => execFileAsync(file, [...args], { shell: false, timeout: options.timeout, env: options.env, encoding: "utf8", maxBuffer: 1024 * 1024 }),
});
