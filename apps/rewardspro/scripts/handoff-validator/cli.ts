#!/usr/bin/env tsx
/**
 * Validates `design-system.md` against the typed registry.
 * Exit code is non-zero on drift, suitable for CI.
 *
 *   npx tsx scripts/handoff-validator/cli.ts
 *   npm run validate-handoff
 */
import { validateCanonicalHandoff } from "./index";
import { registry } from "../rp-registry";

const report = validateCanonicalHandoff();

if (report.ok) {
  console.log(
    `✓ Handoff validates — ${report.referencedTokens} token reference(s) checked against ${registry.tokens.length} registry token(s)`
  );
  process.exit(0);
}

console.error(`✗ Handoff drift — ${report.issues.length} issue(s):\n`);
for (const issue of report.issues) {
  console.error(`  [${issue.type.padEnd(13)}] ${issue.detail}`);
}
console.error(
  `\nFix the handoff (\`extensions/theme-app-extension-rewardspro/claude-design/design-system.md\`) to match \`rp-shared.css\`. The CSS is canonical.`
);
process.exit(1);
