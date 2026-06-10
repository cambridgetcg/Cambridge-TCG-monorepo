#!/usr/bin/env npx tsx
/**
 * Audit drift between Prisma schema fields and actual DB columns.
 *
 * Reads model field definitions from prisma/schema.prisma, then for every
 * model issues `SELECT column_name FROM information_schema.columns` and diffs
 * the two sets. Reports columns missing from DB (likely pending migrations).
 *
 * The new Driver Adapter requests exact columns instead of SELECT *, so any
 * drift becomes a runtime error after cut-over. We need a clean drift report
 * BEFORE flipping the flag in production.
 */
import { readFileSync } from "fs";
import { config as loadEnv } from "dotenv";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

loadEnv({ path: ".env.local", override: true });

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

/**
 * Parse model { ... } blocks from schema.prisma and extract scalar field names.
 * Skips relation fields (no @relation but typed as another model — we keep
 * only fields whose type is a built-in scalar / scalar-with-modifier).
 */
function parseSchema(): Map<string, Set<string>> {
  const text = readFileSync("prisma/schema.prisma", "utf8");
  const models = new Map<string, Set<string>>();
  const SCALARS = new Set([
    "String", "Int", "BigInt", "Float", "Decimal", "Boolean",
    "DateTime", "Json", "Bytes",
  ]);

  const blockRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const name = m[1];
    const body = m[2];
    const fields = new Set<string>();
    for (const line of body.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
      // field: <name> <Type>[?|[]] [@...]
      const fm = t.match(/^([a-zA-Z_]\w*)\s+([A-Za-z_]\w*)(\?|\[\])?/);
      if (!fm) continue;
      const fieldName = fm[1];
      const typeName = fm[2].replace(/\[\]$/, "").replace(/\?$/, "");
      const isList = fm[3] === "[]";
      // Drop relation fields (typed as another model that has its own block,
      // and not a scalar). Best-effort: scalar fields don't reference enums
      // either, but enums act like text columns at the SQL level so they're
      // safe to keep.
      if (SCALARS.has(typeName)) {
        fields.add(fieldName);
      } else if (!isList) {
        // Could be enum (column) or relation (no column). We need to
        // distinguish. Heuristic: if there's no `@relation(` later in this
        // block referencing this field, AND if there's a corresponding
        // `<field>Id` scalar, it's a relation field — skip.
        // Simpler heuristic: keep only scalar types. Enums get handled below.
      }
    }
    models.set(name, fields);
  }

  // Find enum decls and treat enum-typed fields as scalar columns.
  const enumNames = new Set<string>();
  const enumRe = /^enum\s+(\w+)\s*\{/gm;
  while ((m = enumRe.exec(text)) !== null) enumNames.add(m[1]);

  // Re-walk to add enum-typed fields.
  while ((m = blockRe.exec(text)) !== null) {} // reset
  const blockRe2 = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  while ((m = blockRe2.exec(text)) !== null) {
    const name = m[1];
    const body = m[2];
    const set = models.get(name)!;
    for (const line of body.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
      const fm = t.match(/^([a-zA-Z_]\w*)\s+([A-Za-z_]\w*)(\?|\[\])?/);
      if (!fm) continue;
      const fieldName = fm[1];
      const typeName = fm[2].replace(/\[\]$/, "").replace(/\?$/, "");
      if (enumNames.has(typeName)) set.add(fieldName);
    }
  }

  return models;
}

async function getDbColumns(table: string): Promise<Set<string>> {
  try {
    const r = await client.send(new ExecuteStatementCommand({
      resourceArn: RESOURCE, secretArn: SECRET, database: DB,
      sql: `SELECT column_name FROM information_schema.columns WHERE table_name = :t AND table_schema = 'public'`,
      parameters: [{ name: "t", value: { stringValue: table } }],
    }));
    const cols = new Set<string>();
    for (const row of r.records ?? []) {
      const v = row[0]?.stringValue;
      if (v) cols.add(v);
    }
    return cols;
  } catch (e: any) {
    return new Set();
  }
}

const models = parseSchema();
console.log(`Parsed ${models.size} models from schema.\n`);

const drift: Array<{ model: string; missingFromDb: string[]; extraInDb: string[] }> = [];
const missingTables: string[] = [];

const entries = [...models.entries()];
let i = 0;
for (const [model, fields] of entries) {
  i++;
  if (i % 10 === 0) process.stderr.write(`.`);
  const db = await getDbColumns(model);
  if (db.size === 0) {
    missingTables.push(model);
    continue;
  }
  const missing = [...fields].filter((f) => !db.has(f));
  const extra = [...db].filter((c) => !fields.has(c));
  if (missing.length || extra.length) {
    drift.push({ model, missingFromDb: missing, extraInDb: extra });
  }
}
process.stderr.write("\n\n");

console.log(`=== Schema Drift Report ===`);
console.log(`Models in schema:  ${models.size}`);
console.log(`Tables in DB:      ${models.size - missingTables.length}`);
console.log(`Missing tables:    ${missingTables.length}`);
console.log(`Drifted models:    ${drift.length}`);
console.log("");

if (missingTables.length) {
  console.log("--- Tables in schema but NOT in DB ---");
  for (const t of missingTables) console.log(`  • ${t}`);
  console.log("");
}

if (drift.length) {
  console.log("--- Column drift ---");
  for (const d of drift) {
    console.log(`\n${d.model}:`);
    if (d.missingFromDb.length) {
      console.log(`  ❌ in schema, NOT in DB (will break new adapter):`);
      for (const c of d.missingFromDb) console.log(`     - ${c}`);
    }
    if (d.extraInDb.length) {
      console.log(`  ⚠️  in DB, NOT in schema (legacy columns):`);
      for (const c of d.extraInDb) console.log(`     - ${c}`);
    }
  }
}

if (!missingTables.length && !drift.length) {
  console.log("✅ No drift detected.");
}
