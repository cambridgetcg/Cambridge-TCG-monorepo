/**
 * How long the observability tables (migration 0148) keep their rows, and
 * the statement that deletes the rest. Hourly rows are kept 35 days; daily
 * rows, and the one row each price job writes per run, 13 months. The /privacy
 * notice and docs/operations/monitoring.md state these periods; the monitor
 * page reads them from here and shows any table holding a row past its period.
 *
 * Deletion runs hourly from the maintenance cron at minute 23
 * (runObservabilityRetentionSweep), whichever counting flags are on, so a
 * period holds after every writer of a table has stopped. The writers also
 * delete as they write: after each job outcome is recorded
 * (job-outcomes.ts), inside the MCP counter's own upsert (mcp-daily.ts), and
 * after each traffic pull. Nothing here keeps a copy of what it deletes.
 */

export const OBSERVABILITY_RETENTION = {
  hourly: { days: 35 },
  daily: { months: 13 },
} as const;

export type ObservabilityTable = "ops_job_outcomes" | "mcp_daily" | "traffic_hourly" | "traffic_pulls" | "error_daily";

/** Each table's time column and the period it keeps. Dates are UTC days. */
export const RETENTION_BY_TABLE: Readonly<Record<ObservabilityTable, { column: string; kind: "timestamp" | "date"; keep: "hourly" | "daily" }>> = {
  traffic_hourly: { column: "hour", kind: "timestamp", keep: "hourly" },
  traffic_pulls: { column: "window_start", kind: "timestamp", keep: "hourly" },
  mcp_daily: { column: "day", kind: "date", keep: "daily" },
  error_daily: { column: "day", kind: "date", keep: "daily" },
  ops_job_outcomes: { column: "started_at", kind: "timestamp", keep: "daily" },
};

export const OBSERVABILITY_TABLES = Object.keys(RETENTION_BY_TABLE) as ObservabilityTable[];

/** The earliest time (or UTC day) a table keeps, as SQL over now(). */
export function retentionCutoffSql(table: ObservabilityTable): string {
  const { kind, keep } = RETENTION_BY_TABLE[table];
  const period = keep === "hourly" ? `interval '${OBSERVABILITY_RETENTION.hourly.days} days'` : `interval '${OBSERVABILITY_RETENTION.daily.months} months'`;
  return kind === "date"
    ? `((now() AT TIME ZONE 'UTC')::date - ${period})::date`
    : `now() - ${period}`;
}

/** Rows a table holds past its period. */
export function expiredRowsSql(table: ObservabilityTable): string {
  return `${RETENTION_BY_TABLE[table].column} < ${retentionCutoffSql(table)}`;
}

type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] } | undefined>;

/** Deletes every observability row past its period, in one statement, and
 * says how many went from each table. Every time column leads an index
 * (0148), so a run with nothing to delete reads almost nothing. Throws what
 * the database throws (42P01 before 0148); callers decide whether that
 * matters. */
export async function pruneObservability(runQuery: RunQuery): Promise<Record<ObservabilityTable, number>> {
  const steps = OBSERVABILITY_TABLES.map((table, index) => `d${index} AS (DELETE FROM ${table} WHERE ${expiredRowsSql(table)} RETURNING 1)`);
  const counts = OBSERVABILITY_TABLES.map((table, index) => `(SELECT count(*)::int FROM d${index}) AS ${table}`);
  const result = await runQuery(`WITH ${steps.join(", ")} SELECT ${counts.join(", ")}`);
  const row = result?.rows[0] ?? {};
  return Object.fromEntries(OBSERVABILITY_TABLES.map(table => [table, Number(row[table] ?? 0)])) as Record<ObservabilityTable, number>;
}

export type ObservabilityRetentionSweep =
  | { ranInWindow: false }
  | { ranInWindow: true; provisioned: false }
  | { ranInWindow: true; provisioned: true; deleted: Record<ObservabilityTable, number> };

/** The hourly sweep: runs in the maintenance cron's minute 23, beside the
 * door tables' sweep. Throws what the database throws, except a missing
 * table (before 0148). */
export async function runObservabilityRetentionSweep(now = new Date(), run?: RunQuery): Promise<ObservabilityRetentionSweep> {
  if (now.getUTCMinutes() !== 23) return { ranInWindow: false };
  const runQuery = run ?? ((await import("@/lib/db")).query as RunQuery);
  try {
    return { ranInWindow: true, provisioned: true, deleted: await pruneObservability(runQuery) };
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01") return { ranInWindow: true, provisioned: false };
    throw error;
  }
}

/** "35 days" / "13 months", for copy. */
export function retentionLabel(table: ObservabilityTable): string {
  return RETENTION_BY_TABLE[table].keep === "hourly" ? `${OBSERVABILITY_RETENTION.hourly.days} days` : `${OBSERVABILITY_RETENTION.daily.months} months`;
}
