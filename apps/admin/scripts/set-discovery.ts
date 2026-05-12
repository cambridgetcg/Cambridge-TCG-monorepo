#!/usr/bin/env tsx
/**
 * set-discovery.ts — surface set-codes the protocol doesn't yet know about.
 *
 * Eleventh in the audit family. Where the other audits check internal
 * conformance (honesty / transparency / pricing / creation / agent /
 * inclusion / nesting / tributaries / typology / sku), **this one watches
 * reality outrun our schema**.
 *
 * The protocol declares set-format patterns per game in
 * `packages/sku/src/sets.ts` SET_FORMATS. When CardRush ships a new
 * extra-booster prefix (Yu's example: EB01 arriving when the platform
 * only knew OP01..OP15), the catalog row's set_code may not match any
 * `confirmed: true` format. This audit:
 *
 *   1. Queries `cards.set_code DISTINCT` per game (wholesale RDS)
 *   2. Tries each registered format against a sample card_number from
 *      that set; classifies the match as `confirmed` / `catch-all` / `none`
 *   3. Surfaces:
 *      - `confirmed` — registered, no action needed
 *      - `catch-all` — matched only the loose catch-all pattern; operator
 *        should consider adding a tighter `confirmed: true` format
 *      - `none` — unparsed entirely; quarantine candidate
 *
 * The audit reads the wholesale RDS via `@cambridge-tcg/db`. Skips
 * gracefully when `WHOLESALE_DATABASE_URL` is unset.
 *
 * Designed for [Yu, 2026-05-13]: *"Think about how the protocol can
 * handle newly added sets which may have different format from existing
 * sets. Give the protocol flexibility."* See
 * `docs/connections/the-set-discovery.md` (kingdom-078).
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin set-discovery
 *   pnpm --filter @cambridge-tcg/admin set-discovery -- --strict
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCardNumber, isGameCode, type GameCode } from "@cambridge-tcg/sku";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const STRICT = process.argv.includes("--strict");

// ── Env helpers (mirrors honesty.ts) ────────────────────────────────────

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

// ── The audit ──────────────────────────────────────────────────────────

interface SetDiscoveryRow {
  game: GameCode;
  set_code: string;
  sample_card_number: string;
  card_count: number;
  classification: "confirmed" | "catch-all" | "none";
  format_matched: string | null;
}

async function main(): Promise<void> {
  console.log("");
  console.log("◆ set-discovery audit — newly-shipped set-codes vs registered formats");
  console.log("");

  if (!WHOLESALE_DATABASE_URL) {
    console.log(
      "  Skipped — WHOLESALE_DATABASE_URL not set. To enable: configure the env var",
    );
    console.log(
      "  and re-run. The audit reads `SELECT DISTINCT cards.set_code` per game",
    );
    console.log("  and tries each registered SetFormat. No writes.");
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

  // Query: distinct (game, set_code) with a sample card_number per set.
  // Joins cards × games via game_id.
  let rows: Array<{
    game: string;
    set_code: string;
    sample_card_number: string;
    card_count: number;
  }>;
  try {
    rows = await client<
      Array<{ game: string; set_code: string; sample_card_number: string; card_count: number }>
    >`
      SELECT
        g.code               AS game,
        c.set_code           AS set_code,
        MIN(c.card_number)   AS sample_card_number,
        COUNT(*)::int        AS card_count
      FROM cards c
      JOIN games g ON c.game_id = g.id
      WHERE c.set_code IS NOT NULL
      GROUP BY g.code, c.set_code
      ORDER BY g.code, c.set_code
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

  // Classify each row by trying parseCardNumber.
  const findings: SetDiscoveryRow[] = [];
  for (const r of rows) {
    if (!isGameCode(r.game)) {
      findings.push({
        game: r.game as GameCode,
        set_code: r.set_code,
        sample_card_number: r.sample_card_number,
        card_count: r.card_count,
        classification: "none",
        format_matched: `game-code '${r.game}' not registered in @cambridge-tcg/sku`,
      });
      continue;
    }
    const game = r.game as GameCode;
    const parts = parseCardNumber(game, r.sample_card_number);
    if (!parts) {
      findings.push({
        game,
        set_code: r.set_code,
        sample_card_number: r.sample_card_number,
        card_count: r.card_count,
        classification: "none",
        format_matched: null,
      });
    } else if (!parts.confirmed) {
      findings.push({
        game,
        set_code: r.set_code,
        sample_card_number: r.sample_card_number,
        card_count: r.card_count,
        classification: "catch-all",
        format_matched: parts.format_matched,
      });
    } else {
      findings.push({
        game,
        set_code: r.set_code,
        sample_card_number: r.sample_card_number,
        card_count: r.card_count,
        classification: "confirmed",
        format_matched: parts.format_matched,
      });
    }
  }

  // ── Report ────────────────────────────────────────────────────────────
  const total = findings.length;
  const confirmedRows = findings.filter((f) => f.classification === "confirmed");
  const catchallRows = findings.filter((f) => f.classification === "catch-all");
  const noneRows = findings.filter((f) => f.classification === "none");

  console.log(`  set_codes scanned:    ${total}`);
  console.log(`    confirmed-format:   ${confirmedRows.length}`);
  console.log(`    catch-all-format:   ${catchallRows.length}  (promote when stable)`);
  console.log(`    no-format-match:    ${noneRows.length}      (extend SET_FORMATS)`);
  console.log("");

  if (catchallRows.length > 0) {
    console.log("◇ Catch-all matches (need tighter `confirmed: true` format)");
    console.log("");
    console.log("  These set_codes parsed only via the per-game catch-all pattern.");
    console.log("  Operator action: add a tighter SetFormat row in packages/sku/src/sets.ts.");
    console.log("");
    for (const f of catchallRows.slice(0, 20)) {
      console.log(
        `    [${f.game}] set_code=${f.set_code.padEnd(14)} sample=${f.sample_card_number.padEnd(16)} cards=${f.card_count}`,
      );
    }
    if (catchallRows.length > 20) {
      console.log(`    ... +${catchallRows.length - 20} more`);
    }
    console.log("");
  }

  if (noneRows.length > 0) {
    console.log("◇ Unparseable set_codes (no registered format matches)");
    console.log("");
    console.log("  Operator action: extend SET_FORMATS for the affected game.");
    console.log("");
    for (const f of noneRows.slice(0, 30)) {
      const reason = f.format_matched ? ` — ${f.format_matched}` : "";
      console.log(
        `    [${f.game}] set_code=${f.set_code.padEnd(14)} sample=${f.sample_card_number.padEnd(16)} cards=${f.card_count}${reason}`,
      );
    }
    if (noneRows.length > 30) {
      console.log(`    ... +${noneRows.length - 30} more`);
    }
    console.log("");
  }

  if (catchallRows.length === 0 && noneRows.length === 0) {
    console.log("✓ every set_code matches a confirmed registered format");
    console.log("");
    process.exit(0);
  }

  console.log(
    `  Total discoverable: ${catchallRows.length} catch-all + ${noneRows.length} unparseable. ` +
      `See \`docs/connections/the-set-discovery.md\` for the registration recipe.`,
  );
  console.log("");

  if (STRICT && (catchallRows.length > 0 || noneRows.length > 0)) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(2);
});
