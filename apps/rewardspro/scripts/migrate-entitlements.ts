/**
 * Retired unsafe entitlement backfill.
 *
 * The former script embedded obsolete feature gates, silently mapped unknown
 * paid plans to Free, and could write without a reviewed live-schema preflight.
 */

console.error(`
This migration is retired and made no database connection.

Use the guarded free-first rollout instead:
  npx tsx scripts/backfill-free-first-entitlements.ts --dry-run

Review the dry-run and the free-first pricing decision before any --apply.
`.trim());

process.exitCode = 1;
