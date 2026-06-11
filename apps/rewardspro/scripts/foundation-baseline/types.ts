/**
 * Persisted snapshot + change-over-time types.
 *
 * Synthesizes a concept (`trend`) that doesn't exist in any single
 * `HealthReport` — it only exists when comparing two reports across
 * time.
 */
import type { HealthReport, Status } from "../foundation-health/types";

export type Trend = "improved" | "regressed" | "unchanged" | "mixed";

export interface Baseline {
  /** ISO 8601 timestamp the baseline was captured. */
  capturedAt: string;
  /** Frozen `HealthReport` from that moment. */
  report: HealthReport;
}

export interface SectionDiff {
  name: string;
  prevStatus: Status;
  currStatus: Status;
  trend: Trend;
  /** Plain-language summary of what changed in this section. */
  summary: string;
}

export interface BaselineDiff {
  prev: Baseline;
  curr: Baseline;
  sections: SectionDiff[];
  /** Worst-of trend across sections — `mixed` if some improved + some regressed. */
  trend: Trend;
}
