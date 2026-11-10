/**
 * The production build's migration check (RP-25), for
 * scripts/check-production-migrations.ts: production must have applied
 * every migration in prisma/migrations, with the SQL this commit holds,
 * before code that may read their columns goes live.
 *
 * The decision is pure: migrationCheckPlan reads the env, migrationVerdict
 * compares the local migrations with production's `_prisma_migrations`
 * rows, and reportVerdict turns a verdict into the lines the CLI prints and
 * its exit code. readAppliedMigrations is the one read, read-only, with the
 * app's own verified TLS (app/db/database-connection.server.ts).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { databaseConnectionConfig } from "../../app/db/database-connection.server";

export interface LocalMigration {
  name: string;
  /** sha256 hex of migration.sql's bytes: Prisma's checksum, and what `shasum -a 256` prints */
  checksum: string;
}

/** A row of `_prisma_migrations`, as Prisma writes it */
export interface MigrationRow {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export type PendingState = "missing" | "unfinished" | "rolled_back" | "changed";

export type MigrationVerdict =
  | { outcome: "pass"; extra: string[] }
  | { outcome: "refuse"; pending: Array<{ name: string; state: PendingState }>; extra: string[] };

export type CheckPlan = { notes: string[] } & (
  | { action: "skip"; reason: string }
  | { action: "refuse"; reason: string }
  | { action: "override"; sha: string }
  | { action: "check"; url: string; schema: string; host: string }
);

/** Every migration directory, oldest first, with its checksum. */
export function localMigrations(dir: string): LocalMigration[] {
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort()
    .map((name) => {
      const file = join(dir, name, "migration.sql");
      if (!existsSync(file)) throw new Error(`${name} has no migration.sql`);
      return { name, checksum: createHash("sha256").update(readFileSync(file)).digest("hex") };
    });
}

/**
 * A migration is applied when some row for it finished and was not rolled
 * back, and its SQL is this commit's when one such row has its checksum.
 * Rows for migrations this commit lacks are reported and never refused: a
 * migration is applied before its own PR merges, while other PRs build.
 */
export function migrationVerdict(local: LocalMigration[], rows: MigrationRow[]): MigrationVerdict {
  const pending: Array<{ name: string; state: PendingState }> = [];
  for (const { name, checksum } of local) {
    const mine = rows.filter((row) => row.migration_name === name);
    const applied = mine.filter((row) => row.finished_at !== null && row.rolled_back_at === null);
    if (mine.length === 0) pending.push({ name, state: "missing" });
    else if (applied.length === 0) {
      const running = mine.some((row) => row.finished_at === null && row.rolled_back_at === null);
      pending.push({ name, state: running ? "unfinished" : "rolled_back" });
    } else if (!applied.some((row) => row.checksum === checksum)) pending.push({ name, state: "changed" });
  }
  const names = new Set(local.map((m) => m.name));
  const extra = [...new Set(rows.map((row) => row.migration_name).filter((name) => !names.has(name)))].sort();
  return pending.length === 0 ? { outcome: "pass", extra } : { outcome: "refuse", pending, extra };
}

const STATES: Record<PendingState, string> = {
  missing: "not applied to production",
  unfinished: "started, not finished (failed, or still running)",
  rolled_back: "rolled back",
  changed: "applied with different SQL: checksum differs",
};

/** One line of the CLI's report: `say` goes to stdout, `warn` to stderr. */
export interface ReportLine {
  level: "say" | "warn";
  text: string;
}

/**
 * What the CLI prints after a verdict, without its prefix, and its exit
 * code: each local migration with its state, production's rows this commit
 * lacks, then the outcome. Exit 1 refuses the build; the CLI then adds the
 * recovery lines. It names migrations only.
 */
export function reportVerdict(local: LocalMigration[], verdict: MigrationVerdict): { lines: ReportLine[]; exitCode: 0 | 1 } {
  const pending = new Map(verdict.outcome === "refuse" ? verdict.pending.map((p) => [p.name, p.state]) : []);
  const lines: ReportLine[] = local.map(({ name }) => {
    const state = pending.get(name);
    return state ? { level: "warn", text: `  ${name}  ${STATES[state]}` } : { level: "say", text: `  ${name}  applied` };
  });
  for (const name of verdict.extra) lines.push({ level: "say", text: `  ${name}  in production, not in this commit (fine: applied before its PR merged)` });
  if (verdict.outcome === "refuse") {
    lines.push({ level: "warn", text: `refused: production lacks ${verdict.pending.length} of this commit's migrations, or holds different SQL for them.` });
    return { lines, exitCode: 1 };
  }
  lines.push({ level: "say", text: "ok: production has every migration in prisma/migrations, with this commit's SQL" });
  return { lines, exitCode: 0 };
}

const SKIP_VARIABLE = "REWARDS_SKIP_MIGRATION_CHECK";

/**
 * What this build does, fail closed:
 *
 * - REWARDS_SKIP_MIGRATION_CHECK, a hex prefix of at least 7 characters of
 *   this build's VERCEL_GIT_COMMIT_SHA: build unchecked. Any other value is
 *   ignored, with a note saying so.
 * - REWARDS_DATABASE_URL set, in any environment: check it, so production
 *   is checked even if Vercel's system variables don't reach the build.
 * - Else VERCEL_ENV=production: refuse, since nothing can be proved.
 * - Else (previews, local and CI builds): skip, saying why.
 *
 * Nothing returned holds the URL's user or password, except `url` itself.
 */
export function migrationCheckPlan(env: Record<string, string | undefined>): CheckPlan {
  const notes: string[] = [];
  const commit = (env.VERCEL_GIT_COMMIT_SHA ?? "").trim().toLowerCase();
  const skip = (env[SKIP_VARIABLE] ?? "").trim().toLowerCase();
  if (skip) {
    if (!/^[0-9a-f]{7,}$/.test(skip)) {
      notes.push(`${SKIP_VARIABLE} is not a commit SHA prefix of at least 7 hex characters: ignored`);
    } else if (commit && commit.startsWith(skip)) {
      return { action: "override", sha: commit, notes };
    } else {
      notes.push(`${SKIP_VARIABLE}=${skip} names another commit, not this build's commit ${commit.slice(0, 12) || "(unset)"}: ignored`);
    }
  }

  const url = (env.REWARDS_DATABASE_URL ?? "").trim();
  if (url) {
    let config: ReturnType<typeof databaseConnectionConfig>;
    try {
      config = databaseConnectionConfig(url);
    } catch (error) {
      // databaseConnectionConfig's messages name at most the host
      return { action: "refuse", reason: `REWARDS_DATABASE_URL can't be used: ${(error as Error).message}`, notes };
    }
    if (!config.schemaInUrl) {
      return { action: "refuse", reason: "REWARDS_DATABASE_URL has no ?schema=, so it doesn't say which schema's _prisma_migrations to read", notes };
    }
    return { action: "check", url, schema: config.schema, host: config.pool.host ?? "", notes };
  }
  if (env.VERCEL_ENV === "production") {
    return {
      action: "refuse",
      reason: "this is a production build with no REWARDS_DATABASE_URL, so it can't show that production has this commit's migrations",
      notes,
    };
  }
  return {
    action: "skip",
    reason: `no REWARDS_DATABASE_URL and VERCEL_ENV=${env.VERCEL_ENV || "(unset)"}: not checking production's migrations`,
    notes,
  };
}

/**
 * Read `_prisma_migrations` in a read-only transaction, over TLS verified
 * against the bundled Supabase root CA (loopback hosts connect without
 * TLS). Plain statements in one transaction, so it is safe through
 * Supavisor's transaction pooler, and the SET is LOCAL, so nothing stays
 * on the pooled connection. Rejects on any failure, or after `timeoutMs`.
 */
export async function readAppliedMigrations(databaseUrl: string, { timeoutMs = 20_000 } = {}): Promise<MigrationRow[]> {
  const { pool, schema } = databaseConnectionConfig(databaseUrl);
  const client = new pg.Client({
    host: pool.host,
    port: pool.port,
    user: pool.user,
    password: pool.password,
    database: pool.database,
    ssl: pool.ssl,
    connectionTimeoutMillis: pool.connectionTimeoutMillis,
  });
  // A late socket error must not crash the process
  client.on("error", () => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("timed out"), { code: "TIMEOUT" })), timeoutMs);
  });
  const read = (async () => {
    await client.connect();
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const { rows } = await client.query<MigrationRow>(
      `SELECT migration_name, checksum, finished_at, rolled_back_at FROM "${schema}"."_prisma_migrations"`,
    );
    await client.query("ROLLBACK");
    return rows;
  })();
  read.catch(() => undefined);
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
    // Bounded too: after a timeout the connection may never have opened
    await Promise.race([client.end().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 1_000).unref())]);
  }
}

/**
 * Why a read failed, by error code only: a driver's message can name the
 * user ("password authentication failed for user …").
 */
export function readFailure(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "TIMEOUT") return "no answer in time";
  if (typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code)) return code;
  return error instanceof Error ? error.name : "unknown error";
}
