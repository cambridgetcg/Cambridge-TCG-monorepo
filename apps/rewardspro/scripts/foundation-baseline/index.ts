/**
 * Top-level facade — file I/O on top of pure `snapshot` + `diff`.
 *
 * The persisted baseline lives at the repo root as
 * `foundation-baseline.json` so it shows up in PR diffs naturally.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { generateHealthReport } from "../foundation-health";
import { snapshot } from "./snapshot";
import { diff } from "./diff";
import type { Baseline, BaselineDiff } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BASELINE_PATH = path.resolve(
  __dirname,
  "../../foundation-baseline.json"
);

export function readBaseline(): Baseline | null {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  const raw = fs.readFileSync(BASELINE_PATH, "utf-8");
  return JSON.parse(raw) as Baseline;
}

export function takeBaseline(): Baseline {
  const baseline = snapshot(generateHealthReport());
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  return baseline;
}

export function diffAgainstBaseline(): BaselineDiff | null {
  const prev = readBaseline();
  if (!prev) return null;
  const curr = snapshot(generateHealthReport());
  return diff(prev, curr);
}

export { snapshot } from "./snapshot";
export { diff } from "./diff";
export type { Baseline, BaselineDiff, SectionDiff, Trend } from "./types";
