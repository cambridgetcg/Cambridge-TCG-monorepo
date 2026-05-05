#!/usr/bin/env npx tsx
/**
 * Apply prisma/migrations/20260430_phase_2_5_schema_reconciliation/migration.sql
 * to the live Aurora cluster via RDS Data API.
 *
 * Splits the migration on `;` (respecting single-quoted strings + dollar-quoted
 * blocks), then runs each statement sequentially with progress logging.
 *
 * Idempotency: every ALTER uses IF NOT EXISTS / IF EXISTS, so re-runs are
 * safe. CREATE TYPE / CREATE TABLE will error on second run; that's acceptable
 * since the migration is one-shot.
 */
import { readFileSync } from "fs";
import { config as loadEnv } from "dotenv";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

loadEnv({ path: ".env.local" });

const client = new RDSDataClient({
  region: (process.env.AWS_REGION || "eu-north-1").trim(),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!.trim(),
  },
});

const RESOURCE = process.env.AURORA_RESOURCE_ARN!.trim();
const SECRET = process.env.AURORA_SECRET_ARN!.trim();
const DB = (process.env.AURORA_DATABASE_NAME || "rewardspro").trim();

const MIGRATION = "prisma/migrations/20260430_phase_2_5_schema_reconciliation/migration.sql";

/** Split on `;` but skip inside string literals + dollar-quoted blocks. */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      buf += ch; i++;
      while (i < sql.length) {
        buf += sql[i];
        if (sql[i] === "'") { i++; if (sql[i] === "'") { buf += "'"; i++; continue; } break; }
        i++;
      }
      continue;
    }
    if (ch === "$") {
      const m = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        const tag = m[0];
        buf += tag; i += tag.length;
        const end = sql.indexOf(tag, i);
        if (end === -1) { buf += sql.slice(i); i = sql.length; }
        else { buf += sql.slice(i, end + tag.length); i = end + tag.length; }
        continue;
      }
    }
    if (ch === "-" && sql[i + 1] === "-") {
      // Skip line comment.
      const eol = sql.indexOf("\n", i);
      if (eol === -1) { i = sql.length; } else { i = eol + 1; }
      continue;
    }
    if (ch === ";") { out.push(buf); buf = ""; i++; continue; }
    buf += ch; i++;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

async function exec(sql: string): Promise<{ ok: boolean; err?: string }> {
  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn: RESOURCE, secretArn: SECRET, database: DB, sql,
    }));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, err: e?.message || String(e) };
  }
}

const sql = readFileSync(MIGRATION, "utf8");
const statements = splitStatements(sql).map(s => s.trim()).filter(Boolean);
console.log(`Loaded ${statements.length} statements from ${MIGRATION}\n`);

let ok = 0, skipped = 0, failed = 0;
const failures: Array<{ stmt: string; err: string }> = [];

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  // First 80 chars for logging.
  const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
  process.stdout.write(`  [${i + 1}/${statements.length}] ${preview} ... `);

  const r = await exec(stmt);
  if (r.ok) {
    ok++;
    console.log("✓");
  } else {
    // Treat "already exists" / "duplicate" as idempotent skip.
    const lower = (r.err ?? "").toLowerCase();
    if (
      lower.includes("already exists") ||
      lower.includes("duplicate")
    ) {
      skipped++;
      console.log("∅ (already applied)");
    } else {
      failed++;
      console.log(`✗ ${r.err?.slice(0, 200)}`);
      failures.push({ stmt: preview, err: r.err ?? "" });
    }
  }
}

console.log(`\n=== Summary ===`);
console.log(`  Applied:  ${ok}`);
console.log(`  Skipped:  ${skipped} (already applied)`);
console.log(`  Failed:   ${failed}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.stmt}\n      → ${f.err.slice(0, 300)}`);
}
process.exit(failed > 0 ? 1 : 0);
