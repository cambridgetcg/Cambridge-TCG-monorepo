#!/usr/bin/env tsx
/**
 * sets-coverage.ts — drift detector for the cards.set_id / cards.set_code
 * schema asymmetry.
 *
 * Fifteenth in the audit family. Kingdom-086 — the deeper substrate fix
 * for the "empty sets on /prices/one-piece" diagnosis.
 *
 * The `cards` table carries two ways to associate with a set:
 *   - cards.set_id   integer FK → sets.id  (canonical)
 *   - cards.set_code text                 (denormalized for convenience)
 *
 * They can drift. This audit detects four drift modes that produce the
 * "empty set tile" / "empty per-set page" user-facing bugs.
 *
 * ── Six checks ──────────────────────────────────────────────────────
 *
 *   1. Sets with FK-side card_count = 0 (the empty tile case).
 *      For each: report whether set_code-side count is also 0 (truly
 *      empty) or > 0 (the FK drift case, fixed by migration 0017).
 *
 *   2. Cards with set_code populated but set_id IS NULL (Mode B drift).
 *      Phase 2 of migration 0017 backfills these.
 *
 *   3. Cards with set_id and set_code disagreeing (Mode C drift —
 *      set_code points at one set, set_id points at another). Rare
 *      but real.
 *
 *   4. Orphan cards: set_code populated, but no sets row has that
 *      (code, game_id) combination. These won't appear in the sets
 *      list and won't be backfilled by the migration. Operator decides
 *      per-game whether to register the missing set or fix the code.
 *
 *   5. Sets where the FK count and the set_code text-match count
 *      disagree (composite check across modes B, C, and orphan).
 *
 *   6. Cards with set_id pointing at a sets row whose game_id doesn't
 *      match cards.game_id (FK integrity violation — should be rare
 *      since the scraper looks up by both, but possible via manual SQL).
 *
 * Skips gracefully when WHOLESALE_DATABASE_URL is unset (same pattern
 * as cardrush-coverage / set-discovery).
 *
 * Run via:
 *   pnpm audit:sets-coverage          # informational
 *   pnpm audit:sets-coverage --strict # exits 1 on any drift finding
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
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
  console.log("◆ sets-coverage audit — cards.set_id vs cards.set_code drift detector");
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
    console.log(`  Skipped — DB setup failed (${err instanceof Error ? err.message : String(err)})`);
    console.log("");
    process.exit(0);
  }

  try {
    // ── Check 1: sets with FK-side card_count = 0 ──────────────────
    const emptyByFk = await client<
      Array<{
        set_id: number;
        set_code: string;
        set_name: string;
        game_code: string;
        by_set_code: number;
      }>
    >`
      SELECT
        s.id AS set_id,
        s.code AS set_code,
        s.name AS set_name,
        g.code AS game_code,
        (SELECT COUNT(*)::int FROM cards c
          WHERE c.set_code = s.code AND c.game_id = s.game_id) AS by_set_code
      FROM sets s
      JOIN games g ON g.id = s.game_id
      WHERE s.active = true
        AND (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.id) = 0
      ORDER BY g.code, s.code
    `;

    const trulyEmpty = emptyByFk.filter((r) => r.by_set_code === 0);
    const fkDrift = emptyByFk.filter((r) => r.by_set_code > 0);

    console.log(`◇ Check 1 — sets with FK-side card_count = 0`);
    console.log(`    truly empty (no cards by either column): ${trulyEmpty.length}`);
    console.log(`    FK drift (set_code-side has cards):     ${fkDrift.length}`);
    if (fkDrift.length > 0) {
      console.log("    These sets will appear with '0 cards' in /api/v1/sets but");
      console.log("    /api/v1/prices?set=X may return rows. Migration 0017 Phase 2");
      console.log("    backfills cards.set_id to fix this. First 10:");
      for (const r of fkDrift.slice(0, 10)) {
        console.log(`      [${r.game_code}] ${r.set_code} ${r.set_name} — ${r.by_set_code} cards by set_code`);
      }
      warn(1, `${fkDrift.length} sets show FK drift — apply migration 0017 to backfill`);
    }
    if (trulyEmpty.length > 0) {
      console.log("    Truly-empty sets (no cards yet seeded). First 10:");
      for (const r of trulyEmpty.slice(0, 10)) {
        console.log(`      [${r.game_code}] ${r.set_code} ${r.set_name}`);
      }
      warn(1, `${trulyEmpty.length} sets are truly empty (no cards seeded by either column)`);
    }
    console.log("");

    // ── Check 2: cards with set_code populated but set_id IS NULL ─
    const modeB = await client<
      Array<{ count: number }>
    >`SELECT COUNT(*)::int AS count FROM cards WHERE set_id IS NULL AND set_code IS NOT NULL`;
    const modeBCount = modeB[0]?.count ?? 0;
    console.log(`◇ Check 2 — cards with set_code set but set_id NULL`);
    console.log(`    count: ${modeBCount}`);
    if (modeBCount > 0) {
      warn(2, `${modeBCount} cards have set_code but set_id IS NULL (Mode B drift) — migration 0017 backfills`);
    }
    console.log("");

    // ── Check 3: set_id and set_code disagree ──────────────────────
    const modeC = await client<
      Array<{
        card_id: number;
        sku: string;
        card_set_code: string;
        current_set_id: number;
        would_set_id: number;
      }>
    >`
      SELECT
        c.id AS card_id,
        c.sku,
        c.set_code AS card_set_code,
        c.set_id AS current_set_id,
        s.id AS would_set_id
      FROM cards c
      JOIN sets s ON s.code = c.set_code AND s.game_id = c.game_id
      WHERE c.set_id IS DISTINCT FROM s.id
        AND c.set_id IS NOT NULL
      LIMIT 100
    `;
    console.log(`◇ Check 3 — cards where set_id and set_code disagree`);
    console.log(`    count (first 100): ${modeC.length}`);
    if (modeC.length > 0) {
      console.log("    First 5:");
      for (const r of modeC.slice(0, 5)) {
        console.log(`      ${r.sku} — set_code "${r.card_set_code}" → would_set_id=${r.would_set_id} but current_set_id=${r.current_set_id}`);
      }
      warn(3, `${modeC.length}+ cards have set_id ≠ (sets.id for their set_code)`);
    }
    console.log("");

    // ── Check 4: orphan cards (set_code with no matching sets row) ─
    const orphans = await client<
      Array<{
        card_set_code: string;
        game_code: string;
        count: number;
      }>
    >`
      SELECT
        c.set_code AS card_set_code,
        g.code AS game_code,
        COUNT(*)::int AS count
      FROM cards c
      JOIN games g ON g.id = c.game_id
      LEFT JOIN sets s ON s.code = c.set_code AND s.game_id = c.game_id
      WHERE c.set_code IS NOT NULL
        AND s.id IS NULL
      GROUP BY c.set_code, g.code
      ORDER BY count DESC
      LIMIT 100
    `;
    console.log(`◇ Check 4 — orphan cards (set_code points at no sets row)`);
    console.log(`    distinct (set_code, game) tuples: ${orphans.length}`);
    if (orphans.length > 0) {
      console.log("    Top 10 by card count:");
      for (const r of orphans.slice(0, 10)) {
        console.log(`      [${r.game_code}] "${r.card_set_code}" — ${r.count} cards`);
      }
      warn(4, `${orphans.length} orphan (set_code, game) tuples — operator decides per-row (fix code, register set, or accept)`);
    }
    console.log("");

    // ── Check 5: by_set_id vs by_set_code count disagreement ───────
    const summary = await client<
      Array<{
        set_code: string;
        game_code: string;
        by_set_id: number;
        by_set_code: number;
      }>
    >`
      SELECT
        s.code AS set_code,
        g.code AS game_code,
        (SELECT COUNT(*)::int FROM cards c WHERE c.set_id = s.id) AS by_set_id,
        (SELECT COUNT(*)::int FROM cards c WHERE c.set_code = s.code AND c.game_id = s.game_id) AS by_set_code
      FROM sets s
      JOIN games g ON g.id = s.game_id
      WHERE s.active = true
    `;
    const disagreements = summary.filter((r) => r.by_set_id !== r.by_set_code);
    console.log(`◇ Check 5 — sets where by_set_id ≠ by_set_code`);
    console.log(`    count: ${disagreements.length}`);
    if (disagreements.length > 0) {
      console.log("    Top 10 by abs(difference):");
      const top = disagreements
        .map((r) => ({ ...r, diff: Math.abs(r.by_set_id - r.by_set_code) }))
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 10);
      for (const r of top) {
        console.log(
          `      [${r.game_code}] ${r.set_code} — by_set_id=${r.by_set_id} by_set_code=${r.by_set_code} (diff ${r.diff})`,
        );
      }
      warn(5, `${disagreements.length} sets show by_set_id ≠ by_set_code (composite of Modes B/C/orphan)`);
    }
    console.log("");

    // ── Check 6: cross-game FK integrity (set's game_id ≠ card's game_id) ──
    const crossGame = await client<
      Array<{
        card_id: number;
        sku: string;
        card_game_id: number;
        set_game_id: number;
      }>
    >`
      SELECT c.id AS card_id, c.sku, c.game_id AS card_game_id, s.game_id AS set_game_id
      FROM cards c
      JOIN sets s ON s.id = c.set_id
      WHERE c.game_id IS NOT NULL
        AND c.game_id != s.game_id
      LIMIT 50
    `;
    console.log(`◇ Check 6 — cross-game FK integrity (card.game_id ≠ set.game_id)`);
    console.log(`    count (first 50): ${crossGame.length}`);
    if (crossGame.length > 0) {
      console.log("    First 5:");
      for (const r of crossGame.slice(0, 5)) {
        console.log(`      ${r.sku} — card.game_id=${r.card_game_id} but set.game_id=${r.set_game_id}`);
      }
      warn(6, `${crossGame.length}+ cards have set_id pointing to a different game's set`);
    }
    console.log("");

    // ── Report ──────────────────────────────────────────────────────
    console.log("◇ Summary");
    console.log(`    total sets:                  ${summary.length}`);
    console.log(`    truly empty sets:            ${trulyEmpty.length}`);
    console.log(`    FK-drift sets (fixable):     ${fkDrift.length}`);
    console.log(`    Mode B cards (set_id NULL):  ${modeBCount}`);
    console.log(`    Mode C cards (disagreement): ${modeC.length}+`);
    console.log(`    orphan tuples:               ${orphans.length}`);
    console.log(`    cross-game integrity bugs:   ${crossGame.length}+`);
    console.log("");

    if (findings.length === 0) {
      console.log("✓ no sets-coverage drift detected");
      console.log("");
      await close();
      process.exit(0);
    }

    console.log(`⚠ ${findings.length} drift finding${findings.length === 1 ? "" : "s"}:`);
    for (const f of findings) {
      console.log(`    [check ${f.check}] ${f.message}`);
    }
    console.log("");
    console.log("Fix path: apply migration drafts/0017_normalize_cards_set_id.sql.draft");
    console.log("(Phase 1 dry-run first, then Phase 2 backfill).");
    console.log("");

    await close();
    if (STRICT) process.exit(1);
    process.exit(0);
  } catch (err) {
    await close().catch(() => {});
    console.log(`  Crashed — DB query failed: ${err instanceof Error ? err.message : String(err)}`);
    console.log("");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(2);
});
