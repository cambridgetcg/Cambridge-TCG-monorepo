/**
 * Top-level facade — runs the sibling modules, feeds their reports
 * into the pure composer, returns a single HealthReport.
 *
 * For programmatic / synthetic input, import `compose` directly from
 * `./composer` and pass your own validator + usage reports.
 */
import { validateCanonicalHandoff } from "../handoff-validator";
import { analyzeWidgetAssets } from "../usage-analyzer";
import { registry } from "../rp-registry";

import { compose } from "./composer";
import type { HealthReport } from "./types";

export function generateHealthReport(): HealthReport {
  return compose({
    validator: validateCanonicalHandoff(),
    usage: analyzeWidgetAssets(),
    registry,
  });
}

export { compose } from "./composer";
export type { HealthReport, HealthSection, Status } from "./types";
