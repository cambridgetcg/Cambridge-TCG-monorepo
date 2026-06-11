#!/usr/bin/env node
/**
 * Remove specific unused models from prisma/schema.prisma.
 *
 * Walks the schema file line-by-line. When we hit `model <name> {` for any
 * model in the trim list, skip to the matching `^}` that ends the block and
 * also drop trailing blank line. Idempotent — re-runs are no-ops.
 */
import { readFileSync, writeFileSync } from "fs";

const TRIM = new Set(process.argv.slice(2));
if (TRIM.size === 0) {
  console.error("Usage: trim-schema-models.mjs ModelName1 ModelName2 ...");
  process.exit(1);
}

const SCHEMA = "prisma/schema.prisma";
const lines = readFileSync(SCHEMA, "utf8").split("\n");
const out = [];
let trimmed = 0;
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  const m = line.match(/^model\s+(\w+)\s*\{/);
  if (m && TRIM.has(m[1])) {
    // Skip until we find the closing `^}`. Track inline `{}` defensively.
    let depth = 1;
    i++;
    while (i < lines.length && depth > 0) {
      const ch = lines[i];
      for (const c of ch) {
        if (c === "{") depth++;
        else if (c === "}") depth--;
        if (depth === 0) break;
      }
      i++;
    }
    // Also drop the blank line that typically follows.
    if (i < lines.length && lines[i].trim() === "") i++;
    trimmed++;
    continue;
  }
  out.push(line);
  i++;
}

writeFileSync(SCHEMA, out.join("\n"));
console.log(`Trimmed ${trimmed} model(s).`);
