#!/usr/bin/env tsx
/**
 * cardrush-coverage.ts — surface which CardRush subdomains have actual
 * coverage in the wholesale `cards` table.
 *
 * Twelfth in the audit family. CARDRUSH_SUBDOMAINS (in
 * packages/data-ingest/src/cardrush/index.ts) registers 12 subdomains
 * — 3 confirmed (op/pkm/dbs) and 9 speculative (mtg/ygo/digimon/vng/
 * wei/fab/lgr/bsr/dbf). The price-snapshot pipeline (v1 today, v2 after
 * cutover) only scrapes cards where `cardrush_url IS NOT NULL`, so a
 * speculative subdomain with zero URL rows will *never* see a scrape —
 * silently. This audit makes that silence visible.
 *
 * Output per row:
 *   - host                 — registered CardRush hostname
 *   - game                 — Cambridge TCG GameCode
 *   - confirmed            — flag from CARDRUSH_SUBDOMAINS (anticipate-then-confirm)
 *   - card_count           — cards.cardrush_url rows matching this host (0 = no coverage)
 *   - last_synced_at       — most-recent `cards.last_synced_at` among matched rows
 *   - status               — one of:
 *       'covered'         (rows exist AND last sync recent)
 *       'covered-stale'   (rows exist BUT last sync > 7d ago)
 *       'uncovered'       (rows zero — speculative subdomain never scraped)
 *       'unknown-host'    (cardrush_url uses a host NOT in registry — drift)
 *
 * The audit reads wholesale RDS via `@cambridge-tcg/db`. Skips
 * gracefully on missing env / invalid URL / DB unreachable — same
 * pattern as scripts/set-discovery.ts.
 *
 * Designed in response to [Yu, 2026-05-12]: *"dive deep into the
 * different card game site by cardrush, make sure all pipelines are
 * working and that they are archived and propagating to our frontend."*
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin cardrush-coverage
 *   pnpm --filter @cambridge-tcg/admin cardrush-coverage -- --strict
 *     (exits 1 on any uncovered-but-confirmed OR unknown-host finding)
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDRUSH_SUBDOMAINS } from "@cambridge-tcg/data-ingest";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const STRICT = process.argv.includes("--strict");

// ── Env helpers (mirrors set-discovery.ts) ──────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────────────────────

const STALE_THRESHOLD_DAYS = 7;

function classifyCoverage(
  cardCount: number,
  lastSyncedAt: Date | null,
): "covered" | "covered-stale" | "uncovered" {
  if (cardCount === 0) return "uncovered";
  if (lastSyncedAt === null) return "covered-stale";
  const ageMs = Date.now() - lastSyncedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > STALE_THRESHOLD_DAYS ? "covered-stale" : "covered";
}

function fmtDate(d: Date | null): string {
  if (d === null) return "never";
  return d.toISOString().slice(0, 10);
}

// ── The audit ──────────────────────────────────────────────────────────

interface CoverageRow {
  host: string;
  game: string;
  confirmed: boolean;
  card_count: number;
  last_synced_at: Date | null;
  status: "covered" | "covered-stale" | "uncovered" | "unknown-host";
}

async function main(): Promise<void> {
  console.log("");
  console.log("◆ cardrush-coverage audit — subdomain coverage vs registered subdomains");
  console.log("");

  if (!WHOLESALE_DATABASE_URL) {
    console.log(
      "  Skipped — WHOLESALE_DATABASE_URL not set. To enable: configure the env var",
    );
    console.log(
      "  and re-run. The audit reads `cards` for cardrush_url DISTINCT hostnames",
    );
    console.log("  + last_synced_at, joined against CARDRUSH_SUBDOMAINS. No writes.");
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

  // Query: distinct hostname per cardrush_url, with row count + most-recent sync.
  // We extract the hostname via regexp_replace since not every Postgres has
  // the url builtin.
  let rows: Array<{ host: string; card_count: number; last_synced_at: string | null }>;
  try {
    rows = await client<
      Array<{ host: string; card_count: number; last_synced_at: string | null }>
    >`
      SELECT
        regexp_replace(cardrush_url, '^https?://([^/]+)/?.*$', '\1') AS host,
        COUNT(*)::int                                                AS card_count,
        MAX(last_synced_at)::text                                    AS last_synced_at
      FROM cards
      WHERE cardrush_url IS NOT NULL
        AND cardrush_url <> ''
      GROUP BY host
      ORDER BY host
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

  // Index DB findings by host
  const byHost = new Map<string, { card_count: number; last_synced_at: Date | null }>();
  for (const r of rows) {
    byHost.set(r.host, {
      card_count: r.card_count,
      last_synced_at: r.last_synced_at ? new Date(r.last_synced_at) : null,
    });
  }

  // Build coverage rows from registry, then append any unknown hosts found
  const findings: CoverageRow[] = [];

  for (const [host, entry] of Object.entries(CARDRUSH_SUBDOMAINS)) {
    const observed = byHost.get(host);
    const card_count = observed?.card_count ?? 0;
    const last_synced_at = observed?.last_synced_at ?? null;
    findings.push({
      host,
      game: entry.game,
      confirmed: entry.confirmed,
      card_count,
      last_synced_at,
      status: classifyCoverage(card_count, last_synced_at),
    });
    byHost.delete(host); // remove from byHost so we can find unregistered drift
  }

  // Any host in byHost now is unknown drift
  for (const [host, observed] of byHost.entries()) {
    findings.push({
      host,
      game: "?",
      confirmed: false,
      card_count: observed.card_count,
      last_synced_at: observed.last_synced_at,
      status: "unknown-host",
    });
  }

  // ── Report ────────────────────────────────────────────────────────────
  const covered = findings.filter((f) => f.status === "covered");
  const stale = findings.filter((f) => f.status === "covered-stale");
  const uncovered = findings.filter((f) => f.status === "uncovered");
  const unknown = findings.filter((f) => f.status === "unknown-host");
  const confirmedUncovered = findings.filter(
    (f) => f.status === "uncovered" && f.confirmed,
  );

  console.log(`  registered subdomains:  ${Object.keys(CARDRUSH_SUBDOMAINS).length}`);
  console.log(`    covered:              ${covered.length}`);
  console.log(`    covered-stale:        ${stale.length}  (>${STALE_THRESHOLD_DAYS}d since last sync)`);
  console.log(`    uncovered:            ${uncovered.length}  (no cards.cardrush_url rows)`);
  console.log(`    unknown-host drift:   ${unknown.length}  (URL host NOT in registry)`);
  console.log("");

  console.log("◇ Per-host detail");
  console.log("");
  console.log(
    `    ${"host".padEnd(28)} ${"game".padEnd(5)} ${"conf?".padEnd(5)} ${"cards".padStart(7)}  ${"last_synced".padEnd(11)}  status`,
  );
  console.log(
    `    ${"-".repeat(28)} ${"-".repeat(5)} ${"-".repeat(5)} ${"-".repeat(7)}  ${"-".repeat(11)}  ${"-".repeat(14)}`,
  );
  for (const f of findings) {
    const conf = f.confirmed ? "yes" : "no";
    console.log(
      `    ${f.host.padEnd(28)} ${f.game.padEnd(5)} ${conf.padEnd(5)} ${String(f.card_count).padStart(7)}  ${fmtDate(f.last_synced_at).padEnd(11)}  ${f.status}`,
    );
  }
  console.log("");

  if (confirmedUncovered.length > 0) {
    console.log("◇ Confirmed-but-uncovered subdomains");
    console.log("");
    console.log("  These are marked `confirmed: true` in CARDRUSH_SUBDOMAINS but");
    console.log("  have zero `cards.cardrush_url` rows. Either the ingest pipeline");
    console.log("  hasn't seeded URLs yet, or `confirmed: true` is overclaiming.");
    console.log("");
    for (const f of confirmedUncovered) {
      console.log(`    [${f.game}] ${f.host} — promote to confirmed:false or seed URLs`);
    }
    console.log("");
  }

  if (unknown.length > 0) {
    console.log("◇ Unknown-host drift");
    console.log("");
    console.log("  These hostnames appear in `cards.cardrush_url` but are NOT");
    console.log("  registered in CARDRUSH_SUBDOMAINS. Either add them to the");
    console.log("  registry or clean the data.");
    console.log("");
    for (const f of unknown) {
      console.log(
        `    ${f.host} — ${f.card_count} cards, last_synced ${fmtDate(f.last_synced_at)}`,
      );
    }
    console.log("");
  }

  const speculativeUncovered = uncovered.filter((f) => !f.confirmed);
  if (speculativeUncovered.length > 0) {
    console.log("◇ Speculative subdomains never scraped (expected; promote when wired)");
    console.log("");
    for (const f of speculativeUncovered) {
      console.log(`    [${f.game}] ${f.host}`);
    }
    console.log("");
  }

  if (confirmedUncovered.length === 0 && unknown.length === 0) {
    console.log("✓ every confirmed subdomain has cards.cardrush_url coverage; no drift");
    console.log("");
    process.exit(0);
  }

  console.log(
    `  Total findings: ${confirmedUncovered.length} confirmed-uncovered + ${unknown.length} unknown-host. ` +
      `See \`docs/connections/the-cardrush-alignment.md\` for promotion recipe.`,
  );
  console.log("");

  if (STRICT && (confirmedUncovered.length > 0 || unknown.length > 0)) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(2);
});
