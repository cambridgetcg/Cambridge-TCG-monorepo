#!/usr/bin/env tsx
/**
 *   npm run validate-raffles
 *
 * Exit code 1 on any violation, 0 on clean. Wire into CI as a merge
 * gate — same shape as `validate-ledger`.
 */
import { validateRaffleContract } from "./index";

const report = validateRaffleContract();

if (report.ok) {
  console.log(
    `✓ Raffle contract holds — ${report.filesScanned} file(s) scanned, no violations`
  );
  process.exit(0);
}

console.error(
  `✗ Raffle contract violated — ${report.violations.length} issue(s) across ${report.filesScanned} scanned file(s):\n`
);

const byFile = new Map<string, typeof report.violations>();
for (const v of report.violations) {
  const list = byFile.get(v.path) ?? [];
  list.push(v);
  byFile.set(v.path, list);
}

for (const [file, vs] of byFile) {
  console.error(`  ${file}`);
  for (const v of vs) {
    console.error(
      `    L${v.line.toString().padStart(4)}  ${v.table}.${v.method}()  ${v.context}`
    );
    console.error(`           ↳ ${v.reason}`);
  }
  console.error("");
}

process.exit(1);
