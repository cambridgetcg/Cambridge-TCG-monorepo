#!/usr/bin/env tsx
/**
 * generate-wholesale-merge-sql — produces the Phase 6 schema SQL
 * by introspecting the live wholesale RDS.
 *
 * Phase 6 of the wholesale consolidation creates ~30 ws_*-prefixed
 * tables in the storefront RDS. Hand-mirroring those CREATE TABLE
 * statements is error-prone (a missing CHECK, a misspelled
 * NUMERIC(10,2)). This script asks the source-of-truth (wholesale
 * information_schema) for the actual column definitions and emits
 * a `.sql` you can promote.
 *
 * Output: apps/storefront/drizzle/drafts/0102_wholesale_db_merge.sql.draft
 *         (overwrites)
 *
 * Run (operator-side, with credentials):
 *   WHOLESALE_DATABASE_URL='postgres://...' \
 *     pnpm tsx apps/storefront/scripts/generate-wholesale-merge-sql.ts
 *
 * The output includes:
 *   - Phase A: CREATE TABLE ws_* for every wholesale table
 *   - Indexes preserved (renamed with ws_ prefix)
 *   - Phase C: FK constraints in a second section (because some FKs
 *     can't be added until all tables exist)
 *   - Header pointing at docs/wholesale-db-merge-runbook.md
 *
 * What this script does NOT do:
 *   - Generate data-load SQL. Use pg_dump per the runbook.
 *   - Touch the source DB. Read-only on information_schema.
 *   - Apply anything. Output is a file the operator promotes.
 *
 * Safety: the introspection queries are READ-only. The output file
 * is a .draft and won't be picked up by drizzle-kit.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const WHOLESALE = join(REPO_ROOT, "apps/wholesale");
const OUTPUT = join(
  REPO_ROOT,
  "apps/storefront/drizzle/drafts/0102_wholesale_db_merge.sql.draft",
);

// Tables on wholesale RDS we want to mirror to storefront. The
// information_schema query filters to public-schema tables; we
// further exclude anything matching this skip-list.
const SKIP_TABLES = new Set([
  "schema_migrations",       // drizzle-kit's own bookkeeping
  "__drizzle_migrations",    // drizzle-kit's own bookkeeping (alt name)
  "pg_stat_statements",      // pg extension table
]);

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const path = join(WHOLESALE, f);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*?)["']?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

interface IndexRow {
  index_name: string;
  index_def: string; // pg_get_indexdef() output
  is_unique: boolean;
  is_primary: boolean;
}

interface FKRow {
  constraint_name: string;
  column_name: string;
  foreign_table: string;
  foreign_column: string;
}

interface CheckRow {
  constraint_name: string;
  check_clause: string;
}

function formatColumnType(c: ColumnRow): string {
  // Use udt_name as the canonical type; fall back to data_type if needed.
  // information_schema reports text/varchar/int/numeric/... — we mostly
  // want udt_name (e.g. "int4", "numeric", "text", "timestamptz") which
  // is the Postgres-internal name we can re-emit.
  const udt = c.udt_name;
  if (udt === "numeric") {
    if (c.numeric_precision != null && c.numeric_scale != null) {
      return `numeric(${c.numeric_precision}, ${c.numeric_scale})`;
    }
    return "numeric";
  }
  if (udt === "varchar" || udt === "bpchar") {
    return c.character_maximum_length != null
      ? `varchar(${c.character_maximum_length})`
      : "text";
  }
  if (udt === "int4") return "integer";
  if (udt === "int8") return "bigint";
  if (udt === "int2") return "smallint";
  if (udt === "float4") return "real";
  if (udt === "float8") return "double precision";
  if (udt === "bool") return "boolean";
  if (udt === "timestamp") return "timestamp";
  if (udt === "timestamptz") return "timestamptz";
  // Pass through everything else (text, date, jsonb, inet, uuid, …).
  return udt;
}

async function listTables(sql: postgres.Sql): Promise<string[]> {
  const rows = await sql<{ table_name: string }[]>`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name
  `;
  return rows.map((r) => r.table_name).filter((t) => !SKIP_TABLES.has(t));
}

async function columnsOf(sql: postgres.Sql, table: string): Promise<ColumnRow[]> {
  return sql<ColumnRow[]>`
    SELECT column_name, data_type, udt_name, is_nullable,
           column_default, character_maximum_length,
           numeric_precision, numeric_scale
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ${table}
     ORDER BY ordinal_position
  `;
}

async function indexesOf(sql: postgres.Sql, table: string): Promise<IndexRow[]> {
  return sql<IndexRow[]>`
    SELECT
      i.relname AS index_name,
      pg_get_indexdef(i.oid) AS index_def,
      ix.indisunique AS is_unique,
      ix.indisprimary AS is_primary
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE t.relkind = 'r' AND t.relname = ${table}
    ORDER BY i.relname
  `;
}

async function foreignKeysOf(sql: postgres.Sql, table: string): Promise<FKRow[]> {
  return sql<FKRow[]>`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = ${table}
    ORDER BY tc.constraint_name
  `;
}

async function checksOf(sql: postgres.Sql, table: string): Promise<CheckRow[]> {
  return sql<CheckRow[]>`
    SELECT tc.constraint_name, cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
       AND tc.table_schema = cc.constraint_schema
     WHERE tc.constraint_type = 'CHECK'
       AND tc.table_schema = 'public'
       AND tc.table_name = ${table}
       AND tc.constraint_name NOT LIKE '%_not_null'
     ORDER BY tc.constraint_name
  `;
}

function emitCreateTable(table: string, cols: ColumnRow[], checks: CheckRow[]): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE IF NOT EXISTS ws_${table} (`);
  const colLines = cols.map((c) => {
    let line = `  ${c.column_name} ${formatColumnType(c)}`;
    if (c.is_nullable === "NO") line += " NOT NULL";
    if (c.column_default != null) line += ` DEFAULT ${c.column_default}`;
    return line;
  });
  const constraintLines = checks.map((cc) => `  CONSTRAINT ${cc.constraint_name} CHECK (${cc.check_clause})`);
  lines.push([...colLines, ...constraintLines].join(",\n"));
  lines.push(");");
  return lines.join("\n");
}

function emitIndex(table: string, idx: IndexRow): string | null {
  if (idx.is_primary) {
    // Promote PRIMARY KEY into the CREATE TABLE? For simplicity we
    // emit a separate ALTER TABLE ... ADD PRIMARY KEY instead — it
    // round-trips cleanly and keeps the CREATE TABLE shape uniform.
    const pkName = `ws_${idx.index_name}`;
    // index_def looks like: CREATE UNIQUE INDEX <name> ON <schema>.<table> USING btree (...)
    const m = idx.index_def.match(/USING\s+\w+\s+\(([^)]+)\)/i);
    if (!m) return null;
    return `ALTER TABLE ws_${table} ADD CONSTRAINT ${pkName} PRIMARY KEY (${m[1]});`;
  }
  // Non-primary index — rewrite the index_def with ws_ prefix on the
  // index name and the table name.
  const newName = `ws_${idx.index_name}`;
  let rewritten = idx.index_def
    .replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+\S+/, (match, unique) => `CREATE ${unique ?? ""}INDEX IF NOT EXISTS ${newName}`)
    .replace(new RegExp(`\\bpublic\\.${table}\\b`), `public.ws_${table}`)
    .replace(new RegExp(`\\bON\\s+${table}\\b`), `ON ws_${table}`);
  if (!rewritten.endsWith(";")) rewritten += ";";
  return rewritten;
}

async function main() {
  loadEnv();
  const url = process.env.WHOLESALE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("WHOLESALE_DATABASE_URL not set.");
    process.exit(1);
  }
  const sql = postgres(url.replace(/\?sslmode=[^&]*/, ""), {
    ssl: { rejectUnauthorized: false },
  });

  const tables = await listTables(sql);
  console.log(`Found ${tables.length} tables to mirror.`);

  const header = `-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️  DRAFT — generated by apps/storefront/scripts/generate-wholesale-merge-sql.ts
--     DO NOT APPLY WITHOUT OPERATOR REVIEW + STAGING REHEARSAL  ⚠️
-- ═══════════════════════════════════════════════════════════════════════
--
-- Migration 0102 (DRAFT) — wholesale RDS → storefront RDS table merge.
-- Phase 6 of the wholesale consolidation arc.
--
-- This file was REGENERATED from the live wholesale schema. It
-- captures every CREATE TABLE, every index, every CHECK constraint,
-- and every foreign key as they currently exist on the wholesale RDS.
--
-- Runbook: docs/wholesale-db-merge-runbook.md
-- Data load (out-of-band): use pg_dump + pg_restore per the runbook.
--
-- Promotion: rename this file to 0102_wholesale_db_merge.sql once
-- the staging rehearsal completes and the operator has reviewed
-- every CREATE statement against the canonical schema in
-- apps/wholesale/src/lib/db/schema.ts.
--
-- Generated at: ${new Date().toISOString()}
-- Tables mirrored: ${tables.length}
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────
-- PHASE A — CREATE TABLE for every ws_* table
-- ───────────────────────────────────────────────────────────────────────
`;

  const tableSections: string[] = [];
  const indexSections: string[] = [];
  const fkSections: string[] = [];

  for (const table of tables) {
    const cols = await columnsOf(sql, table);
    const idx = await indexesOf(sql, table);
    const fks = await foreignKeysOf(sql, table);
    const checks = await checksOf(sql, table);

    tableSections.push(
      `-- ── ws_${table} (mirror of wholesale.${table}) ────────────────────────`,
    );
    tableSections.push(emitCreateTable(table, cols, checks));
    tableSections.push("");

    for (const i of idx) {
      const emitted = emitIndex(table, i);
      if (emitted) indexSections.push(emitted);
    }

    for (const fk of fks) {
      fkSections.push(
        `ALTER TABLE ws_${table}\n  ADD CONSTRAINT ws_${fk.constraint_name}\n  FOREIGN KEY (${fk.column_name}) REFERENCES ws_${fk.foreign_table} (${fk.foreign_column});`,
      );
    }
  }

  const footer = `
-- ───────────────────────────────────────────────────────────────────────
-- PHASE A.2 — indexes
-- ───────────────────────────────────────────────────────────────────────

${indexSections.join("\n")}

COMMIT;

-- ───────────────────────────────────────────────────────────────────────
-- PHASE B — data load (RUN OUT-OF-BAND; SEE runbook)
-- ───────────────────────────────────────────────────────────────────────
--
-- Use pg_dump --data-only --table='<each table>' on wholesale, then
-- pg_restore --data-only --table='ws_<table>' on storefront. The
-- table renaming requires a remap helper (apps/storefront/scripts/
-- restore-with-rename.ts — separate Phase 7 task).

-- ───────────────────────────────────────────────────────────────────────
-- PHASE C — foreign keys (only after Phase B; tables must hold data)
-- ───────────────────────────────────────────────────────────────────────

BEGIN;

${fkSections.join("\n\n")}

COMMIT;

-- ───────────────────────────────────────────────────────────────────────
-- PHASE E — verification (run apps/storefront/scripts/verify-wholesale-merge.ts)
-- ───────────────────────────────────────────────────────────────────────
`;

  const output = header + tableSections.join("\n") + footer;
  writeFileSync(OUTPUT, output, "utf-8");

  console.log(`\n✓ Wrote ${output.split("\n").length} lines to:`);
  console.log(`  ${OUTPUT.replace(REPO_ROOT, ".../")}`);
  console.log(`\nNext: review the diff, run the staging rehearsal, then promote`);
  console.log(`      to 0102_wholesale_db_merge.sql.`);

  await sql.end();
}

main().catch((err) => {
  console.error("\nFailed:", err);
  process.exit(1);
});
