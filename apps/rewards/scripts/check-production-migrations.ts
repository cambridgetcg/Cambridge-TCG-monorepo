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
import { localMigrations, migrationCheckPlan, migrationVerdict, readAppliedMigrations, readFailure, reportVerdict } from "./lib/production-migrations";

const PREFIX = "[migration-check]";
const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), "../prisma/migrations");

const say = (line: string) => console.log(`${PREFIX} ${line}`);
const warn = (line: string) => console.error(`${PREFIX} ${line}`);

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

  say(`schema ${plan.schema} on ${plan.host}, against the ${local.length} migrations in prisma/migrations:`);
  const report = reportVerdict(local, migrationVerdict(local, rows));
  for (const { level, text } of report.lines) (level === "say" ? say : warn)(text);
  if (report.exitCode !== 0) howToRecover({ migrations: true });
  return report.exitCode;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    warn(`refused: ${readFailure(error)}`);
    process.exit(1);
  },
);
