/**
 * Pure: assert pattern compliance on a discovered `Architecture`.
 *
 * Rules enforced (mirror the feedback memory's `Module extension pattern`):
 *   1. Every module has a `README.md`.
 *   2. Every module has an `index.ts` entry point.
 *   3. Every module has at least one matching `*.test.ts` in `test/scripts/`.
 *   4. Every `imports` entry resolves to a known module name.
 */
import type { Architecture, PatternIssue } from "./types";

export function validate(arch: Architecture): PatternIssue[] {
  const issues: PatternIssue[] = [];
  const known = new Set(arch.modules.map((m) => m.name));

  for (const m of arch.modules) {
    if (!m.hasReadme) {
      issues.push({
        module: m.name,
        type: "missing-readme",
        detail: `expected ${m.path}/README.md`,
      });
    }
    if (!m.hasIndex) {
      issues.push({
        module: m.name,
        type: "missing-index",
        detail: `expected ${m.path}/index.ts`,
      });
    }
    if (!m.hasTest) {
      issues.push({
        module: m.name,
        type: "missing-test",
        detail: `expected test/scripts/${m.name}.*.test.ts or ${m.name}.test.ts`,
      });
    }
    for (const dep of m.imports) {
      if (!known.has(dep)) {
        issues.push({
          module: m.name,
          type: "unknown-import",
          detail: `imports unknown module \`${dep}\``,
        });
      }
    }
  }
  return issues;
}
