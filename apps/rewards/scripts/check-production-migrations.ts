/**
 * Refuse a production build whose migrations production lacks (RP-25).
 *
 * vercel.json runs it before the build ("pnpm run check:migrations && pnpm
 * run build"), so a non-zero exit fails the deployment and Vercel keeps the
 * live one. `pnpm run build` itself never runs it: CI's and local builds stay
 * database-free.
 *
 * Code that reads a column production lacks breaks every webhook, the
 * widget proxy, every admin page and the hourly sweep (findConnection reads
 * every merchant column). So every migration in prisma/migrations must have
 * a finished, not rolled-back row in production's `_prisma_migrations`,
 * whose checksum is this commit's migration.sql: a migration applied before
 * merge and then edited in review is refused too. When it runs, and the
 * escape hatch: scripts/lib/production-migrations.ts (migrationCheckPlan),
 * and docs/switch.md, "A pull request with a migration".
 *
 * It prints migration names and the outcome, never the URL, its user or its
 * password.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type PendingState,
  localMigrations,
  migrationCheckPlan,
  migrationVerdict,
  readAppliedMigrations,
  readFailure,
} from "./lib/production-migrations";

const PREFIX = "[migration-check]";
const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), "../prisma/migrations");

const say = (line: string) => console.log(`${PREFIX} ${line}`);
const warn = (line: string) => console.error(`${PREFIX} ${line}`);

const STATES: Record<PendingState, string> = {
  missing: "not applied to production",
  unfinished: "started, not finished (failed, or still running)",
  rolled_back: "rolled back",
  changed: "applied with different SQL: checksum differs",
};

function howToRecover({ migrations }: { migrations: boolean }) {
  if (migrations) {
    warn('Apply the migrations to production and see migrate:drift pass (docs/switch.md, "A pull request with a migration").');
  }
  warn(
    `${migrations ? "Then redeploy" : "Once that is fixed, redeploy"} the failed deployment of this commit in Vercel (not the live one: a redeploy of the live commit is skipped).`,
  );
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim().slice(0, 7);
  warn(
    `Only if this commit must go live unchecked: Yu sets REWARDS_SKIP_MIGRATION_CHECK=${commit || "<this commit's SHA, at least 7 characters>"} in Vercel Production, redeploys, then deletes it.`,
  );
}

async function main(): Promise<number> {
  const plan = migrationCheckPlan(process.env);
  for (const note of plan.notes) warn(note);

  switch (plan.action) {
    case "skip":
      say(`skipped: ${plan.reason}`);
      return 0;
    case "override":
      warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
      warn(`WARNING: REWARDS_SKIP_MIGRATION_CHECK names this commit (${plan.sha.slice(0, 12)}): NOT checking production's migrations.`);
      warn("This build can go live with code that reads columns production lacks. Delete REWARDS_SKIP_MIGRATION_CHECK in Vercel Production once it is live.");
      warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
      return 0;
    case "refuse":
      warn(`refused: ${plan.reason}`);
      howToRecover({ migrations: false });
      return 1;
    case "check":
      break;
  }

  let local;
  try {
    local = localMigrations(MIGRATIONS);
  } catch (error) {
    // Local file names only
    warn(`refused: prisma/migrations can't be read: ${(error as Error).message}`);
    return 1;
  }
  let rows;
  try {
    rows = await readAppliedMigrations(plan.url);
  } catch (error) {
    warn(`refused: could not read production's migrations (${readFailure(error)}) from schema ${plan.schema} on ${plan.host}`);
    howToRecover({ migrations: false });
    return 1;
  }

  const verdict = migrationVerdict(local, rows);
  const pending = new Map(verdict.outcome === "refuse" ? verdict.pending.map((p) => [p.name, p.state]) : []);
  say(`schema ${plan.schema} on ${plan.host}, against the ${local.length} migrations in prisma/migrations:`);
  for (const { name } of local) {
    const state = pending.get(name);
    if (state) warn(`  ${name}  ${STATES[state]}`);
    else say(`  ${name}  applied`);
  }
  for (const name of verdict.extra) say(`  ${name}  in production, not in this commit (fine: applied before its PR merged)`);

  if (verdict.outcome === "refuse") {
    warn(`refused: production lacks ${verdict.pending.length} of this commit's migrations, or holds different SQL for them.`);
    howToRecover({ migrations: true });
    return 1;
  }
  say("ok: production has every migration in prisma/migrations, with this commit's SQL");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    warn(`refused: ${readFailure(error)}`);
    process.exit(1);
  },
);
