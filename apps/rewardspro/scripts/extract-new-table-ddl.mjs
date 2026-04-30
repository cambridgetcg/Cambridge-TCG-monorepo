#!/usr/bin/env node
/**
 * Extract CREATE TABLE / CREATE INDEX / ADD CONSTRAINT statements for the
 * tables Phase 2.5 is shipping. Reads /tmp/full-create.sql produced by
 * `prisma migrate diff --from-empty --to-schema-datamodel`.
 *
 * Also extracts CREATE TYPE for enums whose first usage is in one of the
 * shipping tables (best-effort — overshoots are harmless if statement is
 * wrapped in IF NOT EXISTS where applicable).
 */
import { readFileSync, writeFileSync } from "fs";

const SHIPPING = new Set([
  "Integration", "IntegrationEvent", "IntegrationWebhook",
  "OAuthState", "IntegrationPointsRule",
  "AISession", "AISessionAction", "AISessionFeedback",
  "AICodeMetric", "AILearningPattern", "AICodeQualitySignal",
  "AIArchitectureHealth", "AIInnovationTracker", "AIUsage",
]);

const sql = readFileSync("/tmp/full-create.sql", "utf8");
// Each statement ends with `;` on its own line or end-of-file.
const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);

const out = [];
const enumsNeeded = new Set();

// First pass — find tables we want, and remember which enums they reference.
for (const stmt of statements) {
  const m = stmt.match(/CREATE TABLE\s+"(\w+)"/);
  if (!m) continue;
  if (!SHIPPING.has(m[1])) continue;

  // Track every "<EnumName>" reference inside this CREATE TABLE.
  for (const e of stmt.matchAll(/"(\w+)"\s*(?:NOT NULL|DEFAULT|,)/g)) {
    // Skip column names (lowercase first letter usually) — heuristic.
    if (/^[A-Z]/.test(e[1])) enumsNeeded.add(e[1]);
  }
  // Also explicit type cast references like ::"EnumName"
  for (const e of stmt.matchAll(/::"(\w+)"/g)) enumsNeeded.add(e[1]);

  out.push(stmt + ";");
}

// Second pass — emit needed enum CREATE TYPE statements first.
const enumStmts = [];
for (const stmt of statements) {
  const m = stmt.match(/CREATE TYPE\s+"(\w+)"\s+AS ENUM/);
  if (m && enumsNeeded.has(m[1])) enumStmts.push(stmt + ";");
}

// Third pass — INDEXes / FOREIGN KEY constraints touching the shipped tables.
const tail = [];
for (const stmt of statements) {
  // CREATE [UNIQUE] INDEX "..." ON "<TableName>" ...
  const i = stmt.match(/CREATE (?:UNIQUE )?INDEX\s+"\w+"\s+ON\s+"(\w+)"/);
  if (i && SHIPPING.has(i[1])) tail.push(stmt + ";");
  // ALTER TABLE "<T>" ADD CONSTRAINT ...
  const a = stmt.match(/ALTER TABLE\s+"(\w+)"\s+ADD CONSTRAINT/);
  if (a && SHIPPING.has(a[1])) tail.push(stmt + ";");
}

const final =
  "-- Phase 2.5 — CREATE tables for Q1 (Integration platform) + Q2 (AI feedback)\n" +
  "-- Generated from schema.prisma via prisma migrate diff --from-empty.\n\n" +
  "-- Enum types referenced by the new tables.\n" +
  enumStmts.join("\n\n") + "\n\n" +
  "-- New tables.\n" +
  out.join("\n\n") + "\n\n" +
  "-- Indexes and foreign-key constraints for the new tables.\n" +
  tail.join("\n\n") + "\n";

writeFileSync("/tmp/new-tables.sql", final);
console.log(`Extracted ${out.length} CREATE TABLE, ${enumStmts.length} CREATE TYPE, ${tail.length} index/FK`);
console.log(`Output: /tmp/new-tables.sql`);
