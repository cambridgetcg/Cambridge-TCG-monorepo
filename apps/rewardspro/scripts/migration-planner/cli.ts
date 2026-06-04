#!/usr/bin/env tsx
/**
 *   npm run migration:plan          human-readable plan
 *   npm run migration:plan -- --json   machine-readable
 *
 * Read-only — never writes to source. The output is advice; a
 * developer reviews and applies the migrations manually.
 */
import { generateMigrationPlan } from "./index";

const wantsJson = process.argv.slice(2).includes("--json");
const plan = generateMigrationPlan();

if (wantsJson) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const conf: Record<string, string> = { high: "★★★", medium: "★★·", low: "★··" };

console.log(
  `\nMigration plan — ${plan.suggestions.length} suggestion(s), ~${plan.totalEstimatedChanges} touch points\n`
);

if (plan.suggestions.length === 0) {
  console.log(
    `  No widget-local primitives appear to mirror an unused shared primitive.\n` +
      `  Either every shared primitive is adopted, or naming patterns don't match.`
  );
  process.exit(0);
}

for (let i = 0; i < plan.suggestions.length; i++) {
  const s = plan.suggestions[i];
  console.log(`#${i + 1} ${conf[s.confidence]} adopt \`.${s.target}\``);
  for (const c of s.candidates) {
    console.log(
      `      replace \`.${c.name}\` (${c.referenceCount} ref${c.referenceCount === 1 ? "" : "s"}) in:`
    );
    for (const f of c.files) console.log(`         ${f}`);
  }
  console.log(`      ↳ ${s.rationale}`);
  console.log("");
}
