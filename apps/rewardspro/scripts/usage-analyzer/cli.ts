#!/usr/bin/env tsx
/**
 * Print a usage report for foundation tokens & primitives across the
 * widget codebase.
 *
 *   npm run usage-report
 *   npm run usage-report -- --json   # machine-readable output
 */
import { analyzeWidgetAssets } from "./index";
import { registry } from "../rp-registry";

const wantsJson = process.argv.slice(2).includes("--json");
const report = analyzeWidgetAssets();

if (wantsJson) {
  console.log(
    JSON.stringify(
      {
        filesScanned: report.filesScanned,
        tokens: Object.fromEntries(report.tokens),
        primitives: Object.fromEntries(report.primitives),
        unusedTokens: report.unusedTokens,
        unusedPrimitives: report.unusedPrimitives,
      },
      null,
      2
    )
  );
  process.exit(0);
}

const totalTokens = registry.tokens.length;
const usedTokens = report.tokens.size;
const totalPrimitives = registry.primitives.length;
const usedPrimitives = report.primitives.size;

console.log(`\nUsage analysis — ${report.filesScanned} widget files scanned\n`);
console.log(`  Tokens     ${usedTokens}/${totalTokens} used`);
console.log(`  Primitives ${usedPrimitives}/${totalPrimitives} used`);

if (report.unusedTokens.length > 0) {
  console.log(`\nUnused tokens (consider deleting from rp-shared.css):`);
  for (const name of report.unusedTokens) console.log(`  ${name}`);
}

if (report.unusedPrimitives.length > 0) {
  console.log(`\nUnused primitives:`);
  for (const name of report.unusedPrimitives) console.log(`  ${name}`);
}

console.log(`\nTop tokens by usage count:`);
const sorted = [...report.tokens.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 10);
for (const [name, refs] of sorted) {
  console.log(`  ${refs.length.toString().padStart(3)}× ${name}`);
}
console.log("");
