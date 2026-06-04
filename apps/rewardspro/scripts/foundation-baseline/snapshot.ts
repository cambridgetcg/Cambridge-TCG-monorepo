/**
 * Pure: wrap a `HealthReport` in a timestamped `Baseline`.
 */
import type { HealthReport } from "../foundation-health/types";
import type { Baseline } from "./types";

export function snapshot(report: HealthReport, now?: string): Baseline {
  return {
    capturedAt: now ?? new Date().toISOString(),
    report,
  };
}
