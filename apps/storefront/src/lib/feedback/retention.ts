/**
 * The hourly sweep of the door tables (migration 0149), run from the
 * maintenance cron at minute 23 whether or not the doors are open, so a
 * stated period holds after a door closes:
 *   - public_feedback: a message 180 days after it arrived (door.ts);
 *   - feedback_hourly_intake: the global cap's hour counts after 48 hours;
 *   - peer_hello_daily: a day's hello counts after 13 months (peers.ts).
 * The writers also clear what they pass, and no read returns an expired
 * message, so the sweep is the floor, not the only guard. It reports counts
 * only. Before 0149 it finds nothing to sweep and says so.
 */

import { FEEDBACK_INTAKE_RETENTION_HOURS } from "./door";
import { PEER_HELLO_EXPIRED_SQL } from "@/lib/peers";

export const DOOR_RETENTION_SWEEP_SQL = `WITH feedback AS (
    DELETE FROM public_feedback WHERE expires_at <= now() RETURNING 1
  ), intake AS (
    DELETE FROM feedback_hourly_intake WHERE hour < now() - interval '${FEEDBACK_INTAKE_RETENTION_HOURS} hours' RETURNING 1
  ), hello AS (
    DELETE FROM peer_hello_daily WHERE ${PEER_HELLO_EXPIRED_SQL} RETURNING 1
  )
  SELECT (SELECT count(*)::int FROM feedback) AS feedback, (SELECT count(*)::int FROM intake) AS intake, (SELECT count(*)::int FROM hello) AS hello`;

export type DoorRetentionSweep =
  | { ranInWindow: false }
  | { ranInWindow: true; provisioned: false }
  | { ranInWindow: true; provisioned: true; deleted: { feedback: number; intake: number; hello: number } };

type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/** Runs once an hour, in the maintenance cron's minute 23. Throws what the
 * database throws, except a missing table (before 0149). */
export async function runDoorRetentionSweep(now = new Date(), run?: RunQuery): Promise<DoorRetentionSweep> {
  if (now.getUTCMinutes() !== 23) return { ranInWindow: false };
  const runQuery = run ?? ((await import("@/lib/db")).query as RunQuery);
  try {
    const row = (await runQuery(DOOR_RETENTION_SWEEP_SQL)).rows[0] ?? {};
    return { ranInWindow: true, provisioned: true, deleted: { feedback: Number(row.feedback ?? 0), intake: Number(row.intake ?? 0), hello: Number(row.hello ?? 0) } };
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01") return { ranInWindow: true, provisioned: false };
    throw error;
  }
}
