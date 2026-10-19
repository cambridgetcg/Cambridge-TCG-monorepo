/**
 * Retired unsafe entitlement backfill.
 *
 * The former script embedded obsolete feature gates, silently mapped unknown
 * paid plans to Free, and could write without a reviewed live-schema preflight.
 */

console.error(`
This migration is retired and made no database connection.

Nothing needs backfilling: the Postgres rebuild (2026-10-18) starts from an
empty database built by prisma/migrations, and new shops receive the
free-first ShopEntitlements defaults from the schema.
`.trim());

process.exitCode = 1;
