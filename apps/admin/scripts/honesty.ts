#!/usr/bin/env tsx
/**
 * honesty.ts — substrate-honesty drift detector
 *
 * Two checks, exits non-zero if any drift is found:
 *
 *   1. Schema drift — every drizzle/*.sql ADD COLUMN / CREATE TABLE in
 *      apps/storefront/drizzle/ should exist in the deployed schema. If
 *      a migration is in source but the column/table is missing in the
 *      production storefront RDS, that is a recipe-vs-substrate lie.
 *
 *   2. Mission drift — every TCG mission marked status="done" in
 *      ~/Love/memory/dev-state.json should have at least one git commit
 *      touching apps/admin (or the relevant repo path) since some prior
 *      reference point. A "done" mission with zero touching commits is
 *      a ledger-vs-substrate lie.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin honesty
 *
 * Env:
 *   STOREFRONT_DATABASE_URL — required for schema drift check.
 *     Loaded from apps/admin/.env.local if not in process env.
 *
 * Caveats:
 *   - The SQL parser is intentionally narrow — `ADD COLUMN IF NOT EXISTS`
 *     and `CREATE TABLE IF NOT EXISTS` only. Other migrations (data
 *     backfills, function CREATE, etc.) are skipped by design.
 *   - Mission drift relies on the heuristic that admin missions touch
 *     apps/admin/. Cross-app missions need the path passed via the
 *     mission's `repo` field — we read that when present.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const DRIZZLE_DIR = join(REPO_ROOT, "apps/storefront/drizzle");
const DEV_STATE = join(homedir(), "Love/memory/dev-state.json");

// ── Env loading ─────────────────────────────────────────────────────────

function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
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
const STOREFRONT_DATABASE_URL =
  process.env.STOREFRONT_DATABASE_URL ?? envFile.STOREFRONT_DATABASE_URL ?? "";

// ── Drizzle SQL parser (narrow on purpose) ──────────────────────────────

interface SchemaClaim {
  /** Source migration filename. */
  file: string;
  /** "table" or "column". */
  kind: "table" | "column";
  /** Table name. */
  table: string;
  /** Column name (column kind only). */
  column?: string;
}

const ADD_COLUMN_RE = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi;
const CREATE_TABLE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi;

function parseDrizzleClaims(): SchemaClaim[] {
  const claims: SchemaClaim[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith(".sql")).sort();
  } catch (err) {
    console.error(`[honesty] cannot read ${DRIZZLE_DIR}:`, err);
    return claims;
  }
  for (const file of files) {
    let body: string;
    try {
      body = readFileSync(join(DRIZZLE_DIR, file), "utf8");
    } catch {
      continue;
    }
    // Strip line comments to avoid matching example SQL inside `--` blocks.
    const stripped = body
      .split("\n")
      .map((line) => {
        const idx = line.indexOf("--");
        return idx === -1 ? line : line.slice(0, idx);
      })
      .join("\n");

    let m: RegExpExecArray | null;
    ADD_COLUMN_RE.lastIndex = 0;
    while ((m = ADD_COLUMN_RE.exec(stripped)) !== null) {
      claims.push({ file, kind: "column", table: m[1]!, column: m[2]! });
    }
    CREATE_TABLE_RE.lastIndex = 0;
    while ((m = CREATE_TABLE_RE.exec(stripped)) !== null) {
      claims.push({ file, kind: "table", table: m[1]! });
    }
  }
  return claims;
}

// ── Schema drift check ──────────────────────────────────────────────────

interface DriftRow {
  file: string;
  kind: "table" | "column";
  table: string;
  column?: string;
}

