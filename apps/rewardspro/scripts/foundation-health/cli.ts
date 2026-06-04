#!/usr/bin/env tsx
/**
 *   npm run health           # human-readable
 *   npm run health -- --json # machine-readable
 *
 * Exit code: 0 on `ok`, 1 on `warning`, 2 on `error`. Suitable for CI
 * gates that should fail loudly on drift but tolerate adoption gaps.
 */
import { generateHealthReport } from "./index";

const wantsJson = process.argv.slice(2).includes("--json");
const report = generateHealthReport();

if (wantsJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "error" ? 2 : report.status === "warning" ? 1 : 0);
}

const icons: Record<string, string> = { ok: "✓", warning: "⚠", error: "✗" };

console.log(`\nFoundation health — ${icons[report.status]} ${report.status.toUpperCase()}\n`);
console.log(`Generated ${report.generatedAt}\n`);

for (const section of report.sections) {
  console.log(`${icons[section.status]} ${section.name.padEnd(18)} ${section.summary}`);
  for (const detail of section.details) {
    console.log(`    ${detail}`);
  }
  console.log("");
}

process.exit(report.status === "error" ? 2 : report.status === "warning" ? 1 : 0);
