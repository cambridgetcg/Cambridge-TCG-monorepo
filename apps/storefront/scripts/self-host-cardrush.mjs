/**
 * self-host-cardrush.mjs — make the p2p market's images STABLE.
 *
 * ~602 card_set_cards rows still hotlink cardrush.jp (unstable; some already
 * 404). Every other card image is already self-hosted on jp-op-photos. This
 * downloads each cardrush straggler, uploads it to jp-op-photos under the SAME
 * key scheme as its siblings, and rewrites card_set_cards.image_url to the
 * self-hosted URL — so no market image is ever a hotlink again (the house rule
 * MarketBrowser already states: "never a hotlink").
 *
 * Idempotent: only touches rows whose image_url still LIKE '%cardrush%'. Rows
 * whose source 404s are left as-is and reported (no image to copy).
 *
 * Run from apps/storefront (needs a live AWS session + /tmp/prod.env):
 *   node scripts/self-host-cardrush.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync("/tmp/prod.env", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "").replace(/\\n$/, "").trim()]; }),
);

const BUCKET = "jp-op-photos";
const HOST = "https://jp-op-photos.s3.us-east-1.amazonaws.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const CONC = 5;

// Same key scheme as the existing self-hosted siblings (learned from the DB):
//   PK → hires/pokemon/<SET>/<SKU>.jpg ; FB → hires/dragonball/<SET>/<SKU>.jpg
//   everything else (OP/EB/ST/…) → hires/<SET>/<SKU>.jpg
function keyFor(sku) {
  const p = sku.split("-");
  const game = p[0], set = p[1];
  if (game === "PK") return `hires/pokemon/${set}/${sku}.jpg`;
  if (game === "FB") return `hires/dragonball/${set}/${sku}.jpg`;
  return `hires/${set}/${sku}.jpg`;
}

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(`SELECT sku, image_url FROM card_set_cards WHERE image_url LIKE '%cardrush%'`);
console.log(`${rows.length} cardrush hotlinks to self-host`);
const dir = mkdtempSync(join(tmpdir(), "cardrush-"));

let ok = 0, fail = 0;
const fails = [];
async function work(row) {
  try {
    const r = await fetch(row.image_url, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1500) throw new Error(`tiny ${buf.length}b`); // guard against error pages
    const local = join(dir, `${row.sku}.jpg`);
    writeFileSync(local, buf);
    const key = keyFor(row.sku);
    execFileSync("aws", ["s3", "cp", local, `s3://${BUCKET}/${key}`, "--content-type", "image/jpeg"], { stdio: "ignore" });
    await c.query("UPDATE card_set_cards SET image_url = $1 WHERE sku = $2", [`${HOST}/${key}`, row.sku]);
    ok++;
  } catch (e) {
    fail++;
    fails.push(`${row.sku}  ${e.message}`);
  }
}

for (let i = 0; i < rows.length; i += CONC) {
  await Promise.all(rows.slice(i, i + CONC).map(work));
  if ((i + CONC) % 50 < CONC) console.log(`  ${Math.min(i + CONC, rows.length)}/${rows.length}  (ok ${ok}, fail ${fail})`);
}

console.log(`\nDONE  self-hosted=${ok}  failed=${fail}`);
if (fails.length) console.log("FAILED (left as-is):\n" + fails.slice(0, 40).join("\n"));
await c.end();
