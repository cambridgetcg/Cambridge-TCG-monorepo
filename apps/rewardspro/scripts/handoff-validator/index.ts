/**
 * Top-level: read the handoff once, validate against the registry.
 *
 * For programmatic use, import `validate` directly from `./validator`
 * and pass your own handoff text. This module is the convenience
 * wrapper that ties the canonical handoff path to the canonical
 * registry.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { validate } from "./validator";
import { registry } from "../rp-registry";
import type { Report } from "./validator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const HANDOFF_PATH = path.resolve(
  __dirname,
  "../../extensions/theme-app-extension-rewardspro/claude-design/design-system.md"
);

export function validateCanonicalHandoff(): Report {
  const text = fs.readFileSync(HANDOFF_PATH, "utf-8");
  return validate(text, registry);
}

export { validate } from "./validator";
export type { Report, Issue, IssueType, ValidatorOptions } from "./validator";
