#!/usr/bin/env tsx
/**
 * tcgdex-drift.ts — second-witness drift detector for the `sets` table.
 *
 * The platform now carries two witnesses for set metadata: CardRush
 * (operator-curated `name`, `release_date`) is the market-reality witness;
 * TCGdex (`tcgdex_name`, `tcgdex_release_date`) is the metadata-
 * correctness witness. They are not unified — this audit reports where
 * they disagree, leaving the call to the operator.
 *
 * Designed in `docs/connections/the-second-witness.md`. Schema laid down
 * by `apps/wholesale/drizzle/0020_sets_tcgdex_witness.sql`. Enrichment
 * wiring in `apps/wholesale/src/lib/cardrush-discovery.ts` (the
 * `tcgdexPostBackfill` pass).
 *
 * ── Four checks ─────────────────────────────────────────────────────
 *
 *   1. `sets.name` disagrees with `sets.tcgdex_name`. The headline drift.
 *      Surfaces e.g. SV11B "ガイアクライシス" (our pre-release rumour)
 *      vs TCGdex's "ブラックボルト" (the actual release).
 *
 *   2. `sets.release_date` disagrees with `sets.tcgdex_release_date`.
 *      Secondary drift — useful when operator-entered dates are stale.
 *
 *   3. Sets that have NOT yet been enriched (`tcgdex_fetched_at IS NULL`)
 *      for a tcgdex-supported game. Informational — the next discovery
 *      cron will pick them up via `tcgdexPostBackfill` (LIMIT 200).
 *
 *   4. Sets whose `tcgdex_card_count` is much smaller than the actual
 *      card_count joined from `cards`. Suggests we have cards TCGdex
 *      doesn't know about — usually means our set_code parsing landed
 *      on a code TCGdex spells differently.
 *
 * Skips gracefully when `WHOLESALE_DATABASE_URL` is unset.
 *
 * Run via:
 *   pnpm audit:tcgdex-drift                # informational
 *   pnpm audit:tcgdex-drift -- --strict    # exits 1 on any drift finding
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const STRICT = process.argv.includes("--strict");

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const envFile = loadEnvFile(join(ADMIN_DIR, ".env.local"));
const WHOLESALE_DATABASE_URL =
  process.env.WHOLESALE_DATABASE_URL ?? envFile.WHOLESALE_DATABASE_URL ?? "";

interface Finding {
  check: number;
  severity: "fail" | "warn";
  message: string;
}

const findings: Finding[] = [];
function warn(check: number, message: string) {
  findings.push({ check, severity: "warn", message });
}

async function main(): Promise<void> {
  console.log("");
  console.log("◆ tcgdex-drift audit — sets.name vs sets.tcgdex_name (second-witness)");
  console.log("");

  if (!WHOLESALE_DATABASE_URL) {
    console.log("  Skipped — WHOLESALE_DATABASE_URL not set.");
    console.log("");
    process.exit(0);
  }

  let client: Awaited<ReturnType<typeof import("@cambridge-tcg/db").createDb>>["client"];
  let close: Awaited<ReturnType<typeof import("@cambridge-tcg/db").createDb>>["close"];
  try {
    const { createDb } = await import("@cambridge-tcg/db");
    ({ client, close } = createDb({ url: WHOLESALE_DATABASE_URL }));
  } catch (err) {
    console.log(
      `  Skipped — DB setup failed (${err instanceof Error ? err.message : String(err)})`,
    );
    console.log("");
    process.exit(0);
  }

  try {
    // ── Check 1: name disagreement ─────────────────────────────────────
    const nameDrift = await client<
      Array<{
        set_id: number;
        set_code: string;
        game_code: string;
        cardrush_name: string;
        tcgdex_name: string;
      }>
    >`
      SELECT
        s.id AS set_id,
        s.code AS set_code,
        g.code AS game_code,
        s.name AS cardrush_name,
        s.tcgdex_name AS tcgdex_name
      FROM sets s
      JOIN games g ON g.id = s.game_id
      WHERE s.tcgdex_name IS NOT NULL
        AND s.name IS DISTINCT FROM s.tcgdex_name
      ORDER BY g.code, s.code
    `;

    console.log(`◇ Check 1 — sets where name ≠ tcgdex_name`);
    console.log(`    count: ${nameDrift.length}`);
    if (nameDrift.length > 0) {
      console.log("    Disagreements (first 30):");
      for (const r of nameDrift.slice(0, 30)) {
        console.log(
          `      [${r.game_code}] ${r.set_code} — ours: "${r.cardrush_name}"  ·  tcgdex: "${r.tcgdex_name}"`,
        );
      }
      console.log(
        `    Operator decides per-row: if tcgdex is right, UPDATE sets SET name = tcgdex_name;`,
      );
      console.log(
        `    if ours is right, the curated KNOWN_SET_NAMES entry stays. Either way, the`,
      );
      console.log(`    discovery cron's post-backfill pass won't overwrite ours (guarded by name = code).`);
      warn(1, `${nameDrift.length} sets show name drift between our curated value and TCGdex`);
    }
    console.log("");

    // ── Check 2: release_date disagreement ─────────────────────────────
    const dateDrift = await client<
      Array<{
        set_code: string;
        game_code: string;
        cardrush_date: string;
        tcgdex_date: string;
      }>
    >`
      SELECT
        s.code AS set_code,
        g.code AS game_code,
        s.release_date AS cardrush_date,
        s.tcgdex_release_date AS tcgdex_date
      FROM sets s
      JOIN games g ON g.id = s.game_id
      WHERE s.tcgdex_release_date IS NOT NULL
        AND s.release_date IS NOT NULL
        AND s.release_date IS DISTINCT FROM s.tcgdex_release_date
      ORDER BY g.code, s.code
    `;

    console.log(`◇ Check 2 — sets where release_date ≠ tcgdex_release_date`);
    console.log(`    count: ${dateDrift.length}`);
    if (dateDrift.length > 0) {
      console.log("    Disagreements (first 20):");
      for (const r of dateDrift.slice(0, 20)) {
        console.log(
          `      [${r.game_code}] ${r.set_code} — ours: ${r.cardrush_date}  ·  tcgdex: ${r.tcgdex_date}`,
        );
      }
      warn(2, `${dateDrift.length} sets show release_date drift vs TCGdex`);
    }
    console.log("");

    // ── Check 3: un-enriched pokemon sets ──────────────────────────────
    const unenriched = await client<
      Array<{ set_code: string; game_code: string; cardrush_name: string }>
    >`
      SELECT s.code AS set_code, g.code AS game_code, s.name AS cardrush_name
      FROM sets s
      JOIN games g ON g.id = s.game_id
      WHERE s.tcgdex_fetched_at IS NULL
        AND g.code = 'pokemon'
      ORDER BY s.code
    `;

    console.log(`◇ Check 3 — pokemon sets not yet enriched by TCGdex`);
    console.log(`    count: ${unenriched.length}`);
    if (unenriched.length > 0) {
      console.log(`    These will be enriched by the next discovery cron tick`);
      console.log(`    (tcgdexPostBackfill — LIMIT 200/run). First 10:`);
      for (const r of unenriched.slice(0, 10)) {
        console.log(`      ${r.set_code} ${r.cardrush_name}`);
      }
      if (unenriched.length > 200) {
        warn(
          3,
          `${unenriched.length} pokemon sets un-enriched — exceeds per-run cap of 200. May take >1 tick to converge.`,
        );
      }
    }
    console.log("");

    // ── Check 4: tcgdex_card_count much smaller than our card count ────
    const sizeDrift = await client<
      Array<{
        set_code: string;
        game_code: string;
        our_count: number;
        tcgdex_count: number;
      }>
    >`
      SELECT
        s.code AS set_code,
        g.code AS game_code,
        (SELECT COUNT(*)::int FROM cards c WHERE c.set_id = s.id) AS our_count,
        s.tcgdex_card_count AS tcgdex_count
      FROM sets s
      JOIN games g ON g.id = s.game_id
      WHERE s.tcgdex_card_count IS NOT NULL
        AND s.tcgdex_card_count > 0
    `;

    // "Much smaller" = ours has >50% more cards than tcgdex (we scraped variants tcgdex doesn't list).
    // The inverse (tcgdex has more than us) is just "we haven't scraped them yet" — not a drift signal.
    const sizeFindings = sizeDrift.filter(
      (r) => r.our_count > r.tcgdex_count * 1.5,
    );
    console.log(`◇ Check 4 — sets where our card count ≫ tcgdex_card_count`);
    console.log(`    count: ${sizeFindings.length}`);
    if (sizeFindings.length > 0) {
      console.log(`    Sets where we have >1.5× the cards TCGdex lists. Often this`);
      console.log(`    indicates parallel/variant SKUs that TCGdex doesn't model.`);
      console.log(`    Top 10 by ratio:`);
      const top = sizeFindings
        .map((r) => ({ ...r, ratio: r.our_count / r.tcgdex_count }))
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, 10);
      for (const r of top) {
        console.log(
          `      [${r.game_code}] ${r.set_code} — ours: ${r.our_count}  ·  tcgdex: ${r.tcgdex_count}  (×${r.ratio.toFixed(2)})`,
        );
      }
      warn(
        4,
        `${sizeFindings.length} sets have >1.5× TCGdex's card count — likely parallel/variant cards`,
      );
    }
    console.log("");
  } finally {
    await close();
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("◆ Summary");
  if (findings.length === 0) {
    console.log("  No drift findings. Sets and TCGdex agree on all enriched rows.");
    console.log("");
    process.exit(0);
  }

  for (const f of findings) {
    console.log(`  · [check ${f.check}] ${f.message}`);
  }
  console.log("");

  if (STRICT) {
    console.log("✗ Strict mode — exiting 1 due to drift findings.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[tcgdex-drift] crashed:", err);
  process.exit(1);
});
