// What /verify/health may say about the self-audit window and the chain tip.
// Pure, so the states are tested apart from the page (page.tsx can export
// nothing but the page).
//
// With no revealed draw to sample, the self-audit writes no row and the
// digest job publishes nothing. An empty window and an old tip are then
// expected, and are not shown as a failure, as health or as staleness.
// has_auditable_draws and has_undigested_draws come from /api/verify/health;
// null or missing means unknown, which is read as neither answer.

export type AuditState =
  /** Audits ran in the window and none failed. */
  | "passing"
  /** Audits ran in the window and at least one failed. */
  | "failing"
  /** None ran, and there is no revealed draw to sample. */
  | "nothing-to-audit"
  /** None ran, although there is a revealed draw to sample. */
  | "not-running"
  /** None ran, and whether there is anything to sample is unknown. */
  | "unknown";

export function auditState(audit: {
  total: number;
  failed: number;
  has_auditable_draws?: boolean | null;
}): AuditState {
  if (audit.total > 0) return audit.failed > 0 ? "failing" : "passing";
  if (audit.has_auditable_draws === false) return "nothing-to-audit";
  if (audit.has_auditable_draws === true) return "not-running";
  return "unknown";
}

/** A tip older than this, with a draw waiting, is shown as overdue. */
export const STALE_TIP_MINUTES = 60;

export type TipState =
  /** No digest has been published (ageMinutes is null). */
  | "none"
  /** No revealed draw is waiting, so no digest is due, however old the tip. */
  | "idle"
  /** Published within STALE_TIP_MINUTES, or its age could not be read. */
  | "recent"
  /** Older, and a revealed draw is waiting for a digest. */
  | "overdue"
  /** Older, and whether a draw is waiting is unknown. */
  | "old";

export function tipState(
  ageMinutes: number | null,
  digest: { has_undigested_draws?: boolean | null },
): TipState {
  if (ageMinutes == null) return "none";
  if (digest.has_undigested_draws === false) return "idle";
  if (!(ageMinutes > STALE_TIP_MINUTES)) return "recent";
  return digest.has_undigested_draws === true ? "overdue" : "old";
}

/** Whether the tip is shown with the stale accent. */
export function tipLooksStale(state: TipState): boolean {
  return state === "overdue" || state === "old";
}
