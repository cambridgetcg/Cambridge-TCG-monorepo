/**
 * Retired ad-hoc ShopEntitlements schema creator.
 *
 * The live schema must be reconciled through a reviewed Prisma migration. The
 * old script created only part of the table with obsolete, restrictive Free
 * defaults and also wrote directly to Prisma's migration ledger.
 */

console.error(`
This schema migration is retired and made no database connection.

Nothing needs backfilling: the Postgres rebuild (2026-10-18) starts from an
empty database built by prisma/migrations, and new shops receive the
free-first ShopEntitlements defaults from the schema.
`.trim());

process.exitCode = 1;
