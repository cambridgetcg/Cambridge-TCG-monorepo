#!/usr/bin/env tsx
/**
 * play-game-registry.ts — verify every pve_levels.game_code resolves to
 * a known engine.
 *
 * Seventeenth in the audit family. Where set-discovery (kingdom-078)
 * surfaces set-codes the protocol doesn't yet know about, **this one
 * surfaces game-codes the play module doesn't yet have an engine for**.
 *
 * The contract: every row in pve_levels.game_code MUST appear in
 * @cambridge-tcg/play's KNOWN_GAME_CODES list — i.e. there should be an
 * engine adapter shipped for it somewhere on the platform. If a row's
 * game_code isn't in the list, the route can't dispatch through the
 * registry; it would return 500 at request time.
 *
 * Three classifications:
 *   - `known + registered` — game_code matches KNOWN_GAME_CODES; no action.
 *   - `unknown` — DB row references a game_code that no engine is
 *     declared for. **Audit failure.**
 *   - `declared but unused` — KNOWN_GAME_CODES entry has no
 *     pve_levels row. Not a failure; surfaces as info.
 *
 * Setup state (until 0102_pve_game_code migration applies):
 *   - The column doesn't exist yet. We detect this and report "column
 *     not present — operator hasn't applied migration 0102 yet" and
 *     exit 0 (the route's DEFAULT_GAME_CODE fallback covers this case).
 *
 * Usage:
 *   pnpm --filter cambridgetcg-storefront play-game-registry
 *   pnpm --filter cambridgetcg-storefront play-game-registry -- --strict
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KNOWN_GAME_CODES, isKnownGameCode } from "@cambridge-tcg/play";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const STRICT = process.argv.includes("--strict");

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const envFile = loadEnvFile(join(ADMIN_DIR, ".env.local"));
const DATABASE_URL =
  process.env.DATABASE_URL ?? envFile.DATABASE_URL ?? "";

async function main() {
  console.log("");
  console.log("  ╔══════════════════════════════════════════════════════════════╗");
  console.log("  ║  pnpm audit:play-game-registry — every pve_levels.game_code  ║");
  console.log("  ║  resolves to a known engine                                  ║");
  console.log("  ╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Known engines (${KNOWN_GAME_CODES.length}): ${KNOWN_GAME_CODES.join(", ")}`);
  console.log("");

  if (!DATABASE_URL) {
    console.log("  Skipped — DATABASE_URL not set. The audit reads from pve_levels");
    console.log("  on the storefront RDS. Configure DATABASE_URL in apps/storefront/.env.local");
    console.log("  and re-run. No writes.");
    console.log("");
    process.exit(0);
  }

  let client: Awaited<ReturnType<typeof import("@cambridge-tcg/db").createDb>>["client"];
  let close: Awaited<ReturnType<typeof import("@cambridge-tcg/db").createDb>>["close"];
  try {
    const { createDb } = await import("@cambridge-tcg/db");
    ({ client, close } = createDb({ url: DATABASE_URL }));
  } catch (err) {
    console.log(
      `  Skipped — DB connection setup failed (${err instanceof Error ? err.message : String(err)})`,
    );
    console.log("");
    process.exit(0);
  }

  // Step 1: check if the column exists. If not, the operator hasn't applied
  // migration 0102 yet — that's OK, the route falls back to DEFAULT_GAME_CODE.
  let columnExists = false;
  try {
    const r = await client<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pve_levels' AND column_name = 'game_code'
      ) AS exists
    `;
    columnExists = r[0]?.exists ?? false;
  } catch (err) {
    await close();
    console.log(
      `  Skipped — schema check failed (${err instanceof Error ? err.message : String(err)})`,
    );
    console.log("");
    process.exit(0);
  }

  if (!columnExists) {
    await close();
    console.log("  ℹ️  pve_levels.game_code column not present.");
    console.log("");
    console.log("     The 0102_pve_game_code migration draft has not been applied. The");
    console.log("     route falls back to DEFAULT_GAME_CODE='optcg' at read time, so");
    console.log("     existing PVE works. Apply via `pnpm db:migrate` on storefront when");
    console.log("     ready, then re-run this audit to verify per-row coverage.");
    console.log("");
    console.log("     Draft: apps/storefront/drizzle/drafts/0102_pve_game_code.sql.draft");
    console.log("");
    process.exit(0);
  }

  // Step 2: pull the distribution of game_code values from pve_levels.
  let rows: Array<{ game_code: string; level_count: number }>;
  try {
    rows = await client<Array<{ game_code: string; level_count: number }>>`
      SELECT game_code, COUNT(*)::int AS level_count
      FROM pve_levels
      WHERE is_active = true
      GROUP BY game_code
      ORDER BY game_code
    `;
  } catch (err) {
    await close();
    console.log(
      `  Skipped — DB query failed (${err instanceof Error ? err.message : String(err)})`,
    );
    console.log("");
    process.exit(0);
  }

  await close();

  if (rows.length === 0) {
    console.log("  ℹ️  No active PVE levels found. Nothing to audit.");
    console.log("");
    process.exit(0);
  }

  // Classify each distinct game_code.
  let unknownCount = 0;
  console.log("  Distribution of pve_levels.game_code:");
  console.log("");
  for (const r of rows) {
    const known = isKnownGameCode(r.game_code);
    const tag = known ? "✓ known   " : "✗ UNKNOWN ";
    console.log(`    ${tag} ${r.game_code.padEnd(12)} ${r.level_count} levels`);
    if (!known) unknownCount++;
  }
  console.log("");

  // Surface KNOWN_GAME_CODES with no levels (informational, not a failure).
  const seenCodes = new Set(rows.map((r) => r.game_code));
  const unused = KNOWN_GAME_CODES.filter((c) => !seenCodes.has(c));
  if (unused.length > 0) {
    console.log("  ℹ️  Known engines without levels:");
    for (const c of unused) console.log(`     - ${c}`);
    console.log("");
    console.log("     The engine adapter is shipped but no pve_levels.game_code row");
    console.log("     references it. Not a failure — just visibility.");
    console.log("");
  }

  if (unknownCount > 0) {
    console.log(`  ❌ ${unknownCount} game_code value(s) have no registered engine.`);
    console.log("");
    console.log("     The PVE route would return 500 for these levels. Either:");
    console.log("     - Ship an engine adapter for the game_code, OR");
    console.log("     - Update pve_levels.game_code on the affected rows.");
    console.log("");
    process.exit(STRICT ? 1 : 1);
  }

  console.log("  ✓ Every game_code maps to a known engine.");
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error("audit:play-game-registry crashed:", err);
  process.exit(2);
});
