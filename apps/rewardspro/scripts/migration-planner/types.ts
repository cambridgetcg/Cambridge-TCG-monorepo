/**
 * Output types for the planner.
 *
 * `MigrationPlan` is prescriptive — it states *what to do*, not just
 * *what is*. That's the load-bearing distinction between this module
 * and the analyzers / validators / composers that came before. Every
 * suggestion is read-only advice; the developer does the actual work.
 */
import type { ScannedFile } from "../usage-analyzer/types";

export interface Candidate {
  /** Widget-local primitive name (without leading dot). */
  name: string;
  /** Total reference count across files. */
  referenceCount: number;
  /** Files where this candidate is defined or referenced. */
  files: string[];
}

export interface Suggestion {
  /** Unused shared primitive that the planner thinks could absorb the candidates. */
  target: string;
  /** Widget-local primitives that mirror the target by naming pattern. */
  candidates: Candidate[];
  /** How likely the suggestion is to apply cleanly. */
  confidence: "high" | "medium" | "low";
  /** Plain-language reason a reviewer can audit. */
  rationale: string;
}

export interface MigrationPlan {
  generatedAt: string;
  /** Ordered by total reference count (most impactful first). */
  suggestions: Suggestion[];
  /** Sum of all candidates' reference counts — rough estimate of touch points. */
  totalEstimatedChanges: number;
}

export type { ScannedFile };
