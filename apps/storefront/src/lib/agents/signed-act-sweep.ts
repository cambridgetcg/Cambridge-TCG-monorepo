/**
 * The hourly sweep for agent-held signing keys (docs/plans/agent-auth/
 * held-keys.md, build step 6), run from the maintenance cron at minute 23
 * beside runObservabilityRetentionSweep:
 *   - agent_act_nonces: every row past its expires_at (the act's exp plus
 *     60 seconds). Each act also deletes a few as it commits; this is the
 *     floor.
 *   - agent_signing_keys: keys never confirmed by a signed act, 7 days
 *     after binding (PENDING_SIGNING_KEY_DAYS), whether or not the operator
 *     removed them meanwhile. A confirmed key is never deleted here.
 *
 * It runs only while signed acts are open on the deployment
 * (signed-act-config.ts): closed, no code path reads or writes the new
 * tables, this one included. So after the path is closed, expired nonces
 * and lapsed pending keys stay until it opens again; nothing can use them
 * meanwhile, since the act path is closed too.
 *
 * Each run that reaches the database records one ops_job_outcomes row
 * (job sweep/held-keys) with its counts, which the monitor shows as the
 * nonce table's last purge. Counts only: no key, thumbprint or agent.
 */

import { PENDING_SIGNING_KEY_DAYS, signedActsOpen } from "./signed-act-config";
import { recordJobOutcome } from "@/lib/observability/job-outcomes";

export const SIGNED_ACT_SWEEP_JOB = "sweep/held-keys" as const;

export const SIGNED_ACT_SWEEP_SQL = `WITH nonces AS (
    DELETE FROM agent_act_nonces WHERE expires_at < now() RETURNING 1
  ), pending AS (
    DELETE FROM agent_signing_keys
     WHERE confirmed_at IS NULL
       AND created_at <= now() - make_interval(days => ${PENDING_SIGNING_KEY_DAYS})
     RETURNING 1
  )
  SELECT (SELECT count(*)::int FROM nonces) AS nonces, (SELECT count(*)::int FROM pending) AS pending_keys`;

export type SignedActSweep =
  | { ranInWindow: false }
  | { ranInWindow: true; open: false }
  | { ranInWindow: true; open: true; provisioned: false }
  | { ranInWindow: true; open: true; provisioned: true; deleted: { nonces: number; pendingKeys: number } };

type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

const undefinedTable = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";

/** Runs once an hour, in the maintenance cron's minute 23, while signed
 *  acts are open. Throws what the database throws, except a missing table
 *  (before 0152). */
export async function runSignedActSweep(
  now = new Date(),
  run?: RunQuery,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<SignedActSweep> {
  if (now.getUTCMinutes() !== 23) return { ranInWindow: false };
  if (!signedActsOpen(env)) return { ranInWindow: true, open: false };
  const runQuery = run ?? ((await import("@/lib/db")).query as RunQuery);
  // The record's own times are the work's, on this clock.
  const startedAt = new Date();
  let row: Record<string, unknown>;
  try {
    row = (await runQuery(SIGNED_ACT_SWEEP_SQL)).rows[0] ?? {};
  } catch (error) {
    if (undefinedTable(error)) return { ranInWindow: true, open: true, provisioned: false };
    await recordJobOutcome(
      { job: SIGNED_ACT_SWEEP_JOB, startedAt, httpStatus: 500, outcome: "unavailable:failed", counts: {} },
      run,
    );
    throw error;
  }
  const deleted = { nonces: Number(row.nonces ?? 0), pendingKeys: Number(row.pending_keys ?? 0) };
  await recordJobOutcome(
    { job: SIGNED_ACT_SWEEP_JOB, startedAt, httpStatus: 200, outcome: "ran", counts: { nonces: deleted.nonces, pendingKeys: deleted.pendingKeys } },
    run,
  );
  return { ranInWindow: true, open: true, provisioned: true, deleted };
}
