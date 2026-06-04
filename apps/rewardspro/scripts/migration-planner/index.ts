/**
 * Top-level facade — pulls the registry + usage report + widget files,
 * runs the pure planner, returns a MigrationPlan.
 *
 * Read-only. The planner never modifies source code; its output is
 * advice, and a developer is the one who ultimately makes the change.
 */
import { registry } from "../rp-registry";
import { analyzeWidgetAssets, loadWidgetAssets } from "../usage-analyzer";
import { plan } from "./planner";
import type { MigrationPlan } from "./types";

export function generateMigrationPlan(): MigrationPlan {
  return plan({
    registry,
    usage: analyzeWidgetAssets(),
    files: loadWidgetAssets(),
  });
}

export { plan } from "./planner";
export type { PlannerInputs } from "./planner";
export type { MigrationPlan, Suggestion, Candidate } from "./types";
