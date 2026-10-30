// backfill-card-images-s3 — REFUSED since 2026-10-30. It stops before it
// reads credentials, the database or the network, and has no switch to turn
// back on. Official images reach the bucket only through
// upload-official-images.mjs (docs/decisions/2026-10-30-japanese-official-images.md),
// because this script, run beside Japanese rows, would:
//   - select every official_sample row with no s3_key, with no language,
//     source or takedown filter (disputed and removed rows included);
//   - record with UPDATE … WHERE sku=$2, not the primary key
//     (sku, lang, kind, source), pointing every row sharing a sku at one object;
//   - upload with ambient AWS credentials, not a named profile;
//   - overwrite existing objects (aws s3 cp);
//   - fetch five images at once with no spacing, robots.txt or stop on refusal.
// The redistribution audit pins the refusal. What the script did, below, is
// kept as history.
//
// Was: self-host the official publisher images.
//
// Policy: public readers must NEVER hotlink publisher source_urls. So we
// download each official_sample image once, upload it to the Cambridge-
// controlled bucket (ctcg-card-images), and write s3_key back. Only rows with
// a populated s3_key + takedown_status='clear' are ever published. Idempotent
// (skips rows that already have s3_key) and resumable.
//
//   DATABASE_URL=... node apps/storefront/scripts/backfill-card-images-s3.mjs
//
// Required the `aws` CLI (creds in env/config) + network to the publisher CDN.

import pg from "pg";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

console.error("Official images upload only through upload-official-images.mjs: docs/decisions/2026-10-30-japanese-official-images.md.");
process.exit(1);

const BUCKET = "ctcg-card-images";
const CONCURRENCY = 5;
const UA = "Mozilla/5.0 (compatible; CambridgeTCG-image-mirror/1.0; +https://cambridgetcg.com/legal/card-images)";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const tmp = mkdtempSync(join(tmpdir(), "ctcg-img-"));

function extFor(url) {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".webp")) return ["webp", "image/webp"];
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return ["jpg", "image/jpeg"];
  return ["png", "image/png"];
}

function s3cp(file, key, contentType) {
  return new Promise((resolve, reject) => {
    const p = spawn("aws", ["s3", "cp", file, `s3://${BUCKET}/${key}`, "--content-type", contentType, "--only-show-errors"], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error("aws cp " + code + ": " + err.slice(0, 200)))));
  });
}

async function one(row) {
  const [ext, ct] = extFor(row.source_url);
  const key = `official/${row.sku}.${ext}`;
  const res = await fetch(row.source_url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error(`too small (${buf.length}b) — likely not an image`);
  const file = join(tmp, `${row.sku}.${ext}`);
  writeFileSync(file, buf);
  await s3cp(file, key, ct);
  rmSync(file, { force: true });
  await pool.query("UPDATE card_images SET s3_key=$1 WHERE sku=$2 AND s3_key IS NULL", [key, row.sku]);
  return buf.length;
}

const { rows } = await pool.query(
  "SELECT sku, source_url FROM card_images WHERE s3_key IS NULL AND kind='official_sample' AND source_url IS NOT NULL ORDER BY sku",
);
console.log(`backfilling ${rows.length} official images → s3://${BUCKET}/official/ (concurrency ${CONCURRENCY})`);

let done = 0, ok = 0, fail = 0, bytes = 0;
let idx = 0;
async function worker() {
  while (idx < rows.length) {
    const row = rows[idx++];
    try { bytes += await one(row); ok++; }
    catch (e) { fail++; if (fail <= 20) console.error(`  ✗ ${row.sku}: ${e.message}`); }
    if (++done % 250 === 0) console.log(`  ${done}/${rows.length} (${ok} ok, ${fail} fail, ${(bytes / 1e6).toFixed(0)}MB)`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`DONE: ${ok} hosted, ${fail} failed, ${(bytes / 1e6).toFixed(0)}MB total`);
rmSync(tmp, { recursive: true, force: true });
await pool.end();
