/**
 * Composite health report — synthesizes validator + analyzer + registry
 * into a single, prioritized view of the design system's state.
 */
export type Status = "ok" | "warning" | "error";

export interface HealthSection {
  /** Human-readable section title (e.g. "Handoff drift", "Token adoption"). */
  name: string;
  status: Status;
  /** One-line headline for the section (e.g. "37/39 tokens used"). */
  summary: string;
  /** Bulleted detail lines — surfacing specific issues, hot tokens, etc. */
  details: string[];
}

export interface HealthReport {
  /** Worst status across all sections. */
  status: Status;
  sections: HealthSection[];
  /** ISO 8601 timestamp the report was generated. */
  generatedAt: string;
}
