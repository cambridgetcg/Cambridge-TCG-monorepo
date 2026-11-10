import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { localMigrations, migrationVerdict, readAppliedMigrations } from "../../scripts/lib/production-migrations";
import { hasTestDatabase } from "./helpers/database";

/**
 * The production build's migration check against a database migrated by
 * Prisma itself (RP-25): the read-only query, the table's real shape, and
 * Prisma's checksum format all agree with the check. resetDatabase never
 * empties _prisma_migrations, so the test database holds every row.
 */

const MIGRATIONS = resolve(__dirname, "../../prisma/migrations");

describe.skipIf(!hasTestDatabase)("the production migration check on Postgres", () => {
  it("finds every migration applied, with this commit's SQL", async () => {
    const rows = await readAppliedMigrations(process.env.REWARDS_TEST_DATABASE_URL!);

    expect(rows.length).toBeGreaterThan(0);
    expect(migrationVerdict(localMigrations(MIGRATIONS), rows)).toEqual({ outcome: "pass", extra: [] });
  });
});