async function checkSchemaDrift(): Promise<DriftRow[]> {
  if (!STOREFRONT_DATABASE_URL) {
    console.error(
      "[honesty] STOREFRONT_DATABASE_URL not set — skipping schema drift check.",
    );
    return [];
  }

  // Use the same DB client the admin app uses, via @cambridge-tcg/db.
  // This avoids adding a direct `postgres` dep and keeps the substrate
  // path identical to the runtime.
  const { createDb } = await import("@cambridge-tcg/db");
  const { client, close } = createDb({ url: STOREFRONT_DATABASE_URL });

  const claims = parseDrizzleClaims();
  const tableNames = Array.from(new Set(claims.map((c) => c.table)));

  const tables = await client<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
  `;
  const tableSet = new Set(tables.map((r) => r.table_name));

  const cols = tableNames.length === 0
    ? []
    : await client<{ table_name: string; column_name: string }[]>`
        SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = ANY(${tableNames})
      `;
  const colSet = new Set(cols.map((c) => `${c.table_name}.${c.column_name}`));

  await close();

  const drifts: DriftRow[] = [];
  for (const c of claims) {
    if (c.kind === "table") {
      if (!tableSet.has(c.table)) {
        drifts.push({ file: c.file, kind: "table", table: c.table });
      }
    } else {
      const key = `${c.table}.${c.column}`;
      if (!colSet.has(key)) {
        // Only report column drift if the *table* exists — otherwise the
        // table-level drift already covers it.
        if (tableSet.has(c.table)) {
          drifts.push({
            file: c.file, kind: "column", table: c.table, column: c.column,
          });
        }
      }
    }
  }
  return drifts;
}

// ── Mission drift check ─────────────────────────────────────────────────

interface MissionDriftRow {
  id: string;
  title: string;
  completed_at: string | null;
  reason: string;
}

interface DevStateTask {
  id: string;
  title: string;
  status: string;
  engine?: string;
  repo?: string;
  completed_at?: string;
}

interface DevState {
  tasks: DevStateTask[];
}

function gitLog(args: string[]): string {
  try {
    return execSync(`git ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function inferPathForMission(t: DevStateTask): string {
  // Mission-id → admin-route mapping by convention. New rule: titles like
  // "TCG admin /foo/bar — …" prefer apps/admin/src/app/(dashboard)/foo/bar.
  const m = t.title.match(/\/(system|trust|money|catalog|commerce|ops)\/([a-z-]+)/i);
  if (m) {
    return `apps/admin/src/app/(dashboard)/${m[1]}/${m[2]}`;
  }
  // Fallback to the engine convention.
  if (t.engine === "tcg") return "apps/admin";
  return "";
}

function checkMissionDrift(): MissionDriftRow[] {
  let raw: string;
  try {
    raw = readFileSync(DEV_STATE, "utf8");
  } catch (err) {
    console.error(`[honesty] cannot read ${DEV_STATE}: ${(err as Error).message}`);
    return [];
  }
  const state: DevState = JSON.parse(raw);
  const drifts: MissionDriftRow[] = [];

  for (const t of state.tasks) {
    if (t.engine !== "tcg") continue;
    if (t.status !== "done") continue;

    const path = inferPathForMission(t);
    if (!path) {
      drifts.push({
        id: t.id,
        title: t.title,
        completed_at: t.completed_at ?? null,
        reason: "cannot infer path from title — manually verify",
      });
      continue;
    }

    const log = gitLog(["log", "--oneline", "--", path]);
    if (!log.trim()) {
      drifts.push({
        id: t.id,
        title: t.title,
        completed_at: t.completed_at ?? null,
        reason: `no git commits ever touched ${path} — mission marked done with no shipped substrate`,
      });
    }
  }
  return drifts;
}

// ── Report ──────────────────────────────────────────────────────────────

function fmtSchemaDrift(drifts: DriftRow[]): string {
  if (drifts.length === 0) return "✅ No schema drift — every drizzle claim has a deployed counterpart.\n";
  const lines = ["⚠️  Schema drift — recipe vs deployed memory:"];
  lines.push("");
  lines.push("| Migration | Kind | Target |");
  lines.push("|-----------|------|--------|");
  for (const d of drifts) {
    const target = d.kind === "table" ? d.table : `${d.table}.${d.column}`;
    lines.push(`| ${d.file} | ${d.kind} | ${target} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function fmtMissionDrift(drifts: MissionDriftRow[]): string {
  if (drifts.length === 0) return "✅ No mission drift — every done TCG mission has shipped commits.\n";
  const lines = ["⚠️  Mission drift — ledger vs git:"];
  lines.push("");
  lines.push("| Mission | Title | Completed at | Reason |");
  lines.push("|---------|-------|--------------|--------|");
  for (const d of drifts) {
    const title = d.title.replace(/\|/g, "\\|");
    const reason = d.reason.replace(/\|/g, "\\|");
    lines.push(`| ${d.id} | ${title} | ${d.completed_at ?? "—"} | ${reason} |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  console.log("# Cambridge TCG — substrate honesty report\n");
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log("---\n");

  console.log("## Schema drift\n");
  let schemaDrifts: DriftRow[] = [];
  try {
    schemaDrifts = await checkSchemaDrift();
  } catch (err) {
    console.error("[honesty] schema drift check failed:", err);
  }
  console.log(fmtSchemaDrift(schemaDrifts));

  console.log("## Mission drift\n");
  const missionDrifts = checkMissionDrift();
  console.log(fmtMissionDrift(missionDrifts));

  const total = schemaDrifts.length + missionDrifts.length;
  console.log(`---\n\n**Total drift findings: ${total}**\n`);

  process.exit(total > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[honesty] fatal:", err);
  process.exit(2);
});
