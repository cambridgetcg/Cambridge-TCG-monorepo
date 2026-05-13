#!/usr/bin/env tsx
/**
 * tcgplayer-mapping audit — surface which TCGplayer categories have
 * coverage in the wholesale `cards` table, and which speculative entries
 * remain unconfirmed.
 *
 * 13th in the audit family (after tributaries, sku, set-discovery,
 * cardrush-coverage, etc.). Companion to kingdom-NNN's TCGplayer
 * integration. Mirrors `cardrush-coverage.ts` in spirit: the registry
 * (TCGPLAYER_CATEGORIES) lists what we EXPECT; this audit reports what
 * we ACTUALLY have in the wholesale DB; drift is named and findings
 * are actionable.
 *
 * Output per category:
 *   - category_id            — TCGplayer category number
 *   - game                   — Cambridge GameCode
 *   - confirmed              — flag from TCGPLAYER_CATEGORIES (anticipate-then-confirm)
 *   - cards_total            — Cambridge cards rows for this game (the denominator)
 *   - cards_mapped           — those with tcgplayer_product_id IS NOT NULL
 *   - coverage_pct           — mapped/total × 100
 *   - status                 — one of:
 *       'covered'             (coverage >= 50%)
 *       'covered-partial'     (1% <= coverage < 50%)
 *       'uncovered'           (coverage < 1%)
 *       'no-game-cards'       (Cambridge has zero cards for this game)
 *
 * Plus secondary findings:
 *   - orphaned_sku_ids       — rows in card_tcgplayer_sku_ids where the
 *                              referenced card no longer has matching
 *                              tcgplayer_product_id (mapping drift)
 *   - unmapped_categories    — distinct cards.game_id values with cards but
 *                              no category entry in TCGPLAYER_CATEGORIES
 *
 * Skips gracefully on missing env / invalid URL / DB unreachable — same
 * pattern as `set-discovery.ts` and `cardrush-coverage.ts`.
 *
 * STRICT mode (--strict): exits 1 on any 'covered-partial' for confirmed
 * categories OR any orphaned skuId. Useful for CI gating once the first
 * confirmed category lands.
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-NNN) §5.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin tcgplayer-mapping
 *   pnpm --filter @cambridge-tcg/admin tcgplayer-mapping -- --strict
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TCGPLAYER_CATEGORIES, gameForCategory } from "@cambridge-tcg/data-ingest";
import { GAMES, type GameCode } from "@cambridge-tcg/sku";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const STRICT = process.argv.includes("--strict");

// ── Env helpers (mirrors cardrush-coverage.ts) ──────────────────────────

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
const WHOLESALE_DATABASE_URL =
  process.env.WHOLESALE_DATABASE_URL ?? envFile.WHOLESALE_DATABASE_URL ?? "";

// ── Coverage classifier ─────────────────────────────────────────────────

function classifyCoverage(
  mapped: number,
  total: number,
): "covered" | "covered-partial" | "uncovered" | "no-game-cards" {
  if (total === 0) return "no-game-cards";
  const pct = (mapped / total) * 100;
  if (pct >= 50) return "covered";
  if (pct >= 1) return "covered-partial";
  return "uncovered";
}

// ── Game-code → game_id resolver (for the JOIN) ─────────────────────────

// We resolve game_id at query time via a join, but we need GameCode → game
// row mapping for the report. The cards table has game_id (int) referring
// to games(id); we look up by games.code.

// ── The audit ──────────────────────────────────────────────────────────

interface CategoryFinding {
  category_id: number;
  game: GameCode;
  game_name: string;
  confirmed: boolean;
  cards_total: number;
  cards_mapped: number;
  coverage_pct: number;
  status: "covered" | "covered-partial" | "uncovered" | "no-game-cards";
}

async function main(): Promise<void> {
  console.log("");
  console.log("◆ tcgplayer-mapping audit — TCGplayer category coverage vs Cambridge cards table");
  console.log("");

  if (!WHOLESALE_DATABASE_URL) {
    console.log(
      "  Skipped — WHOLESALE_DATABASE_URL not set. The audit reads cards × card_tcgplayer_sku_ids",
    );
    console.log("  for coverage % per category. No writes.");
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
      `  Skipped — DB connection setup failed (${err instanceof Error ? err.message : String(err)})`,
    );
    console.log("");
    process.exit(0);
  }

  // Build per-game counts of (total, mapped). The join uses cards.game_id ×
  // games.code, then aggregates by games.code.
  let perGameRows: Array<{
    game_code: string;
    cards_total: number;
    cards_mapped: number;
  }>;
  try {
    perGameRows = await client<
      Array<{ game_code: string; cards_total: number; cards_mapped: number }>
    >`
      SELECT
        COALESCE(g.code, '?')                                       AS game_code,
        COUNT(*)::int                                                AS cards_total,
        COUNT(*) FILTER (WHERE c.tcgplayer_product_id IS NOT NULL)::int  AS cards_mapped
      FROM cards c
      LEFT JOIN games g ON g.id = c.game_id
      GROUP BY COALESCE(g.code, '?')
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

  // Orphaned skuId check — rows in card_tcgplayer_sku_ids whose card has
  // no tcgplayer_product_id (mapping drift / partial removal).
  let orphanedSkuIds = 0;
  try {
    const result = await client<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
        FROM card_tcgplayer_sku_ids s
        JOIN cards c ON c.id = s.card_id
       WHERE c.tcgplayer_product_id IS NULL
    `;
    orphanedSkuIds = result[0]?.count ?? 0;
  } catch {
    orphanedSkuIds = -1; // table doesn't exist yet (migration not applied)
  }

  await close();

  // Build findings, joining per-game DB rows with the registry.
  const findings: CategoryFinding[] = [];
  const knownGames = new Set<string>();

  for (const [idStr, entry] of Object.entries(TCGPLAYER_CATEGORIES)) {
    const categoryId = Number(idStr);
    const game = entry.game;
    knownGames.add(game);
    const gameRow = perGameRows.find((r) => r.game_code === game);
    const cardsTotal = gameRow?.cards_total ?? 0;
    const cardsMapped = gameRow?.cards_mapped ?? 0;
    const coveragePct = cardsTotal > 0 ? (cardsMapped / cardsTotal) * 100 : 0;
    const status = classifyCoverage(cardsMapped, cardsTotal);
    findings.push({
      category_id: categoryId,
      game,
      game_name: GAMES[game]?.name ?? entry.name,
      confirmed: entry.confirmed,
      cards_total: cardsTotal,
      cards_mapped: cardsMapped,
      coverage_pct: Math.round(coveragePct * 10) / 10,
      status,
    });
  }

  // Cambridge games with cards but no TCGplayer category — drift.
  const unregisteredGames = perGameRows.filter(
    (r) => r.cards_total > 0 && !knownGames.has(r.game_code) && r.game_code !== "?",
  );

  // ── Report ────────────────────────────────────────────────────────────
  const totalCambridgeCards = perGameRows.reduce((sum, r) => sum + r.cards_total, 0);
  const totalMapped = perGameRows.reduce((sum, r) => sum + r.cards_mapped, 0);
  const overallPct = totalCambridgeCards > 0 ? (totalMapped / totalCambridgeCards) * 100 : 0;

  console.log(`  TCGPLAYER_CATEGORIES registered:  ${Object.keys(TCGPLAYER_CATEGORIES).length}`);
  console.log(`  Cambridge cards (all games):      ${totalCambridgeCards}`);
  console.log(`  Cards with tcgplayer_product_id:  ${totalMapped}  (${overallPct.toFixed(1)}%)`);
  if (orphanedSkuIds >= 0) {
    console.log(`  Orphaned card_tcgplayer_sku_ids:  ${orphanedSkuIds}`);
  } else {
    console.log(`  card_tcgplayer_sku_ids table:     not yet created (migration 0015 pending)`);
  }
  console.log("");

  console.log("◇ Per-category coverage");
  console.log("");
  console.log(
    `    ${"cat".padEnd(4)} ${"game".padEnd(5)} ${"conf?".padEnd(5)} ${"cards".padStart(7)} ${"mapped".padStart(7)} ${"pct%".padStart(7)}  status`,
  );
  console.log(
    `    ${"-".repeat(4)} ${"-".repeat(5)} ${"-".repeat(5)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)}  ${"-".repeat(16)}`,
  );
  for (const f of findings) {
    const conf = f.confirmed ? "yes" : "no";
    console.log(
      `    ${String(f.category_id).padStart(4)} ${f.game.padEnd(5)} ${conf.padEnd(5)} ${String(f.cards_total).padStart(7)} ${String(f.cards_mapped).padStart(7)} ${f.coverage_pct.toFixed(1).padStart(6)}%  ${f.status}`,
    );
  }
  console.log("");

  const partialConfirmed = findings.filter(
    (f) => f.status === "covered-partial" && f.confirmed,
  );
  if (partialConfirmed.length > 0) {
    console.log("◇ Partial coverage on confirmed categories");
    console.log("");
    for (const f of partialConfirmed) {
      console.log(
        `    [${f.game}] cat=${f.category_id} ${f.game_name} — ${f.cards_mapped}/${f.cards_total} (${f.coverage_pct}%)`,
      );
      console.log(
        `      Run: pnpm wholesale tcgplayer:seed-set --category ${f.category_id}`,
      );
    }
    console.log("");
  }

  const uncoveredConfirmed = findings.filter(
    (f) => f.status === "uncovered" && f.confirmed,
  );
  if (uncoveredConfirmed.length > 0) {
    console.log("◇ Uncovered confirmed categories (overclaim)");
    console.log("");
    console.log(
      "  These are marked `confirmed: true` in TCGPLAYER_CATEGORIES but have <1% coverage.",
    );
    console.log("  Either run the seed CLI to populate, or downgrade to confirmed:false.");
    console.log("");
    for (const f of uncoveredConfirmed) {
      console.log(`    [${f.game}] cat=${f.category_id} ${f.game_name}`);
    }
    console.log("");
  }

  const speculativeNoCoverage = findings.filter(
    (f) => f.status === "uncovered" && !f.confirmed && f.cards_total > 0,
  );
  if (speculativeNoCoverage.length > 0) {
    console.log("◇ Speculative categories never seeded (expected; promote when wired)");
    console.log("");
    for (const f of speculativeNoCoverage) {
      console.log(
        `    [${f.game}] cat=${f.category_id} ${f.game_name} (${f.cards_total} Cambridge cards available)`,
      );
    }
    console.log("");
  }

  if (unregisteredGames.length > 0) {
    console.log("◇ Cambridge games with cards but no TCGplayer category");
    console.log("");
    console.log(
      "  These games have cards in our catalog but no entry in TCGPLAYER_CATEGORIES.",
    );
    console.log(
      "  Either add an entry to packages/data-ingest/src/tcgplayer/categories.ts or the",
    );
    console.log("  game doesn't exist on TCGplayer.");
    console.log("");
    for (const g of unregisteredGames) {
      console.log(`    [${g.game_code}] ${g.cards_total} cards`);
    }
    console.log("");
  }

  if (orphanedSkuIds > 0) {
    console.log("◇ Orphaned card_tcgplayer_sku_ids rows");
    console.log("");
    console.log(
      `  ${orphanedSkuIds} rows reference cards whose tcgplayer_product_id is now NULL.`,
    );
    console.log("  Inspect: SELECT s.* FROM card_tcgplayer_sku_ids s");
    console.log("           JOIN cards c ON c.id = s.card_id");
    console.log("           WHERE c.tcgplayer_product_id IS NULL LIMIT 20;");
    console.log("");
  }

  // ── Exit ──────────────────────────────────────────────────────────────
  const hasFindings =
    partialConfirmed.length > 0 ||
    uncoveredConfirmed.length > 0 ||
    orphanedSkuIds > 0 ||
    unregisteredGames.length > 0;

  if (!hasFindings) {
    console.log("✓ every confirmed category has >=50% coverage; no orphans; no drift");
    console.log("");
    process.exit(0);
  }

  console.log(
    `  Total: ${partialConfirmed.length} partial-confirmed + ${uncoveredConfirmed.length} uncovered-confirmed + ${unregisteredGames.length} unregistered + ${Math.max(0, orphanedSkuIds)} orphan rows.`,
  );
  console.log("");

  if (
    STRICT &&
    (partialConfirmed.length > 0 ||
      uncoveredConfirmed.length > 0 ||
      orphanedSkuIds > 0)
  ) {
    process.exit(1);
  }
  // gameForCategory referenced to silence dead-export warnings; remove when used
  void gameForCategory;
  process.exit(0);
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(2);
});
