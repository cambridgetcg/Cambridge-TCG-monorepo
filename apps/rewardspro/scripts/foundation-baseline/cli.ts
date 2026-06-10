#!/usr/bin/env tsx
/**
 *   npm run baseline:take    snapshot current state, write to foundation-baseline.json
 *   npm run baseline:diff    compare current state against the persisted baseline
 *
 * Exit codes:
 *   0  trend == improved | unchanged
 *   1  trend == mixed
 *   2  trend == regressed
 *
 * Wire `baseline:diff` into CI to fail loud on regressions while still
 * shipping mixed PRs that improve some sections.
 */
import {
  takeBaseline,
  diffAgainstBaseline,
  BASELINE_PATH,
  readBaseline,
} from "./index";
import * as path from "node:path";

const cmd = process.argv[2];

if (cmd === "take") {
  const fresh = takeBaseline();
  console.log(`✓ Baseline written: ${path.relative(process.cwd(), BASELINE_PATH)}`);
  console.log(`  captured ${fresh.capturedAt}`);
  console.log(`  status   ${fresh.report.status}`);
  process.exit(0);
}

if (cmd === "diff") {
  const result = diffAgainstBaseline();
  if (!result) {
    console.error(
      `No baseline found at ${path.relative(process.cwd(), BASELINE_PATH)}.\n` +
        `Run \`npm run baseline:take\` to capture the first baseline.`
    );
    process.exit(1);
  }

  const trendIcon: Record<string, string> = {
    improved: "↑",
    regressed: "↓",
    unchanged: "·",
    mixed: "↕",
  };

  console.log(
    `\nBaseline diff — overall trend: ${trendIcon[result.trend]} ${result.trend.toUpperCase()}`
  );
  console.log(
    `  prev ${result.prev.capturedAt} (${result.prev.report.status})`
  );
  console.log(
    `  curr ${result.curr.capturedAt} (${result.curr.report.status})\n`
  );

  for (const s of result.sections) {
    console.log(
      `  ${trendIcon[s.trend]} ${s.name.padEnd(18)} ${s.summary}`
    );
  }
  console.log("");

  process.exit(
    result.trend === "regressed" ? 2 : result.trend === "mixed" ? 1 : 0
  );
}

if (cmd === "show") {
  const b = readBaseline();
  if (!b) {
    console.error("No baseline saved.");
    process.exit(1);
  }
  console.log(JSON.stringify(b, null, 2));
  process.exit(0);
}

console.error(`Usage:
  baseline:take       capture a fresh baseline (overwrites prior)
  baseline:diff       compare current state to the saved baseline
  baseline:show       print the saved baseline as JSON
`);
process.exit(1);
