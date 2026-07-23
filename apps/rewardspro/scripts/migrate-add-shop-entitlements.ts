/**
 * Retired ad-hoc ShopEntitlements schema creator.
 *
 * The live schema must be reconciled through a reviewed Prisma migration. The
 * old script created only part of the table with obsolete, restrictive Free
 * defaults and also wrote directly to Prisma's migration ledger.
 */

console.error(`
This schema migration is retired and made no database connection.

Reconcile the live schema against prisma/schema.prisma through a reviewed
migration first. Then run:
  npx tsx scripts/backfill-free-first-entitlements.ts --dry-run
`.trim());

process.exitCode = 1;
